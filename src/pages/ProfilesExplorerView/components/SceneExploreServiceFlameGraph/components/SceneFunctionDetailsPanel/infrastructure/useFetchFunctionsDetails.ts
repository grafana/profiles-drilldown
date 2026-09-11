import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DataSourceProxyClientBuilder } from '../../../../../infrastructure/series/http/DataSourceProxyClientBuilder';
import { PprofApiClient } from '../../../infrastructure/PprofApiClient';
import { PLACEHOLDER_COMMIT_DATA } from '../components/GitHubContextProvider/infrastructure/PrivateVcsClient';
import { useGitHubContext } from '../components/GitHubContextProvider/useGitHubContext';
import { convertPprofToFunctionDetails } from '../domain/convertPprofToFunctionDetails';
import { useFunctionVersion } from '../domain/FunctionVersionContext';
import { FunctionDetails, FunctionVersion } from '../domain/types/FunctionDetails';
import { fetchCommitsInfo } from './fetchCommitsInfo';
import { sortByTotal } from './helpers/sortByTotal';

type FetchParams = {
  dataSourceUid: string;
  query: string;
  timeRange: TimeRange;
  stackTrace: string[];
  profileIdSelector?: string;
};

type FetchResponse = {
  isFetching: boolean;
  error: Error | null;
  functionsDetails: FunctionDetails[];
};

// We don't expect more than 500 nodes after the selected node.
// This will avoid downloading too much data by removing leaf nodes.
// TODO: This could be a setting in the UI.
const MAX_NODES = 500;

const DEFAULT_FUNCTION_VERSION: FunctionVersion = {
  repository: '',
  git_ref: 'HEAD',
  root_path: '',
};

export function useFetchFunctionsDetails({
  dataSourceUid,
  query,
  timeRange,
  stackTrace,
  profileIdSelector,
}: FetchParams): FetchResponse {
  const { profileMetricId, labelsSelector, serviceId } = parseQuery(query);
  const [start, end] = [timeRange.from.unix(), timeRange.to.unix()];
  const { isLoggedIn: isGitHubLogged } = useGitHubContext();

  const pprofApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, PprofApiClient);

  // Get the default function version for the service including provided overrides
  const { functionVersion: defaultFunctionVersion } = useFunctionVersion(
    dataSourceUid,
    serviceId,
    DEFAULT_FUNCTION_VERSION
  );

  const {
    isFetching,
    error: queryError,
    data,
  } = useQuery({
    enabled: Boolean(profileMetricId && labelsSelector && stackTrace.length > 0 && start > 0 && end > 0),
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      'function-details',
      profileMetricId,
      labelsSelector,
      start,
      end,
      stackTrace,
      isGitHubLogged,
      defaultFunctionVersion,
      profileIdSelector,
    ],
    queryFn: async () => {
      const pprof = await pprofApiClient.selectMergeProfileJson({
        profileMetricId,
        labelsSelector,
        start,
        end,
        stackTrace,
        maxNodes: MAX_NODES,
        profileIdSelector,
      });

      const functionsDetails = convertPprofToFunctionDetails(stackTrace[stackTrace.length - 1], pprof).sort(
        sortByTotal
      );

      return isGitHubLogged
        ? fetchCommitsInfo(dataSourceUid, functionsDetails, defaultFunctionVersion || DEFAULT_FUNCTION_VERSION)
        : functionsDetails;
    },
  });

  const functionsDetails = useMemo(
    () =>
      data?.length
        ? data
        : [
            {
              name: stackTrace.at(-1) as string,
              startLine: undefined,
              fileName: '',
              callSites: new Map(),
              unit: '',
              commit: PLACEHOLDER_COMMIT_DATA,
            },
          ],
    [data, stackTrace]
  );

  return {
    isFetching,
    error: pprofApiClient.isAbortError(queryError) ? null : queryError,
    functionsDetails,
  };
}
