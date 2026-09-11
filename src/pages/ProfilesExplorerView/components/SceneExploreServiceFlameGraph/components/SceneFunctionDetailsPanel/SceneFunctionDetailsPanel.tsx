import { css } from '@emotion/css';
import { GrafanaTheme2, TimeRange } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { ClipboardButton, IconButton, InlineLabel, TextLink, Tooltip, useStyles2 } from '@grafana/ui';
import { displayError } from '@shared/domain/displayStatus';
import { userStorage } from '@shared/infrastructure/userStorage';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { InlineBanner } from '@shared/ui/InlineBanner';
import { Panel } from '@shared/ui/Panel/Panel';
import React, { useMemo, useState } from 'react';

import { useBuildPyroscopeQuery } from '../../../../domain/useBuildPyroscopeQuery';
import { ProfilesDataSourceVariable } from '../../../../domain/variables/ProfilesDataSourceVariable';
import { getSceneVariableValue } from '../../../../helpers/getSceneVariableValue';
import { CodeContainer } from './components/CodeContainer/CodeContainer';
import { GitHubRepository } from './components/GitHubRepository';
import { calculateIsGitHubSupported } from './domain/calculateIsGitHubSupported';
import { formatFileName } from './domain/formatFileName';
import { useFunctionVersion } from './domain/FunctionVersionContext';
import { CommitWithSamples, getCommitsWithSamples } from './domain/getCommitsWithSamples';
import { getRepositoryDetails } from './domain/getRepositoryDetails';
import { isGitHubRepository } from './domain/isGitHubRepository';
import { FunctionDetails, FunctionVersion } from './domain/types/FunctionDetails';
import { StackTrace } from './domain/types/StackTrace';
import { useFetchFunctionsDetails } from './infrastructure/useFetchFunctionsDetails';
import { CommitSelect } from './ui/CommitSelect';
import { GitHubIntegrationBanner } from './ui/GitHubIntegrationBanner';
import { InlineSpinner } from './ui/InlineSpinner';
import { OverrideRepositoryDetailsButton } from './ui/OverrideRepositoryDetailsButton';

interface SceneFunctionDetailsPanelState extends SceneObjectState {}

export class SceneFunctionDetailsPanel extends SceneObjectBase<SceneFunctionDetailsPanelState> {
  static LABEL_WIDTH = 16;

  constructor() {
    super({ key: 'function-details-panel' });
  }

