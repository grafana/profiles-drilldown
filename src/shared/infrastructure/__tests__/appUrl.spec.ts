import type { GrafanaConfig } from '@grafana/data';

// jest.config.js sets window.location.origin to http://localhost:3000 for absolute URL assertions.

function setupAppUrl({ appSubUrl = '' }: { appSubUrl?: string } = {}) {
  const { locationUtil } = require('@grafana/data') as typeof import('@grafana/data');
  locationUtil.initialize({
    config: { appSubUrl } as GrafanaConfig,
    getTimeRangeForUrl: jest.fn(),
    getVariablesUrlParams: jest.fn(),
  });
  return require('../appUrl') as typeof import('../appUrl');
}

describe('appUrl', () => {
  test.each([
    ['', '/explore'],
    ['/', '/explore'],
    ['/grafana', '/grafana/explore'],
    ['/grafana/', '/grafana/explore'],
  ])('should prefix root-relative paths consistently with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('/explore')).toBe(expectedUrl);
  });

  test.each([
    ['', '/explore'],
    ['/', '/explore'],
    ['/grafana', '/grafana/explore'],
    ['/grafana/', '/grafana/explore'],
  ])('should prefix relative paths consistently with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('explore')).toBe(expectedUrl);
  });

  test.each([
    ['', '/grafana/explore'],
    ['/', '/grafana/explore'],
    ['/grafana', '/grafana/explore'],
    ['/grafana/', '/grafana/explore'],
  ])('should not duplicate an existing base path with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('/grafana/explore')).toBe(expectedUrl);
  });

  test.each([
    ['', '/grafana'],
    ['/', '/grafana'],
    ['/grafana', '/grafana'],
    ['/grafana/', '/grafana'],
  ])('should preserve a path equal to the base with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('/grafana')).toBe(expectedUrl);
  });

  test.each([
    ['/grafana', '/grafana?view=all', '/grafana?view=all'],
    ['/grafana', '/grafana#details', '/grafana#details'],
    ['/grafana/', '/grafana?view=all', '/grafana?view=all'],
    ['/grafana/', '/grafana#details', '/grafana#details'],
  ])(
    'should not duplicate a base path followed by a query or fragment with appSubUrl "%s" and path "%s"',
    (appSubUrl, path, expectedUrl) => {
      const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

      expect(getGrafanaUrl(path)).toBe(expectedUrl);
    }
  );

  test.each([
    ['', '/grafana-other/explore'],
    ['/', '/grafana-other/explore'],
    ['/grafana', '/grafana/grafana-other/explore'],
    ['/grafana/', '/grafana/grafana-other/explore'],
  ])('should not mistake a similar prefix for the base path with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('/grafana-other/explore')).toBe(expectedUrl);
  });

  test.each([
    ['', 'https://example.com/explore'],
    ['/', 'https://example.com/explore'],
    ['/grafana', 'https://example.com/explore'],
    ['/grafana/', 'https://example.com/explore'],
  ])('should leave absolute URLs unchanged with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('https://example.com/explore')).toBe(expectedUrl);
  });

  test.each([
    ['', '/explore?next=https://example.com/path//part'],
    ['/', '/explore?next=https://example.com/path//part'],
    ['/grafana', '/grafana/explore?next=https://example.com/path//part'],
    ['/grafana/', '/grafana/explore?next=https://example.com/path//part'],
  ])('should preserve query values containing consecutive slashes with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaUrl('/explore?next=https://example.com/path//part')).toBe(expectedUrl);
  });

  test.each([
    ['', 'http://localhost:3000/a/plugin/callback'],
    ['/', 'http://localhost:3000/a/plugin/callback'],
    ['/grafana', 'http://localhost:3000/grafana/a/plugin/callback'],
    ['/grafana/', 'http://localhost:3000/grafana/a/plugin/callback'],
  ])('should build absolute URLs using the browser origin with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getGrafanaAbsoluteUrl } = setupAppUrl({ appSubUrl });

    expect(getGrafanaAbsoluteUrl('/a/plugin/callback')).toBe(expectedUrl);
  });

  test.each([
    ['', '/api/datasources/proxy/uid/profiles'],
    ['/', '/api/datasources/proxy/uid/profiles'],
    ['/grafana', '/grafana/api/datasources/proxy/uid/profiles'],
    ['/grafana/', '/grafana/api/datasources/proxy/uid/profiles'],
  ])('should build datasource proxy URLs with appSubUrl "%s"', (appSubUrl, expectedUrl) => {
    const { getDataSourceProxyUrl } = setupAppUrl({ appSubUrl });

    expect(getDataSourceProxyUrl('profiles')).toBe(expectedUrl);
  });

  test.each([
    ['', 'http://localhost:3000/namespaces/team%2Fone?view=all#details'],
    ['/', 'http://localhost:3000/namespaces/team%2Fone?view=all#details'],
    ['/grafana', 'http://localhost:3000/grafana/namespaces/team%2Fone?view=all#details'],
    ['/grafana/', 'http://localhost:3000/grafana/namespaces/team%2Fone?view=all#details'],
  ])(
    'should preserve encoded path segments, query parameters and fragments with appSubUrl "%s"',
    (appSubUrl, expectedUrl) => {
      const { getGrafanaAbsoluteUrl } = setupAppUrl({ appSubUrl });

      expect(getGrafanaAbsoluteUrl('/namespaces/team%2Fone?view=all#details')).toBe(expectedUrl);
    }
  );
});
