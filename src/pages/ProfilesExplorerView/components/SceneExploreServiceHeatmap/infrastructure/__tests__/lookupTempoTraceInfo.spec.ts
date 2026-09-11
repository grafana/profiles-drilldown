import { DataFrame, DataQuery, DataQueryRequest, DataQueryResponse, DataSourceApi } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';

import { lookupTempoTraceInfo } from '../lookupTempoTraceInfo';

interface TempoSpanQuery extends DataQuery {
  query: string;
}

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: jest.fn(),
}));

function buildSpanFrame(rows: Array<{ spanId: string; traceId: string; name?: string; duration?: number }>): DataFrame {
  return {
    fields: [
      { name: 'traceIdHidden', values: rows.map((row) => row.traceId) },
      { name: 'spanID', values: rows.map((row) => row.spanId) },
      { name: 'name', values: rows.map((row) => row.name) },
      { name: 'duration', values: rows.map((row) => row.duration) },
    ],
    length: rows.length,
  } as unknown as DataFrame;
}

describe('lookupTempoTraceInfo', () => {
  it('issues one request per merged time window, scoped to that window, and merges the results', async () => {
    const query = jest.fn((request: DataQueryRequest<TempoSpanQuery>) => {
      const target = request.targets[0];
      let data: DataFrame[] = [];

      if (target.query.includes('span-a') && target.query.includes('span-b')) {
        data = [buildSpanFrame([{ spanId: 'span-a', traceId: 'trace-1' }, { spanId: 'span-b', traceId: 'trace-2' }])];
      } else if (target.query.includes('span-c')) {
        data = [buildSpanFrame([{ spanId: 'span-c', traceId: 'trace-3' }])];
      }

      return Promise.resolve({ data } as DataQueryResponse);
    });

    const dataSource = { query } as unknown as DataSourceApi;
    (getDataSourceSrv as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(dataSource) });

    const result = await lookupTempoTraceInfo(
      'tempo-uid',
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 1_020_000 },
        { spanId: 'span-c', timestamp: 5_000_000 },
      ],
      30_000,
      30_000
    );

    expect(query).toHaveBeenCalledTimes(2);

    const [firstRequest, secondRequest] = query.mock.calls.map(([request]) => request as DataQueryRequest<TempoSpanQuery>);

    expect(firstRequest.targets[0].query).toBe('{span:id="span-a" || span:id="span-b"}');
    expect(firstRequest.range.from.valueOf()).toBe(970_000);
    expect(firstRequest.range.to.valueOf()).toBe(1_050_000);

    expect(secondRequest.targets[0].query).toBe('{span:id="span-c"}');
    expect(secondRequest.range.from.valueOf()).toBe(4_970_000);
    expect(secondRequest.range.to.valueOf()).toBe(5_030_000);

    expect(result).toEqual({
      traceInfoBySpanId: {
        'span-a': { traceId: 'trace-1', spanName: undefined, duration: undefined },
        'span-b': { traceId: 'trace-2', spanName: undefined, duration: undefined },
        'span-c': { traceId: 'trace-3', spanName: undefined, duration: undefined },
      },
      failed: false,
    });
  });

  it('sets a span to null when no trace is found within its window', async () => {
    const query = jest.fn().mockResolvedValue({ data: [] } as DataQueryResponse);
    const dataSource = { query } as unknown as DataSourceApi;
    (getDataSourceSrv as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(dataSource) });

    const result = await lookupTempoTraceInfo(
      'tempo-uid',
      [{ spanId: 'span-a', timestamp: 1_000_000 }],
      30_000,
      30_000
    );

    expect(result).toEqual({ traceInfoBySpanId: { 'span-a': null }, failed: false });
  });

  it('keeps successful windows when another window fails', async () => {
    const query = jest.fn((request: DataQueryRequest<TempoSpanQuery>) => {
      if (request.targets[0].query.includes('span-a')) {
        return Promise.resolve({ data: [buildSpanFrame([{ spanId: 'span-a', traceId: 'trace-1' }])] } as DataQueryResponse);
      }
      return Promise.reject(new Error('Tempo unavailable'));
    });
    const dataSource = { query } as unknown as DataSourceApi;
    (getDataSourceSrv as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(dataSource) });

    const result = await lookupTempoTraceInfo(
      'tempo-uid',
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 5_000_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual({
      traceInfoBySpanId: { 'span-a': { traceId: 'trace-1', spanName: undefined, duration: undefined } },
      failed: true,
    });
  });
});
