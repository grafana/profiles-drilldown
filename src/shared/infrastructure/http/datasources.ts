import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';

import { PYROSCOPE_DATA_SOURCE_PLUGIN_ID, TEMPO_DATA_SOURCE_PLUGIN_ID } from '../../../constants';
import { logger } from '../tracking/logger';

export type SettingsWithDefaultUid<T> = { settings: T; defaultUid?: string };

type Instances = Awaited<ReturnType<typeof getDataSourceInstanceList>>; // return type is only available in @grafana/data >= v13.2.0
type PluginID = typeof PYROSCOPE_DATA_SOURCE_PLUGIN_ID | typeof TEMPO_DATA_SOURCE_PLUGIN_ID;
type Pending = Record<PluginID, Promise<SettingsWithDefaultUid<any>> | undefined>;

let pending: Pending = {} as Pending;

async function getDataSourceSettings<T>(instances: Instances): Promise<T> {
  const promises = instances.map((i) =>
    getDataSourceInstanceSettings(i.uid).catch((error) =>
      logger.error(error as Error, { message: `Failed to get settings for the datasource: ${i.uid}` })
    )
  );
  const resolvedSettings = await Promise.all(promises);
  const settings = resolvedSettings.filter(Boolean) as T;
  return settings;
}

async function getSettingsAndDefaultUid<T>(pluginId: PluginID): Promise<SettingsWithDefaultUid<T>> {
  const instances = await getDataSourceInstanceList({ pluginId });
  const defaultUid = (await getDefaultDataSourceInstanceListItem(instances))?.uid;
  const settings = await getDataSourceSettings<T>(instances);
  return { settings, defaultUid };
}

export async function getSettingsAndDefault<T>(pluginId: PluginID): Promise<SettingsWithDefaultUid<T>> {
  if (pending[pluginId]) {
    return pending[pluginId];
  }

  pending[pluginId] = getSettingsAndDefaultUid<T>(pluginId).finally(() => {
    pending[pluginId] = undefined;
  });

  return pending[pluginId];
}
