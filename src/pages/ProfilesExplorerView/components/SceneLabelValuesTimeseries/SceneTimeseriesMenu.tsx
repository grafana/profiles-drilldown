import { PanelMenuItem } from '@grafana/data';
import { t } from '@grafana/i18n';
import { reportInteraction, usePluginComponent } from '@grafana/runtime';
import {
  SceneComponentProps,
  SceneDataQuery,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  VizPanel,
  VizPanelMenu,
} from '@grafana/scenes';
import { ScaleDistribution, ScaleDistributionConfig } from '@grafana/schema';
import React, { useEffect } from 'react';

import {
  ADD_TO_DASHBOARD_COMPONENT_ID,
  EventOpenAddToDashboard,
  getPanelData,
} from '../../domain/actions/addToDashboard';
import { getExploreUrl } from '../../helpers/getExploreUrl';
import { TimeSeriesQuery } from '../../infrastructure/timeseries/buildTimeSeriesQueryRunner';
import { FavAction } from '../../domain/actions/FavAction';
import { SelectAction } from '../../domain/actions/SelectAction';
import { SceneLabelValuesTimeseries } from './SceneLabelValuesTimeseries';

/**
 * Divider rows must use distinct non-empty `text` values because `VizPanelMenu` keys list children
 * from `text`, and multiple `text: ''` dividers produce duplicate React keys. Use explicit sentinel
 * values instead of zero-width Unicode characters so the behavior is easier to understand and less
 * fragile if the menu implementation changes.
 */
const MENU_DIVIDER_AFTER_EXEMPLARS = 'divider-after-exemplars';
const MENU_DIVIDER_BEFORE_ACTIONS = 'divider-before-actions';

interface SceneTimeseriesMenuState extends SceneObjectState {
  items?: PanelMenuItem[];
  scaleType?: ScaleDistribution;
  showExemplars?: boolean; // undefined means that the Exemplars button is not shown in the menu. Otherwise, it's shown and the value is the current state of the Exemplars button.
  includeAddToDashboard?: boolean;
  selectAction?: SelectAction;
  favAction?: FavAction;
}

