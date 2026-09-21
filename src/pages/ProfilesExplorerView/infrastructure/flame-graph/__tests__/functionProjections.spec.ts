import {
  FunctionProjections,
  functionProjectionsCapability,
  projectionRequest,
  ProjectionSnapshot,
} from '../functionProjections';

const snapshot: ProjectionSnapshot = {
  dataSourceUid: 'profiles',
  left: {
    profileTypeID: 'cpu',
    labelSelector: '{service_name="api"}',
    start: 1000,
    end: 2000,
    spanSelector: ['span'],
    traceIdSelector: ['trace'],
    profileIdSelector: ['profile'],
  },
};

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});

function respond(value: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => value });
}

it('places diff options on the left and preserves both selections and root-first caller chains', () => {
  expect(
    projectionRequest(
      { ...snapshot, right: { ...snapshot.left, start: 3000, end: 4000 } },
      {
        selection: 'FUNCTION_CHAIN',
        direction: 'CALLERS',
        path: ['A', 'F'],
        depth: 4,
      }
    )
  ).toEqual({
    left: {
      profileTypeID: 'cpu',
      labelSelector: '{service_name="api"}',
      start: 1000,
      end: 2000,
      spanSelector: ['span'],
      traceIdSelector: ['trace'],
      profileIdSelector: ['profile'],
      stackTraceSelector: { callSite: [{ name: 'A' }, { name: 'F' }] },
      format: 'PROFILE_FORMAT_FUNCTION_TREE',
      formatOptions: {
        functionTree: {
          selection: 'FUNCTION_TREE_SELECTION_FUNCTION_CHAIN',
          direction: 'FUNCTION_TREE_DIRECTION_CALLERS',
          maxDepth: 4,
        },
      },
    },
    right: {
      profileTypeID: 'cpu',
      labelSelector: '{service_name="api"}',
      start: 3000,
      end: 4000,
      spanSelector: ['span'],
      traceIdSelector: ['trace'],
      profileIdSelector: ['profile'],
      stackTraceSelector: { callSite: [{ name: 'A' }, { name: 'F' }] },
    },
  });
});

it.each([undefined, 0, 4])('preserves depth %s without substituting a node budget', (depth) => {
  const request = projectionRequest(snapshot, { selection: 'ROOT_PATH', direction: 'CALLEES', path: [], depth });
  expect(request).toMatchObject({ formatOptions: { functionTree: depth === undefined ? {} : { maxDepth: depth } } });
  expect(JSON.stringify(request).includes('maxDepth')).toBe(depth !== undefined);
  expect(JSON.stringify(request).includes('maxNodes')).toBe(false);
});

it('decodes exact sample totals, recursion aggregates and one-sided diff rows without recomputing them', async () => {
  respond({
    functions: {
      left: { functions: [{ name: 'F', total: '100', self: '20' }, { name: 'G' }], total: '120', totalFunctions: '2' },
      right: { functions: [{ name: 'F' }, { name: 'G', total: '70', self: '70' }], total: '70', totalFunctions: '2' },
    },
  });
  const source = new FunctionProjections({ ...snapshot, right: snapshot.left });
  expect(await source.getFunctions()).toEqual({
    left: {
      functions: [
        { name: 'F', total: 100, self: 20 },
        { name: 'G', total: 0, self: 0 },
      ],
      total: 120,
      totalFunctions: 2,
    },
    right: {
      functions: [
        { name: 'F', total: 0, self: 0 },
        { name: 'G', total: 70, self: 70 },
      ],
      total: 70,
      totalFunctions: 2,
    },
  });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/datasources/proxy/uid/profiles/querier.v1.QuerierService/Diff');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).left.formatOptions).toEqual({ functions: { limit: '0' } });
});

it('keeps empty requested sides and unresolved boundary nodes distinct from leaves', async () => {
  respond({
    functionTree: {
      left: { callees: {} },
      right: { callees: { root: { name: 'F', total: '50', self: '3', hasChildren: true } } },
    },
  });
  const source = new FunctionProjections({ ...snapshot, right: snapshot.left });
  expect(await source.getTree({ selection: 'ROOT_PATH', direction: 'CALLEES', path: [], depth: 0 })).toEqual({
    left: { callees: { root: undefined } },
    right: { callees: { root: { name: 'F', total: 50, self: 3, children: [], hasChildren: true } } },
  });
});

it('deduplicates identical work, caches results, and snapshots mutable input', async () => {
  respond({ functions: {} });
  const mutable = { ...snapshot, left: { ...snapshot.left, spanSelector: ['original'] } };
  const source = new FunctionProjections(mutable);
  mutable.left.start = 9000;
  mutable.left.spanSelector[0] = 'changed';
  const first = source.getFunctions();
  expect(source.getFunctions()).toBe(first);
  expect(await first).toEqual({ left: { functions: [], total: 0, totalFunctions: 0 } });
  await source.getFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ start: 1000, spanSelector: ['original'] });
});

it('discards old-source responses even when the transport ignores cancellation', async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const source = new FunctionProjections(snapshot);
  const pending = source.getFunctions();
  source.dispose();
  resolve({ ok: true, json: async () => ({ functions: { total: '42' } }) });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it('allows a failed projection to retry instead of caching failure or pretending it is empty', async () => {
  respond({ flamegraph: {} });
  respond({ functions: { total: '42' } });
  const source = new FunctionProjections(snapshot);
  await expect(source.getFunctions()).rejects.toThrow('Missing functions projection');
  expect(await source.getFunctions()).toEqual({ left: { functions: [], total: 42, totalFunctions: 0 } });
});

it('looks up the single capability once per context and trusts true', async () => {
  respond({ featureFlags: [{ name: 'functionProjections', enabled: true }] });
  const capability = functionProjectionsCapability('profiles');
  expect(await Promise.all([capability(), capability()])).toEqual([true, true]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(
    '/api/datasources/proxy/uid/profiles/capabilities.v1.FeatureFlagsService/GetFeatureFlags'
  );
});

it.each([{}, { featureFlags: [{ name: 'functionProjections', enabled: false }] }])(
  'keeps local behavior when capability is unavailable or false: %j',
  async (response) => {
    respond(response);
    expect(await functionProjectionsCapability('profiles')()).toBe(false);
  }
);
