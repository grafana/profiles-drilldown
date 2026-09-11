import { DashboardCursorSync } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  behaviors,
  EmbeddedSceneState,
  QueryVariable,
  SceneComponentProps,
  SceneCSSGridItem,
  SceneCSSGridLayout,
  sceneGraph,
  SceneObjectBase,
  VariableValueOption,
  VizPanelState,
} from '@grafana/scenes';
import { Spinner } from '@grafana/ui';
import { noOp } from '@shared/domain/noOp';
import { debounce, isEqual } from 'lodash';
import React from 'react';

import { EventTimeseriesDataReceived } from '../../domain/events/EventTimeseriesDataReceived';
import { AllServicesFilterVariable } from '../../domain/variables/FiltersVariable/AllServicesFilterVariable';
import { FiltersVariable } from '../../domain/variables/FiltersVariable/FiltersVariable';
import { getSceneVariableValue } from '../../helpers/getSceneVariableValue';
import { vizPanelBuilder } from '../../helpers/vizPanelBuilder';
import { SceneLabelValuesBarGauge } from '../SceneLabelValuesBarGauge';
import { SceneLabelValuesHistogram } from '../SceneLabelValuesHistogram';
import { SceneLabelValuesTable } from '../SceneLabelValuesTable';
import { SceneLabelValuesTimeseries } from '../SceneLabelValuesTimeseries/SceneLabelValuesTimeseries';
import { SceneEmptyState } from './components/SceneEmptyState/SceneEmptyState';
import { SceneErrorState } from './components/SceneErrorState/SceneErrorState';
import { LayoutType, SceneLayoutSwitcher, SceneLayoutSwitcherState } from './components/SceneLayoutSwitcher';
import { SceneNoDataSwitcher, SceneNoDataSwitcherState } from './components/SceneNoDataSwitcher';
import { ScenePanelTypeSwitcher } from './components/ScenePanelTypeSwitcher';
import { SceneQuickFilter, SceneQuickFilterState } from './components/SceneQuickFilter';
import { sortFavGridItems } from './domain/sortFavGridItems';
import { GridItemData } from './types/GridItemData';

interface SceneByVariableRepeaterGridState extends EmbeddedSceneState {
  variableName: string;
  items: GridItemData[];
  headerActions: (item: GridItemData, items: GridItemData[]) => VizPanelState['headerActions'];
  mapOptionToItem: (
    option: VariableValueOption,
    index: number,
    variablesValues: Record<string, string>
  ) => GridItemData | null;
  sortItemsFn: (a: GridItemData, b: GridItemData) => number;
  hideNoData: boolean;
}

const GRID_TEMPLATE_COLUMNS = 'repeat(auto-fit, minmax(400px, 1fr))';
const GRID_TEMPLATE_ROWS = '1fr';
const GRID_AUTO_ROWS = '240px';

export class SceneByVariableRepeaterGrid extends SceneObjectBase<SceneByVariableRepeaterGridState> {
  /**
   * Identifies a panel by what it queries, so that renderGridItems() can recognize the panels it
   * can keep. `index` is deliberately left out: it only drives panel colors and shifts for every
   * item whenever the list grows or shrinks, which would make every panel look new.
   */
  static buildGridItemKey(item: GridItemData) {
    return `grid-item-${item.value}-${item.panelType}-${JSON.stringify(item.queryRunnerParams)}`;
  }

  static getGridColumnsTemplate(layout: LayoutType) {
    return layout === LayoutType.ROWS ? GRID_TEMPLATE_ROWS : GRID_TEMPLATE_COLUMNS;
  }

