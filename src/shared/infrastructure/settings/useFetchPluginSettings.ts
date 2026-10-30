import { useMutation, useQuery } from '@tanstack/react-query';
import { DataSourceProxyClientBuilder } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClientBuilder';

import { useDataSourceUid } from '../datasource/DataSourceUidContext';
import { DEFAULT_SETTINGS, PluginSettings } from './PluginSettings';
import { SettingsApiClient } from './settingsApiClient';

type FetchParams = {
  enabled?: boolean;
};

type FetchResponse = {
  isFetching: boolean;
  error: Error | null;
  settings?: PluginSettings;
  mutate: (newSettings: PluginSettings) => Promise<void>;
};

/**
 * Fetches the plugin settings and, if none/only some have been stored previously, returns adequate default values for the rest of the application
 */
export function useFetchPluginSettings({ enabled = true }: FetchParams = {}): FetchResponse {
  const dataSourceUid = useDataSourceUid();
  const settingsApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, SettingsApiClient);

  const { isFetching, error, data } = useQuery({
    enabled: enabled && Boolean(dataSourceUid),
    queryKey: ['settings', `ds-uid-${dataSourceUid}`],
    queryFn: () =>
      settingsApiClient.get().then(
        (json) =>
          // provide defaults if any value comes null or undefined from the API (which can be the case ;))
          Object.keys(DEFAULT_SETTINGS).reduce((acc, key) => {
            acc[key] ??= DEFAULT_SETTINGS[key as keyof PluginSettings]; // TS luv :man_shrug:
            return acc;
          }, json as Record<string, any>) as PluginSettings // TS luv :man_shrug:
      ),
  });

  const { mutateAsync: mutate } = useMutation({
    mutationFn: (newSettings: PluginSettings) => settingsApiClient.set(newSettings),
    networkMode: 'always',
  });

  return {
    isFetching,
    error: settingsApiClient.isAbortError(error) ? null : error,
    settings: data,
    mutate,
  };
}
