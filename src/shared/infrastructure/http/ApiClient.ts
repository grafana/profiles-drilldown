import { DataSourceInstanceSettings, DataSourceJsonData } from '@grafana/data';
import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';
import { config } from '@grafana/runtime';

import {
  NO_DATASOURCE_CONFIGURED_UID,
  PYROSCOPE_DATA_SOURCES_TYPE,
  PYROSCOPE_URL_SEARCH_PARAM_NAME,
} from '../../../constants';
import { logger } from '../tracking/logger';
import { userStorage } from '../userStorage';
import { HttpClient } from './HttpClient';

type CustomDataSourceJsonData = { overridesDefault: boolean };
type CustomDataSourceInstanceSettings = DataSourceInstanceSettings<DataSourceJsonData & CustomDataSourceJsonData>;
type GetPyroscopeDataSourcesResult = { settings: CustomDataSourceInstanceSettings[]; defaultUid?: string };

let pending: Promise<GetPyroscopeDataSourcesResult> | undefined;

/**
 * An HTTP client ready to fetch data from the plugin's backend
 */
export class ApiClient extends HttpClient {
  static async getPyroscopeDataSources(): Promise<GetPyroscopeDataSourcesResult> {
    if (pending) {
      return pending;
    }

    pending = this.getSettingsAndDefault().finally(() => {
      pending = undefined;
    });

    return pending;
  }

  private static async getSettingsAndDefault(): Promise<GetPyroscopeDataSourcesResult> {
    const instances = await getDataSourceInstanceList({ pluginId: PYROSCOPE_DATA_SOURCES_TYPE });
    const defaultUid = (await getDefaultDataSourceInstanceListItem(instances))?.uid;
    const allSettings = await Promise.all(
      instances.map((i) =>
        getDataSourceInstanceSettings(i.uid).catch((error) =>
          logger.error(error as Error, { message: `Failed to get settings for the datasource ${i.uid}` })
        )
      )
    );
    const settings = allSettings.filter(Boolean) as CustomDataSourceInstanceSettings[];
    const value = { settings, defaultUid };

    return value;
  }

  static async selectDefaultDataSource(): Promise<CustomDataSourceInstanceSettings> {
    return ApiClient.findDefaultDataSource(await ApiClient.getPyroscopeDataSources());
  }

  static findDefaultDataSource({
    settings,
    defaultUid,
  }: GetPyroscopeDataSourcesResult): CustomDataSourceInstanceSettings {
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
