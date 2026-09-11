import {
  DataFrame,
  DataQuery,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  TimeRange,
  dateTime,
} from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { logger } from '@shared/infrastructure/tracking/logger';
import { lastValueFrom, Observable } from 'rxjs';

import {
  collectVisibleOtherPaths,
  countNodes,
  dataFrameToTree,
  findVisibleOtherParents,
  hasVisibleOther,
  isPrefix,
  mergeChildren,
  ProfileTreeNode,
  resolvePath,
  samePath,
  treeToDataFrame,
  ViewGeometry,
} from './progressiveProfileTree';

/**
 * Progressive flame graph loading.
 *
 * The first query is an ordinary one, so nothing extra is paid for a profile that arrives complete. Further queries
 * are made only where the user can actually see truncation: for every 'other' node wide enough to be drawn as a real
 * bar, the subtree above it is re-queried with a call site selector, which spends the whole node budget inside that
 * subtree and so resolves every 'other' within it at once. Focusing a node re-runs the same rule against the zoomed
 * view, where slivers that were too narrow to see become visible.
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
// Safety net only: a focus or search change starts a new cycle.
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
  /** Width of the rendered flame graph, used to tell a visible 'other' node from a sliver. */
  getViewWidth: () => number;
}

export interface ProgressiveController {
  /** Call path of the focused node, or undefined when the focus is reset. */
  setFocusPath(path: string[] | undefined): void;
  /** Re-evaluate what is visible, for instance after the flame graph was laid out or resized. */
  rescan(): void;
  /** While a search is active every 'other' node is greyed out, so focus refinement pauses. */
  setSearchActive(active: boolean): void;
  cancel(): void;
}

type RefineTask = {
  path: string[];
  budget: number;
};

interface PyroscopeProfileQuery extends DataQuery {
  profileTypeId: string;
  labelSelector: string;
  maxNodes: number;
  stackTraceSelector?: string[];
}

async function fetchSubtree(query: ProgressiveQuery, callSite: string[], budget: number): Promise<DataFrame | undefined> {
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
 * Refines the tree in place, calling onUpdate with a new data frame after every merged response. The returned
 * controller stays alive after the initial upgrade so that focus changes can trigger further refinement; cancel it
 * when the data it was built from is replaced.
 */
export function startProgressiveRefinement(
  root: ProfileTreeNode,
  initialFrame: DataFrame,
  query: ProgressiveQuery,
  onUpdate: (frame: DataFrame, progress: ProgressiveProgress) => void
): ProgressiveController {
  const queue: RefineTask[] = [];
  const pendingByPath = new Map<string, RefineTask>();
  // Call sites with a request on the wire. A rescan triggered by another merge sees their 'other' still in place,
  // precisely because the answer has not arrived yet, and would re-queue them at a higher budget for nothing.
  const inFlight = new Set<string>();
  const loading = new Map<string, string[][]>();
  // Highest budget already queried per subtree. The initial query counts as the root having been asked at the base
  // budget, so the root is only re-queried if it escalates.
  const attempted = new Map<string, number>([['', INITIAL_MAX_NODES]]);

  // The flame graph reports and expects paths that start at the synthetic root ('total'), while paths here are
  // relative to it: that is also what a call site selector needs, since the root is not a real frame.
  const rootName = root.name;
  const toRelative = (path: string[] | undefined) =>
    path && path[0] === rootName ? path.slice(1) : path;
  const toAbsolute = (path: string[]) => [rootName, ...path];

  const currentView = (): ViewGeometry | null => {
    if (searchActive) {
      return null;
    }

    const viewRoot = focusPath ? resolvePath(root, focusPath) : root;

    return viewRoot ? { viewTotal: viewRoot.total, widthPx: query.getViewWidth() } : null;
  };

  let focusPath: string[] | undefined;
  let searchActive = false;
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
      return;
    }

    pendingByPath.set(key, task);
    queue.push(task);
  };

  /** Queues the subtrees above every 'other' node the user can currently see. */
  const scanVisible = () => {
    const view = currentView();

    if (!view) {
      return;
    }

    const scanRoot = focusPath ? resolvePath(root, focusPath) : root;

    if (!scanRoot) {
      return;
    }

    for (const parentPath of findVisibleOtherParents(scanRoot, focusPath ?? [], view)) {
      const key = parentPath.join(' ');
      const previous = attempted.get(key) ?? 0;
      // A call site query spends the whole budget inside the subtree, so the base budget is enough. Only the root,
      // which no call site can target, has to escalate to see anything new.
      const budget = parentPath.length === 0 ? previous * BUDGET_ESCALATION : Math.max(INITIAL_MAX_NODES, previous * BUDGET_ESCALATION);

      if (budget <= MAX_BUDGET) {
        push({ path: parentPath, budget });
      }
    }
  };

  const isEligible = (task: RefineTask) => {
    if (searchActive) {
      return false;
    }

    if (!focusPath) {
      return true;
    }

    // While focused, everything outside the focused subtree is greyed out.
    return isPrefix(task.path, focusPath) || isPrefix(focusPath, task.path);
  };

  const takeBestEligible = (): RefineTask | undefined => {
    // Shallowest first: a broader refinement covers the deeper ones.
    let best = -1;

    for (let i = 0; i < queue.length; i++) {
      if (!isEligible(queue[i])) {
        continue;
      }

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
    const target = resolvePath(root, task.path);
    const view = currentView();

    if (!target || !view) {
      return;
    }

    // An earlier, broader refinement may have resolved everything visible here already.
    if (!hasVisibleOther(target, view)) {
      return;
    }

    attempted.set(task.path.join(' '), task.budget);

    const loadingKey = task.path.join(' ');
    inFlight.add(loadingKey);
    loading.set(loadingKey, collectVisibleOtherPaths(target, task.path, view));
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

      // Rescan only once this call site is off the wire, so that a subtree which came back still truncated can be
      // asked again at a higher budget. Before emit, so the reported pending count includes whatever this queues.
      if (treeChanged) {
        scanVisible();
      }

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
      const task = takeBestEligible();

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

  scanVisible();
  pump();

  return {
    setFocusPath(path: string[] | undefined) {
      const relativePath = toRelative(path);

      if (cancelled || samePath(relativePath, focusPath)) {
        return;
      }

      focusPath = relativePath;
      cycleRequests = 0;
      // Zooming into a subtree makes slivers inside it wide enough to see, and so worth querying.
      scanVisible();
      pump();
    },
    rescan() {
      if (cancelled) {
        return;
      }

      scanVisible();
      pump();
    },
    setSearchActive(active: boolean) {
      if (cancelled || active === searchActive) {
        return;
      }

      searchActive = active;
      cycleRequests = 0;
      scanVisible();
      pump();
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      pendingByPath.clear();
    },
  };
}
