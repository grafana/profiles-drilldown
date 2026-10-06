import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { SceneComponentProps, sceneGraph, SceneObject, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Stack, useStyles2 } from '@grafana/ui';
import { prepareHistoryEntry } from '@shared/domain/prepareHistoryEntry';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React, { useMemo } from 'react';
import { Unsubscribable } from 'rxjs';
import { EventViewDiffFlameGraph } from 'src/pages/ProfilesExplorerView/domain/events/EventViewDiffFlameGraph';

import { FavAction } from '../../../../domain/actions/FavAction';
import { SelectAction } from '../../../../domain/actions/SelectAction';
import { EventSelectLabel } from '../../../../domain/events/EventSelectLabel';
import {
  clearLabelValue,
  excludeLabelValue,
  includeLabelValue,
} from '../../../../domain/variables/FiltersVariable/filters-ops';
import { FiltersVariable } from '../../../../domain/variables/FiltersVariable/FiltersVariable';
import { GroupByVariable } from '../../../../domain/variables/GroupByVariable/GroupByVariable';
import { getSceneVariableValue } from '../../../../helpers/getSceneVariableValue';
import { interpolateQueryRunnerVariables } from '../../../../infrastructure/helpers/interpolateQueryRunnerVariables';
import { SceneLayoutSwitcher } from '../../../SceneByVariableRepeaterGrid/components/SceneLayoutSwitcher';
import { SceneNoDataSwitcher } from '../../../SceneByVariableRepeaterGrid/components/SceneNoDataSwitcher';
import {
  PanelType,
  ScenePanelTypeSwitcher,
  ScenePanelTypeSwitcherState,
} from '../../../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { SceneQuickFilter } from '../../../SceneByVariableRepeaterGrid/components/SceneQuickFilter';
import { SceneByVariableRepeaterGrid } from '../../../SceneByVariableRepeaterGrid/SceneByVariableRepeaterGrid';
import { GridItemData } from '../../../SceneByVariableRepeaterGrid/types/GridItemData';
import { CompareTarget } from '../../../SceneExploreDiffFlameGraph/domain/types';
import { SceneProfilesExplorer } from '../../../SceneProfilesExplorer/SceneProfilesExplorer';
import { SceneStatsPanel } from './components/SceneLabelValuesGrid/components/SceneStatsPanel/SceneStatsPanel';
import { SceneLabelValuesGrid } from './components/SceneLabelValuesGrid/SceneLabelValuesGrid';
import { IncludeExcludeAction } from './domain/actions/IncludeExcludeAction/IncludeExcludeAction';
import { EventClearLabelFromFilters } from './domain/events/EventClearLabelFromFilters';
import { EventExcludeLabelFromFilters } from './domain/events/EventExcludeLabelFromFilters';
import { EventIncludeLabelInFilters } from './domain/events/EventIncludeLabelInFilters';
import { EventSelectForCompare } from './domain/events/EventSelectForCompare';
import { CompareControls } from './ui/CompareControls';

export interface SceneGroupByLabelsState extends SceneObjectState {
  body?: SceneObject;
  compare: Map<CompareTarget, GridItemData>;
  panelTypeChangeSub?: Unsubscribable;
}

export class SceneGroupByLabels extends SceneObjectBase<SceneGroupByLabelsState> {
  constructor({ item }: { item?: GridItemData }) {
    super({
      key: 'group-by-labels',
      body: undefined,
      compare: new Map(),
      panelTypeChangeSub: undefined,
    });

    this.addActivationHandler(() => {
      this.onActivate(item);
    });
  }

  async onActivate(item?: GridItemData) {
    // initial load
    const groupByVariable = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable);
    await groupByVariable.update();

    if (item) {
      this.initVariablesAndControls(item);
    }

    this.renderBody(groupByVariable);

    const groupBySub = this.subscribeToGroupByChange();
    const panelEventsSub = this.subscribeToPanelEvents();

