import 'dotenv/config';
import path from 'path';

type EnvVars = {
  E2E_BASE_URL: string;
  E2E_USERNAME: string;
  E2E_PASSWORD: string;
};

function getEnvVars(): EnvVars {
  const envVars = ['E2E_BASE_URL', 'E2E_USERNAME', 'E2E_PASSWORD'].reduce((acc, name: string) => {
    acc[name] = process.env[name];
    return acc;
  }, {} as EnvVars);

  if (!envVars.E2E_BASE_URL) {
    envVars.E2E_BASE_URL = 'http://localhost:3000';
  }

  return envVars;
}

export const ENV_VARS = getEnvVars();

export const CHROMIUM_VIEWPORT = { width: 1920, height: 1080 };

export const AUTH_FILE = path.join(process.cwd(), 'e2e', 'auth', 'user.json');

/* Grafana Profiles Drilldown */

/**
 * If you're adding a new exploration type, please make sure to update the useCurrentServiceName() function
 * @see src/pages/ProfilesExplorerView/components/SceneCreateMetricModal/SceneCreateRecordingRuleModal.tsx
 */
export enum ExplorationType {
  AllServices = 'all',
  ProfileTypes = 'profiles',
  Labels = 'labels',
  FlameGraph = 'flame-graph',
  DiffFlameGraph = 'diff-flame-graph',
  Favorites = 'favorites',
}

export const DEFAULT_EXPLORE_PROFILES_DATASOURCE_UID = 'grafanacloud-profiles-local-a';

export const DEFAULT_EXPLORE_PROFILES_URL_PARAMS = ENV_VARS.E2E_BASE_URL.startsWith('http://localhost')
  ? new URLSearchParams({
      // We use static data in local and PR build (where the host is http://localhost):
      from: '2024-03-13T18:00:00.000Z',
      to: '2024-03-13T18:50:00.000Z',
      'var-dataSource': 'grafanacloud-profiles-local-a',
      'var-serviceName': 'ride-sharing-app',
      'var-profileMetricId': 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
      // no max nodes here so that the app fetches user settings and we can also test settings changes
    })
  : new URLSearchParams();

export const EXPLORE_PROFILES_DIFF_RANGES_URL_PARAMS = new URLSearchParams({
  // no max nodes here neither so that the app fetches user settings and we can also test settings changes
  'from-2': '2024-03-13T18:00:00.000Z',
  'to-2': '2024-03-13T18:50:00.000Z',
  'from-3': '2024-03-13T18:00:00.000Z',
  'to-3': '2024-03-13T18:50:00.000Z',
  diffFrom: '2024-03-13T18:15:00.000Z',
  diffTo: '2024-03-13T18:20:00.000Z',
  'diffFrom-2': '2024-03-13T18:35:00.000Z',
  'diffTo-2': '2024-03-13T18:45:00.000Z',
});

// taken from Grafana
// see https://github.com/grafana/grafana/blob/852d032e1ae1f7c989d8b2ec7d8e05bf2a54928e/public/app/core/components/AppChrome/AppChromeService.tsx#L33
export const DOCKED_MENU_OPEN_LOCAL_STORAGE_KEY = 'grafana.navigation.open';

// Keep the legacy "Explain Flame Graph" button visible when Grafana Assistant is available.
// See useGrafanaAssistant() in the plugin source.
export const FORCE_SHOW_AI_BUTTON_LOCAL_STORAGE_KEY = 'grafana-pyroscope-app.forceShowAIButton';
