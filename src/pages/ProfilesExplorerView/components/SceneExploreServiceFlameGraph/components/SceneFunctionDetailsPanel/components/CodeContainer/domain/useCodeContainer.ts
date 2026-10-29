import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { useMemo, useState } from 'react';

import { FunctionDetails, LineProfile } from '../../../domain/types/FunctionDetails';
import { useGitHubContext } from '../../GitHubContextProvider/useGitHubContext';
import { useFetchVCSFile } from '../infrastructure/useFetchVCSFile';
import { annotateLines, annotatePlaceholderLines } from './annotateLines';
import { buildGithubUrlForFunction } from './buildGithubUrlForFunction';

/**
 * View model for Code component
 */
export type CodeLine = LineProfile & { line: string };

type CodeContainerDomainValue = DomainHookReturnValue & { data: { snippetLines: CodeLine[]; allLines: CodeLine[] } };

export function useCodeContainer(functionDetails: FunctionDetails): CodeContainerDomainValue {
  const dataSourceUid = useDataSourceUid();
  const { isLoggedIn } = useGitHubContext();
  const { version } = functionDetails;

  const [openAiSuggestions, setOpenAiSuggestions] = useState<boolean>(false);

  const {
    fileInfo,
    error: fetchError,
    isFetching,
  } = useFetchVCSFile({
    enabled: isLoggedIn,
    dataSourceUid,
    localPath: functionDetails.fileName,
    repository: version?.repository ?? '',
    gitRef: version?.git_ref ?? '',
    rootPath: version?.root_path ?? '',
    functionName: functionDetails.name ?? '',
  });

  // might be a bit costly so we memoize it
  const { snippetLines, allLines } = useMemo(
    () =>
      fileInfo?.content
        ? annotateLines(fileInfo.content, functionDetails.callSites)
        : annotatePlaceholderLines(functionDetails.callSites),
    [fileInfo?.content, functionDetails.callSites]
  );

  return {
    data: {
      fetchError,
      openAiSuggestions,
      isLoadingCode: isFetching,
      unit: functionDetails.unit,
      githubUrl: fileInfo?.URL ? buildGithubUrlForFunction(fileInfo.URL, functionDetails.startLine) : undefined,
      snippetLines: snippetLines.map((annotatedLine) => ({ ...annotatedLine, line: annotatedLine.line ?? '???' })),
      allLines: allLines.map((annotateLine) => ({ ...annotateLine, line: annotateLine.line ?? '???' })),
      noCodeAvailable: Boolean(fetchError) || !allLines.some((line) => line.line),
    },
    actions: {
      setOpenAiSuggestions,
    },
  };
}
