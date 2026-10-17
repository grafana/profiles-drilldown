import { getAppPluginVersion, reportInteraction as grafanaReportInteraction } from '@grafana/runtime';

import { reportInteraction } from '../reportInteraction';

jest.mock('@grafana/runtime', () => ({
  reportInteraction: jest.fn(),
  getAppPluginVersion: jest.fn(),
}));

const getAppPluginVersionMock = jest.mocked(getAppPluginVersion);

describe('reportInteraction(interactionName, properties)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getAppPluginVersionMock.mockResolvedValue('1.0.0');
  });

  it('calls Grafana\'s reportInteraction with a new "meta" property', async () => {
    setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/test-page-1'));

    await reportInteraction('g_pyroscope_app_exploration_type_clicked');

    expect(grafanaReportInteraction).toHaveBeenCalledWith('g_pyroscope_app_exploration_type_clicked', {
      props: undefined,
      meta: {
        page: 'test-page-1',
        appRelease: '1.0.0',
        appVersion: 'dev',
      },
    });
  });

  describe('if the current URL corresponds to the "profiles-explorer" page', () => {
    it('adds a "view" meta', async () => {
      setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/explore?explorationType=flame-graph'));

      await reportInteraction('g_pyroscope_app_exploration_type_clicked');

      expect(grafanaReportInteraction).toHaveBeenCalledWith('g_pyroscope_app_exploration_type_clicked', {
        props: undefined,
        meta: {
          appRelease: '1.0.0',
          appVersion: 'dev',
          page: 'explore',
          view: 'flame-graph',
        },
      });
    });
  });

  it('should report the page and view where the interaction happened when navigation occurs before the app version resolves', async () => {
    setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/explore?explorationType=flame-graph'));
    getAppPluginVersionMock.mockImplementation(async () => {
      setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/settings'));
      return '1.0.0';
    });

    await reportInteraction('g_pyroscope_app_user_settings_clicked');

    expect(grafanaReportInteraction).toHaveBeenCalledWith('g_pyroscope_app_user_settings_clicked', {
      props: undefined,
      meta: {
        appRelease: '1.0.0',
        appVersion: 'dev',
        page: 'explore',
        view: 'flame-graph',
      },
    });
  });

  describe('if some extra properties are passed', () => {
    it('calls Grafana\'s reportInteraction with these properties as well as a new "page" property', async () => {
      setWindowLocation(new URL('http://localhost:3000/a/grafana-pyroscope-app/test-page-2'));

      await reportInteraction('g_pyroscope_app_exploration_type_clicked', { explorationType: 'unit-tests' });

      expect(grafanaReportInteraction).toHaveBeenCalledWith('g_pyroscope_app_exploration_type_clicked', {
        props: {
          explorationType: 'unit-tests',
        },
        meta: {
          appRelease: '1.0.0',
          appVersion: 'dev',
          page: 'test-page-2',
        },
      });
    });
  });
});
