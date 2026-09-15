import { dateTime, TimeRange } from '@grafana/data';

import { DiffProfileApiClient } from './DiffProfileApiClient';

jest.mock('@grafana/runtime', () => ({ config: { appSubUrl: '/grafana/', bootData: { user: { orgId: 42 } } } }));

const leftTimeRange: TimeRange = {
  from: dateTime(1700000000123),
  to: dateTime(1700000001123),
  raw: { from: '1700000000123', to: '1700000001123' },
};
const rightTimeRange: TimeRange = {
  from: dateTime(1700000002123),
  to: dateTime(1700000003123),
  raw: { from: '1700000002123', to: '1700000003123' },
};
const params = {
  leftQuery: 'memory:alloc_space:bytes:space:bytes{service_name="baseline",env!="dev"}',
  leftTimeRange,
  rightQuery: 'memory:alloc_space:bytes:space:bytes{service_name="comparison",env=~"prod.*"}',
  rightTimeRange,
  maxNodes: 5,
};

function reply(body: unknown, status = 200): Response {
  return { ok: status === 200, status, statusText: '', json: async () => body } as Response;
}

describe('DiffProfileApiClient', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(() => {
    global.fetch = fetchMock;
  });

  it('posts both selections and per-side node limits to Diff and preserves the paired graph values', async () => {
    fetchMock.mockResolvedValue(
      reply({
        flamegraph: {
          names: ['total', 'shared', 'removed', 'new'],
          levels: [
            { values: ['0', '100', '10', '0', '200', '20', '0'] },
            {
              values: [
                '0',
                '30',
                '30',
                '0',
                '80',
                '80',
                '1',
                '0',
                '60',
                '60',
                '0',
                '0',
                '0',
                '2',
                '0',
                '0',
                '0',
                '0',
                '100',
                '100',
                '3',
              ],
            },
          ],
          total: '300',
          maxSelf: '100',
          leftTicks: '100',
          rightTicks: '200',
        },
      })
    );
    const signal = new AbortController().signal;
    const profile = await new DiffProfileApiClient({ dataSourceUid: 'local' }).get(params, signal);

    expect(fetchMock).toHaveBeenCalledWith('/grafana/api/datasources/proxy/uid/local/querier.v1.QuerierService/Diff', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'X-Grafana-Org-Id': '42' },
      body: JSON.stringify({
        left: {
          profileTypeID: 'memory:alloc_space:bytes:space:bytes',
          labelSelector: '{service_name="baseline",env!="dev"}',
          start: 1700000000123,
          end: 1700000001123,
          maxNodes: 5,
        },
        right: {
          profileTypeID: 'memory:alloc_space:bytes:space:bytes',
          labelSelector: '{service_name="comparison",env=~"prod.*"}',
          start: 1700000002123,
          end: 1700000003123,
          maxNodes: 5,
        },
      }),
    });
    expect(profile).toEqual({
      version: 1,
      flamebearer: {
        names: ['total', 'shared', 'removed', 'new'],
        levels: [
          [0, 100, 10, 0, 200, 20, 0],
          [0, 30, 30, 0, 80, 80, 1, 0, 60, 60, 0, 0, 0, 2, 0, 0, 0, 0, 100, 100, 3],
        ],
        numTicks: 300,
        maxSelf: 100,
      },
      metadata: { name: 'alloc_space', format: 'double', spyName: '', units: 'bytes', sampleRate: 100 },
      leftTicks: 100,
      rightTicks: 200,
    });
  });

  it.each([
    ['process_cpu:cpu:nanoseconds:cpu:nanoseconds', 'cpu', 'samples', 1_000_000_000],
    ['process_cpu:samples:count:cpu:nanoseconds', 'samples', 'objects', 100],
    ['memory:alloc_objects:count:space:bytes', 'alloc_objects', 'objects', 100],
    ['memory:inuse_objects:count:space:bytes', 'inuse_objects', 'objects', 100],
    ['goroutines:goroutine:count:goroutine:count', 'goroutine', 'objects', 100],
    ['block:delay:nanoseconds:contentions:count', 'delay', 'nanoseconds', 100],
  ])('preserves Flamebearer metadata for %s', async (profileTypeID, name, units, sampleRate) => {
    fetchMock.mockResolvedValue(reply({ flamegraph: {} }));
    const query = `${profileTypeID}{service_name="test"}`;
    const profile = await new DiffProfileApiClient({ dataSourceUid: 'local' }).get({
      ...params,
      leftQuery: query,
      rightQuery: query,
    });
    expect(profile.metadata).toEqual({ name, format: 'double', spyName: '', units, sampleRate });
    expect(profile.flamebearer).toEqual({ names: [], levels: [], numTicks: 0, maxSelf: 0 });
    expect(profile.leftTicks).toBe(0);
    expect(profile.rightTicks).toBe(0);
  });

  it.each([null, 0, -1])('preserves the default or unlimited limit: %s', async (maxNodes) => {
    fetchMock.mockResolvedValue(reply({ flamegraph: {} }));
    await new DiffProfileApiClient({ dataSourceUid: 'local' }).get({ ...params, maxNodes });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.left.maxNodes).toBe(maxNodes ?? undefined);
    expect(body.right.maxNodes).toBe(maxNodes ?? undefined);
    expect(body).not.toHaveProperty('maxNodes');
  });

  it('rejects mismatched profile types before querying', async () => {
    await expect(
      new DiffProfileApiClient({ dataSourceUid: 'local' }).get({
        ...params,
        rightQuery: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="comparison"}',
      })
    ).rejects.toThrow('Profile types must match');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates query errors and rejects a missing graph without falling back to the legacy endpoint', async () => {
    const client = new DiffProfileApiClient({ dataSourceUid: 'local' });
    fetchMock.mockResolvedValueOnce(reply({ message: 'query failed' }, 500)).mockResolvedValueOnce(reply({}));
    await expect(client.get(params)).rejects.toThrow('query failed');
    await expect(client.get(params)).rejects.toThrow('Diff response is missing the flame graph');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
