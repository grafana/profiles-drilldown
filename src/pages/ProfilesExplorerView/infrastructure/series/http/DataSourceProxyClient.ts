import { locationUtil } from '@grafana/data';
import { getDataSourceProxyUrl } from '@shared/infrastructure/appUrl';
import { grafanaFetch } from '@shared/infrastructure/http/grafanaFetch';
import { HttpClient } from '@shared/infrastructure/http/HttpClient';
import type { HttpRequestInput } from '@shared/infrastructure/types';

export class DataSourceProxyClient extends HttpClient {
  dataSourceUid: string;

  constructor(options: { dataSourceUid: string }) {
    const { dataSourceUid } = options;
    super(getDataSourceProxyUrl(dataSourceUid), { 'content-type': 'application/json' });
    this.dataSourceUid = options.dataSourceUid;
  }

  protected request({ url, options }: HttpRequestInput): Promise<Response> {
    // BackendSrv makes URLs relative to Grafana's base href; strip appSubUrl to avoid a doubled prefix.
    return grafanaFetch({ url: locationUtil.stripBaseFromUrl(`${this.baseUrl}${url}`), options });
  }
}
