import { DataSourceInstanceListItem, DataSourceInstanceSettings } from '@grafana/data';
import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';
import { DataSourceJsonData } from '@grafana/schema';
import { useEffect } from 'react';
import { useAsync, useAsyncFn } from 'react-use';
import { PYROSCOPE_DATA_SOURCES_TYPE, PYROSCOPE_URL_SEARCH_PARAM_NAME } from 'src/constants';

import { logger } from '../tracking/logger';
import { userStorage } from '../userStorage';

export interface SelectedDataSourceUidInput {
  selectedUid?: string;
}

type CustomDataSourceJsonData = { overridesDefault: boolean };
type CustomDataSourceInstanceSettings = DataSourceInstanceSettings<DataSourceJsonData & CustomDataSourceJsonData>;

let pending: Promise<DataSourceInstanceListItem | undefined> | undefined;

async function getPyroscopeInstances(): Promise<DataSourceInstanceListItem[]> {
  const instances = await getDataSourceInstanceList({ pluginId: PYROSCOPE_DATA_SOURCES_TYPE });
  return instances;
}

async function getPyroscopeDataSources(
  instances: DataSourceInstanceListItem[]
): Promise<CustomDataSourceInstanceSettings[]> {
  const allSettings = await Promise.all(instances.map((i) => getDataSourceInstanceSettings(i.uid)));
  return allSettings.filter(Boolean) as CustomDataSourceInstanceSettings[];
}

async function getDefaultPyroscopeDataSource(
  instances: DataSourceInstanceListItem[]
): Promise<DataSourceInstanceListItem | undefined> {
  const defaultDs = await getDefaultDataSourceInstanceListItem(instances);
  return defaultDs;
}

async function internalGetSelectedDefaultDataSource(): Promise<DataSourceInstanceListItem | undefined> {
  const instances = await getPyroscopeInstances();
  const uidFromUrl = new URL(window.location.href).searchParams.get(PYROSCOPE_URL_SEARCH_PARAM_NAME);
  const uidFromLocalStorage = userStorage.get(userStorage.KEYS.PROFILES_EXPLORER)?.dataSource;

  let defaultDataSource =
    instances.find((ds) => ds.uid === uidFromUrl) || instances.find((ds) => ds.uid === uidFromLocalStorage);

  if (!defaultDataSource) {
    const pyroscopeDataSources = await getPyroscopeDataSources(instances);
    defaultDataSource = pyroscopeDataSources.find((ds) => ds.jsonData.overridesDefault) as DataSourceInstanceListItem;
  }

  if (!defaultDataSource) {
    defaultDataSource = await getDefaultPyroscopeDataSource(instances);
  }

  if (!defaultDataSource) {
    defaultDataSource = instances[0];
  }

  if (!defaultDataSource) {
    logger.warn(
      'Cannot find any Pyroscope data source! Please add and configure a Pyroscope data source to your Grafana instance.'
    );
  }

  return defaultDataSource;
}

export async function getSelectedDefaultDataSource(): Promise<DataSourceInstanceListItem | undefined> {
  if (pending) {
    return pending;
  }

  pending = internalGetSelectedDefaultDataSource().finally(() => {
    pending = undefined;
  });

  return pending;
}

export function useSelectDefaultDataSourceUid({ selectedUid }: SelectedDataSourceUidInput) {
  const needsDefault = selectedUid === undefined;
  const [state, resolve] = useAsyncFn(async () => (await getSelectedDefaultDataSource())?.uid, [], {
    loading: needsDefault,
  });

  useEffect(() => {
    if (needsDefault) {
      resolve();
    }
  }, [needsDefault, resolve]);

  return state;
}

export function usePyroscopeDataSources() {
  const { loading, error, value: datasources } = useAsync(getPyroscopeInstances, []);
  return { loading, error, datasources };
}
