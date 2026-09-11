import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState, SceneReactObject } from '@grafana/scenes';
import { useStyles2 } from '@grafana/ui';
import { getProfilesHeatmapFromOpenFeature } from '@shared/infrastructure/featureFlags/featureFlags';
import { uniqBy } from 'lodash';
import React from 'react';
import { Unsubscribable } from 'rxjs';

import { FavAction } from '../../domain/actions/FavAction';
import { SpanExemplarToggleAction } from '../../domain/actions/SpanExemplarToggleAction';
import { AllServicesFilterVariable } from '../../domain/variables/FiltersVariable/AllServicesFilterVariable';
import { FiltersVariable } from '../../domain/variables/FiltersVariable/FiltersVariable';
import { ProfileIdSelectorVariable } from '../../domain/variables/ProfileIdSelectorVariable';
import { ProfileMetricVariable } from '../../domain/variables/ProfileMetricVariable';
import { ProfilesDataSourceVariable } from '../../domain/variables/ProfilesDataSourceVariable';
import { ServiceNameVariable } from '../../domain/variables/ServiceNameVariable/ServiceNameVariable';
import { SpanSelectorVariable } from '../../domain/variables/SpanSelectorVariable';
import { PanelType } from '../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { GridItemData } from '../SceneByVariableRepeaterGrid/types/GridItemData';
import { selectHeatmap } from '../SceneExploreServiceHeatmap/infrastructure/HeatmapApiClient';
import {
  buildSpanHeatmapQuery,
  hasSpanProfiles,
  PrimedSpanHeatmapResponse,
  SceneExploreServiceHeatmap,
} from '../SceneExploreServiceHeatmap/SceneExploreServiceHeatmap';
import { SceneHeatmapMenu } from '../SceneExploreServiceHeatmap/SceneHeatmapMenu';
import { TimeseriesReprocess } from '../SceneLabelValuesTimeseries/domain/events/TimeseriesReprocess';
import { SceneMainServiceTimeseries } from '../SceneMainServiceTimeseries';
import { ResolutionBoostExtensionPoint } from './components/ResolutionBoostExtensionPoint';
import { SpanHeatmapPanel } from './components/SpanHeatmapPanel';
import { SpanProfilesToggled } from './domain/events/SpanProfilesToggled';
import { SceneFlameGraph } from './SceneFlameGraph';

interface SceneExploreServiceFlameGraphState extends SceneObjectState {
  mainTimeseries: SceneMainServiceTimeseries;
  body: SceneFlameGraph;
  spanHeatmap?: SceneExploreServiceHeatmap;
  showSpanHeatmap: boolean;
  spanToggleAction: SpanExemplarToggleAction;
  heatmapMenu: SceneHeatmapMenu;
}

const HEATMAP_ITEM: GridItemData = {
  index: 0,
  value: '',
  label: '',
  panelType: PanelType.TIMESERIES,
  queryRunnerParams: {},
};

export class SceneExploreServiceFlameGraph extends SceneObjectBase<SceneExploreServiceFlameGraphState> {
  private heatmapSelectedSpanSub?: Unsubscribable;
  private profilesHeatmapEnabled: boolean;
  private spanAvailabilityProbeId = 0;
  private primedSpanHeatmapResponse?: PrimedSpanHeatmapResponse;
  private syncingHeatmapSelection = false;
  private initialShowSpanHeatmap: boolean;
  private initialTempoDataSourceUid?: string;
  private onShowSpanHeatmapChange?: (showSpanHeatmap: boolean) => void;
  private onTempoDataSourceUidChange?: (tempoDataSourceUid?: string) => void;

  constructor({
    item,
    initialShowSpanHeatmap = false,
    initialTempoDataSourceUid,
    onShowSpanHeatmapChange,
    onTempoDataSourceUidChange,
  }: {
    item?: GridItemData;
    initialShowSpanHeatmap?: boolean;
    initialTempoDataSourceUid?: string;
    onShowSpanHeatmapChange?: (showSpanHeatmap: boolean) => void;
    onTempoDataSourceUidChange?: (tempoDataSourceUid?: string) => void;
  }) {
    const profilesHeatmapEnabled = getProfilesHeatmapFromOpenFeature();
    const spanToggleAction = new SpanExemplarToggleAction(initialShowSpanHeatmap);

    super({
      key: 'explore-service-flame-graph',
      showSpanHeatmap: false,
      spanToggleAction,
      heatmapMenu: new SceneHeatmapMenu({
        favAction: new FavAction({ item: HEATMAP_ITEM }),
      }),
      mainTimeseries: new SceneMainServiceTimeseries({
        item,
        includeExemplars: true,
        includeSpanExemplars: profilesHeatmapEnabled,
        spanExemplarToggleAction: spanToggleAction,
        headerActions: () => [
          new SceneReactObject({ component: ResolutionBoostExtensionPoint, props: { scene: this } }),
        ],
        menuActions: (item) => ({
          favAction: new FavAction({ item }),
        }),
      }),
      body: new SceneFlameGraph(),
    });

    this.profilesHeatmapEnabled = profilesHeatmapEnabled;
    this.initialShowSpanHeatmap = initialShowSpanHeatmap;
    this.initialTempoDataSourceUid = initialTempoDataSourceUid;
    this.onShowSpanHeatmapChange = onShowSpanHeatmapChange;
    this.onTempoDataSourceUidChange = onTempoDataSourceUidChange;

    this.addActivationHandler(this.onActivate.bind(this, item));
  }

