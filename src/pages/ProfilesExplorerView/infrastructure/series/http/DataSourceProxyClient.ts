import { config } from '@grafana/runtime';
import { getDataSourceProxyUrl } from '@shared/infrastructure/appUrl';
import { HttpClient } from '@shared/infrastructure/http/HttpClient';

export class DataSourceProxyClient extends HttpClient {
  dataSourceUid: string;

  constructor(options: { dataSourceUid: string }) {
    const { dataSourceUid } = options;

    super(getDataSourceProxyUrl(dataSourceUid), {
      'content-type': 'application/json',
      'X-Grafana-Org-Id': String(config.bootData?.user?.orgId || ''),
    });

    this.dataSourceUid = options.dataSourceUid;
  }
}
