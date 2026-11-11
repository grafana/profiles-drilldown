function setup(appSubUrl?: string) {
  jest.doMock('@grafana/runtime', () => ({
    reportInteraction: jest.fn(),
    config: {
      appSubUrl,
    },
  }));

  const { locationUtil } = require('@grafana/data');
  locationUtil.initialize({
    config: { appSubUrl: appSubUrl ?? '' },
    getTimeRangeForUrl: jest.fn(),
    getVariablesUrlParams: jest.fn(),
  });

  return require('../getExploreUrl');
}

describe('getExploreUrl(rawTimeRange, query, datasource)', () => {
  test('If "appSubUrl" is not defined in the Grafana runtime config', () => {
    const { getExploreUrl } = setup();

    const rawTimeRange = { from: 'now-5m', to: 'now' };
    const query = {
      refId: 'test1',
      queryType: 'metrics',
      profileTypeId: 'block:delay:nanoseconds:contentions:count',
      labelSelector: '{}',
      groupBy: [],
    };
    const datasource = 'grafanacloud-profiles-sedemo';
    const expectedUrl =
      '/explore?panes=%7B%22pyroscope-explore%22:%7B%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D,%22queries%22:%5B%7B%22refId%22:%22test1%22,%22queryType%22:%22metrics%22,%22profileTypeId%22:%22block:delay:nanoseconds:contentions:count%22,%22labelSelector%22:%22%7B%7D%22,%22groupBy%22:%5B%5D,%22datasource%22:%22grafanacloud-profiles-sedemo%22%7D%5D,%22panelsState%22:%7B%7D,%22datasource%22:%22grafanacloud-profiles-sedemo%22%7D%7D&schemaVersion=1';

    expect(getExploreUrl(rawTimeRange, query, datasource)).toBe(expectedUrl);
  });

  test('If "appSubUrl" is defined in the Grafana runtime config', () => {
    const { getExploreUrl } = setup('http://test:4242');

    const rawTimeRange = { from: 'now-5m', to: 'now' };
    const query = {
      refId: 'test1',
      queryType: 'metrics',
      profileTypeId: 'block:delay:nanoseconds:contentions:count',
      labelSelector: '{}',
      groupBy: [],
    };
    const datasource = 'grafanacloud-profiles-sedemo';
    const expectedUrl =
      'http://test:4242/explore?panes=%7B%22pyroscope-explore%22:%7B%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D,%22queries%22:%5B%7B%22refId%22:%22test1%22,%22queryType%22:%22metrics%22,%22profileTypeId%22:%22block:delay:nanoseconds:contentions:count%22,%22labelSelector%22:%22%7B%7D%22,%22groupBy%22:%5B%5D,%22datasource%22:%22grafanacloud-profiles-sedemo%22%7D%5D,%22panelsState%22:%7B%7D,%22datasource%22:%22grafanacloud-profiles-sedemo%22%7D%7D&schemaVersion=1';

    expect(getExploreUrl(rawTimeRange, query, datasource)).toBe(expectedUrl);
  });
});