  onActivate(item?: GridItemData) {
    if (item) {
      this.initVariables(item);
    }

    const allServicesFilters = sceneGraph.findByKeyAndType(this, 'filtersAllServices', AllServicesFilterVariable);
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
    if (allServicesFilters.state.filters.length > 0) {
      const merged = uniqBy(
        [...allServicesFilters.state.filters, ...filtersVariable.state.filters],
        ({ key, operator, value }) => `${key}${operator}${value}`
      );
      filtersVariable.updateFilters(merged);
    }

    const profileMetricVariable = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable);
    profileMetricVariable.setState({ query: ProfileMetricVariable.QUERY_SERVICE_NAME_DEPENDENT });
    profileMetricVariable.update(true);

    if (!this.profilesHeatmapEnabled) {
      return () => {
        profileMetricVariable.setState({ query: ProfileMetricVariable.QUERY_DEFAULT });
        profileMetricVariable.update(true);
      };
    }

    const spanToggleSub = this.subscribeToEvent(SpanProfilesToggled, (event) => {
      if (event.payload.enabled) {
        this.openSpanHeatmapMode();
      } else {
        this.closeSpanHeatmapMode();
      }
    });

    // When spanSelector changes from outside (e.g. the "×" button on SpanSelectorLabel),
    // sync the selection into the visible heatmap.
    const spanSelectorSub = sceneGraph
      .findByKeyAndType(this, 'spanSelector', SpanSelectorVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value === prevState.value || !this.state.spanHeatmap || this.syncingHeatmapSelection) {
          return;
        }
        const currentProfileId = sceneGraph.interpolate(this, '$profileIdSelector') || undefined;
        this.state.spanHeatmap.setState({
          selectedSpanId: (newState.value as string) || undefined,
          selectedProfileId: currentProfileId,
          selectedTimestamp: undefined,
        });
      });

    const timeRangeSub = sceneGraph.getTimeRange(this).subscribeToState(() => {
      this.clearSpanProfileSelection();
      this.probeSpanAvailability();
    });

    const dataSourceSub = sceneGraph
      .findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value !== prevState.value) {
          this.onDataSourceChange();
        }
      });

    const serviceNameSub = sceneGraph
      .findByKeyAndType(this, 'serviceName', ServiceNameVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value !== prevState.value) {
          this.onServiceNameChange();
        }
      });

    const profileMetricSub = profileMetricVariable.subscribeToState((newState, prevState) => {
      if (newState.value !== prevState.value) {
        this.clearSpanProfileSelection();
        this.probeSpanAvailability();
      }
    });

    const filtersSub = sceneGraph
      .findByKeyAndType(this, 'filters', FiltersVariable)
      .subscribeToState((newState, prevState) => {
        if (JSON.stringify(newState.filters) !== JSON.stringify(prevState.filters)) {
          this.clearSpanProfileSelection();
          this.probeSpanAvailability();
        }
      });

    this.probeSpanAvailability(this.initialShowSpanHeatmap);

    return () => {
      profileMetricVariable.setState({ query: ProfileMetricVariable.QUERY_DEFAULT });
      profileMetricVariable.update(true);
      this.spanAvailabilityProbeId++;
      spanToggleSub.unsubscribe();
      spanSelectorSub.unsubscribe();
      timeRangeSub.unsubscribe();
      dataSourceSub.unsubscribe();
      serviceNameSub.unsubscribe();
      profileMetricSub.unsubscribe();
      filtersSub.unsubscribe();
      this.heatmapSelectedSpanSub?.unsubscribe();

      const withoutAllServicesFilters = filtersVariable.state.filters.filter((filter) => {
        return !allServicesFilters.state.filters.some((allServicesFilter) => {
          return (
            filter.key === allServicesFilter.key &&
            filter.operator === allServicesFilter.operator &&
            filter.value === allServicesFilter.value
          );
        });
      });
      filtersVariable.updateFilters([...withoutAllServicesFilters]);
    };
  }

  async probeSpanAvailability(openHeatmapWhenAvailable = false) {
    if (!this.profilesHeatmapEnabled || this.state.showSpanHeatmap) {
      return;
    }

    const requestId = ++this.spanAvailabilityProbeId;
    this.primedSpanHeatmapResponse = undefined;
    this.state.spanToggleAction.setState({ hasSpanData: undefined });

    const spanHeatmapQuery = buildSpanHeatmapQuery(this);
    if (!spanHeatmapQuery) {
      return;
    }

    try {
      const response = await selectHeatmap(spanHeatmapQuery.dataSourceUid, spanHeatmapQuery.request);

      if (requestId !== this.spanAvailabilityProbeId) {
        return;
      }

      this.primedSpanHeatmapResponse = { response, signature: spanHeatmapQuery.signature };
      const hasSpanData = hasSpanProfiles(response);
      this.state.spanToggleAction.setState({ hasSpanData });
      if (openHeatmapWhenAvailable && hasSpanData) {
        this.openSpanHeatmapMode();
      }
    } catch {
      if (requestId !== this.spanAvailabilityProbeId) {
        return;
      }

      this.state.spanToggleAction.setState({ hasSpanData: undefined });
    }
  }

  syncSpanHeatmapFromUrl(showSpanHeatmap: boolean) {
    if (showSpanHeatmap) {
      this.probeSpanAvailability(true);
      return;
    }

    if (this.state.showSpanHeatmap) {
      this.closeSpanHeatmapMode();
    }
  }

  openSpanHeatmapMode() {
    if (!this.profilesHeatmapEnabled) {
      return;
    }

    let { spanHeatmap } = this.state;
    const primedResponse = this.getPrimedSpanHeatmapResponse();

    if (!spanHeatmap) {
      spanHeatmap = new SceneExploreServiceHeatmap({
        manageProfileMetricQuery: false,
        embedded: true,
        primedResponse,
        initialTempoDataSourceUid: this.initialTempoDataSourceUid,
        onTempoDataSourceUidChange: this.onTempoDataSourceUidChange,
      });
    } else {
      // Re-priming alone doesn't refetch: without this, reopening an existing
      // heatmap after switching services would keep showing the previous
      // service's data until something else happened to trigger a fetch.
      spanHeatmap.primeWithResponse(primedResponse);
      spanHeatmap.fetchHeatmapData();
    }

    // Sync the current spanSelector into the heatmap's selection highlight.
    const currentSpanId = sceneGraph.interpolate(this, '$spanSelector') || undefined;
    const currentProfileId = sceneGraph.interpolate(this, '$profileIdSelector') || undefined;
    spanHeatmap.setState({
      selectedSpanId: currentSpanId,
      selectedProfileId: currentProfileId,
      selectedTimestamp: undefined,
    });

    // When the user clicks a span in the heatmap/table, push the selection into
    // spanSelector so the flamegraph below filters accordingly.
    this.heatmapSelectedSpanSub?.unsubscribe();
    this.heatmapSelectedSpanSub = spanHeatmap.subscribeToState((newState, prevState) => {
      if (
        newState.selectedSpanId === prevState.selectedSpanId &&
        newState.selectedProfileId === prevState.selectedProfileId &&
        newState.selectedTimestamp === prevState.selectedTimestamp
      ) {
        return;
      }
      const spanSelectorVar = sceneGraph.findByKeyAndType(this, 'spanSelector', SpanSelectorVariable);
      const profileIdSelectorVar = sceneGraph.findByKeyAndType(this, 'profileIdSelector', ProfileIdSelectorVariable);
      this.syncingHeatmapSelection = true;
      try {
        if (newState.selectedSpanId) {
          this.applySelectedSpanTimeRange(newState.selectedTimestamp);
          spanSelectorVar.changeValueTo(newState.selectedSpanId);
          const profileId =
            newState.selectedProfileId ??
            this.findSelectedProfileId(newState.selectedSpanId, newState.selectedTimestamp);
          if (profileId) {
            profileIdSelectorVar.changeValueTo(profileId);
          } else {
            profileIdSelectorVar.reset();
          }
        } else {
          spanSelectorVar.reset();
          profileIdSelectorVar.reset();
          this.state.body.setState({ $timeRange: undefined });
        }
      } finally {
        this.syncingHeatmapSelection = false;
      }
    });

    this.state.spanToggleAction.setState({ showSpanHeatmap: true });
    this.setState({ spanHeatmap, showSpanHeatmap: true });
    this.onShowSpanHeatmapChange?.(true);
  }

  findSelectedProfileId(spanId: string, timestamp?: number): string | undefined {
    const rows = this.state.spanHeatmap?.state.exemplarRows ?? [];

    return rows.find((row) => row.spanId === spanId && (timestamp === undefined || row.timestamp === timestamp))
      ?.profileId;
  }

  applySelectedSpanTimeRange(timestamp?: number) {
    if (timestamp === undefined) {
      return;
    }

    this.state.body.setSpanTimeRange(timestamp);
  }

  getPrimedSpanHeatmapResponse(): PrimedSpanHeatmapResponse | undefined {
    const spanHeatmapQuery = buildSpanHeatmapQuery(this);

    if (!spanHeatmapQuery || this.primedSpanHeatmapResponse?.signature !== spanHeatmapQuery.signature) {
      return undefined;
    }

    return this.primedSpanHeatmapResponse;
  }

  closeSpanHeatmapMode() {
    this.heatmapSelectedSpanSub?.unsubscribe();
    this.heatmapSelectedSpanSub = undefined;
    this.clearSpanProfileSelection();
    this.state.spanToggleAction.setState({ showSpanHeatmap: false });
    this.setState({ showSpanHeatmap: false });
    this.onShowSpanHeatmapChange?.(false);
    this.probeSpanAvailability();
  }

  onServiceNameChange() {
    if (this.state.showSpanHeatmap) {
      this.closeSpanHeatmapMode();
      return;
    }

    this.clearSpanProfileSelection();
    this.probeSpanAvailability();
  }

  onDataSourceChange() {
    this.clearSpanProfileSelection();

    if (this.state.showSpanHeatmap) {
      this.state.spanHeatmap?.fetchHeatmapData();
      return;
    }

    this.probeSpanAvailability();
  }

  clearSpanProfileSelection() {
    this.syncingHeatmapSelection = true;
    try {
      sceneGraph.findByKeyAndType(this, 'spanSelector', SpanSelectorVariable).reset();
      sceneGraph.findByKeyAndType(this, 'profileIdSelector', ProfileIdSelectorVariable).reset();
      this.state.body.setState({ $timeRange: undefined });
      this.state.spanHeatmap?.setState({
        selectedSpanId: undefined,
        selectedProfileId: undefined,
        selectedTimestamp: undefined,
        selectedTraceId: undefined,
      });
    } finally {
      this.syncingHeatmapSelection = false;
    }
  }

  initVariables(item: GridItemData) {
    const { serviceName, profileMetricId, filters, profileIdSelector } = item.queryRunnerParams;

    if (serviceName) {
      const serviceNameVariable = sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable);
      serviceNameVariable.changeValueTo(serviceName);
    }

    if (profileMetricId) {
      const profileMetricVariable = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable);
      profileMetricVariable.changeValueTo(profileMetricId);
    }

    if (profileIdSelector) {
      const profileIdSelectorVariable = sceneGraph.findByKeyAndType(
        this,
        'profileIdSelector',
        ProfileIdSelectorVariable
      );
      profileIdSelectorVariable.changeValueTo(profileIdSelector);
    }

    if (filters) {
      const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
      filtersVariable.setState({ filters });
    }
  }

  reprocessMainTimeseries() {
    this.state.mainTimeseries?.state.body?.publishEvent(new TimeseriesReprocess({}), true);
  }

  // see SceneProfilesExplorer
  getVariablesAndGridControls() {
    return {
      variables: [
        sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable),
        sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable),
        sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable),
      ],
      gridControls: [],
    };
  }

  static Component({ model }: SceneComponentProps<SceneExploreServiceFlameGraph>) {
    const styles = useStyles2(getStyles);
    const {
      mainTimeseries,
      body,
      spanHeatmap,
      showSpanHeatmap,
      heatmapMenu,
      spanToggleAction,
    } = model.useState();
    const showHeatmapPanel = model.profilesHeatmapEnabled && showSpanHeatmap && spanHeatmap;

    return (
      <div className={styles.flex}>
        {showHeatmapPanel ? (
          <SpanHeatmapPanel
            model={model}
            spanHeatmap={spanHeatmap}
            menu={heatmapMenu}
            spanToggle={spanToggleAction}
          />
        ) : (
          // we use CSS here and Scenes Flex layout because we encountered a problem where the Flamegraph would not respect each panel width,
          // resulting in a cropped flame graph when opening the side panel
          <div className={styles.mainTimeseries}>
            <mainTimeseries.Component model={mainTimeseries} />
          </div>
        )}
        <body.Component model={body} />
      </div>
    );
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  flex: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: ${theme.spacing(1)};
  `,
  mainTimeseries: css`
    height: ${SceneMainServiceTimeseries.MIN_HEIGHT}px;
  `,
});
