import { DataSourceProxyClient } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClient';

import { MemoryCacheClient } from './MemoryCacheClient';

export interface HttpRequestInput {
  url: string;
  options: RequestInit;
}

export interface RepositoryOptions {
  cacheClient: MemoryCacheClient;
}

export interface CancelOptions {
  dataSourceUid: string;
  reason: string;
}

export interface DataSourceRepository<TApiClient extends DataSourceProxyClient> {
  getCacheClient(): MemoryCacheClient;
  getApiClient(dataSourceUid: string): TApiClient;
  cancel(options: CancelOptions): void;
}
