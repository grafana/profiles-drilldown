import { dateTime, TimeRange } from '@grafana/data';

import { FunctionTableApiClient, functionTableRequest, FunctionTableSelection } from './FunctionTableApiClient';

jest.mock('@grafana/runtime', () => ({ config: { appSubUrl: '/grafana/', bootData: { user: { orgId: 42 } } } }));

const range: TimeRange = {
  from: dateTime(1700000000123),
  to: dateTime(1700000001123),
  raw: { from: '1700000000123', to: '1700000001123' },
};
const selection: FunctionTableSelection = {
  query: 'memory:alloc_space:bytes:space:bytes{service_name="pyroscope",env="test"}',
  timeRange: range,
};

function reply(body: unknown, status = 200): Response {
  return { ok: status === 200, status, statusText: '', json: async () => body } as Response;
}

describe('FunctionTableApiClient', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(() => {
    global.fetch = fetchMock;
  });

  it('requests exact single-profile rows with selectors and the full millisecond range', async () => {
    fetchMock.mockResolvedValue(
      reply({ functions: { total: '100', functions: [{ name: 'only', self: '7', total: '20' }, { name: 'zero' }] } })
    );
    const client = new FunctionTableApiClient({ dataSourceUid: 'local' });
    const signal = new AbortController().signal;
    const result = await client.query(
      functionTableRequest({
        left: { ...selection, spanSelector: '0000000000000001', profileIdSelector: 'profile-id' },
        maxNodes: 1,
      }),
      signal
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/grafana/api/datasources/proxy/uid/local/querier.v1.QuerierService/SelectMergeStacktraces',
      {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'X-Grafana-Org-Id': '42' },
        body: JSON.stringify({
          profileTypeID: 'memory:alloc_space:bytes:space:bytes',
          labelSelector: '{service_name="pyroscope",env="test"}',
          start: 1700000000123,
          end: 1700000001123,
          spanSelector: ['0000000000000001'],
          profileIdSelector: ['profile-id'],
          format: 'PROFILE_FORMAT_FUNCTIONS',
          maxNodes: 1,
        }),
      }
    );
    expect(result).toEqual({
      total: 100,
      rows: [
        { name: 'only', self: 7, total: 20 },
        { name: 'zero', self: 0, total: 0 },
      ],
    });
  });

  it('requests the joined diff with a top-level limit and preserves both full totals', async () => {
    fetchMock.mockResolvedValue(
      reply({
        functions: {
          leftTotal: '100',
          rightTotal: '200',
          functions: [{ name: 'shared', leftSelf: '2', leftTotal: '20', rightSelf: '3', rightTotal: '60' }],
        },
      })
    );
    const result = await new FunctionTableApiClient({ dataSourceUid: 'local' }).query(
      functionTableRequest({
        left: selection,
        right: { ...selection, query: 'memory:alloc_space:bytes:space:bytes{service_name="other"}' },
        maxNodes: 1,
      })
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/grafana/api/datasources/proxy/uid/local/querier.v1.QuerierService/Diff');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      left: {
        profileTypeID: 'memory:alloc_space:bytes:space:bytes',
        labelSelector: '{service_name="pyroscope",env="test"}',
        start: 1700000000123,
        end: 1700000001123,
      },
      right: {
        profileTypeID: 'memory:alloc_space:bytes:space:bytes',
        labelSelector: '{service_name="other"}',
        start: 1700000000123,
        end: 1700000001123,
      },
      format: 'PROFILE_FORMAT_FUNCTIONS',
      maxNodes: 1,
    });
    expect(result).toEqual({
      total: 100,
      totalRight: 200,
      rows: [{ name: 'shared', self: 2, total: 20, selfRight: 3, totalRight: 60 }],
    });
  });

  it('distinguishes an empty exact table from an unsupported response', async () => {
    fetchMock.mockResolvedValueOnce(reply({ functions: {} })).mockResolvedValueOnce(reply({ flamegraph: {} }));
    const client = new FunctionTableApiClient({ dataSourceUid: 'local' });
    const request = functionTableRequest({ left: selection });
    await expect(client.query(request)).resolves.toEqual({ total: 0, rows: [] });
    await expect(client.query(request)).resolves.toBeNull();
  });

  it('falls back on unimplemented but propagates authorization and query errors', async () => {
    const client = new FunctionTableApiClient({ dataSourceUid: 'local' });
    const request = functionTableRequest({ left: selection });
    fetchMock.mockResolvedValueOnce(reply({ code: 'unimplemented' }, 501));
    await expect(client.query(request)).resolves.toBeNull();
    for (const status of [400, 401, 500]) {
      fetchMock.mockResolvedValueOnce(reply({ message: 'query failed' }, status));
      await expect(client.query(request)).rejects.toThrow('query failed');
    }
  });
});
