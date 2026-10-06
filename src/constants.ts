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

export const PYROSCOPE_DATA_SOURCES_TYPE = 'grafana-pyroscope-datasource';
export const PYROSCOPE_URL_SEARCH_PARAM_NAME = 'var-dataSource'; // matches with the Scenes library
export const NO_DATASOURCE_CONFIGURED_UID = 'no-data-source-configured';
