import { FunctionProjections, ProjectionSnapshot } from '../functionProjections';

const snapshot: ProjectionSnapshot = {
  dataSourceUid: 'profiles',
  left: { profileTypeID: 'cpu', labelSelector: '{}', start: 1000, end: 2000 },
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

it('bounds concurrent tree requests to four without cancelling distinct refinements', async () => {
  const resolvers: Array<(response: unknown) => void> = [];
  const fetchMock = jest.fn().mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  global.fetch = fetchMock;
  const source = new FunctionProjections(snapshot);
  const pending = Array.from({ length: 6 }, (_, i) =>
    source.getTree({ selection: 'ROOT_PATH', direction: 'CALLEES', path: [`branch-${i}`], depth: 4 })
  );
  expect(fetchMock).toHaveBeenCalledTimes(4);
  resolvers[0]({ ok: true, json: async () => ({ functionTree: { callees: {} } }) });
  expect(await pending[0]).toEqual({ left: { callees: { root: undefined } } });
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted === false)).toBe(true);
  resolvers[1]({ ok: true, json: async () => ({ functionTree: { callees: {} } }) });
  await pending[1];
  expect(fetchMock).toHaveBeenCalledTimes(6);
  for (const resolve of resolvers.slice(2)) {
    resolve({ ok: true, json: async () => ({ functionTree: { callees: {} } }) });
  }
  await Promise.all(pending);
  expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).stackTraceSelector.callSite)).toEqual(
    Array.from({ length: 6 }, (_, i) => [{ name: `branch-${i}` }])
  );
});

it('aborts queued work without sending it and rejects responses arriving after disposal', async () => {
  const resolvers: Array<(response: unknown) => void> = [];
  const fetchMock = jest.fn().mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  global.fetch = fetchMock;
  const source = new FunctionProjections(snapshot);
  const pending = Array.from({ length: 6 }, (_, depth) =>
    source.getTree({ selection: 'ROOT_PATH', direction: 'CALLEES', path: [], depth })
  );
  const settled = Promise.allSettled(pending);
  source.dispose();
  for (const resolve of resolvers) {
    resolve({ ok: true, json: async () => ({ functionTree: { callees: {} } }) });
  }
  expect((await settled).map((result) => result.status)).toEqual(Array(6).fill('rejected'));
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it('distinguishes datasources, diff sides, filters and resolved ranges in source identity', () => {
  const first = new FunctionProjections(snapshot);
  expect(new FunctionProjections({ ...snapshot, left: { ...snapshot.left } }).sourceId).toBe(first.sourceId);
  for (const changed of [
    { ...snapshot, dataSourceUid: 'other' },
    { ...snapshot, right: snapshot.left },
    { ...snapshot, left: { ...snapshot.left, start: 9000 } },
    { ...snapshot, left: { ...snapshot.left, traceIdSelector: ['trace'] } },
  ]) {
    expect(new FunctionProjections(changed).sourceId).not.toBe(first.sourceId);
  }
});
