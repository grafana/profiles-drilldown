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
  jest.doMock('@grafana/runtime', () => ({
    config: {
      appSubUrl: options?.appSubUrl,
      bootData: options?.bootData,
      datasources: {
        ...TEST_DATA_SOURCES,
        ...options?.dataSources,
      },
    },
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
      test(`the API base URL is "${expectedApiBaseUrl}"`, () => {
        setupMocks({ appSubUrl });

        const { ApiClient } = require('../ApiClient');

        const apiClient = new ApiClient();

        expect(apiClient.baseUrl).toBe(expectedApiBaseUrl);
      });
    });

    describe('if there is a data source uid in the URL', () => {
      describe('if it exists in the list of all data sources', () => {
        test('uses it to build the base URL', () => {
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

          expect(apiClient.baseUrl).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test-bis');
        });
      });
    });

    describe('if there is NO data source uid in the URL', () => {
      describe('if there is a data source in local storage', () => {
        test('uses this data source to build the base URL', () => {
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

          expect(apiClient.baseUrl).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test-local-storage');
        });
      });

      describe('if there is a data source marked as a default override', () => {
        test('uses this data source to build the base URL', () => {
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

          expect(apiClient.baseUrl).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test-ter');
        });
      });

      describe('when there is NO data source marked as default override', () => {
        test('uses the default data source to build the base URL', () => {
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

          expect(apiClient.baseUrl).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test');
        });
      });

      describe('otherwise', () => {
        test('uses the first data source in the list of all data sources to build the base URL', () => {
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

          expect(apiClient.baseUrl).toBe('/api/datasources/proxy/uid/grafanacloud-profiles-test');
        });
      });
    });
  });
});
