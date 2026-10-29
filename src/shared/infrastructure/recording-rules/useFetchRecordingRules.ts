import { HttpClientError } from '@shared/infrastructure/http/HttpClientError';
import { RecordingRulesApiClient } from '@shared/infrastructure/recording-rules/recordingRulesApiClient';
import { RecordingRuleViewModel } from '@shared/types/RecordingRuleViewModel';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataSourceProxyClientBuilder } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClientBuilder';

import { useDataSourceUid } from '../datasource/DataSourceUidContext';

type FetchParams = {
  enabled?: boolean;
};

type FetchResponse = {
  isFetching: boolean;
  error: HttpClientError | null;
  recordingRules?: RecordingRuleViewModel[];
  mutate: (rule: RecordingRuleViewModel) => Promise<void>;
  remove: (rule: RecordingRuleViewModel) => Promise<void>;
};

export function useFetchRecordingRules({ enabled = true }: FetchParams = {}): FetchResponse {
  const queryClient = useQueryClient();
  const dataSourceUid = useDataSourceUid();
  const recordingRulesApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, RecordingRulesApiClient);

  const { isFetching, error, data } = useQuery<RecordingRuleViewModel[], HttpClientError>({
    enabled: enabled && Boolean(dataSourceUid),
    queryKey: ['recording_rules', dataSourceUid],
    queryFn: () => recordingRulesApiClient.get(),
  });

  const { mutateAsync: mutate } = useMutation({
    mutationFn: (rule: RecordingRuleViewModel) => recordingRulesApiClient.create(rule),
    networkMode: 'always',
  });

  const { mutateAsync: remove } = useMutation({
    mutationFn: async (rule: RecordingRuleViewModel) => {
      await recordingRulesApiClient.remove(rule);
      await queryClient.invalidateQueries({ queryKey: ['recording_rules', dataSourceUid] });
    },
    networkMode: 'always',
  });

  return {
    isFetching,
    error: recordingRulesApiClient.isAbortError(error) ? null : error,
    recordingRules: data,
    mutate,
    remove,
  };
}
