import { css } from '@emotion/css';
import { createTheme, DataFrame, GrafanaTheme2, LoadingState, TimeRange } from '@grafana/data';
// TODO: onFocusChange and loadingPaths are not in a released @grafana/flamegraph yet (see grafana/grafana#132316).
// Until it ships, point the dependency at a local build:
//   "@grafana/flamegraph": "file:./grafana-flamegraph-local.tgz"
import { FlameGraph, Props as FlameGraphProps } from '@grafana/flamegraph';
import { t, Trans } from '@grafana/i18n';
import {
  sceneGraph,
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
import { DEFAULT_SETTINGS } from '@shared/infrastructure/settings/PluginSettings';
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
import {
  INITIAL_MAX_NODES,
  ProgressiveController,
  ProgressiveProgress,
  startProgressiveRefinement,
} from '../../infrastructure/flame-graph/progressiveFlameGraph';
import { dataFrameToTree } from '../../infrastructure/flame-graph/progressiveProfileTree';
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
  progressiveFrame?: DataFrame;
  progressiveProgress?: ProgressiveProgress;
  focusPath?: string[];
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

          const frame = newDataState.data.series?.[0];

          if (frame && frame !== this.lastRefinedFrame) {
            this.lastRefinedFrame = frame;
            this.startProgressiveRefinement(frame, newDataState.data.timeRange);
          }
        }
      });
    });

    return () => {
      stateSubscription.unsubscribe();
      dataSubscription?.unsubscribe();
      this.stopProgressiveRefinement();
    };
  }

  private refiner?: ProgressiveController;
  private lastRefinedFrame?: DataFrame;
  private progressiveQuery?: { enabled: boolean };

  /** Called from the hook below, which is where the settings are available. */
  setProgressiveQuery(enabled: boolean) {
    this.progressiveQuery = { enabled };
  }

  private stopProgressiveRefinement() {
    this.refiner?.cancel();
    this.refiner = undefined;
  }

  private startProgressiveRefinement(frame: DataFrame, timeRange: TimeRange) {
    this.stopProgressiveRefinement();

    // The flame graph keeps the focus across a data change, and does so without reporting a change, so the focus path
    // is kept here too and handed to the new controller below. If the path is gone from the new data, resolving it
    // simply finds nothing and no queries are made.
    this.setState({ progressiveFrame: frame, progressiveProgress: undefined });

    if (!this.progressiveQuery?.enabled) {
      return;
    }

    const tree = dataFrameToTree(frame);
    const dataSourceUid = getSceneVariableValue(this, 'dataSource');
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');
    const labelSelectorTemplate = (this.state.$data.state.queries[0] as { labelSelector?: string } | undefined)
      ?.labelSelector;

    if (!tree || !dataSourceUid || !profileMetricId || !labelSelectorTemplate) {
      return;
    }

    // The query carries the label selector as a template ($serviceName, ${filters...}), which the query runner would
    // normally interpolate for us.
    const labelSelector = sceneGraph.interpolate(this, labelSelectorTemplate);

    this.refiner = startProgressiveRefinement(
      tree,
      frame,
      {
        dataSourceUid,
        profileTypeId: profileMetricId,
        labelSelector,
        timeRange,
        unit: frame.fields.find((field) => field.name === 'value')?.config?.unit ?? 'short',
        // Whether an 'other' node is worth querying depends on how wide it is drawn, so measure the rendered graph.
        // Zero means it has not been laid out yet, and nothing counts as visible until it has.
        getViewWidth: () => document.querySelector('[data-testid="flameGraph"]')?.clientWidth ?? 0,
      },
      (progressiveFrame, progressiveProgress) => {
        this.setState({ progressiveFrame, progressiveProgress });
      }
    );

    this.refiner.setFocusPath(this.state.focusPath);
  }

  /** The width the flame graph is drawn at decides what counts as visible, so re-check when it changes. */
  onViewWidthChange = () => {
    this.refiner?.rescan();
  };

  setFocusPath = (focusPath: string[] | undefined) => {
    this.setState({ focusPath });
    this.refiner?.setFocusPath(focusPath);
  };

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
    const {
      $timeRange,
      $data,
      lastTimeRange,
      exportMenu,
      aiPanel,
      functionDetailsPanel,
      createRecordingRuleModal,
      progressiveFrame,
      progressiveProgress,
      focusPath,
    } = this.useState();

    // Progressive loading only makes sense for the plain profile view: a span or profile id selector already narrows
    // the query down to something small. Settings can fail to load (the settings API is not available on every
    // backend), in which case fall back to the default rather than silently turning the feature off.
    const progressiveEnabled = Boolean(
      (settings?.progressiveFlamegraphs ?? DEFAULT_SETTINGS.progressiveFlamegraphs) && !spanSelector && !profileIdSelector
    );
    this.setProgressiveQuery(progressiveEnabled);

    useEffect(() => {
      const runner = buildFlameGraphQueryRunner({
        // Progressive loading ignores the configured maxNodes: detail comes from re-querying subtrees instead.
        maxNodes: progressiveEnabled ? INITIAL_MAX_NODES : maxNodes,
        spanSelector,
        profileIdSelector,
      });
      this.setState({ $data: runner });
      return deferSceneQueryRunnerRun(runner);
    }, [$timeRange, maxNodes, spanSelector, profileIdSelector, progressiveEnabled]);

    const $dataState = $data.useState();
    const loadingState = $dataState?.data?.state;

    const fetchProfileError =
      loadingState === LoadingState.Error
        ? ($dataState?.data?.errors?.[0] as Error) || new Error('Unknown error!')
        : null;

    const isFetchingProfileData = loadingState === LoadingState.Loading;
    // Refinement is still a load as far as the panel is concerned, so the panel's loading bar keeps animating rather
    // than the flame graph looking finished while more of it is on the way.
    const isRefining = Boolean(progressiveProgress && !progressiveProgress.done);
    const profileData = (progressiveEnabled && progressiveFrame) || $dataState?.data?.series?.[0];
    const hasProfileData = Number(profileData?.length) > 1;

    const query = useBuildPyroscopeQuery(this, 'filters');

    return {
      data: {
        title: this.buildTitle(),
        isLoading: isFetchingProfileData || isRefining,
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
        progressive: {
          enabled: progressiveEnabled,
          progress: progressiveProgress,
          focusPath,
        },
      },
      actions: {
        getTheme,
        setFocusPath: this.setFocusPath,
        onViewWidthChange: this.onViewWidthChange,
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

    // The flame graph settles into its final width after the panes lay out, and the user can resize it afterwards.
    // Both change what counts as a visible 'other' node, so re-check when the width changes.
    useEffect(() => {
      const canvas = document.querySelector('[data-testid="flameGraph"]');

      if (!canvas || typeof ResizeObserver === 'undefined') {
        return;
      }

      const observer = new ResizeObserver(() => actions.onViewWidthChange());
      observer.observe(canvas);

      return () => observer.disconnect();
    }, [actions, data.profileData]);

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
                />
              }
              keepFocusOnDataChange
              onFocusChange={actions.setFocusPath}
              loadingPaths={data.progressive.progress?.loadingPaths}
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
