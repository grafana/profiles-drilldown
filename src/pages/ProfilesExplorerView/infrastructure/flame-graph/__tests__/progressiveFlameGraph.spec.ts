import { type DataFrame, type DataQueryRequest, dateTime, type TimeRange } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

import { INITIAL_MAX_NODES, type ProgressiveProgress, startProgressiveRefinement } from '../progressiveFlameGraph';
import { type ProfileTreeNode, treeToDataFrame } from '../progressiveProfileTree';

jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn(),
}));

jest.mock('@shared/infrastructure/tracking/logger', () => ({
  logger: { error: jest.fn() },
}));

/** Drains the promise cascade of a refinement round: fetch -> merge -> rescan -> next request. */
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

/** A tree with a visible 'other' under each of two separate parents. */
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

  return { captured, pending, resolveFor };
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
      getViewWidth: () => 1000,
    },
    (_frame, progress) => onUpdate?.(progress)
  );
}

/** The refined answer for A: same totals, but the truncated child resolved into real symbols. */
const refinedA = () =>
  node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), node('a2', 120, 120), node('a3', 80, 80)])]);

const childNames = (root: ProfileTreeNode, name: string) =>
  root.children.find((c) => c.name === name)!.children.map((c) => c.name);

describe('startProgressiveRefinement', () => {
  it('queries the parent of every visible truncated node once', async () => {
    const { captured, resolveFor } = stubDataSource();
    const root = twoTruncatedBranches();
    const controller = refine(root);

    await flush();

    expect(captured.map((c) => c.callSite)).toEqual([['A'], ['B']]);

    await resolveFor(['A'], refinedA());

    expect(childNames(root, 'A')).toEqual(['a1', 'a2', 'a3']);
    controller.cancel();
  });

  it('does not re-query a call site while its request is still in flight', async () => {
    const { captured, resolveFor } = stubDataSource();
    const root = twoTruncatedBranches();
    const controller = refine(root);

    await flush();
    expect(captured).toHaveLength(2);

    // B lands first. Merging it rescans, and A's 'other' is necessarily still in the tree because A's own request has
    // not come back yet. Re-queueing A here would abort the request already on the wire, because backendSrv cancels
    // an in-flight request as soon as another one with the same requestId starts.
    await resolveFor(['B'], node('total', 1000, 0, [node('B', 500, 0, [node('b1', 300, 300), node('b2', 200, 200)])]));

    expect(captured.filter((c) => c.callSite.join('|') === 'A')).toHaveLength(1);

    // A still completes and merges normally.
    await resolveFor(['A'], refinedA());
    expect(childNames(root, 'A')).toEqual(['a1', 'a2', 'a3']);
    controller.cancel();
  });

  it('gives every request its own requestId so none of them cancels another', async () => {
    const { captured, resolveFor } = stubDataSource();
    // A single branch whose refinement comes back still truncated, so the budget escalates.
    const root = node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), other(200)])]);
    const controller = refine(root);

    await flush();

    for (let i = 0; i < 4 && captured.length > i; i++) {
      await resolveFor(['A'], node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), other(200)])]));
    }

    const ids = captured.map((c) => c.request.requestId);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    controller.cancel();
  });

  it('escalates the budget only after the previous answer for that call site arrived', async () => {
    const { captured, resolveFor } = stubDataSource();
    const root = node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), other(200)])]);
    const controller = refine(root);

    await flush();
    expect(captured).toHaveLength(1);
    expect(maxNodesOf(captured[0])).toBe(INITIAL_MAX_NODES + 2);

    await resolveFor(['A'], node('total', 1000, 0, [node('A', 500, 0, [node('a1', 300, 300), other(200)])]));

    expect(captured).toHaveLength(2);
    expect(maxNodesOf(captured[1])).toBeGreaterThan(maxNodesOf(captured[0]));
    controller.cancel();
  });

  it('never asks for more nodes than Pyroscope allows', async () => {
    const { captured, resolveFor } = stubDataSource();
    // An 'other' directly under the root can only be opened up by raising the budget for the whole profile, so this
    // escalates all the way to the ceiling.
    const root = node('total', 1000, 0, [node('a1', 300, 300), other(700)]);
    const controller = refine(root);

    await flush();

    for (let i = 0; i < 8; i++) {
      if (!captured.length) {
        break;
      }

      try {
        await resolveFor([], node('total', 1000, 0, [node('a1', 300, 300), other(700)]));
      } catch {
        break;
      }
    }

    const requested = captured.map(maxNodesOf);
    expect(requested.length).toBeGreaterThan(1);
    // Pyroscope answers 'max flamegraph nodes limit N is greater than allowed 1048576' above this.
    expect(Math.max(...requested)).toBeLessThanOrEqual(1 << 20);
    controller.cancel();
  });
});
