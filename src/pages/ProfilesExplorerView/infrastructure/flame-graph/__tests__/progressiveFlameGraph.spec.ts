import { type DataFrame, type DataQueryRequest, dateTime, type TimeRange } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

import {
  INITIAL_MAX_NODES,
  type ProgressiveController,
  type ProgressiveProgress,
  startProgressiveRefinement,
} from '../progressiveFlameGraph';
import { type ProfileTreeNode, treeToDataFrame } from '../progressiveProfileTree';

jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn(),
}));

jest.mock('@shared/infrastructure/tracking/logger', () => ({
  logger: { error: jest.fn() },
}));

/** Drains the promise cascade of a refinement round: fetch -> merge -> next request. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const node = (name: string, total: number, self: number, children: ProfileTreeNode[] = []): ProfileTreeNode => ({
  name,
  total,
  self,
  children,
});

const other = (total: number) => node('other', total, total);

const timeRange = {
  from: dateTime(1_700_000_000_000),
  to: dateTime(1_700_000_600_000),
} as TimeRange;

/** A tree with a truncated node under each of two separate parents. */
function twoTruncatedBranches() {
  return node('total', 1000, 0, [
    node('A', 500, 0, [node('a1', 300, 300), other(200)]),
    node('B', 500, 0, [node('b1', 300, 300), other(200)]),
  ]);
}

type Captured = { request: DataQueryRequest; callSite: string[] };

const maxNodesOf = (captured: Captured) => (captured.request.targets[0] as unknown as { maxNodes: number }).maxNodes;

/**
 * Stubs the data source so every query can be resolved by hand, which is what lets a test hold one call site's
 * request open while another one lands.
 */
function stubDataSource() {
  const captured: Captured[] = [];
  const pending: Array<{ callSite: string[]; resolve: (frame: DataFrame | undefined) => void }> = [];

  jest.mocked(getDataSourceSrv).mockReturnValue({
    get: async () => ({
      query: (request: DataQueryRequest) => {
        const callSite = (request.targets[0] as { stackTraceSelector?: string[] }).stackTraceSelector ?? [];
        captured.push({ request, callSite });
        return new Promise((resolve) => {
          pending.push({ callSite, resolve: (frame) => resolve({ data: frame ? [frame] : [] }) });
        });
      },
    }),
  } as unknown as ReturnType<typeof getDataSourceSrv>);

  const resolveFor = async (callSite: string[], tree: ProfileTreeNode) => {
    const index = pending.findIndex((p) => p.callSite.join('|') === callSite.join('|'));

    if (index === -1) {
      throw new Error(`no pending request for ${callSite.join('|')}`);
    }

    pending.splice(index, 1)[0].resolve(treeToDataFrame(tree, 'ns'));
    await flush();
  };

  const callSites = () => captured.map((c) => c.callSite.join('|'));

  return { captured, callSites, pending, resolveFor };
}

function refine(root: ProfileTreeNode, onUpdate?: (progress: ProgressiveProgress) => void) {
  return startProgressiveRefinement(
    root,
    treeToDataFrame(root, 'ns'),
    {
      dataSourceUid: 'ds',
      profileTypeId: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
      labelSelector: '{service_name="svc"}',
      timeRange,
      unit: 'ns',
    },
    (_frame, progress) => onUpdate?.(progress)
  );
}

/**
 * Stands in for the flame graph, which reports the truncated nodes the active view is showing. Every truncated node
 * still in the tree counts as visible here, which is what a call tree with all its rows expanded would report.
 */
function reportVisibleTruncated(controller: ProgressiveController, root: ProfileTreeNode) {
  const paths: string[][] = [];

  const walk = (node: ProfileTreeNode, path: string[]) => {
    for (const child of node.children) {
      if (child.name === 'other') {
        paths.push([...path, child.name]);
      } else {
        walk(child, [...path, child.name]);
      }
    }
  };

  walk(root, [root.name]);
  controller.setVisibleTruncated(paths);
}

/** The refined answer for A: same totals, but the truncated child resolved into real symbols. */
const refinedA = () =>
  node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), node('a2', 120, 120), node('a3', 80, 80)])]);

/** The refined answer for A, still truncated: the budget was not enough to resolve it. */
const stillTruncatedA = () => node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), other(200)])]);

const childNames = (root: ProfileTreeNode, name: string) =>
  root.children.find((c) => c.name === name)!.children.map((c) => c.name);

