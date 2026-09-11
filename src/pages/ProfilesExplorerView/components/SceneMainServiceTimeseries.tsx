import {
  SceneComponentProps,
  SceneDataTransformer,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  VizPanelState,
} from '@grafana/scenes';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React from 'react';

import { FiltersVariable } from '../domain/variables/FiltersVariable/FiltersVariable';
import { SpanExemplarToggleAction } from '../domain/actions/SpanExemplarToggleAction';
import { FavAction } from '../domain/actions/FavAction';
import { SelectAction } from '../domain/actions/SelectAction';
import { GroupByVariable } from '../domain/variables/GroupByVariable/GroupByVariable';
import { ProfileMetricVariable } from '../domain/variables/ProfileMetricVariable';
import { ServiceNameVariable } from '../domain/variables/ServiceNameVariable/ServiceNameVariable';
import { getSceneVariableValue } from '../helpers/getSceneVariableValue';
import { PYROSCOPE_DATA_SOURCE } from '../infrastructure/pyroscope-data-sources';
import { getProfileMetricLabel } from '../infrastructure/series/helpers/getProfileMetricLabel';
import { PanelType } from './SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { addRefId, addStats } from './SceneByVariableRepeaterGrid/infrastructure/data-transformations';
import { GridItemData } from './SceneByVariableRepeaterGrid/types/GridItemData';
import { SceneLabelValuesTimeseries } from './SceneLabelValuesTimeseries/SceneLabelValuesTimeseries';

interface SceneMainServiceTimeseriesState extends SceneObjectState {
  headerActions: (item: GridItemData) => VizPanelState['headerActions'];
  body?: SceneLabelValuesTimeseries;
}

export class SceneMainServiceTimeseries extends SceneObjectBase<SceneMainServiceTimeseriesState> {
  static MIN_HEIGHT = 240;

  private variablesInitialized = false;

  constructor({
    item,
    headerActions,
    supportGroupBy,
    includeExemplars,
    includeSpanExemplars,
    spanExemplarToggleAction,
    menuActions,
  }: {
    item?: GridItemData;
    headerActions: SceneMainServiceTimeseriesState['headerActions'];
    supportGroupBy?: boolean;
    includeExemplars?: boolean;
    includeSpanExemplars?: boolean;
    spanExemplarToggleAction?: SpanExemplarToggleAction;
    menuActions?: (item: GridItemData) => { selectAction?: SelectAction; favAction: FavAction };
  }) {
    super({
      headerActions,
      body: undefined,
    });

    this.addActivationHandler(
      this.onActivate.bind(
        this,
        item,
        supportGroupBy,
        includeExemplars,
        includeSpanExemplars,
        spanExemplarToggleAction,
        menuActions
      )
    );
  }