  constructor({
    key,
    variableName,
    headerActions,
    mapOptionToItem,
    sortItemsFn,
  }: {
    key: string;
    variableName: SceneByVariableRepeaterGridState['variableName'];
    headerActions: SceneByVariableRepeaterGridState['headerActions'];
    mapOptionToItem: SceneByVariableRepeaterGridState['mapOptionToItem'];
    sortItemsFn?: SceneByVariableRepeaterGridState['sortItemsFn'];
  }) {
    super({
      key,
      variableName,
      items: [],
      headerActions,
      mapOptionToItem,
      sortItemsFn: sortItemsFn || sortFavGridItems,
      hideNoData: false,
      body: new SceneCSSGridLayout({
        templateColumns: SceneByVariableRepeaterGrid.getGridColumnsTemplate(SceneLayoutSwitcher.DEFAULT_LAYOUT),
        autoRows: GRID_AUTO_ROWS,
        isLazy: true,
        $behaviors: [
          new behaviors.CursorSync({
            key: 'metricCrosshairSync',
            sync: DashboardCursorSync.Crosshair,
          }),
        ],
        children: [],
      }),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    // here we try to emulate VariableDependencyConfig.onVariableUpdateCompleted
    const variable = sceneGraph.lookupVariable(this.state.variableName, this) as QueryVariable & { update: () => void };

    const variableSub = variable.subscribeToState((newState, prevState) => {
      if (!newState.loading && prevState.loading) {
        this.renderGridItems();
      }
    });

    // if the variable is inactive, the data source will not fetch the options
    // so we force an update here to be sure we have the latest values
    variable.update();

    const quickFilterSub = this.subscribeToQuickFilterChange();
    const layoutChangeSub = this.subscribeToLayoutChange();
    const hideNoDataSub = this.subscribeToHideNoDataChange();
    const filtersSub = this.subscribeToFiltersChange();
    const filtersAllServicesSub = this.subscribeToFiltersAllServicesChange();

    return () => {
      filtersAllServicesSub.unsubscribe();
      filtersSub.unsubscribe();
      hideNoDataSub.unsubscribe();
      layoutChangeSub.unsubscribe();
      quickFilterSub.unsubscribe();

      variableSub.unsubscribe();
    };
  }

  subscribeToQuickFilterChange() {
    const quickFilter = sceneGraph.findByKeyAndType(this, 'quick-filter', SceneQuickFilter);

    this.subscribeToState((newState, prevState) => {
      if (newState.items.length !== prevState.items.length) {
        quickFilter.setResultsCount(newState.items.length);
      }
    });

    const onChangeState = (newState: SceneQuickFilterState, prevState?: SceneQuickFilterState) => {
      if (newState.searchText !== prevState?.searchText) {
        this.renderGridItems();
      }
    };

    return quickFilter.subscribeToState(debounce(onChangeState, SceneQuickFilter.DEBOUNCE_DELAY));
  }

  subscribeToLayoutChange() {
    const layoutSwitcher = sceneGraph.findByKeyAndType(this, 'layout-switcher', SceneLayoutSwitcher);

    const body = this.state.body as SceneCSSGridLayout;

    const onChangeState = (newState: SceneLayoutSwitcherState, prevState?: SceneLayoutSwitcherState) => {
      if (newState.layout !== prevState?.layout) {
        body.setState({
          templateColumns: SceneByVariableRepeaterGrid.getGridColumnsTemplate(newState.layout),
        });
      }
    };

    onChangeState(layoutSwitcher.state);

    return layoutSwitcher.subscribeToState(onChangeState);
  }

  subscribeToHideNoDataChange() {
    const noDataSwitcher = sceneGraph.findByKeyAndType(this, 'no-data-switcher', SceneNoDataSwitcher);

    if (!noDataSwitcher.isActive) {
      this.setState({ hideNoData: false });

      return {
        unsubscribe: noOp,
      };
    }

    const onChangeState = (newState: SceneNoDataSwitcherState, prevState?: SceneNoDataSwitcherState) => {
      if (newState.hideNoData !== prevState?.hideNoData) {
        this.setState({ hideNoData: newState.hideNoData === 'on' });

        // we force render because this.state.items certainly have not changed but we want to update the UI panels anyway
        this.renderGridItems(true);
      }
    };

    onChangeState(noDataSwitcher.state);

    return noDataSwitcher.subscribeToState(onChangeState);
  }

  subscribeToFiltersChange() {
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
    const noDataSwitcher = sceneGraph.findByKeyAndType(this, 'no-data-switcher', SceneNoDataSwitcher);

    // the handler will be called each time a filter is added/removed/modified
    return filtersVariable.subscribeToState(() => {
      if (noDataSwitcher.state.hideNoData === 'on') {
        // to be sure the list is updated we force render because the filters only influence the query made in each panel
        this.renderGridItems(true);
      }
    });
  }

  subscribeToFiltersAllServicesChange() {
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filtersAllServices', AllServicesFilterVariable);
    const noDataSwitcher = sceneGraph.findByKeyAndType(this, 'no-data-switcher', SceneNoDataSwitcher);

    return filtersVariable.subscribeToState(() => {
      if (noDataSwitcher.state.hideNoData === 'on') {
        // to be sure the list is updated we force render because the filters only influence the query made in each panel
        this.renderGridItems(true);
      }
    });
  }

  buildItemsData(variable: QueryVariable) {
    const { mapOptionToItem } = this.state;

    const variableValues = {
      serviceName: getSceneVariableValue(this, 'serviceName'),
      profileMetricId: getSceneVariableValue(this, 'profileMetricId'),
      panelType: sceneGraph.findByKeyAndType(this, 'panel-type-switcher', ScenePanelTypeSwitcher).state.panelType,
    };

    const items = variable.state.options
      .map((option, i) => mapOptionToItem(option, i, variableValues))
      .filter(Boolean) as GridItemData[];

    return this.filterItems(items).sort(this.state.sortItemsFn);
  }

  shouldRenderItems(newItems: SceneByVariableRepeaterGridState['items']) {
    const { items } = this.state;

    if (!newItems.length || items.length !== newItems.length) {
      return true;
    }

    return !isEqual(items, newItems);
  }

  /**
   * Indexes the panels that are already on screen so that renderGridItems() can keep the ones that
   * still query the same thing. Replacing every child unmounts the whole grid, which blanks the
   * page and restarts every query each time the time range or the filters change.
   *
   * A forced render intentionally reuses nothing: it is how panels (re)attach the "no data"
   * subscription set up in setupHideNoData().
   */
  private collectReusablePanels(forceRender: boolean) {
    const reusablePanels = new Map<string, SceneCSSGridLayout['state']['children'][number]>();

    if (forceRender) {
      return reusablePanels;
    }

    for (const child of (this.state.body as SceneCSSGridLayout).state.children) {
      if (child.state.key) {
        reusablePanels.set(child.state.key, child);
      }
    }

    return reusablePanels;
  }

  private buildGridItem(item: GridItemData, key: string) {
    const vizPanel = vizPanelBuilder(item.panelType, {
      item,
      headerActions: this.state.headerActions.bind(null, item, this.state.items),
    });

    if (this.state.hideNoData) {
      this.setupHideNoData(vizPanel);
    }

    return new SceneCSSGridItem({ key, body: vizPanel });
  }

  renderGridItems(forceRender = false) {
    const variable = sceneGraph.lookupVariable(this.state.variableName, this) as QueryVariable;

    if (variable.state.loading) {
      return;
    }

    if (variable.state.error) {
      this.renderErrorState(variable.state.error);
      return;
    }

    const newItems = this.buildItemsData(variable);

    if (!forceRender && !this.shouldRenderItems(newItems)) {
      return;
    }

    this.setState({ items: newItems });

    if (!this.state.items.length) {
      this.renderEmptyState(this.isQuickFilterActive());
      return;
    }

    const grid = this.state.body as SceneCSSGridLayout;
    const reusablePanels = this.collectReusablePanels(forceRender);

    const gridItems = this.state.items.map((item) => {
      const key = SceneByVariableRepeaterGrid.buildGridItemKey(item);
      return reusablePanels.get(key) ?? this.buildGridItem(item, key);
    });

    grid.setState({
      autoRows: GRID_AUTO_ROWS, // required to have the correct grid items height
      children: gridItems,
    });
  }

  setupHideNoData(
    vizPanel: SceneLabelValuesTimeseries | SceneLabelValuesBarGauge | SceneLabelValuesHistogram | SceneLabelValuesTable
  ) {
    const sub = vizPanel.subscribeToEvent(EventTimeseriesDataReceived, (event) => {
      if (event.payload.series?.length) {
        return;
      }

      const gridItem = sceneGraph.getAncestor(vizPanel, SceneCSSGridItem);
      const { key: gridItemKey } = gridItem.state;
      const grid = sceneGraph.getAncestor(gridItem, SceneCSSGridLayout);

      const filteredChildren = grid.state.children.filter((c) => c.state.key !== gridItemKey);

      if (!filteredChildren.length) {
        this.renderEmptyState();
      } else {
        grid.setState({ children: filteredChildren });
      }
    });

    vizPanel.addActivationHandler(() => {
      return () => {
        sub.unsubscribe();
      };
    });
  }

  filterItems(items: SceneByVariableRepeaterGridState['items']) {
    const quickFilterScene = sceneGraph.findByKeyAndType(this, 'quick-filter', SceneQuickFilter);
    const { searchText } = quickFilterScene.state;

    if (!searchText) {
      return items;
    }

    const regexes = searchText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((r) => {
        try {
          return new RegExp(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as RegExp[];

    return items.filter(({ label }) => regexes.some((r) => r.test(label)));
  }

  isQuickFilterActive() {
    const quickFilterScene = sceneGraph.findByKeyAndType(this, 'quick-filter', SceneQuickFilter);
    return Boolean(quickFilterScene?.state.searchText);
  }

  renderEmptyState(isFiltered = false) {
    (this.state.body as SceneCSSGridLayout).setState({
      autoRows: '480px',
      children: [
        new SceneCSSGridItem({
          body: new SceneEmptyState({
            message: isFiltered
              ? t('grid.empty-state.no-results', 'No results')
              : t(
                  'grid.empty-state.no-profiles',
                  'No profiles found. Widen the time range or start sending profile data.'
                ),
          }),
        }),
      ],
    });
  }

  renderErrorState(error: Error) {
    (this.state.body as SceneCSSGridLayout).setState({
      autoRows: '480px',
      children: [
        new SceneCSSGridItem({
          body: new SceneErrorState({
            message: error.message || error.toString(),
          }),
        }),
      ],
    });
  }

  static Component({ model }: SceneComponentProps<SceneByVariableRepeaterGrid>) {
    const { body, variableName } = model.useState();
    const { loading } = (sceneGraph.lookupVariable(variableName, model) as QueryVariable)?.useState();

    return loading ? <Spinner /> : <body.Component model={body} />;
  }
}
