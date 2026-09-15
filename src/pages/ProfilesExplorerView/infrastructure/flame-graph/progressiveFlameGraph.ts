import {
  DataFrame,
  DataQuery,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  dateTime,
  TimeRange,
} from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { logger } from '@shared/infrastructure/tracking/logger';
import { lastValueFrom, Observable } from 'rxjs';

import {
  countNodes,
  dataFrameToTree,
  mergeChildren,
  ProfileTreeNode,
  resolvePath,
  treeToDataFrame,
} from './progressiveProfileTree';

/**
 * Progressive flame graph loading.
 *
 * The first query is an ordinary one, so nothing extra is paid for a profile that arrives complete. Further queries
 * are made only where the user can actually see truncation: the flame graph reports the call paths of the 'other'
 * nodes the active view is showing, and for each of them the subtree above it is re-queried with a call site
 * selector, which spends the whole node budget inside that subtree and so resolves every 'other' within it at once.
 *
 * Deciding what the user can see belongs to the flame graph package, not here: a bar is visible when it is wide
 * enough to read, a call tree row when its ancestors are expanded, and only the package knows which view is on
 * screen. So focusing, zooming, resizing and expanding all reach this controller the same way, as a new set of paths.
 *
 * A query costs the backend about the same whatever its maxNodes is (the read path reads and symbolizes everything
 * matching the selector either way, maxNodes only trims what comes back), so a call site query is far cheaper than
 * raising maxNodes for the whole profile, and bounded in payload size too.
 *
 * See https://github.com/grafana/grafana-pyroscope-datasource/issues/49.
 */

// Node budget of every query, including the first one. Progressive loading ignores the configured maxNodes: detail
// comes from re-querying subtrees rather than from a bigger budget.
export const INITIAL_MAX_NODES = 16384;

// An 'other' directly under the root cannot be targeted with a call site, so the only way to see inside it is a
// bigger budget for the whole profile. Rare, and bounded by the server side limit.
const BUDGET_ESCALATION = 4;
// Pyroscope refuses a request whose maxNodes is above this, so the padding below must not push us over it.
const SERVER_MAX_NODES = 1 << 20;
const MAX_BUDGET = 1 << 20;

const CONCURRENCY = 2;
// Safety net only: a change in what the flame graph shows starts a new cycle.
const MAX_REQUESTS_PER_CYCLE = 16;

export interface ProgressiveProgress {
  requestsCompleted: number;
  requestsPending: number;
  nodeCount: number;
  done: boolean;
  // Paths of the 'other' nodes covered by the requests in flight, for the loading overlays.
  loadingPaths: string[][];
}

export interface ProgressiveQuery {
  dataSourceUid: string;
  profileTypeId: string;
  labelSelector: string;
  timeRange: TimeRange;
  unit: string;
}

export interface ProgressiveController {
  /**
   * Call paths of the truncated nodes the user can currently see, as reported by the flame graph. Anything not in the
   * set is either resolved already or not on screen, so this is the whole of what drives refinement.
   */
  setVisibleTruncated(paths: string[][]): void;
  cancel(): void;
}

type RefineTask = {
  /** Call site to re-query, relative to the root. */
  path: string[];
  budget: number;
  /**
   * The truncated nodes this refinement is meant to resolve, for the loading markers and to tell whether an earlier,
   * broader refinement has already dealt with them.
   */
  truncated: string[][];
};

interface PyroscopeProfileQuery extends DataQuery {
  profileTypeId: string;
  labelSelector: string;
  maxNodes: number;
  stackTraceSelector?: string[];
}

