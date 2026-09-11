import { css } from '@emotion/css';
import { createTheme, GrafanaTheme2, LoadingState, TimeRange } from '@grafana/data';
import { FlameGraph, Props as FlameGraphProps } from '@grafana/flamegraph';
import { t, Trans } from '@grafana/i18n';
import {
  SceneComponentProps,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  SceneTimeRange,
} from '@grafana/scenes';
import { Spinner, useStyles2, useTheme2 } from '@grafana/ui';
import { useMaxNodesFromUrl } from '@shared/domain/url-params/useMaxNodesFromUrl';
import { useToggleSidePanel } from '@shared/domain/useToggleSidePanel';
import { useFlagMetricsFromProfiles } from '@shared/infrastructure/featureFlags/featureFlags';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { InlineBanner } from '@shared/ui/InlineBanner';
import { Panel } from '@shared/ui/Panel/Panel';
import { PyroscopeLogo } from '@shared/ui/PyroscopeLogo';
import React, { useEffect, useMemo, useState } from 'react';
import { Unsubscribable } from 'rxjs';

import { useBuildPyroscopeQuery } from '../../domain/useBuildPyroscopeQuery';
import { useGrafanaAssistant } from '../../domain/useGrafanaAssistant';
import { getSceneVariableValue } from '../../helpers/getSceneVariableValue';
import { deferSceneQueryRunnerRun } from '../../infrastructure/deferSceneQueryRunnerRun';
import { buildFlameGraphQueryRunner } from '../../infrastructure/flame-graph/buildFlameGraphQueryRunner';
import { PYROSCOPE_DATA_SOURCE } from '../../infrastructure/pyroscope-data-sources';
import { AIButton } from '../SceneAiPanel/components/AiButton/AIButton';
import { SceneAiPanel } from '../SceneAiPanel/SceneAiPanel';
import { useCreateRecordingRulesMenu } from '../SceneCreateMetricModal/domain/useMenuOption';
import { SceneCreateRecordingRuleModal } from '../SceneCreateMetricModal/SceneCreateRecordingRuleModal';
import { SamplingIndicatorExtensionPoint } from './components/SamplingIndicatorExtensionPoint';
import { SceneExportMenu } from './components/SceneExportMenu/SceneExportMenu';
import { useGitHubIntegration } from './components/SceneFunctionDetailsPanel/domain/useGitHubIntegration';
import { SceneFunctionDetailsPanel } from './components/SceneFunctionDetailsPanel/SceneFunctionDetailsPanel';
import { buildSpanTimeRange } from './domain/buildSpanTimeRange';
import { RemoveProfileIdSelector } from './domain/events/RemoveProfileIdSelector';
import { RemoveSpanSelector } from './domain/events/RemoveSpanSelector';
import { ProfileIdSelectorLabel } from './ProfileIdSelectorLabel';
import { SceneExploreServiceFlameGraph } from './SceneExploreServiceFlameGraph';
import { SpanSelectorLabel } from './SpanSelectorLabel';

interface SceneFlameGraphState extends SceneObjectState {
  $timeRange?: SceneTimeRange;
  $data: SceneQueryRunner;
  lastTimeRange?: TimeRange;
  exportMenu: SceneExportMenu;
  aiPanel: SceneAiPanel;
  functionDetailsPanel: SceneFunctionDetailsPanel;
  createRecordingRuleModal: SceneCreateRecordingRuleModal;
}

