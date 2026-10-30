import { useQuery } from '@tanstack/react-query';
import { DataSourceProxyClientBuilder } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClientBuilder';

import { Stats, StatsApiClient } from './statsApiClient';

type FetchResponse = {
  isFetching: boolean;
  error: Error | null;
  stats?: Stats;
  refetch: () => void;
};

interface FetchParams {
  enabled: boolean;
  dataSourceUid: string;
}

export function useFetchTenantStats({ enabled, dataSourceUid }: FetchParams): FetchResponse {
  const statsApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, StatsApiClient);

  const { isFetching, error, data, refetch } = useQuery({
    enabled: enabled && Boolean(dataSourceUid),
    placeholderData: () => ({ hasIngestedData: true, oldestProfileTime: 0, newestProfileTime: 0 }),
    queryKey: ['tenant-stats', dataSourceUid],
    queryFn: () => {
      statsApiClient.abort();

      return statsApiClient.get();
    },
  });

  return {
    isFetching,
    error: statsApiClient.isAbortError(error) ? null : error,
    stats: data,
    refetch,
  };
}
