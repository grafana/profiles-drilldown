import { type GrafanaConfig, locationUtil } from '@grafana/data';
import { mockGrafanaFetch } from '@shared/infrastructure/http/testing/mockGrafanaFetch';

import { DataSourceProxyClient } from '../DataSourceProxyClient';

const locationDependencies = {
  config: { appSubUrl: '' } as GrafanaConfig,
  getTimeRangeForUrl: jest.fn(),
  getVariablesUrlParams: jest.fn(),
};

describe('DataSourceProxyClient', () => {
  beforeEach(() => {
    locationUtil.initialize(locationDependencies);
  });

  it('should proxy requests through the given datasource', () => {
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    expect(client.baseUrl).toBe('/api/datasources/proxy/uid/pyroscope-abc');
  });

  it('should send only the JSON content type by default', () => {
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    expect(client.defaultHeaders).toEqual({
      'content-type': 'application/json',
    });
  });

  it('should forward caller headers', async () => {
    const fetch = mockGrafanaFetch();
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    await client.fetch('/pyroscope/render', { headers: { accept: 'text/plain' } });

    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/pyroscope/render',
      expect.objectContaining({
        headers: { 'content-type': 'application/json', accept: 'text/plain' },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('should keep subpaths in base URLs but omit them from BackendSrv requests', async () => {
    locationUtil.initialize({
      ...locationDependencies,
      config: { ...locationDependencies.config, appSubUrl: '/grafana' },
    });
    const fetch = mockGrafanaFetch();
    const client = new DataSourceProxyClient({ dataSourceUid: 'pyroscope-abc' });

    await client.fetch('/pyroscope/render?format=dot');

    expect(client.baseUrl).toBe('/grafana/api/datasources/proxy/uid/pyroscope-abc');
    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/pyroscope/render?format=dot',
      expect.any(Object)
    );
  });
});
