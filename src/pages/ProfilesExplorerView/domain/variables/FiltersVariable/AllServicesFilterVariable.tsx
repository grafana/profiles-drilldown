import { AdHocVariableFilter } from '@grafana/data';
import { t } from '@grafana/i18n';
import { AdHocFiltersVariable, sceneGraph } from '@grafana/scenes';
import { buildFilterExpressionParts } from '@shared/components/SavedSearches/utils';

import { ProfilesDataSourceVariable } from '../ProfilesDataSourceVariable';
import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from './filterExpressionWithLeadingComma';
import { getTagKeysProvider, getTagValuesProvider, SUPPORTED_OPERATORS } from './labelSuggestionsProviders';

export class AllServicesFilterVariable extends AdHocFiltersVariable {
  constructor({ key, initialFilters }: { key: string; initialFilters?: AdHocVariableFilter[] }) {
    super({
      key,
      name: key,
      label: t('variables.filters.label', 'Filters'),
      filters: initialFilters ?? [],
      expressionBuilder: (filters) => buildFilterExpressionParts(filters),
      applyMode: 'manual',
      getTagKeysProvider,
      getTagValuesProvider,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }

  _getOperators() {
    return super._getOperators().filter(({ value }) => SUPPORTED_OPERATORS.includes(value ?? ''));
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
}