async function fetchSubtree(
  query: ProgressiveQuery,
  callSite: string[],
  budget: number
): Promise<DataFrame | undefined> {
  const dataSource: DataSourceApi = await getDataSourceSrv().get(query.dataSourceUid);
  const from = query.timeRange.from.valueOf();
  const to = query.timeRange.to.valueOf();

  const request: DataQueryRequest<PyroscopeProfileQuery> = {
    // The budget is part of the id: backendSrv cancels an in-flight request as soon as another one with the same
    // requestId starts, so escalating the budget for a call site would otherwise abort the request already on the wire.
    requestId: `progressive-flame-graph-${from}-${to}-${budget}-${callSite.join('|')}`,
    targets: [
      {
        refId: 'progressive',
        queryType: 'profile',
        profileTypeId: query.profileTypeId,
        labelSelector: query.labelSelector,
        // The call site and the root count against maxNodes, so pad the budget to keep the detail of the subtree the
        // same at any depth.
        maxNodes: Math.min(budget + callSite.length + 1, SERVER_MAX_NODES),
        ...(callSite.length > 0 && { stackTraceSelector: callSite }),
        datasource: { type: 'grafana-pyroscope-datasource', uid: query.dataSourceUid },
      },
    ],
    range: {
      from: dateTime(from),
      to: dateTime(to),
      raw: { from: dateTime(from), to: dateTime(to) },
    },
    interval: '1s',
    intervalMs: 1000,
    maxDataPoints: 1,
    scopedVars: {},
    timezone: 'browser',
    app: 'pyroscope-app',
    startTime: from,
  };

  const result = dataSource.query(request) as Observable<DataQueryResponse> | Promise<DataQueryResponse>;
  const response = result instanceof Promise ? await result : await lastValueFrom(result);

  return response.data?.[0];
}

/**
 * Refines the tree in place, calling onUpdate with a new data frame after every merged response. Nothing is queried
 * until the flame graph reports what it is showing; the controller then stays alive so that later reports can trigger
 * further refinement. Cancel it when the data it was built from is replaced.
 */
