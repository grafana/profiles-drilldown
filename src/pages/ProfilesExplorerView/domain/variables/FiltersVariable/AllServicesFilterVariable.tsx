import { AdHocVariableFilter } from '@grafana/data';
import { t } from '@grafana/i18n';
import { AdHocFiltersVariable, SceneComponentProps, sceneGraph } from '@grafana/scenes';
import { CompleteFilters } from '@shared/components/QueryBuilder/domain/types';
import { QueryBuilder } from '@shared/components/QueryBuilder/QueryBuilder';
import { buildFilterExpressionParts } from '@shared/components/SavedSearches/utils';
import React, { useMemo } from 'react';

import { ProfileMetricVariable } from '../ProfileMetricVariable';
import { ProfilesDataSourceVariable } from '../ProfilesDataSourceVariable';
import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from './filterExpressionWithLeadingComma';
import { convertPyroscopeToVariableFilter } from './filters-ops';

export class AllServicesFilterVariable extends AdHocFiltersVariable {
  constructor({ key, initialFilters }: { key: string; initialFilters?: AdHocVariableFilter[] }) {
    super({
      key,
      name: key,
      label: t('variables.filters.label', 'Filters'),
      filters: initialFilters ?? [],
      expressionBuilder: (filters) => buildFilterExpressionParts(filters),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }

  private onActivate() {
    const dataSourceSub = sceneGraph
      .findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable)
      .subscribeToState(() => {
        this.reset();
      });
    this._subs.add(dataSourceSub);
  }

  private reset() {
    this.setState({ filters: [] });
  }

  private onQueryChange = (_query: string, filters: CompleteFilters) => {
    this.setState({
      filters: filters.map(convertPyroscopeToVariableFilter),
    });
  };

  static Component = ({ model }: SceneComponentProps<AdHocFiltersVariable & { onQueryChange?: any }>) => {
    const { key, filterExpression } = model.useState();
    const {
      value: { from, to },
    } = sceneGraph.getTimeRange(model).useState();
    const { value: dataSourceUid } = sceneGraph
      .findByKeyAndType(model, 'dataSource', ProfilesDataSourceVariable)
      .useState();
    const { value: profileMetricId } = sceneGraph
      .findByKeyAndType(model, 'profileMetricId', ProfileMetricVariable)
      .useState();

    const query = useMemo(() => {
      const labels = `{${filterExpression ?? ''}}`;
      return profileMetricId != null && profileMetricId !== '' ? `${profileMetricId}${labels}` : labels;
    }, [filterExpression, profileMetricId]);

    return (
      <QueryBuilder
        id={`query-builder-${key}`}
        autoExecute
        dataSourceUid={dataSourceUid as string}
        query={query}
        from={from.unix() * 1000}
        to={to.unix() * 1000}
        onChangeQuery={model.onQueryChange}
      />
    );
  };
}
