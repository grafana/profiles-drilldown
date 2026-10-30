import { useQuery } from '@tanstack/react-query';

import { DataSourceProxyClientBuilder } from '../../../../../../../infrastructure/series/http/DataSourceProxyClientBuilder';
import { PrivateVcsClient } from '../../GitHubContextProvider/infrastructure/PrivateVcsClient';

type FetchParams = {
  enabled: boolean;
  dataSourceUid: string;
  repository: string;
  gitRef: string;
  localPath: string;
  rootPath: string;
  functionName: string;
};

type FetchResponse = {
  isFetching: boolean;
  error: Error | null;
  fileInfo?: {
    content: string;
    URL: string;
  };
};

export function useFetchVCSFile({
  enabled,
  dataSourceUid,
  repository,
  gitRef,
  localPath,
  rootPath,
  functionName,
}: FetchParams): FetchResponse {
  const privateVcsClient = DataSourceProxyClientBuilder.build(dataSourceUid, PrivateVcsClient);
  const { isFetching, error, data } = useQuery({
    enabled: Boolean(enabled && repository && (localPath || functionName)),
    queryKey: ['vcs-file', dataSourceUid, repository, gitRef, localPath, rootPath, functionName],
    queryFn: () =>
      privateVcsClient
        .getFile(repository, gitRef, localPath, rootPath, functionName)
        .then((code) => ({
          content: code.content,
          URL: code.URL,
        }))
        .then((json) => ({ URL: json.URL, content: atob(json.content) })),
  });

  return {
    isFetching,
    error: privateVcsClient.isAbortError(error) ? null : error,
    fileInfo: data,
  };
}
