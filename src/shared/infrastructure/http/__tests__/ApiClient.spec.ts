const TEST_DATA_SOURCES = {
  'Test Data Source': {
    id: 1,
    isDefault: true,
    type: 'grafana-pyroscope-datasource',
    name: 'Test Data Source',
    uid: 'grafanacloud-profiles-test',
    jsonData: {},
  },
};

function setupMocks(options?: {
  appSubUrl?: string;
  bootData?: Record<string, any>;
  dataSources?: Record<string, any>;
}) {
  const datasources = Object.values({
    ...TEST_DATA_SOURCES,
    ...options?.dataSources,
  });
  jest.doMock('@grafana/runtime', () => ({
    config: {
      appSubUrl: options?.appSubUrl,
      bootData: options?.bootData,
    },
  }));

  jest.doMock('@grafana/plugin-compat/datasources', () => ({
    getDataSourceInstanceList: () => Promise.resolve(datasources),
    getDataSourceInstanceSettings: (uid: string) => Promise.resolve(datasources.find((d) => d.uid === uid)),
    getDefaultDataSourceInstanceListItem: () => Promise.resolve(datasources.find((ds) => ds.isDefault)),
  }));
}

describe('ApiClient', () => {
  describe('request headers', () => {
    test('adds default "content-type" and "X-Grafana-Org-Id" headers', () => {
      setupMocks({
        bootData: {
          user: { orgId: 42 },
        },
      });

      const { ApiClient } = require('../ApiClient');

      const apiClient = new ApiClient();

      expect(apiClient.defaultHeaders).toEqual({
        'content-type': 'application/json',
        'X-Grafana-Org-Id': '42',
      });
    });
  });

  describe('base URL', () => {
    describe.each([
      ['/', '/api/datasources/proxy/uid/grafanacloud-profiles-test'],
      ['', '/api/datasources/proxy/uid/grafanacloud-profiles-test'],
      // app URL with pathname
      ['/stable-grafana/', '/stable-grafana/api/datasources/proxy/uid/grafanacloud-profiles-test'],
      // app URL with no slash at the end
      ['/stable-grafana', '/stable-grafana/api/datasources/proxy/uid/grafanacloud-profiles-test'],
    ])('when the app URL provided by the platform is "%s"', (appSubUrl, expectedApiBaseUrl) => {
      test(`the API base URL is "${expectedApiBaseUrl}"`, async () => {
        setupMocks({ appSubUrl });

        const { ApiClient } = require('../ApiClient');

        const apiClient = new ApiClient();

        expect(await apiClient.getBaseUrl()).toBe(expectedApiBaseUrl);
      });
    });

    describe('if there is a data source uid in the URL', () => {
      describe('if it exists in the list of all data sources', () => {
        test('uses it to build the base URL', async () => {
          setupMocks({
            dataSources: {
              'Another Test Data Source': {
                id: 2,
                isDefault: false,
                type: 'grafana-pyroscope-datasource',
                name: 'Another Test Data Source',
                uid: 'grafanacloud-profiles-test-bis',
              },
            },
          });

          const { ApiClient } = require('../ApiClient');

          setWindowLocation(
            new URL(
              'http://localhost:3000/a/grafana-pyroscope-app/single?var-dataSource=grafanacloud-profiles-test-bis'
            )
          );

          const apiClient = new ApiClient();

          expect(await apiClient.getBaseUrl()).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test-bis');
        });
      });
    });

    describe('if there is NO data source uid in the URL', () => {
      describe('if there is a data source in local storage', () => {
        test('uses this data source to build the base URL', async () => {
          setupMocks({
            dataSources: {
              'Local Storage Test Data Source': {
                id: 2,
                isDefault: false,
                type: 'grafana-pyroscope-datasource',
                name: 'Local Storage Test Data Source',
                uid: 'grafanacloud-profiles-test-local-storage',
                jsonData: {},
              },
            },
          });

          jest.doMock('../../userStorage', () => ({
            userStorage: {
              KEYS: {
                PROFILES_EXPLORER: 'grafana-pyroscope-app.profilesExplorer',
              },
              get: () => ({
                dataSource: 'grafanacloud-profiles-test-local-storage',
              }),
            },
          }));

          const { ApiClient } = require('../ApiClient');

          setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/single?var-dataSource='));

          const apiClient = new ApiClient();

          expect(await apiClient.getBaseUrl()).toBe(
            '/api/datasources/proxy/uid/grafanacloud-profiles-test-local-storage'
          );
        });
      });

      describe('if there is a data source marked as a default override', () => {
        test('uses this data source to build the base URL', async () => {
          setupMocks({
            dataSources: {
              'Test Data Source bis': {
                id: 2,
                type: 'grafana-pyroscope-datasource',
                name: 'Test Data Source bis',
                uid: 'grafanacloud-profiles-test-bis',
                jsonData: {},
              },
              'Test Data Source ter': {
                id: 2,
                type: 'grafana-pyroscope-datasource',
                name: 'Test Data Source ter',
                uid: 'grafanacloud-profiles-test-ter',
                jsonData: {
                  overridesDefault: true,
                },
              },
            },
          });

          const { ApiClient } = require('../ApiClient');

          setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/single?var-dataSource='));

          const apiClient = new ApiClient();

          expect(await apiClient.getBaseUrl()).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test-ter');
        });
      });

      describe('when there is NO data source marked as default override', () => {
        test('uses the default data source to build the base URL', async () => {
          setupMocks({
            dataSources: {
              'Another Test Data Source': {
                id: 2,
                isDefault: false,
                type: 'grafana-pyroscope-datasource',
                name: 'Another Test Data Source',
                uid: 'grafanacloud-profiles-test-bis',
                jsonData: {},
              },
            },
          });

          const { ApiClient } = require('../ApiClient');

          setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/single?var-dataSource='));

          const apiClient = new ApiClient();

          expect(await apiClient.getBaseUrl()).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test');
        });
      });

      describe('otherwise', () => {
        test('uses the first data source in the list of all data sources to build the base URL', async () => {
          setupMocks({
            dataSources: {
              'Test Data Source': {
                id: 1,
                type: 'grafana-pyroscope-datasource',
                name: 'Test Data Source',
                uid: 'grafanacloud-profiles-test',
                isDefault: false,
                jsonData: {},
              },
              'Another Test Data Source': {
                id: 2,
                type: 'grafana-pyroscope-datasource',
                name: 'Another Test Data Source',
                uid: 'grafanacloud-profiles-test-bis',
                isDefault: false,
                jsonData: {},
              },
            },
          });

          const { ApiClient } = require('../ApiClient');

          setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/single?var-dataSource='));

          const apiClient = new ApiClient();

          expect(await apiClient.getBaseUrl()).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test');
        });
      });
    });
  });

  describe('getPyroscopeDataSources', () => {
    beforeEach(() => {
      setupMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    test('should request only Pyroscope data sources', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      const getList = jest.spyOn(datasources, 'getDataSourceInstanceList');
      const { ApiClient } = require('../ApiClient');

      await ApiClient.getPyroscopeDataSources();

      expect(getList).toHaveBeenCalledWith({ pluginId: 'grafana-pyroscope-datasource' });
    });

    test('should return the settings for each data source', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      const getList = jest
        .spyOn(datasources, 'getDataSourceInstanceList')
        .mockResolvedValue([{ uid: 'first' }, { uid: 'second' }]);
      const getSettings = jest
        .spyOn(datasources, 'getDataSourceInstanceSettings')
        .mockImplementation(async (uid) => ({ uid }));
      const { ApiClient } = require('../ApiClient');

      const { settings } = await ApiClient.getPyroscopeDataSources();

      expect(getList).toHaveBeenCalledTimes(1);
      expect(getSettings).toHaveBeenCalledTimes(2);
      expect(getSettings).toHaveBeenCalledWith('first');
      expect(getSettings).toHaveBeenCalledWith('second');
      expect(settings).toEqual([{ uid: 'first' }, { uid: 'second' }]);
    });

    test('should return the default data source UID', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      const getDefault = jest.spyOn(datasources, 'getDefaultDataSourceInstanceListItem');
      const { ApiClient } = require('../ApiClient');

      const { defaultUid } = await ApiClient.getPyroscopeDataSources();

      expect(getDefault).toHaveBeenCalledTimes(1);
      expect(getDefault).toHaveBeenCalledWith(Object.values(TEST_DATA_SOURCES));
      expect(defaultUid).toBe('grafanacloud-profiles-test');
    });

    test('should return an undefined UID when there is no default data source', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      jest.spyOn(datasources, 'getDefaultDataSourceInstanceListItem').mockResolvedValue(undefined);
      const { ApiClient } = require('../ApiClient');

      const { defaultUid } = await ApiClient.getPyroscopeDataSources();

      expect(defaultUid).toBeUndefined();
    });

    test('should return empty settings when there are no data sources', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      jest.spyOn(datasources, 'getDataSourceInstanceList').mockResolvedValue([]);
      const { ApiClient } = require('../ApiClient');

      const { settings } = await ApiClient.getPyroscopeDataSources();

      expect(settings).toEqual([]);
    });

    test('should filter out missing data source settings', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      jest
        .spyOn(datasources, 'getDataSourceInstanceList')
        .mockResolvedValue([{ uid: 'missing' }, { uid: 'grafanacloud-profiles-test' }]);
      const { ApiClient } = require('../ApiClient');

      const { settings } = await ApiClient.getPyroscopeDataSources();

      expect(settings).toEqual(Object.values(TEST_DATA_SOURCES));
    });

    test('should share the pending request between concurrent calls', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      const getList = jest.spyOn(datasources, 'getDataSourceInstanceList');
      const { ApiClient } = require('../ApiClient');

      await Promise.all([ApiClient.getPyroscopeDataSources(), ApiClient.getPyroscopeDataSources()]);

      expect(getList).toHaveBeenCalledTimes(1);
    });

    test('should propagate data source loading errors', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      const error = new Error('Failed to load data sources');
      jest.spyOn(datasources, 'getDataSourceInstanceList').mockRejectedValueOnce(error);
      const { ApiClient } = require('../ApiClient');

      await expect(ApiClient.getPyroscopeDataSources()).rejects.toThrow(error);
    });

    test('should retry after a failed request', async () => {
      const datasources = require('@grafana/plugin-compat/datasources');
      jest
        .spyOn(datasources, 'getDataSourceInstanceList')
        .mockRejectedValueOnce(new Error('Failed to load data sources'));
      const { ApiClient } = require('../ApiClient');

      await expect(ApiClient.getPyroscopeDataSources()).rejects.toThrow('Failed to load data sources');

      await expect(ApiClient.getPyroscopeDataSources()).resolves.toEqual({
        settings: Object.values(TEST_DATA_SOURCES),
        defaultUid: 'grafanacloud-profiles-test',
      });
    });
  });
});
