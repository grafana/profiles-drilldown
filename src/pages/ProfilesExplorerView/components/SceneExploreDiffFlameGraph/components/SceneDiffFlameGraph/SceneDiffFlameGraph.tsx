import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Spinner, useStyles2 } from '@grafana/ui';
import { FlameGraph } from '@shared/components/FlameGraph/FlameGraph';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { useToggleSidePanel } from '@shared/domain/useToggleSidePanel';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import { InlineBanner } from '@shared/ui/InlineBanner';
import { Panel } from '@shared/ui/Panel/Panel';
import { PyroscopeLogo } from '@shared/ui/PyroscopeLogo';
import React, { useEffect, useMemo } from 'react';

import { useBuildPyroscopeQuery } from '../../../../domain/useBuildPyroscopeQuery';
import { useGrafanaAssistant } from '../../../../domain/useGrafanaAssistant';
import { ProfilesDataSourceVariable } from '../../../../domain/variables/ProfilesDataSourceVariable';
import { getSceneVariableValue } from '../../../../helpers/getSceneVariableValue';
import { AnalyzeDiffFlameGraph } from '../../../AnalyzeDiffFlameGraph';
import { AIButton } from '../../../SceneAiPanel/components/AiButton/AIButton';
import { SceneAiPanel } from '../../../SceneAiPanel/SceneAiPanel';
import { EventDiffAutoSelect } from '../../domain/events/EventDiffAutoSelect';
import { SceneExploreDiffFlameGraph } from '../../SceneExploreDiffFlameGraph';
import { useFetchDiffProfile } from './infrastructure/useFetchDiffProfile';
import { MissingSelectionsBanner } from './ui/MissingSelectionsBanner';

interface SceneDiffFlameGraphState extends SceneObjectState {
  aiPanel: SceneAiPanel;
}

export class SceneDiffFlameGraph extends SceneObjectBase<SceneDiffFlameGraphState> {
  constructor() {
    super({
      key: 'diff-flame-graph',
      aiPanel: new SceneAiPanel(),
    });
  }

  buildTitle() {
    const serviceName = getSceneVariableValue(this, 'serviceName');
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');
    const profileMetricType = getProfileMetric(profileMetricId as ProfileMetricId).type;

    return (
      <>
        <PyroscopeLogo size="small" />
        <Trans i18nKey="diff-flame-graph.title" values={{ serviceName, profileMetricType }}>
          Diff flame graph for {{ serviceName }} ({{ profileMetricType }})
        </Trans>
      </>
    );
  }

  useSceneDiffFlameGraph = (): DomainHookReturnValue => {
    const { aiPanel } = this.useState();

    const { baselineTimeRange, comparisonTimeRange } = sceneGraph
      .findByKeyAndType(this, 'explore-diff-flame-graph', SceneExploreDiffFlameGraph)
      .useDiffTimeRanges();

    const baselineQuery = useBuildPyroscopeQuery(this, 'filtersBaseline');
    const comparisonQuery = useBuildPyroscopeQuery(this, 'filtersComparison');

    const { settings } = useFetchPluginSettings();

    const dataSourceUid = sceneGraph.findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable).useState()
      .value as string;

    const isDiffQueryEnabled = Boolean(
      baselineQuery &&
        comparisonQuery &&
        // warning: sending zero parameters values to the API would make the pods crash
        // so we enable only when we have non-zero parameters values
        baselineTimeRange.from.unix() &&
        baselineTimeRange.to.unix() &&
        comparisonTimeRange.from.unix() &&
        comparisonTimeRange.to.unix()
    );

    const {
      isFetching,
      error: fetchProfileError,
      profile,
    } = useFetchDiffProfile({
      enabled: isDiffQueryEnabled,
      dataSourceUid,
      baselineTimeRange,
      baselineQuery,
      comparisonTimeRange,
      comparisonQuery,
    });

    const noProfileDataAvailable =
      isDiffQueryEnabled && !isFetching && !fetchProfileError && profile?.flamebearer.numTicks === 0;

    const shouldDisplayFlamegraph = Boolean(
      isDiffQueryEnabled && !fetchProfileError && !noProfileDataAvailable && profile
    );
    const hasMissingSelections = !isDiffQueryEnabled;

