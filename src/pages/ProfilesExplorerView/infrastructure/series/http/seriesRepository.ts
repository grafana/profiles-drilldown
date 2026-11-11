import { TimeRange } from '@grafana/data';
import { MemoryCacheClient } from '@shared/infrastructure/MemoryCacheClient';
import { CancelOptions, DataSourceRepository, RepositoryOptions } from '@shared/infrastructure/types';

import { computeRoundedTimeRange } from '../../../helpers/computeRoundedTimeRange';
import { DataSourceProxyClientBuilder } from './DataSourceProxyClientBuilder';
import { PyroscopeSeries, SeriesApiClient } from './SeriesApiClient';

class SeriesRepository implements DataSourceRepository<SeriesApiClient> {
  private readonly cacheClient: MemoryCacheClient;

  constructor(options: RepositoryOptions) {
    this.cacheClient = options.cacheClient;
  }

  getCacheClient() {
    return this.cacheClient;
  }

  getApiClient(dataSourceUid: string) {
    return DataSourceProxyClientBuilder.build(dataSourceUid, SeriesApiClient);
  }

  cancel({ dataSourceUid, reason }: CancelOptions) {
    this.getApiClient(dataSourceUid).abort(reason);
  }

  async list(options: { dataSourceUid: string; timeRange: TimeRange; matchers?: string[] }): Promise<PyroscopeSeries> {
    const { from, to } = computeRoundedTimeRange(options.timeRange);
    const { matchers } = options;
    const apiClient = this.getApiClient(options.dataSourceUid);

    const matchersCacheKey = JSON.stringify(matchers ?? []);
    const cacheParams = [apiClient.baseUrl, from, to, matchersCacheKey];

    const responseFromCacheP = this.getCacheClient().get(cacheParams);
    if (responseFromCacheP) {
      const { services, profileMetrics } = await responseFromCacheP;

      if (!services.size && !profileMetrics.size) {
        this.getCacheClient().delete(cacheParams);
      }

      return { services, profileMetrics };
    }

    const fetchP = apiClient.list({ from, to, matchers });
    this.getCacheClient().set(cacheParams, fetchP);

    try {
      const { services, profileMetrics } = await fetchP;
      return { services, profileMetrics };
    } catch (error) {
      this.getCacheClient().delete(cacheParams);
      throw error;
    }
  }
}

export const seriesRepository = new SeriesRepository({ cacheClient: new MemoryCacheClient() });