// I've tried to use a SplitLayout for the body without any success (left: flame graph, right: explain flame graph content)
// without success: the flame graph dimensions are set in runtime and do not change when the user resizes the layout
export class SceneFlameGraph extends SceneObjectBase<SceneFlameGraphState> {
  constructor() {
    super({
      key: 'flame-graph',
      $data: new SceneQueryRunner({
        datasource: PYROSCOPE_DATA_SOURCE,
        queries: [],
      }),
      lastTimeRange: undefined,
      exportMenu: new SceneExportMenu(),
      aiPanel: new SceneAiPanel(),
      functionDetailsPanel: new SceneFunctionDetailsPanel(),
      createRecordingRuleModal: new SceneCreateRecordingRuleModal(),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    let dataSubscription: Unsubscribable | undefined;

    const stateSubscription = this.subscribeToState((newState, prevState) => {
      if (newState.$data === prevState.$data) {
        return;
      }

      if (dataSubscription) {
        dataSubscription.unsubscribe();
      }

      dataSubscription = newState.$data?.subscribeToState((newDataState) => {
        if (newDataState.data?.state === LoadingState.Done) {
          this.setState({ lastTimeRange: newDataState.data.timeRange });
        }
      });
    });

    return () => {
      stateSubscription.unsubscribe();
      dataSubscription?.unsubscribe();
    };
  }

  buildTitle() {
    const serviceName = getSceneVariableValue(this, 'serviceName');
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');
    const profileMetricType = getProfileMetric(profileMetricId as ProfileMetricId).type;

    return (
      <>
        <PyroscopeLogo size="small" />
        <Trans i18nKey="flame-graph.title" values={{ serviceName, profileMetricType }}>
          Flame graph for {{ serviceName }} ({{ profileMetricType }})
        </Trans>
      </>
    );
  }

  useSceneFlameGraph = (spanSelector: string, profileIdSelector?: string): DomainHookReturnValue => {
    const { isLight } = useTheme2();
    const getTheme = useMemo(() => () => createTheme({ colors: { mode: isLight ? 'light' : 'dark' } }), [isLight]);

    const [maxNodes] = useMaxNodesFromUrl();
    const { settings } = useFetchPluginSettings();
    const { $timeRange, $data, lastTimeRange, exportMenu, aiPanel, functionDetailsPanel, createRecordingRuleModal } =
      this.useState();

    useEffect(() => {
      const runner = buildFlameGraphQueryRunner({
        maxNodes,
        spanSelector,
        profileIdSelector,
      });
      this.setState({ $data: runner });
      return deferSceneQueryRunnerRun(runner);
    }, [$timeRange, maxNodes, spanSelector, profileIdSelector]);

    const $dataState = $data.useState();
    const loadingState = $dataState?.data?.state;

    const fetchProfileError =
      loadingState === LoadingState.Error
        ? ($dataState?.data?.errors?.[0] as Error) || new Error('Unknown error!')
        : null;

    const isFetchingProfileData = loadingState === LoadingState.Loading;
    const profileData = $dataState?.data?.series?.[0];
    const hasProfileData = Number(profileData?.length) > 1;

    const query = useBuildPyroscopeQuery(this, 'filters');

    return {
      data: {
        title: this.buildTitle(),
        isLoading: isFetchingProfileData,
        isFetchingProfileData,
        hasProfileData,
        profileData,
        spanSelector,
        fetchProfileError,
        settings,
        export: {
          menu: exportMenu,
          query,
          timeRange: lastTimeRange,
          profileIdSelector,
          spanSelector,
        },
        ai: {
          panel: aiPanel,
          fetchParams: [{ query, timeRange: lastTimeRange }],
        },
        gitHub: {
          panel: functionDetailsPanel,
          timeRange: lastTimeRange,
        },
        recordingRules: {
          modal: createRecordingRuleModal,
        },
      },
      actions: {
        getTheme,
      },
    };
  };

  removeSpanSelector() {
    this.setState({ $timeRange: undefined });
    this.publishEvent(new RemoveSpanSelector({}), true);
  }

  setSpanTimeRange(timestamp: number) {
    this.setState({
      $timeRange: new SceneTimeRange(buildSpanTimeRange(timestamp)),
    });
  }

  removeProfileIdSelector() {
    this.publishEvent(new RemoveProfileIdSelector({}), true);
    (this.parent as SceneExploreServiceFlameGraph)?.reprocessMainTimeseries();
  }

  static Component = ({ model }: SceneComponentProps<SceneFlameGraph>) => {
    const styles = useStyles2(getStyles);
    const metricsFromProfiles = useFlagMetricsFromProfiles();

    const spanSelector = getSceneVariableValue(model, 'spanSelector');
    const profileIdSelector = getSceneVariableValue(model, 'profileIdSelector');
    const { data, actions } = model.useSceneFlameGraph(spanSelector, profileIdSelector);
    const sidePanel = useToggleSidePanel();
    const gitHubIntegration = useGitHubIntegration(sidePanel);

    const { settings } = useFetchPluginSettings();

    const [recordingRulesModalState, setRecordingRulesModalState] = useState<{
      isOpen: boolean;
      functionName?: string;
    }>({ isOpen: false });

    const recordingRulesMenu = useCreateRecordingRulesMenu((functionName?: string) => {
      setRecordingRulesModalState({ isOpen: true, functionName });
    });

    const { hideAIButton } = useGrafanaAssistant();

    const isAiButtonDisabled = data.isLoading || !data.hasProfileData;

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

    const extraContextMenuButtons: FlameGraphProps['getExtraContextMenuButtons'] = (clickedItemData, data) => {
      const ghButtons = gitHubIntegration.actions.getExtraFlameGraphMenuItems(clickedItemData, data);
      const recordingRulesButtons =
        settings?.enableMetricsFromProfiles && metricsFromProfiles
          ? recordingRulesMenu.actions.getExtraFlameGraphMenuItems(clickedItemData, data)
          : [];

      return [...ghButtons, ...recordingRulesButtons];
    };

    return (
      <div className={styles.flex}>
        <Panel
          dataTestId="flame-graph-panel"
          className={styles.flamegraphPanel}
          title={panelTitle}
          isLoading={data.isLoading}
          headerActions={
            <>
              {spanSelector && (
                <SpanSelectorLabel spanSelector={spanSelector} removeSpanSelector={() => model.removeSpanSelector()} />
              )}
              {profileIdSelector && (
                <ProfileIdSelectorLabel
                  profileIdSelector={profileIdSelector}
                  removeProfileIdSelector={() => model.removeProfileIdSelector()}
                />
              )}
              {!hideAIButton && (
                <AIButton
                  disabled={isAiButtonDisabled || sidePanel.isOpen('ai')}
                  onClick={() => sidePanel.open('ai')}
                  interactionName="g_pyroscope_app_explain_flamegraph_clicked"
                >
                  <Trans i18nKey="flame-graph.explain-button">Explain Flame Graph</Trans>
                </AIButton>
              )}
              <SamplingIndicatorExtensionPoint scene={model} />
            </>
          }
        >
          {data.fetchProfileError && (
            <InlineBanner
              severity="error"
              title={t('flame-graph.error-loading-profile', 'Error while loading profile data!')}
              error={data.fetchProfileError}
            />
          )}

          {!data.fetchProfileError && (
            <FlameGraph
              data={data.profileData as any}
              disableCollapsing={!data.settings?.collapsedFlamegraphs}
              getTheme={actions.getTheme as any}
              getExtraContextMenuButtons={extraContextMenuButtons}
              extraHeaderElements={
                <data.export.menu.Component
                  model={data.export.menu}
                  query={data.export.query}
                  timeRange={data.export.timeRange}
                  profileIdSelector={data.export.profileIdSelector}
                  spanSelector={data.export.spanSelector}
                />
              }
              keepFocusOnDataChange
              enableNewUI={true}
            />
          )}
        </Panel>

        {sidePanel.isOpen('ai') && (
          <data.ai.panel.Component model={data.ai.panel} fetchParams={data.ai.fetchParams} onClose={sidePanel.close} />
        )}

        {sidePanel.isOpen('function-details') && (
          <data.gitHub.panel.Component
            model={data.gitHub.panel}
            timeRange={data.gitHub.timeRange}
            stackTrace={gitHubIntegration.data.stacktrace}
            onClose={sidePanel.close}
          />
        )}

        <data.recordingRules.modal.Component
          model={data.recordingRules.modal}
          isModalOpen={recordingRulesModalState.isOpen}
          functionName={recordingRulesModalState.functionName}
          onDismiss={() => setRecordingRulesModalState({ isOpen: false })}
          onCreated={() => {
            setRecordingRulesModalState({ isOpen: false });
          }}
        />
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
  spinner: css`
    margin-left: ${theme.spacing(1)};
  `,
});