  useSceneFunctionDetailsPanel = (stackTrace: StackTrace, timeRange: TimeRange): DomainHookReturnValue => {
    const dataSourceUid = sceneGraph.findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable).useState()
      .value as string;
    const dataSourceName = sceneGraph.findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable).useState()
      .text as string;
    const serviceName = getSceneVariableValue(this, 'serviceName');
    const profileIdSelector = getSceneVariableValue(this, 'profileIdSelector');
    const query = useBuildPyroscopeQuery(this, 'filters');

    const {
      functionsDetails,
      error: fetchFunctionDetailsError,
      isFetching,
    } = useFetchFunctionsDetails({ dataSourceUid, query, timeRange, stackTrace, profileIdSelector });

    const [prevFunctionsDetails, setPrevFunctionsDetails] = useState<FunctionDetails[]>();
    const [currentFunctionDetails, setCurrentFunctionDetails] = useState<FunctionDetails>(functionsDetails[0]);

    const { saveOverride, deleteOverride, functionVersion, deleteAllOverrides, functionVersionOrigin } =
      useFunctionVersion(dataSourceUid, serviceName, currentFunctionDetails.version);

    const [isGitHubBannerDismissed, setIsGitHubBannerDismissed] = useState(
      userStorage.has(userStorage.KEYS.GITHUB_INTEGRATION)
    );

    if (functionsDetails && prevFunctionsDetails !== functionsDetails) {
      setPrevFunctionsDetails(functionsDetails);

      if (currentFunctionDetails !== functionsDetails[0]) {
        setCurrentFunctionDetails(functionsDetails[0]);
      }
    }

    const isGitHubRepo = isGitHubRepository(functionVersion?.repository || '');
    const isGitHubSupported = calculateIsGitHubSupported(currentFunctionDetails);
    const shouldDisplayGitHubBanner = !isGitHubBannerDismissed && !isGitHubRepo && isGitHubSupported;

    // TODO: massage in useFetchFunctionsDetails?
    const totalSamples = useMemo(
      () =>
        functionsDetails
          .map((details) => Array.from(details.callSites.values()).reduce((acc, { cum }) => acc + cum, 0))
          .reduce((acc, total) => acc + total, 0),
      [functionsDetails]
    );
    const commits = getCommitsWithSamples(functionsDetails, totalSamples);
    const selectedCommit = commits.find(({ sha }) => sha === currentFunctionDetails?.commit?.sha);

    return {
      data: {
        serviceName,
        dataSourceName,
        isLoading: isFetching,
        fetchFunctionDetailsError,
        functionDetails: {
          ...currentFunctionDetails,
          version: { ...currentFunctionDetails?.version, ...functionVersion },
        },
        functionVersionOrigin,
        // TODO: massage in useFetchFunctionsDetails?
        repository: getRepositoryDetails(isGitHubRepo, functionVersion),
        commits,
        selectedCommit,
        isGitHubSupported,
        shouldDisplayGitHubBanner,
        dataSourceUid,
      },
      actions: {
        deleteFunctionOverride(datasourceUid: string, serviceName: string) {
          deleteOverride(datasourceUid, serviceName);
        },
        deleteFunctionAllOverrides() {
          deleteAllOverrides();
        },
        saveFunctionDetails(datasourceUid: string, serviceName: string, o: FunctionVersion) {
          saveOverride(datasourceUid, serviceName, o);
        },
        selectCommit(selectedCommit: CommitWithSamples) {
          const details = functionsDetails.find(({ commit }) => commit.sha === selectedCommit.sha);
          setCurrentFunctionDetails(details as FunctionDetails);
        },
        dismissGitHubBanner() {
          userStorage.set(userStorage.KEYS.GITHUB_INTEGRATION, {});
          setIsGitHubBannerDismissed(true);
        },
      },
    };
  };

  static Component = ({
    model,
    timeRange,
    stackTrace,
    onClose,
  }: SceneComponentProps<SceneFunctionDetailsPanel> & {
    timeRange: TimeRange;
    stackTrace: StackTrace;
    onClose: () => void;
  }) => {
    const styles = useStyles2(getStyles);
    const { data, actions } = model.useSceneFunctionDetailsPanel(stackTrace, timeRange);

    return (
      <Panel
        className={styles.sidePanel}
        title={t('function-details.title', 'Function Details')}
        isLoading={false}
        headerActions={
          <IconButton
            name="times-circle"
            variant="secondary"
            aria-label={t('function-details.close', 'close')}
            onClick={onClose}
          />
        }
        dataTestId="function-details-panel"
      >
        <div className={styles.content}>
          {data.fetchFunctionDetailsError && (
            <InlineBanner
              severity="error"
              title={t('function-details.fetch-error', 'Error while fetching function details!')}
              error={data.fetchFunctionDetailsError}
            />
          )}

          <div className={styles.container}>
            <div className={styles.row} data-testid="row-function-name">
              <InlineLabel width={SceneFunctionDetailsPanel.LABEL_WIDTH}>
                <Trans i18nKey="function-details.function-name">Function name</Trans>
              </InlineLabel>
              <Tooltip content={data.functionDetails.name} placement="top">
                <span className={styles.textValue}>{data.functionDetails.name}</span>
              </Tooltip>
            </div>

            <div className={styles.row} data-testid="row-start-line">
              <InlineLabel
                tooltip={t('function-details.start-line-tooltip', 'The line where this function definition starts')}
                width={SceneFunctionDetailsPanel.LABEL_WIDTH}
              >
                <Trans i18nKey="function-details.start-line">Start line</Trans>
              </InlineLabel>
              <span className={styles.textValue}>
                <InlineSpinner isLoading={data.isLoading}>
                  {data.functionDetails.startLine !== undefined
                    ? data.functionDetails.startLine
                    : t('function-details.not-available', '-')}
                </InlineSpinner>
              </span>
            </div>

            <div className={styles.row} data-testid="row-file-path">
              <InlineLabel
                tooltip={t('function-details.file-tooltip', 'File path where that function is defined')}
                width={SceneFunctionDetailsPanel.LABEL_WIDTH}
              >
                <Trans i18nKey="function-details.file">File</Trans>
              </InlineLabel>
              <InlineSpinner isLoading={data.isLoading}>
                {data.functionDetails.fileName ? (
                  <>
                    <Tooltip content={data.functionDetails.fileName} placement="top">
                      {/* adding LRM to prevent ellipsis with RTL to fail when the file name starts with non-alpha chars (e.g. "$")  */}
                      <span className={styles.textValue}>&lrm;{formatFileName(data.functionDetails.fileName)}</span>
                    </Tooltip>
                    <ClipboardButton
                      icon="clipboard-alt"
                      variant="secondary"
                      fill="text"
                      size="sm"
                      className={styles.clipboardIconButton}
                      tooltip={t('function-details.copy-to-clipboard', 'Copy to clipboard')}
                      getText={() => data.functionDetails.fileName ?? ''}
                      onClipboardError={(_text, error) => {
                        displayError(error as Error, [
                          t('function-details.copy-error', 'Error while copying the file path to the clipboard!'),
                        ]);
                      }}
                    />
                  </>
                ) : (
                  t('function-details.not-available', '-')
                )}
              </InlineSpinner>
            </div>

            {data.shouldDisplayGitHubBanner && (
              <div className={styles.row} data-testid="row-github-banner">
                <GitHubIntegrationBanner onDismiss={actions.dismissGitHubBanner} />
              </div>
            )}

            <div className={styles.row} data-testid="row-repository">
              <InlineLabel
                tooltip={t('function-details.repository-tooltip', 'The repository configured for the selected service')}
                width={SceneFunctionDetailsPanel.LABEL_WIDTH}
              >
                <Trans i18nKey="function-details.repository">Repository</Trans>
              </InlineLabel>
              <InlineSpinner isLoading={data.isLoading}>
                {data.repository ? (
                  data.repository.isGitHub ? (
                    <GitHubRepository enableIntegration={data.isGitHubSupported} repository={data.repository} />
                  ) : (
                    <TextLink href={data.repository.url} external>
                      {data.repository.url}
                    </TextLink>
                  )
                ) : (
                  t('function-details.not-available', '-')
                )}
              </InlineSpinner>
              {!data.isLoading && (
                <OverrideRepositoryDetailsButton
                  serviceName={data.serviceName}
                  datasourceName={data.dataSourceName}
                  datasourceUid={data.dataSourceUid}
                  version={data.functionDetails.version}
                  functionVersionOrigin={data.functionVersionOrigin}
                  saveOverrides={actions.saveFunctionDetails}
                  deleteAllOverrides={actions.deleteFunctionAllOverrides}
                  deleteOverride={actions.deleteFunctionOverride}
                />
              )}
            </div>

            <div className={styles.row} data-testid="row-commit">
              <InlineLabel
                width={SceneFunctionDetailsPanel.LABEL_WIDTH}
                tooltip={t(
                  'function-details.commit-tooltip',
                  'The version of the application (commit) where the function is defined. Use the dropdown menu to target a specific commit.'
                )}
              >
                <Trans i18nKey="function-details.commit">Commit</Trans>
              </InlineLabel>
              <InlineSpinner isLoading={data.isLoading}>
                <CommitSelect
                  commits={data.commits}
                  selectedCommit={data.selectedCommit}
                  onChange={actions.selectCommit}
                />
              </InlineSpinner>
            </div>
          </div>

          <CodeContainer dataSourceUid={data.dataSourceUid} functionDetails={data.functionDetails} />
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
  container: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  `,
  row: css`
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding-bottom: 10px;
    > * {
      margin-right: 10px !important;
    }
  `,
  textValue: css`
    // hack to have the ellipsis appear at the start of the string
    direction: rtl;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  `,
  clipboardIconButton: css`
    && {
      padding: 0;
      min-height: unset;
      height: auto;
      min-width: unset;
      width: auto;
      line-height: 1;
      margin: 0;
    }
  `,
});
