import { dateTime } from '@grafana/data';
import { mockFetch } from '@shared/infrastructure/http/testing/mockFetch';

import { seriesRepository } from '../seriesRepository';

const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: '1000', to: '2000' } };

describe('seriesRepository', () => {
  it('should not reuse the cached series of another datasource', async () => {
    const fetch = mockFetch(() => ({ labelsSet: [] }));

    await seriesRepository.list({ dataSourceUid: 'pyroscope-abc', timeRange });
    await seriesRepository.list({ dataSourceUid: 'pyroscope-def', timeRange });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toEqual('/api/datasources/proxy/uid/pyroscope-abc/querier.v1.QuerierService/Series');
    expect(fetch.mock.calls[1][0]).toEqual('/api/datasources/proxy/uid/pyroscope-def/querier.v1.QuerierService/Series');
  });
});