export function startProgressiveRefinement(
  root: ProfileTreeNode,
  initialFrame: DataFrame,
  query: ProgressiveQuery,
  onUpdate: (frame: DataFrame, progress: ProgressiveProgress) => void
): ProgressiveController {
  const queue: RefineTask[] = [];
  const pendingByPath = new Map<string, RefineTask>();
  // Call sites with a request on the wire. A report triggered by another merge sees their 'other' still in place,
  // precisely because the answer has not arrived yet, and would re-queue them at a higher budget for nothing.
  const inFlight = new Set<string>();
  const loading = new Map<string, string[][]>();
  // Highest budget already queried per subtree. The initial query counts as the root having been asked at the base
  // budget, so the root is only re-queried if it escalates.
  const attempted = new Map<string, number>([['', INITIAL_MAX_NODES]]);

  // The flame graph reports and expects paths that start at the synthetic root ('total'), while paths here are
  // relative to it: that is also what a call site selector needs, since the root is not a real frame.
  const rootName = root.name;
  const toRelative = (path: string[]) => (path[0] === rootName ? path.slice(1) : path);
  const toAbsolute = (path: string[]) => [rootName, ...path];

  let visibleKey = '';
  let cancelled = false;
  let active = 0;
  let cycleRequests = 0;
  let requestsCompleted = 0;
  let announcedBusy = false;
  let lastFrame = initialFrame;

  const push = (task: RefineTask) => {
    const key = task.path.join(' ');

    // Never ask the same subtree the same question twice: without this a subtree that stays truncated at a given
    // budget would be re-queued for ever.
    if ((attempted.get(key) ?? 0) >= task.budget) {
      return;
    }

    if (inFlight.has(key)) {
      return;
    }

    const existing = pendingByPath.get(key);

    if (existing) {
      existing.budget = Math.max(existing.budget, task.budget);
      existing.truncated = task.truncated;
      return;
    }

    pendingByPath.set(key, task);
    queue.push(task);
  };

  const takeShallowest = (): RefineTask | undefined => {
    // Shallowest first: a broader refinement covers the deeper ones.
    let best = -1;

    for (let i = 0; i < queue.length; i++) {
      if (best === -1 || queue[i].path.length < queue[best].path.length) {
        best = i;
      }
    }

    if (best === -1) {
      return undefined;
    }

    const task = queue.splice(best, 1)[0];
    pendingByPath.delete(task.path.join(' '));

    return task;
  };

  /**
   * A call site query spends the whole budget inside the subtree, so the base budget is enough. Only the root, which
   * no call site can target, has to escalate to see anything new.
   */
  const nextBudget = (callSite: string[]) => {
    const previous = attempted.get(callSite.join(' ')) ?? 0;
    const escalated = previous * BUDGET_ESCALATION;

    return callSite.length === 0 ? escalated : Math.max(INITIAL_MAX_NODES, escalated);
  };

  /**
   * Groups the reported truncated nodes by the call site above them, since that is what a query can target and one
   * query there resolves every truncated node under it at once.
   */
  const groupByCallSite = (paths: string[][]) => {
    const byCallSite = new Map<string, RefineTask>();

    for (const path of paths) {
      const truncated = toRelative(path);

      if (!truncated.length) {
        continue;
      }

      const callSite = truncated.slice(0, -1);
      const key = callSite.join(' ');
      const existing = byCallSite.get(key);

      if (existing) {
        existing.truncated.push(truncated);
      } else {
        byCallSite.set(key, { path: callSite, budget: nextBudget(callSite), truncated: [truncated] });
      }
    }

    return byCallSite;
  };

  const emit = (done: boolean, treeChanged: boolean) => {
    if (cancelled) {
      return;
    }

    if (treeChanged) {
      lastFrame = treeToDataFrame(root, query.unit);
    }

    onUpdate(lastFrame, {
      requestsCompleted,
      requestsPending: active + queue.length,
      nodeCount: countNodes(root),
      done,
      loadingPaths: [...loading.values()].flat().map(toAbsolute),
    });
  };

  const processTask = async (task: RefineTask) => {
    // An earlier, broader refinement may have resolved these already, in which case the nodes this task was queued
    // for are no longer in the tree.
    if (!task.truncated.some((path) => resolvePath(root, path))) {
      return;
    }

    const loadingKey = task.path.join(' ');
    attempted.set(loadingKey, task.budget);
    inFlight.add(loadingKey);
    loading.set(loadingKey, task.truncated);
    emit(false, false);

    let treeChanged = false;

    try {
      const frame = await fetchSubtree(query, task.path, task.budget);
      requestsCompleted++;

      if (cancelled || !frame) {
        return;
      }

      const refinedRoot = dataFrameToTree(frame);
      const refinedTarget = refinedRoot && resolvePath(refinedRoot, task.path);

      if (!refinedTarget?.children.length) {
        return;
      }

      // Re-resolve: a concurrent merge may have replaced the node object while the request was in flight.
      const mergeTarget = resolvePath(root, task.path);

      if (!mergeTarget) {
        return;
      }

      mergeChildren(mergeTarget, refinedTarget);
      treeChanged = true;
    } finally {
      inFlight.delete(loadingKey);
      loading.delete(loadingKey);

      // No re-scan here. The merged frame goes out to the flame graph, which reports what it now shows: fewer
      // truncated nodes, possibly new ones a level deeper, and the same ones again where the answer was still
      // truncated, which is what escalates the budget.
      emit(false, treeChanged);
    }
  };

  const startTask = (task: RefineTask) => {
    active++;
    cycleRequests++;

    if (!announcedBusy) {
      announcedBusy = true;
      emit(false, false);
    }

    processTask(task)
      .catch((error) => {
        logger.error(error instanceof Error ? error : new Error(String(error)), {
          info: 'Progressive flame graph refinement failed',
          path: task.path.join(' '),
        });
      })
      .finally(() => {
        active--;
        pump();
      });
  };

  const pump = () => {
    if (cancelled) {
      return;
    }

    while (active < CONCURRENCY && cycleRequests < MAX_REQUESTS_PER_CYCLE) {
      const task = takeShallowest();

      if (!task) {
        break;
      }

      startTask(task);
    }

    if (active === 0 && announcedBusy) {
      announcedBusy = false;
      emit(true, false);
    }
  };

  return {
    setVisibleTruncated(paths: string[][]) {
      if (cancelled) {
        return;
      }

      const byCallSite = groupByCallSite(paths);
      const key = [...byCallSite.keys()].sort().join('\n');

      if (key !== visibleKey) {
        visibleKey = key;
        // A different set of call sites on screen means the user moved: focused, expanded a row, resized the pane.
        // The cap is there to stop one such move fanning out without limit, not to limit a session.
        cycleRequests = 0;
      }

      for (const task of byCallSite.values()) {
        if (task.budget <= MAX_BUDGET) {
          push(task);
        }
      }

      pump();
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      pendingByPath.clear();
    },
  };
}
