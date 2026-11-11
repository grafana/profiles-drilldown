import { type DataSourceInstanceSettings, type DataSourceJsonData } from '@grafana/data';
import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';
import { logger } from '@shared/infrastructure/tracking/logger';

export interface TempoDataSourceOption {
  uid: string;
  name: string;
  isDefault?: boolean;
  tracesToProfilesDataSourceUid?: string;
}

export function selectTempoDataSourceUid(
  tempoDataSources: TempoDataSourceOption[],
  currentTempoDataSourceUid?: string,
  profilesDataSourceUid?: string
): string | undefined {
  if (tempoDataSources.some(({ uid }) => uid === currentTempoDataSourceUid)) {
    return currentTempoDataSourceUid;
  }

  const linkedTempoDataSources = tempoDataSources.filter(
    ({ tracesToProfilesDataSourceUid }) =>
      profilesDataSourceUid && tracesToProfilesDataSourceUid === profilesDataSourceUid
  );
  if (linkedTempoDataSources.length === 1) {
    return linkedTempoDataSources[0].uid;
  }

  const defaultTempoDataSourceUid = tempoDataSources.find(({ isDefault }) => isDefault)?.uid;
  if (defaultTempoDataSourceUid) {
    return defaultTempoDataSourceUid;
  }

  return tempoDataSources.length === 1 ? tempoDataSources[0].uid : undefined;
}

export interface TempoDataSourceJsonData extends DataSourceJsonData {
  tracesToProfiles?: {
    datasourceUid?: string;
  };
}

let pending: Promise<TempoDataSourceOption[] | undefined> | undefined;

async function getAllTempoDataSourceOptions(): Promise<TempoDataSourceOption[]> {
  const instances = await getDataSourceInstanceList({ pluginId: 'tempo' });
  const allSettings = await Promise.allSettled(instances.map((i) => getDataSourceInstanceSettings(i.uid)));
  const fullfilled = allSettings.filter((s) => s.status === 'fulfilled').map((s) => s.value);

  if (instances.length > 0 && fullfilled.length === 0) {
    throw new Error('Failed to load settings for any Tempo data source');
  }

  const settings: Array<DataSourceInstanceSettings<TempoDataSourceJsonData>> = fullfilled.filter(
    (f) => f !== undefined
  );

  const defaultDs = await getDefaultDataSourceInstanceListItem(instances).catch((error) => {
    logger.debug('Failed to get default data source instance', { error });
    return undefined;
  });

  const tempoDataSourceOptions = settings.map((s) => ({
    uid: s.uid,
    name: s.name,
    isDefault: Boolean(defaultDs) && s.uid === defaultDs?.uid,
    tracesToProfilesDataSourceUid: s.jsonData.tracesToProfiles?.datasourceUid,
  }));

  return tempoDataSourceOptions;
}

export async function getTempoDataSourceOptions(): Promise<TempoDataSourceOption[] | undefined> {
  if (pending) {
    return pending;
  }

  pending = getAllTempoDataSourceOptions()
    .catch((error) => {
      logger.debug('Failed to get tempo data source options', { error });
      return undefined;
    })
    .finally(() => {
      pending = undefined;
    });

  return pending;
}
