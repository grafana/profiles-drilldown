import { mockGrafanaFetch } from '@shared/infrastructure/http/testing/mockGrafanaFetch';

import { DataSourceProxyClient } from '../DataSourceProxyClient';

describe('DataSourceProxyClient', () => {
  it('should send only the JSON content type by default', () => {
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    expect(client.defaultHeaders).toEqual({
      'content-type': 'application/json',
    });
  });

  it('should pass the datasource and upstream query string to the proxy', async () => {
    const fetch = mockGrafanaFetch();
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    await client.fetch('/pyroscope/render?format=dot&query=cpu%2Ftotal', { headers: { accept: 'text/plain' } });

    expect(fetch).toHaveBeenCalledWith({
      pluginId: 'grafana-pyroscope-datasource',
      uid: 'pyroscope-abc',
      routePath: 'pyroscope/render?format=dot&query=cpu%2Ftotal',
      options: expect.objectContaining({
        headers: { 'content-type': 'application/json', accept: 'text/plain' },
        signal: expect.any(AbortSignal),
      }),
    });
  });
});
