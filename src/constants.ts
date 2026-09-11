import plugin from './plugin.json';

export const PYROSCOPE_APP_ID = plugin.id;

export const PLUGIN_BASE_URL = `/a/${PYROSCOPE_APP_ID}`;
export const PLUGIN_API_URL = `/api/plugin-proxy/${PYROSCOPE_APP_ID}`;

export const GRAFANA_LLM_APP_ID = 'grafana-llm-app';

export enum ROUTES {
  EXPLORE = '/explore',
  ADHOC = '/ad-hoc',
  SETTINGS = '/settings',
  RECORDING_RULES = '/recording-rules',
  GITHUB_CALLBACK = '/github/callback',
}
