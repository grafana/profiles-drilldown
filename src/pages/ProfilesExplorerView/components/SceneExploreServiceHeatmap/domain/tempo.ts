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
  const allSettings = await Promise.all(instances.map((i) => getDataSourceInstanceSettings(i.uid)));

  const settings: Array<DataSourceInstanceSettings<TempoDataSourceJsonData>> = allSettings.filter(
    (s) => s !== undefined
  );

  const defaultDs = await getDefaultDataSourceInstanceListItem(instances).catch((error) =>
    logger.debug('Failed to get default data source instance', { error })
  );
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