export class SceneTimeseriesMenu extends SceneObjectBase<SceneTimeseriesMenuState> {
  constructor(state: SceneTimeseriesMenuState) {
    super({
      scaleType: ScaleDistribution.Linear,
      ...state,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    const includeAddToDashboard = this.state.includeAddToDashboard ?? false;
    this.setState({ includeAddToDashboard, items: this.buildMenuItems(includeAddToDashboard) });
  }

  buildMenuItems(includeAddOverride?: boolean): PanelMenuItem[] {
    const { scaleType, showExemplars } = this.state;
    const includeAddToDashboard = includeAddOverride ?? this.state.includeAddToDashboard ?? false;

    const scaleTypes = [
      {
        text: t('timeseries.menu.scale-linear', 'Linear'),
        scaleDistribution: { type: ScaleDistribution.Linear },
      },
      {
        text: t('timeseries.menu.scale-log2', 'Log2'),
        scaleDistribution: { type: ScaleDistribution.Log, log: 2 },
      },
    ];

    const menuItems: PanelMenuItem[] = [
      {
        text: t('timeseries.menu.scale-type', 'Scale type'),
        type: 'group',
        subMenu: scaleTypes.map((option) => ({
          text: `${scaleType === option.scaleDistribution.type ? '✔ ' : ''}${option.text}`,
          onClick: () => this.onClickScaleOption(option),
        })),
      },
      {
        type: 'divider',
        text: MENU_DIVIDER_BEFORE_ACTIONS,
      },
      {
        iconClassName: 'compass',
        text: t('timeseries.menu.open-in-explore', 'Open in Explore'),
        onClick: () => this.onClickExplore(),
      },
    ];

    if (includeAddToDashboard) {
      menuItems.push({
        iconClassName: 'apps',
        text: t('timeseries.menu.add-to-dashboard', 'Add to dashboard'),
        onClick: () => this.onClickAddToDashboard(),
      });
    }

    menuItems.push(...this.buildSecondaryActionItems());

    if (showExemplars !== undefined) {
      menuItems.unshift(
        {
          iconClassName: showExemplars ? 'eye' : 'eye-slash',
          text: t('timeseries.menu.exemplars', 'Exemplars'),
          onClick: () => this.onClickToggleExemplars(),
        },
        {
          type: 'divider',
          text: MENU_DIVIDER_AFTER_EXEMPLARS,
        }
      );
    }

    return menuItems;
  }

  private buildSecondaryActionItems(): PanelMenuItem[] {
    const { selectAction, favAction } = this.state;
    const items: PanelMenuItem[] = [];

    if (selectAction) {
      items.push({
        text: selectAction.state.label ?? t('timeseries.menu.labels', 'Labels'),
        onClick: selectAction.onClick,
      });
    }

    if (favAction) {
      items.push({
        iconClassName: favAction.state.isFav ? 'favorite' : 'star',
        text: favAction.state.isFav ? t('actions.fav.unfavorite', 'Unfavorite') : t('actions.fav.favorite', 'Favorite'),
        onClick: () => {
          favAction.onClick();
          this.setState({ items: this.buildMenuItems() });
        },
      });
    }

    return items;
  }

  private onClickToggleExemplars() {
    const newShowExemplars = !this.state.showExemplars;

    reportInteraction('g_pyroscope_app_exemplars_toggled', {
      showExemplars: newShowExemplars,
    });

    this.setState({
      showExemplars: newShowExemplars,
      items: this.buildMenuItems(),
    });

    const timeseries = sceneGraph.getAncestor(this, SceneLabelValuesTimeseries);
    timeseries.handleExemplarToggleChange(newShowExemplars);
  }

  onClickScaleOption(option: PanelMenuItem & { scaleDistribution: ScaleDistributionConfig }) {
    const { scaleDistribution, text } = option;

    reportInteraction('g_pyroscope_app_timeseries_scale_changed', { scale: scaleDistribution.type });

    const timeseries = sceneGraph.getAncestor(this, SceneLabelValuesTimeseries);

    timeseries.changeScale(scaleDistribution, text);

    this.setState({
      scaleType: scaleDistribution.type,
      items: this.buildMenuItems(),
    });
  }

  private onClickAddToDashboard() {
    const vizPanel = sceneGraph.findObject(this, (o) => o instanceof VizPanel);
    if (!(vizPanel instanceof VizPanel)) {
      return;
    }
    this.publishEvent(new EventOpenAddToDashboard({ panelData: getPanelData(vizPanel) }), true);
  }

  onClickExplore() {
    reportInteraction('g_pyroscope_app_open_in_explore_clicked');

    const rawTimeRange = sceneGraph.getTimeRange(this).state.value.raw;
    const query = this.getInterpolatedQuery();
    const datasource = sceneGraph.interpolate(this, '${dataSource}');

    const exploreUrl = getExploreUrl(rawTimeRange, query, datasource);

    window.open(exploreUrl, '_blank');
  }

  getInterpolatedQuery() {
    const timeseries = sceneGraph.getAncestor(this, SceneLabelValuesTimeseries);
    const queryRunner = timeseries.state.body.state.$data?.state.$data as SceneQueryRunner;
    const nonInterpolatedQuery = queryRunner?.state.queries[0] as SceneDataQuery;

    return Object.entries(nonInterpolatedQuery)
      .map(([key, value]) => [key, typeof value === 'string' ? sceneGraph.interpolate(this, value) : value])
      .reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: value,
        }),
        {}
      ) as TimeSeriesQuery;
  }

  static Component({ model }: SceneComponentProps<SceneTimeseriesMenu>) {
    const { component: addToDashboardForm, isLoading: isLoadingAddToDashboardForm } =
      usePluginComponent(ADD_TO_DASHBOARD_COMPONENT_ID);

    useEffect(() => {
      if (isLoadingAddToDashboardForm) {
        return;
      }
      const includeAdd = Boolean(addToDashboardForm);
      if (model.state.includeAddToDashboard === includeAdd) {
        return;
      }
      model.setState({
        includeAddToDashboard: includeAdd,
        items: model.buildMenuItems(includeAdd),
      });
    }, [model, isLoadingAddToDashboardForm, addToDashboardForm]);

    return <VizPanelMenu.Component model={model as unknown as VizPanelMenu} />;
  }
}
