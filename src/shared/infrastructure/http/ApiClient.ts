import { type DataSourceInstanceSettings, type DataSourceJsonData } from '@grafana/data';
import { config } from '@grafana/runtime';

import {
  NO_DATASOURCE_CONFIGURED_UID,
  PYROSCOPE_DATA_SOURCE_PLUGIN_ID,
  PYROSCOPE_URL_SEARCH_PARAM_NAME,
  TEMPO_DATA_SOURCE_PLUGIN_ID,
} from '../../../constants';
import { logger } from '../tracking/logger';
import { userStorage } from '../userStorage';
import { getSettingsAndDefault, SettingsWithDefaultUid } from './datasources';
import { HttpClient } from './HttpClient';

type CustomDataSourceJsonData = { overridesDefault: boolean };
type CustomDataSourceInstanceSettings = DataSourceInstanceSettings<DataSourceJsonData & CustomDataSourceJsonData>;
interface TempoDataSourceJsonData extends DataSourceJsonData {
  tracesToProfiles?: {
    datasourceUid?: string;
  };
}
type TempoDataSourceSettings = DataSourceInstanceSettings<DataSourceJsonData & TempoDataSourceJsonData>;

/**
 * An HTTP client ready to fetch data from the plugin's backend
 */
export class ApiClient extends HttpClient {
  static async getPyroscopeDataSources() {
    return getSettingsAndDefault<CustomDataSourceInstanceSettings[]>(PYROSCOPE_DATA_SOURCE_PLUGIN_ID);
  }

  static async getTempoDataSources() {
    return getSettingsAndDefault<TempoDataSourceSettings[]>(TEMPO_DATA_SOURCE_PLUGIN_ID);
  }

  static async selectDefaultDataSource(): Promise<CustomDataSourceInstanceSettings> {
    return ApiClient.findDefaultDataSource(await ApiClient.getPyroscopeDataSources());
  }

  static findDefaultDataSource({
    settings,
    defaultUid,
  }: SettingsWithDefaultUid<CustomDataSourceInstanceSettings[]>): CustomDataSourceInstanceSettings {
    const uidFromUrl = new URL(window.location.href).searchParams.get(PYROSCOPE_URL_SEARCH_PARAM_NAME);
    const uidFromLocalStorage = userStorage.get(userStorage.KEYS.PROFILES_EXPLORER)?.dataSource;

    const defaultDataSource =
      settings.find((ds) => ds.uid === uidFromUrl) ||
      settings.find((ds) => ds.uid === uidFromLocalStorage) ||
      settings.find((ds) => ds.jsonData.overridesDefault) ||
      settings.find((ds) => ds.uid === defaultUid) ||
      settings[0];

    if (!defaultDataSource) {
      logger.warn(
        'Cannot find any Pyroscope data source! Please add and configure a Pyroscope data source to your Grafana instance.'
      );

      // because we instantiate most of our API clients before exporting them,
      // we have to return a dummy data source to prevent the whole app to fail
      return { uid: NO_DATASOURCE_CONFIGURED_UID } as CustomDataSourceInstanceSettings;
    }

    return defaultDataSource;
  }

  override async getBaseUrl(): Promise<string> {
    const pyroscopeDataSource = await ApiClient.selectDefaultDataSource();

    let appSubUrl = config.appSubUrl || '';
    if (appSubUrl.at(-1) !== '/') {
      // ensures that the API pathname is appended correctly (appUrl seems to always have it but better to be extra careful)
      appSubUrl += '/';
    }

    return `${appSubUrl}api/datasources/proxy/uid/${pyroscopeDataSource.uid}`;
  }

  constructor() {
    super('', {
      'content-type': 'application/json',
      'X-Grafana-Org-Id': String(config.bootData?.user?.orgId || ''),
    });
  }
}
