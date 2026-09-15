import { TimeRange } from '@grafana/data';
import { useMaxNodesFromUrl } from '@shared/domain/url-params/useMaxNodesFromUrl';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import { useQuery } from '@tanstack/react-query';

import { DataSourceProxyClientBuilder } from '../../../../../infrastructure/series/http/DataSourceProxyClientBuilder';
import { DiffProfileApiClient } from './DiffProfileApiClient';

type FetchParams = {
  enabled: boolean;
  dataSourceUid: string;
  baselineTimeRange: TimeRange;
  baselineQuery: string;
  comparisonTimeRange: TimeRange;
  comparisonQuery: string;
};

export function useFetchDiffProfile({
  enabled,
  dataSourceUid,
  baselineTimeRange,
  baselineQuery,
  comparisonTimeRange,
  comparisonQuery,
}: FetchParams) {
  const [maxNodes] = useMaxNodesFromUrl();

  const diffProfileApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, DiffProfileApiClient);

  const { isFetching, error, data, refetch } = useQuery<{ profile: FlamebearerProfile }>({
    // for UX: keep previous data while fetching -> profile does not re-render with empty panels when refreshing
    placeholderData: (previousData) => previousData,
    enabled: Boolean(enabled && maxNodes),
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      'diff-profile',
      dataSourceUid,
      baselineQuery,
      baselineTimeRange.from.valueOf(),
      baselineTimeRange.to.valueOf(),
      comparisonQuery,
      comparisonTimeRange.from.valueOf(),
      comparisonTimeRange.to.valueOf(),
      maxNodes,
    ],
    queryFn: ({ signal }) => {
      const params = {
        leftQuery: baselineQuery,
        leftTimeRange: baselineTimeRange,
        rightQuery: comparisonQuery,
        rightTimeRange: comparisonTimeRange,
        maxNodes,
      };

      return diffProfileApiClient.get(params, signal).then((profile) => ({ profile }));
    },
  });

  return {
    isFetching,
    error: diffProfileApiClient.isAbortError(error) ? null : error,
    ...data,
    refetch,
  };
}
