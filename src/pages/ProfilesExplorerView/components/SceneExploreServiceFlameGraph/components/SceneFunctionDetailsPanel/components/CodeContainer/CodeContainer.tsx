import { createAssistantContextItem } from '@grafana/assistant';
import { t } from '@grafana/i18n';
import { displayError } from '@shared/domain/displayStatus';
import { HttpClientError } from '@shared/infrastructure/http/HttpClientError';
import React from 'react';

import { useGrafanaAssistant } from '../../../../../../domain/useGrafanaAssistant';
import { FunctionDetails } from '../../domain/types/FunctionDetails';
import { AiSuggestionsPanel } from '../AiSuggestionsPanel/AiSuggestionsPanel';
import { buildSuggestionPrompts } from '../AiSuggestionsPanel/domain/buildLlmSuggestionPrompts';
import { useCodeContainer } from './domain/useCodeContainer';
import { Code } from './ui/Code';

type CodeContainerProps = {
  functionDetails: FunctionDetails;
};

export function CodeContainer({ functionDetails }: CodeContainerProps) {
  const { data, actions } = useCodeContainer(functionDetails);
  const { hideAIButton } = useGrafanaAssistant();

  if (data.fetchError && (data.fetchError as HttpClientError)?.response?.status !== 404) {
    displayError(data.fetchError, ['Failed to fetch file information!', (data.fetchError as Error).message]);
  }

  const optimizeCodeContextProvider = hideAIButton
    ? async () => {
        try {
          const prompts = buildSuggestionPrompts({
            functionDetails,
            lines: data.allLines,
          });

          const context = [
            createAssistantContextItem('structured', {
              title: t('optimize-code.context.title', 'Annotated source code and optimization instructions'),
              data: { stringifiedData: prompts.user },
            }),
          ];

          return {
            prompt: t('optimize-code.prompt', 'Optimize this code based on the profiling annotations.'),
            context,
          };
        } catch (error) {
          displayError(error as Error, [t('optimize-code.error', 'Failed to build optimization context')]);
          return undefined;
        }
      }
    : undefined;

  return (
    <>
      <Code
        lines={data.snippetLines}
        unit={data.unit}
        githubUrl={data.githubUrl}
        isLoadingCode={data.isLoadingCode}
        noCodeAvailable={data.noCodeAvailable}
        onOptimizeCodeClick={() => {
          actions.setOpenAiSuggestions(true);
          document.getElementById('ai-suggestions-panel')?.scrollIntoView({
            behavior: 'smooth',
          });
        }}
        optimizeCodeContextProvider={optimizeCodeContextProvider}
      />
      <h6 id="ai-suggestions-panel" style={{ height: 0, marginBottom: 0 }}></h6>
      {!hideAIButton && data.openAiSuggestions ? (
        <AiSuggestionsPanel
          suggestionPromptInputs={{
            functionDetails: functionDetails,
            lines: data.allLines,
          }}
        />
      ) : null}
    </>
  );
}