    return () => {
      panelEventsSub.unsubscribe();
      groupBySub.unsubscribe();

      this.state.panelTypeChangeSub?.unsubscribe();
    };
  }

  initVariablesAndControls(item: GridItemData) {
    const { queryRunnerParams, panelType } = item;
    const { groupBy } = queryRunnerParams;

    if (groupBy?.label) {
      const groupByVariable = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable);
      groupByVariable.changeValueTo(groupBy.label);
    }

    if (panelType) {
      const panelTypeSwitcher = sceneGraph.findByKeyAndType(this, 'panel-type-switcher', ScenePanelTypeSwitcher);
      panelTypeSwitcher.setState({ panelType });
    }
  }

  subscribeToGroupByChange() {
    const groupByVariable = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable);
    const quickFilter = sceneGraph.findByKeyAndType(this, 'quick-filter', SceneQuickFilter);

    return groupByVariable.subscribeToState((newState, prevState) => {
      if (newState.value !== prevState?.value) {
        quickFilter.clearSearchText();

        this.renderBody(groupByVariable);
      }
    });
  }

  subscribeToPanelEvents() {
    const selectLabelSub = this.subscribeToEvent(EventSelectLabel, (event) => {
      this.selectLabel(event.payload.item);
    });

    const selectForCompareSub = this.subscribeToEvent(EventSelectForCompare, (event) => {
      const { compareTarget, item } = event.payload;
      this.selectForCompare(compareTarget, item);
    });

    const includeFilterSub = this.subscribeToEvent(EventIncludeLabelInFilters, (event) => {
      this.includeLabelValueInFilters(event.payload.item);
    });

    const excludeFilterSub = this.subscribeToEvent(EventExcludeLabelFromFilters, (event) => {
      this.excludeLabelValueFromFilters(event.payload.item);
    });

    const clearFilterSub = this.subscribeToEvent(EventClearLabelFromFilters, (event) => {
      this.clearLabelValueFromFilters(event.payload.item);
    });

    return {
      unsubscribe() {
        clearFilterSub.unsubscribe();
        excludeFilterSub.unsubscribe();
        includeFilterSub.unsubscribe();
        selectForCompareSub.unsubscribe();
        selectLabelSub.unsubscribe();
      },
    };
  }

  subscribeToPanelTypeChange() {
    const panelTypeSwitcher = sceneGraph.findByKeyAndType(this, 'panel-type-switcher', ScenePanelTypeSwitcher);

    return panelTypeSwitcher.subscribeToState(
      (newState: ScenePanelTypeSwitcherState, prevState?: ScenePanelTypeSwitcherState) => {
        if (newState.panelType !== prevState?.panelType) {
          (this.state.body as SceneByVariableRepeaterGrid)?.renderGridItems();
        }
      }
    );
  }

  renderBody(groupByVariable: GroupByVariable) {
    this.state.panelTypeChangeSub?.unsubscribe();

    if (groupByVariable.state.value === 'all') {
      // we have to resubscribe every time because the subscription is removed every time the ScenePanelTypeSwitcher UI component is unmounted
      this.setState({ panelTypeChangeSub: this.subscribeToPanelTypeChange() });

      this.switchToLabelNamesGrid();
    } else {
      this.switchToLabelValuesGrid(groupByVariable);
    }
  }

  switchToLabelNamesGrid() {
    sceneGraph
      .findByKeyAndType(this, 'quick-filter', SceneQuickFilter)
      .setPlaceholder('Search labels (comma-separated regexes are supported)');

    this.setState({
      body: this.buildSceneLabelNamesGrid(),
    });
  }

  buildSceneLabelNamesGrid() {
    return new SceneByVariableRepeaterGrid({
      key: 'service-labels-grid',
      variableName: 'groupBy',
      mapOptionToItem: (option, index, { serviceName, profileMetricId, panelType }) => {
        if (option.value === 'all') {
          return null;
        }

        // see LabelsDataSource.ts
        const { value, groupBy } = JSON.parse(option.value as string);

        return {
          index: index - 1, // the 'all' option has been removed ;)
          value,
          // remove the count in parenthesis that exists in option.label
          // it'll be set by SceneLabelValuesTimeseries or SceneLabelValuesBarGauge
          label: value,
          queryRunnerParams: {
            serviceName,
            profileMetricId,
            groupBy,
            filters: [],
          },
          panelType: panelType as PanelType,
        };
      },
      headerActions: (item) => [
        new SelectAction({ type: 'select-label', item }),
        new SelectAction({ type: 'expand-panel', item }),
        new FavAction({ item }),
      ],
    });
  }

  switchToLabelValuesGrid(groupByVariable: GroupByVariable) {
    sceneGraph
      .findByKeyAndType(this, 'quick-filter', SceneQuickFilter)
      .setPlaceholder('Search label values (comma-separated regexes are supported)');

    this.clearCompare();

    const { index, value } = groupByVariable.findCurrentOption();

    this.setState({
      body: this.buildSceneLabelValuesGrid(value, index),
    });
  }

  buildSceneLabelValuesGrid(label: string, startColorIndex: number) {
    return new SceneLabelValuesGrid({
      key: 'service-label-values-grid',
      startColorIndex,
      label,
      serviceName: getSceneVariableValue(this, 'serviceName'),
      profileMetricId: getSceneVariableValue(this, 'profileMetricId'),
      headerActions: (item) => [
        new SelectAction({
          type: 'view-flame-graph',
          item,
          tooltip: (item, model) => {
            const { queryRunnerParams, label } = item;
            const profileMetricId =
              queryRunnerParams.profileMetricId || getSceneVariableValue(model, 'profileMetricId');
            const groupByValue = getSceneVariableValue(model, 'groupBy');

            return `View the "${
              getProfileMetric(profileMetricId as ProfileMetricId).type
            }" flame graph for "${groupByValue}=${label}"`;
          },
        }),
        new IncludeExcludeAction({ item }),
        new FavAction({ item }),
      ],
    });
  }

  selectLabel({ queryRunnerParams }: GridItemData) {
    const labelValue = queryRunnerParams!.groupBy!.label;
    const groupByVariable = sceneGraph.findByKeyAndType(this, 'groupBy', GroupByVariable);

    prepareHistoryEntry();
    groupByVariable.changeValueTo(labelValue);
  }

  includeLabelValueInFilters(item: GridItemData) {
    const [filterToInclude] = item.queryRunnerParams.filters!;
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);

    filtersVariable.setState({ filters: includeLabelValue(filtersVariable.state.filters, filterToInclude) });
  }

  excludeLabelValueFromFilters(item: GridItemData) {
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
    const [filterToExclude] = item.queryRunnerParams.filters!;

    filtersVariable.setState({ filters: excludeLabelValue(filtersVariable.state.filters, filterToExclude) });
  }

  clearLabelValueFromFilters(item: GridItemData) {
    const filtersVariable = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable);
    const [filterToClear] = item.queryRunnerParams.filters!;

    filtersVariable.setState({ filters: clearLabelValue(filtersVariable.state.filters, filterToClear) });
  }

  selectForCompare(compareTarget: CompareTarget, item: GridItemData) {
    const compare = new Map(this.state.compare);

    if (compare.get(compareTarget)?.value === item.value) {
      compare.delete(compareTarget);
    } else {
      compare.set(compareTarget, item);
    }

    this.setState({ compare });

    this.updateStatsPanels();
  }

  updateStatsPanels() {
    const { compare } = this.state;
    const baselineItem = compare.get(CompareTarget.BASELINE);
    const comparisonItem = compare.get(CompareTarget.COMPARISON);

    const statsPanels = sceneGraph.findAllObjects(this, (o) => o instanceof SceneStatsPanel) as SceneStatsPanel[];

    // TODO: optimize if needed
    // we can remove the loop if we clear the current selection in the UI before updating the compare map (see selectForCompare() and onClickClearCompareButton())
    for (const panel of statsPanels) {
      panel.updateCompareActions(baselineItem, comparisonItem);
    }
  }

  getCompare() {
    return this.state.compare;
  }

  clearCompare() {
    this.setState({ compare: new Map() });
  }

  onClickCompareButton = () => {
    reportInteraction('g_pyroscope_app_compare_link_clicked');

    const { compare } = this.state;

    const { filters: baselineFilters } = interpolateQueryRunnerVariables(
      this,
      compare.get(CompareTarget.BASELINE) as GridItemData
    );

    const { filters: comparisonFilters } = interpolateQueryRunnerVariables(
      this,
      compare.get(CompareTarget.COMPARISON) as GridItemData
    );

    this.publishEvent(
      new EventViewDiffFlameGraph({
        baselineFilters,
        comparisonFilters,
      }),
      true
    );
  };

  onClickClearCompareButton = () => {
    this.clearCompare();
    this.updateStatsPanels();
  };

  static Component = ({ model }: SceneComponentProps<SceneGroupByLabels>) => {
    const styles = useStyles2(getStyles);

    const { body, compare } = model.useState();

    const groupByVariable = sceneGraph.findByKeyAndType(model, 'groupBy', GroupByVariable);
    const { value: groupByVariableValue } = groupByVariable.useState();

    const gridControls = useMemo(
      () =>
        groupByVariableValue === 'all'
          ? sceneGraph.findByKeyAndType(model, 'profiles-explorer', SceneProfilesExplorer).state.gridControls
          : ([
              sceneGraph.findByKeyAndType(model, 'quick-filter', SceneQuickFilter),
              sceneGraph.findByKeyAndType(model, 'layout-switcher', SceneLayoutSwitcher),
              sceneGraph.findByKeyAndType(model, 'no-data-switcher', SceneNoDataSwitcher),
            ] as SceneObject[]),
      [groupByVariableValue, model]
    );

    return (
      <div className={styles.container} data-testid="groupByLabelsContainer">
        <groupByVariable.Component model={groupByVariable} />

        <div className={styles.sceneControls}>
          <Stack wrap="wrap">
            {groupByVariableValue !== 'all' && (
              <CompareControls
                compare={compare}
                onClickCompare={model.onClickCompareButton}
                onClickClear={model.onClickClearCompareButton}
              />
            )}

            {gridControls.map((control) => (
              <control.Component key={control.state.key} model={control} />
            ))}
          </Stack>
        </div>

        {body && <body.Component model={body} />}
      </div>
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    margin-top: ${theme.spacing(1)};
  `,
  sceneControls: css`
    margin-bottom: ${theme.spacing(1)};

    & .quick-filter {
      flex: 1;
      min-width: 112px;
    }
  `,
});
