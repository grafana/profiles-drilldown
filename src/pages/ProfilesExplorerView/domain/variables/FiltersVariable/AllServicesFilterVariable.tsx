import { AdHocVariableFilter } from '@grafana/data';
import { t } from '@grafana/i18n';
import { AdHocFiltersVariable, SceneComponentProps, sceneGraph } from '@grafana/scenes';
import { buildFilterExpressionParts } from '@shared/components/SavedSearches/utils';
import React, { useMemo } from 'react';

import { AllServicesCombobox } from '../../../components/SceneExploreAllServices/AllServicesCombobox';
import { ProfileMetricVariable } from '../ProfileMetricVariable';
import { ProfilesDataSourceVariable } from '../ProfilesDataSourceVariable';
import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from './filterExpressionWithLeadingComma';

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

  static Component = ({ model }: SceneComponentProps<AdHocFiltersVariable>) => {
    const { filterExpression } = model.useState();
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
      <AllServicesCombobox
        key={String(dataSourceUid)}
        model={model}
        dataSourceUid={dataSourceUid as string}
        query={query}
        from={from.unix() * 1000}
        to={to.unix() * 1000}
      />
    );
  };
}
