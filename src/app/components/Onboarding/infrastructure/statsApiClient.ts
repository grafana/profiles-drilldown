import { DataSourceProxyClient } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClient';

export type Stats = {
  hasIngestedData: boolean;
  oldestProfileTime: number;
  newestProfileTime: number;
};

export class StatsApiClient extends DataSourceProxyClient {
  async get(): Promise<Stats> {
    const response = await this.fetch('/querier.v1.QuerierService/GetProfileStats', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const json = await response.json();

    return {
      hasIngestedData: json.dataIngested,
      oldestProfileTime: Number(json.oldestProfileTime),
      newestProfileTime: Number(json.newestProfileTime),
    };
  }
}
