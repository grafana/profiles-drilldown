import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Alert, Button, IconButton, Spinner, useStyles2 } from '@grafana/ui';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { InlineBanner } from '@shared/ui/InlineBanner';
import { Panel } from '@shared/ui/Panel/Panel';
import React from 'react';

import { getSceneVariableValue } from '../../helpers/getSceneVariableValue';
import { AiReply } from './components/AiReply';
import { FollowUpForm } from './components/FollowUpForm';
import { useOpenAiChatCompletions } from './domain/useOpenAiChatCompletions';
import { FetchParams, useFetchDotProfiles } from './infrastructure/useFetchDotProfiles';

interface SceneAiPanelState extends SceneObjectState {}

export class SceneAiPanel extends SceneObjectBase<SceneAiPanelState> {
  constructor() {
    super({ key: 'ai-panel' });
  }

  useSceneAiPanel = (isDiff: boolean, fetchParams: FetchParams): DomainHookReturnValue => {
    const dataSourceUid = useDataSourceUid();
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');

    const { profileType, profiles, validationError, fetchError, isFetching } = useFetchDotProfiles(
      isDiff,
      fetchParams,
      dataSourceUid,
      profileMetricId
    );

    const { reply, error: llmError, retry } = useOpenAiChatCompletions(profileType, profiles);

    return {
      data: {
        validationError,
        isLoading: isFetching || (!isFetching && !fetchError && !llmError && !reply.text.trim()),
        fetchError,
        llmError,
        reply,
        shouldDisplayReply: Boolean(reply?.hasStarted || reply?.hasFinished),
        shouldDisplayFollowUpForm: !fetchError && !llmError && Boolean(reply?.hasFinished),
      },
      actions: {
        retry,
        submitFollowupQuestion(question: string) {
          reply.askFollowupQuestion(question);
        },
      },
    };
  };

  static Component = ({
    model,
    isDiff,
    fetchParams,
    onClose,
  }: SceneComponentProps<SceneAiPanel> & {
    isDiff: boolean;
    fetchParams: FetchParams;
    onClose: () => void;
  }) => {
    const styles = useStyles2(getStyles);
    const { data, actions } = model.useSceneAiPanel(isDiff, fetchParams);

    return (
      <Panel
        className={styles.sidePanel}
        title={t('ai-panel.title', 'Flame graph analysis')}
        isLoading={data.isLoading}
        headerActions={
          <IconButton
            title={t('ai-panel.close', 'Close panel')}
            name="times-circle"
            variant="secondary"
            aria-label={t('ai-panel.close', 'Close panel')}
            onClick={onClose}
          />
        }
        dataTestId="ai-panel"
      >
        <div className={styles.content}>
          {data.validationError && (
            <InlineBanner
              severity="error"
              title={t('ai-panel.validation-error', 'Validation error!')}
              error={data.validationError}
            />
          )}

          {data.fetchError && (
            <InlineBanner
              severity="error"
              title={t('ai-panel.fetch-error', 'Error while loading profile data!')}
              message={t('ai-panel.fetch-error-message', 'Sorry for any inconvenience, please try again later.')}
              error={data.fetchError}
            />
          )}

          {data.shouldDisplayReply && <AiReply reply={data.reply} />}

          {data.isLoading && (
            <>
              <Spinner inline />
              &nbsp;<Trans i18nKey="ai-panel.analyzing">Analyzing...</Trans>
            </>
          )}

          {data.llmError && (
            <Alert
              title={t('ai-panel.llm-error', 'An error occurred while generating content using OpenAI!')}
              severity="warning"
            >
              <div>
                <div>
                  <p>{data.llmError.message}</p>
                  <p>
                    <Trans i18nKey="ai-panel.llm-error-message">
                      Sorry for any inconvenience, please retry or if the problem persists, contact your organization
                      admin.
                    </Trans>
                  </p>
                </div>
              </div>
              <Button className={styles.retryButton} variant="secondary" fill="outline" onClick={() => actions.retry()}>
                <Trans i18nKey="ai-panel.retry">Retry</Trans>
              </Button>
            </Alert>
          )}

          {data.shouldDisplayFollowUpForm && <FollowUpForm onSubmit={actions.submitFollowupQuestion} />}
        </div>
      </Panel>
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  sidePanel: css`
    flex: 1 0 50%;
    margin-left: 8px;
    max-width: calc(50% - 4px);
  `,
  title: css`
    margin: -4px 0 4px 0;
  `,
  content: css`
    padding: ${theme.spacing(1)};
  `,
  retryButton: css`
    float: right;
  `,
});
