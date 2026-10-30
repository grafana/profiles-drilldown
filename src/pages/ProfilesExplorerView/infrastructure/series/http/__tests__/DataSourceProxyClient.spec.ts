import { DataSourceProxyClient } from '../DataSourceProxyClient';

jest.mock('@grafana/runtime', () => ({ config: { bootData: { user: { orgId: 42 } } } }));

describe('DataSourceProxyClient', () => {
  it('should proxy requests through the given datasource', () => {
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    expect(client.baseUrl).toBe('/api/datasources/proxy/uid/pyroscope-abc');
  });

  it('should send the JSON content type and the org id', () => {
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    expect(client.defaultHeaders).toEqual({
      'content-type': 'application/json',
      'X-Grafana-Org-Id': '42',
    });
  });
});
