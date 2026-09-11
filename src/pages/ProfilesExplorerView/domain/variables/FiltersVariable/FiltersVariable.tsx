import { AdHocVariableFilter } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  AdHocFiltersVariable,
  SceneComponentProps,
  sceneGraph,
  SceneObject,
  SceneTimeRangeLike,
} from '@grafana/scenes';
import { CompleteFilters } from '@shared/components/QueryBuilder/domain/types';
import { QueryBuilder } from '@shared/components/QueryBuilder/QueryBuilder';
import { buildFilterExpressionParts } from '@shared/components/SavedSearches/utils';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { uniq } from 'lodash';
import React from 'react';

import { useBuildPyroscopeQuery } from '../../useBuildPyroscopeQuery';
import { ProfilesDataSourceVariable } from '../ProfilesDataSourceVariable';
import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from './filterExpressionWithLeadingComma';
import { convertPyroscopeToVariableFilter } from './filters-ops';

const FILTERS_LABEL_DEFAULT = 'Filters';

type TimeRangeProp = {
  /**
   * The diff view scopes each compare panel to its own time range, which this variable cannot resolve from its
   * position in the scene graph: it is owned by SceneProfilesExplorer, above the panels.
   */
  timeRange?: SceneTimeRangeLike;
};

export class FiltersVariable extends AdHocFiltersVariable {
  static DEFAULT_VALUE = [];
  private initialFilters?: AdHocVariableFilter[];

  constructor({ key, initialFilters }: { key: string; initialFilters?: AdHocVariableFilter[] }) {
    super({
      key,
      name: key,
      label: FILTERS_LABEL_DEFAULT,
      filters: FiltersVariable.DEFAULT_VALUE,
      expressionBuilder: (filters) => buildFilterExpressionParts(filters),
    });
    this.initialFilters = initialFilters;
    this.addActivationHandler(this.onActivate.bind(this));
  }

  reset() {
    this.setState({ filters: FiltersVariable.DEFAULT_VALUE });
  }

  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }

  static resetAll(sceneObject: SceneObject) {
    ['filters', 'filtersBaseline', 'filtersComparison'].forEach((filterKey) => {
      sceneGraph.findByKeyAndType(sceneObject, filterKey, FiltersVariable).reset();
    });
  }

  onActivate() {
    this.setState({ label: t('variables.filters.label', FILTERS_LABEL_DEFAULT) });
    this.setInitialValue();

    // VariableDependencyConfig does not work :man_shrug: (never called)
    const dataSourceSub = sceneGraph
      .findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable)
      .subscribeToState(() => {
        this.reset();
      });

    return () => {
      dataSourceSub.unsubscribe();
    };
  }

  setInitialValue() {
    if (this.initialFilters && this.initialFilters.length > 0) {
      this.setState({ filters: this.initialFilters });
    }
  }

  onChangeQuery = (query: string, filters: CompleteFilters) => {
    reportInteraction('g_pyroscope_app_filters_changed', {
      name: this.state.name,
      count: filters.length,
      operators: uniq(filters.map((f) => f.operator.label)),
    });

    this.setState({
      filters: filters.map(convertPyroscopeToVariableFilter),
    });
  };

  /** Widens the props: the `SceneComponentWrapper` returned by the base class forwards extra props to `Component` below. */
  get Component(): (props: SceneComponentProps<this> & TimeRangeProp) => React.ReactElement | null {
    return super.Component;
  }

  static Component = ({
    model,
    timeRange,
  }: SceneComponentProps<AdHocFiltersVariable & { onChangeQuery?: any }> & TimeRangeProp) => {
    const { key } = model.useState();

    const query = useBuildPyroscopeQuery(model, key as string);

    const { value: dataSourceUid } = sceneGraph
      .findByKeyAndType(model, 'dataSource', ProfilesDataSourceVariable)
      .useState();

    // subscribing keeps the available label values in sync with the time range, instead of waiting for an unrelated re-render
    const {
      value: { from, to },
    } = (timeRange ?? sceneGraph.getTimeRange(model)).useState();

    return (
      <QueryBuilder
        id={`query-builder-${key}`}
        autoExecute
        dataSourceUid={dataSourceUid as string}
        query={query}
        from={from.unix() * 1000}
        to={to.unix() * 1000}
        onChangeQuery={model.onChangeQuery}
      />
    );
  };
}