describe('startProgressiveRefinement', () => {
  it('queries nothing until the flame graph reports what it is showing', async () => {
    const { captured } = stubDataSource();
    const controller = refine(twoTruncatedBranches());

    await flush();

    expect(captured).toHaveLength(0);
    controller.cancel();
  });

  it('queries the parent of every reported truncated node once', async () => {
    const { callSites, resolveFor } = stubDataSource();
    const root = twoTruncatedBranches();
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();

    expect(callSites()).toEqual(['A', 'B']);

    await resolveFor(['A'], refinedA());

    expect(childNames(root, 'A')).toEqual(['a1', 'a2', 'a3']);
    controller.cancel();
  });

  it('ignores the truncated nodes the view does not show', async () => {
    const { callSites } = stubDataSource();
    const root = twoTruncatedBranches();
    const controller = refine(root);

    // A call tree with A expanded and B collapsed shows only A's truncated child.
    controller.setVisibleTruncated([['total', 'A', 'other']]);
    await flush();

    expect(callSites()).toEqual(['A']);
    controller.cancel();
  });

  it('marks the reported nodes as loading until their call site comes back', async () => {
    const { resolveFor } = stubDataSource();
    const root = twoTruncatedBranches();
    const updates: ProgressiveProgress[] = [];
    const controller = refine(root, (progress) => updates.push(progress));

    controller.setVisibleTruncated([['total', 'A', 'other']]);
    await flush();

    expect(updates.at(-1)?.loadingPaths).toEqual([['total', 'A', 'other']]);

    await resolveFor(['A'], refinedA());

    expect(updates.at(-1)?.loadingPaths).toEqual([]);
    controller.cancel();
  });

  it('does not re-query a call site while its request is still in flight', async () => {
    const { callSites, resolveFor } = stubDataSource();
    const root = twoTruncatedBranches();
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();
    expect(callSites()).toEqual(['A', 'B']);

    // B lands first. The merged frame is re-reported, and A's truncated node is necessarily still in it because A's
    // own request has not come back yet. Re-queueing A here would abort the request already on the wire, because
    // backendSrv cancels an in-flight request as soon as another one with the same requestId starts.
    await resolveFor(['B'], node('total', 1000, 0, [node('B', 500, 0, [node('b1', 300, 300), node('b2', 200, 200)])]));
    reportVisibleTruncated(controller, root);
    await flush();

    expect(callSites().filter((callSite) => callSite === 'A')).toHaveLength(1);

    // A still completes and merges normally.
    await resolveFor(['A'], refinedA());
    expect(childNames(root, 'A')).toEqual(['a1', 'a2', 'a3']);
    controller.cancel();
  });

  it('skips a queued call site whose truncated nodes a broader refinement has resolved', async () => {
    const { callSites, resolveFor } = stubDataSource();
    // Truncated both directly under each branch and a level deeper, so the deeper call sites are queued behind the
    // broader ones that cover them.
    const root = node('total', 1000, 0, [
      node('A', 500, 0, [node('a1', 300, 0, [node('a11', 200, 200), other(100)]), other(200)]),
      node('B', 500, 0, [node('b1', 300, 0, [node('b11', 200, 200), other(100)]), other(200)]),
    ]);
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();
    expect(callSites()).toEqual(['A', 'B']);

    // A comes back fully resolved, so there is nothing left for the queued A|a1 to ask about.
    await resolveFor(
      ['A'],
      node('total', 1000, 0, [
        node('A', 500, 0, [
          node('a1', 300, 0, [node('a11', 200, 200), node('a12', 60, 60), node('a13', 40, 40)]),
          node('a2', 200, 200),
        ]),
      ])
    );
    await flush();

    expect(callSites()).not.toContain('A|a1');
    expect(callSites()).toContain('B|b1');
    controller.cancel();
  });

  it('escalates the budget only after the previous answer for that call site arrived', async () => {
    const { captured, resolveFor } = stubDataSource();
    const root = stillTruncatedA();
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();
    expect(captured).toHaveLength(1);
    expect(maxNodesOf(captured[0])).toBe(INITIAL_MAX_NODES + 2);

    // Re-reporting the same node while the request is on the wire must not escalate.
    reportVisibleTruncated(controller, root);
    await flush();
    expect(captured).toHaveLength(1);

    await resolveFor(['A'], stillTruncatedA());
    reportVisibleTruncated(controller, root);
    await flush();

    expect(captured).toHaveLength(2);
    expect(maxNodesOf(captured[1])).toBeGreaterThan(maxNodesOf(captured[0]));
    controller.cancel();
  });

  it('gives every request its own requestId so none of them cancels another', async () => {
    const { captured, pending, resolveFor } = stubDataSource();
    const root = stillTruncatedA();
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();

    while (pending.length) {
      await resolveFor(['A'], stillTruncatedA());
      reportVisibleTruncated(controller, root);
      await flush();
    }

    const ids = captured.map((c) => c.request.requestId);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    controller.cancel();
  });

  it('never asks for more nodes than Pyroscope allows', async () => {
    const { captured, pending, resolveFor } = stubDataSource();
    const root = stillTruncatedA();
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();

    // A call site that keeps coming back truncated escalates until it hits the ceiling.
    while (pending.length) {
      await resolveFor(['A'], stillTruncatedA());
      reportVisibleTruncated(controller, root);
      await flush();
    }

    const requested = captured.map(maxNodesOf);
    expect(requested.length).toBeGreaterThan(1);
    // Pyroscope answers 'max flamegraph nodes limit N is greater than allowed 1048576' above this.
    expect(Math.max(...requested)).toBeLessThanOrEqual(1 << 20);
    controller.cancel();
  });

  it('leaves a truncated node directly under the root alone', async () => {
    const { captured } = stubDataSource();
    // Nothing above it to target with a call site, so the only lever would be a bigger budget for the whole profile.
    const root = node('total', 1000, 0, [node('a1', 300, 300), other(700)]);
    const controller = refine(root);

    reportVisibleTruncated(controller, root);
    await flush();

    expect(captured).toHaveLength(0);
    controller.cancel();
  });
});
