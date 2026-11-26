import { EmbeddedScene, SceneCanvasText } from '@grafana/scenes';

import packageJson from '../../../../package.json';
import { DrilldownQuerySession, getQuerySession, registerQuerySession } from './DrilldownQuerySession';
import { QuerySession } from './QuerySession';

jest.mock('./QuerySession');
const query = jest.mocked(QuerySession.prototype.query);
const close = jest.mocked(QuerySession.prototype.close);
const options = { dataSourceUid: 'test', query: 'cpu{service_name="api"}', from: 1000, to: 2000 };
const flush = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue({ names: ['env'], labelsSet: [] });
});

it('shares one versioned transport across every metadata consumer', async () => {
  const owner = new DrilldownQuerySession();
  const builder = owner.labels();
  await Promise.all([
    owner.series('test', 1000, 2000, ['{}']),
    owner.labels().listLabels(options),
    builder.listLabelValues({ ...options, label: 'env' }),
  ]);
  expect(QuerySession).toHaveBeenCalledTimes(1);
  expect(QuerySession).toHaveBeenCalledWith('test', packageJson.version);
  expect(query).toHaveBeenCalledWith(
    expect.objectContaining({
      query_type: 'QUERY_SERIES_LABELS',
      label_names: ['service_name', '__profile_type__'],
    }),
    undefined
  );
  expect(query).toHaveBeenCalledWith(
    expect.objectContaining({
      query_type: 'QUERY_LABEL_VALUES',
      name: 'env',
      matchers: ['{__profile_type__="cpu", service_name="api"}'],
    }),
    expect.any(AbortSignal)
  );
  owner.close();
});

it('resolves scene descendants to their own Drilldown owner', () => {
  const first = new EmbeddedScene({ body: new SceneCanvasText({ text: '' }) });
  const second = new EmbeddedScene({ body: new SceneCanvasText({ text: '' }) });
  const owner = new DrilldownQuerySession();
  const other = new DrilldownQuerySession();
  registerQuerySession(first, owner);
  registerQuerySession(second, other);
  expect(getQuerySession(first.state.body)).toBe(owner);
  expect(getQuerySession(second.state.body)).toBe(other);
});

it('closes before replacing the connection when the datasource changes', async () => {
  const owner = new DrilldownQuerySession();
  await owner.series('first', 1000, 2000, []);
  await owner.series('second', 1000, 2000, []);
  expect(close).toHaveBeenCalledTimes(1);
  expect(QuerySession).toHaveBeenCalledTimes(2);
  expect(close.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(QuerySession).mock.invocationCallOrder[1]);
  owner.close();
});

it('cancels only one query builder while retaining the shared connection', async () => {
  query.mockImplementation(
    (_query, signal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
      })
  );
  const owner = new DrilldownQuerySession();
  const first = owner.labels();
  const second = owner.labels();
  const a = first.listLabels(options);
  const b = second.listLabels(options);
  const aRejected = a.catch((error) => error);
  const bRejected = b.catch((error) => error);
  await flush();
  first.cancel({ dataSourceUid: 'test', reason: '' });
  expect(await aRejected).toMatchObject({ name: 'AbortError' });
  expect(query.mock.calls[0][1]?.aborted).toBe(true);
  expect(query.mock.calls[1][1]?.aborted).toBe(false);
  expect(close).not.toHaveBeenCalled();
  second.cancel({ dataSourceUid: 'test', reason: '' });
  expect(await bRejected).toMatchObject({ name: 'AbortError' });
  owner.close();
});

it('reuses pending and completed requests and invalidates them on datasource changes', async () => {
  const owner = new DrilldownQuerySession();
  const labels = owner.labels();
  await Promise.all([labels.listLabels(options), labels.listLabels(options)]);
  await labels.listLabels(options);
  expect(query).toHaveBeenCalledTimes(1);
  owner.selectDataSource('other');
  await labels.listLabels({ ...options, dataSourceUid: 'other' });
  expect(query).toHaveBeenCalledTimes(2);
  owner.close();
});

it('does not cache failed reads', async () => {
  const owner = new DrilldownQuerySession();
  query.mockRejectedValueOnce(new Error('unavailable'));
  const labels = owner.labels();
  await expect(labels.listLabels(options)).rejects.toThrow('unavailable');
  await expect(labels.listLabels(options)).resolves.toEqual([{ value: 'env', label: 'env' }]);
  expect(query).toHaveBeenCalledTimes(2);
  owner.close();
});

it('bounds concurrent queries and discards queued work after teardown', async () => {
  const resolvers: Array<() => void> = [];
  query.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ names: [], labelsSet: [] }));
      })
  );
  const owner = new DrilldownQuerySession();
  const requests = Array.from({ length: 8 }, (_, i) => owner.series('test', 1000 + i, 2000, []));
  const settled = Promise.allSettled(requests);
  await flush();
  expect(query).toHaveBeenCalledTimes(4);
  owner.close();
  resolvers.forEach((resolve) => resolve());
  const results = await settled;
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(4);
  expect(query).toHaveBeenCalledTimes(4);
  await expect(owner.series('test', 1000, 2000, [])).rejects.toMatchObject({ name: 'AbortError' });
  owner.activate();
  query.mockResolvedValue({ names: [], labelsSet: [] });
  await owner.series('test', 1000, 2000, []);
  expect(QuerySession).toHaveBeenCalledTimes(2);
  owner.close();
});
