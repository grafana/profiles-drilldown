import { grafanaFetch } from '@shared/infrastructure/http/grafanaFetch';
import { HttpClient } from '@shared/infrastructure/http/HttpClient';
import type { HttpRequestInput } from '@shared/infrastructure/types';
import { PYROSCOPE_DATA_SOURCES_TYPE } from 'src/constants';

export class DataSourceProxyClient extends HttpClient {
  dataSourceUid: string;

  constructor({ dataSourceUid }: { dataSourceUid: string }) {
    super('', { 'content-type': 'application/json' });
    this.dataSourceUid = dataSourceUid;
  }

  protected request({ url, options }: HttpRequestInput): Promise<Response> {
    const routePath = url.startsWith('/') ? url.slice(1) : url;
    return grafanaFetch({
      pluginId: PYROSCOPE_DATA_SOURCES_TYPE,
      uid: this.dataSourceUid,
      routePath,
      options,
    });
  }
}