    return {
      data: {
        title: this.buildTitle(),
        isLoading: isFetching,
        fetchProfileError,
        noProfileDataAvailable,
        shouldDisplayFlamegraph,
        hasMissingSelections,
        profile: profile as FlamebearerProfile,
        settings,
        ai: {
          panel: aiPanel,
          fetchParams: [
            { query: baselineQuery, timeRange: baselineTimeRange },
            { query: comparisonQuery, timeRange: comparisonTimeRange },
          ],
        },
      },
      actions: {},
    };
  };

  onClickAutoSelect = () => {
    reportInteraction('g_pyroscope_app_diff_auto_select_clicked');

    this.publishEvent(new EventDiffAutoSelect({ wholeRange: false }), true);
  };

  onOpenLearnHow = () => {
    reportInteraction('g_pyroscope_app_diff_learn_how_clicked');
  };

  static Component = ({ model }: SceneComponentProps<SceneDiffFlameGraph>) => {
    const styles = useStyles2(getStyles);

    const { data } = model.useSceneDiffFlameGraph();
    const sidePanel = useToggleSidePanel();

    const { hideAIButton } = useGrafanaAssistant();

    const isAiButtonDisabled = data.isLoading || data.hasMissingSelections || data.noProfileDataAvailable;

    useEffect(() => {
      if (isAiButtonDisabled) {
        sidePanel.close();
      }
    }, [isAiButtonDisabled, sidePanel]);

    const panelTitle = useMemo(
      () => (
        <>
          {data.title}
          {data.isLoading && <Spinner inline className={styles.spinner} />}
        </>
      ),
      [data.isLoading, data.title, styles.spinner]
    );

    const dataSourceUid = sceneGraph.findByKeyAndType(model, 'dataSource', ProfilesDataSourceVariable).useState()
      .value as string;
    const profileMetricId = getSceneVariableValue(model, 'profileMetricId');

    const aiActionButton = hideAIButton ? (
      <AnalyzeDiffFlameGraph
        dataSourceUid={dataSourceUid}
        profileMetricId={profileMetricId}
        isDiff
        fetchParams={data.ai.fetchParams}
      />
    ) : (
      <AIButton
        disabled={isAiButtonDisabled || sidePanel.isOpen('ai')}
        onClick={() => sidePanel.open('ai')}
        interactionName="g_pyroscope_app_explain_flamegraph_clicked"
      >
        <Trans i18nKey="diff-flame-graph.explain-button">Explain Diff Flame Graph</Trans>
      </AIButton>
    );

    return (
      <div className={styles.flex}>
        <Panel
          dataTestId="diff-flame-graph-panel"
          className={styles.flamegraphPanel}
          title={panelTitle}
          isLoading={data.isLoading}
          headerActions={aiActionButton}
        >
          {data.hasMissingSelections && (
            <MissingSelectionsBanner
              onClickAutoSelect={model.onClickAutoSelect}
              onOpenLearnHow={model.onOpenLearnHow}
            />
          )}

          {data.fetchProfileError && (
            <InlineBanner
              severity="error"
              title={t('diff-flame-graph.error-loading-profile', 'Error while loading profile data!')}
              error={data.fetchProfileError}
            />
          )}

          {data.noProfileDataAvailable && (
            <InlineBanner
              severity="warning"
              title={t('diff-flame-graph.no-profile-data', 'No profile data available')}
              message={t(
                'diff-flame-graph.no-profile-data-message',
                "Please verify that you've selected adequate filters and time ranges."
              )}
            />
          )}

          {data.shouldDisplayFlamegraph && (
            <FlameGraph
              diff={true}
              profile={data.profile}
              enableFlameGraphDotComExport={data.settings?.enableFlameGraphDotComExport}
              collapsedFlamegraphs={data.settings?.collapsedFlamegraphs}
              /** Grafana assistant does not support diff flame graphs yet, we will use LLM plugin if enabled */
              showAnalyzeWithAssistant={false}
            />
          )}
        </Panel>

        {sidePanel.isOpen('ai') && (
          <data.ai.panel.Component
            model={data.ai.panel}
            isDiff
            fetchParams={data.ai.fetchParams}
            onClose={sidePanel.close}
          />
        )}
      </div>
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  flex: css`
    display: flex;
  `,
  flamegraphPanel: css`
    min-width: 0;
    flex-grow: 1;
  `,
  sidePanel: css`
    flex: 1 0 50%;
    margin-left: 8px;
    max-width: calc(50% - 4px);
  `,
  spinner: css`
    margin-left: ${theme.spacing(1)};
  `,
  aiButton: css`
    margin-top: ${theme.spacing(1)};
  `,
});