  onActivate(
    item?: GridItemData,
    supportGroupBy?: boolean,
    includeExemplars?: boolean,
    includeSpanExemplars?: boolean,
    spanExemplarToggleAction?: SpanExemplarToggleAction,
    menuActions?: (item: GridItemData) => { selectAction?: SelectAction; favAction: FavAction }
  ) {
    // Only seed the variables from the construction-time item on first activation.
    // This scene is remounted whenever the span heatmap panel is toggled, and
    // re-running initVariables would revert user-driven changes (e.g. the selected
    // service) back to the original item's values.
    if (item && !this.variablesInitialized) {
      this.initVariables(item);
    }
    this.variablesInitialized = true;

    this.setState({
      body: this.buildTimeseries(
        item,
        supportGroupBy,
        includeExemplars,
        includeSpanExemplars,
        spanExemplarToggleAction,
        menuActions
      ),
    });

    if (supportGroupBy) {
      this.subscribeToGroupByStateChanges(item);
    }

    const serviceNameVariable = sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable);
    const profileMetricsVariable = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable);

    this._subs.add(
      serviceNameVariable.subscribeToState((newState, prevState) => {
        if (newState?.value !== prevState?.value) {
          this.resetTimeseries(true); // reset filters when service name changes
        }
      })
    );

    this._subs.add(
      profileMetricsVariable.subscribeToState((newState, prevState) => {
        if (newState?.value !== prevState?.value) {
          this.resetTimeseries(false); // keep same filters whe just profiles metric changes
        }
      })
    );
  }

  initVariables(item: GridItemData) {
    const { serviceName, profileMetricId, filters } = item.queryRunnerParams;

    if (serviceName) {
      const serviceNameVariable = sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable);
      serviceNameVariable.changeValueTo(serviceName);
    }

    if (profileMetricId) {
      const profileMetricVariable = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable);
      profileMetricVariable.changeValueTo(profileMetricId);
    }

    if (filters) {
      const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
      filtersVariable.setState({ filters });
    }
  }

  buildTimeseries(
    item?: GridItemData,
    supportGroupBy?: boolean,
    includeExemplars?: boolean,
    includeSpanExemplars?: boolean,
    spanExemplarToggleAction?: SpanExemplarToggleAction,
    menuActions?: (item: GridItemData) => { selectAction?: SelectAction; favAction: FavAction }
  ) {
    const { headerActions } = this.state;

    const timeseriesItem: GridItemData = {
      index: 0,
      value: '',
      queryRunnerParams: {},
      label: this.buildTitle(),
      panelType: PanelType.TIMESERIES,
    };

    if (item && supportGroupBy) {
      timeseriesItem.queryRunnerParams.groupBy = item.queryRunnerParams.groupBy;
    }

    const groupBy = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable).state.value;

    return new SceneLabelValuesTimeseries({
      item: timeseriesItem,
      headerActions,
      includeExemplars: includeExemplars,
      includeSpanExemplars: includeSpanExemplars,
      spanExemplarToggleAction,
      menuActions: menuActions?.(timeseriesItem),
      // we pass data for the scenarios where we land on the page from a shared link
      // we do this to prevent rendering a timeseries without groupBy for a second then with groupBy
      // and also to directly render something when there's no groupBy in the URL
      data:
        !item && supportGroupBy && groupBy && groupBy !== 'all'
          ? new SceneDataTransformer({
              $data: new SceneQueryRunner({ datasource: PYROSCOPE_DATA_SOURCE, queries: [] }),
              transformations: [addRefId, addStats],
            })
          : undefined,
    });
  }

  subscribeToGroupByStateChanges(item?: GridItemData) {
    const groupByVariable = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable);

    this._subs.add(
      groupByVariable.subscribeToState((newState, prevState) => {
        if (newState.loading || !newState.options.length) {
          return;
        }

        // First load:
        // here we check for the item to prevent two queries to occur when coming from (e.g) favorites and
        // selecting an item with a different profile metric than the current ProfileMetricVariable value
        if (!item && prevState.loading) {
          this.onGroupByChanged(groupByVariable);
          return;
        }

        if (newState.value !== prevState.value) {
          this.onGroupByChanged(groupByVariable);
        }
      })
    );
  }

  onGroupByChanged(groupByVariable: GroupByVariable) {
    if (!groupByVariable.state.value || groupByVariable.state.value === 'all') {
      this.resetTimeseries();
      return;
    }

    const { index, value, groupBy } = groupByVariable.findCurrentOption();

    (this.state.body as SceneLabelValuesTimeseries)?.updateItem({
      index,
      label: `${this.buildTitle()}, grouped by ${value}`,
      queryRunnerParams: { groupBy },
    });
  }

  resetTimeseries(resetFilters = false) {
    if (resetFilters) {
      sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable).reset();
    }

    (this.state.body as SceneLabelValuesTimeseries)?.updateItem({
      index: 0,
      label: this.buildTitle(),
      queryRunnerParams: { groupBy: undefined },
    });
  }

  buildTitle() {
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');
    const { description } = getProfileMetric(profileMetricId as ProfileMetricId);
    return description || getProfileMetricLabel(profileMetricId);
  }

  static Component({ model }: SceneComponentProps<SceneMainServiceTimeseries>) {
    const { body } = model.useState();

    return body && <body.Component model={body} />;
  }
}
