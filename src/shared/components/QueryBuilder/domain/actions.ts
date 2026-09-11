import { t } from '@grafana/i18n';
import { assign } from 'xstate';

import { generateUUID } from '@shared/domain/generateUUID';
import { LabelsApiClient } from '../../../../pages/ProfilesExplorerView/infrastructure/labels/http/LabelsApiClient';
import { labelsRepository } from '../../../infrastructure/labels/labelsRepository';
import { areFiltersEqual } from './helpers/areFiltersEqual';
import { buildIsEmptyFilter } from './helpers/buildIsEmptyFilter';
import { filtersToQuery } from './helpers/filtersToQuery';
import { getLastFilter } from './helpers/getLastFilter';
import { isMultipleValuesOperator } from './helpers/isMultipleValuesOperator';
import { isPartialFilter } from './helpers/isPartialFilter';
import { isEditingOperatorMode } from './helpers/isSwitchingOperatorMode';
import { queryToFilters } from './helpers/queryToFilters';
import { toggleCompleteFilters } from './helpers/toggleCompleteFilters';
import {
  ChangeInputParamsEvent,
  EditEvent,
  FilterKind,
  FilterPartKind,
  Filters,
  OperatorKind,
  QueryBuilderContext,
  RemoveFilterEvent,
  SelectEvent,
} from './types';

function updateFiltersAndQuery(newFilters: Filters, context: QueryBuilderContext) {
  const isQueryUpToDate = areFiltersEqual(newFilters, queryToFilters(context.inputParams.query));

  return {
    filters: isQueryUpToDate ? toggleCompleteFilters(newFilters, true) : newFilters,
    query: filtersToQuery(context.query, newFilters),
    isQueryUpToDate,
  };
}

export const actions: any = {
  cancelAllLoad: () => {
    labelsRepository.cancel('Discarded by user');
  },
  // FILTER ATTRIBUTES
  setFilterAttribute: assign((context: QueryBuilderContext, event: SelectEvent) => {
    const newFilters = [
      ...context.filters,
      { id: generateUUID(), type: FilterKind.partial, active: false, attribute: event.data },
    ] as Filters;

    return {
      ...context,
      filters: newFilters,
      isQueryUpToDate: areFiltersEqual(newFilters, queryToFilters(context.inputParams.query)),
    };
  }),
  editFilterAttribute: assign((context: QueryBuilderContext, event: SelectEvent) => {
    if (context.edition === null) {
      throw new Error('Cannot edit filter attribute without edition data!');
    }

    const { filterId } = context.edition;

    const newFilters = context.filters.map((filter) =>
      filter.id === filterId
        ? {
            ...filter,
            attribute: event.data,
            operator: undefined,
            value: undefined,
          }
        : filter
    ) as Filters;

    return {
      ...context,
      filters: newFilters,
      // note: we can only edit the attribute of partial filters, so no need to rebuild the query here
      isQueryUpToDate: areFiltersEqual(newFilters, queryToFilters(context.inputParams.query)),
      edition: null,
    };
  }),
  // FILTER OPERATORS
  setFilterOperator: assign((context: QueryBuilderContext, event: SelectEvent) => {
    const newFilters = context.filters.map((filter) => {
      if (!isPartialFilter(filter)) {
        return filter;
      }

      const newOperator = event.data;

      if (newOperator.value === OperatorKind['is-empty']) {
        return buildIsEmptyFilter(filter);
      }

      return {
        ...filter,
        operator: newOperator,
        value: undefined,
      };
    }) as Filters;

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
    };
  }),

  editFilterOperator: assign((context: QueryBuilderContext, event: SelectEvent) => {
    if (context.edition === null) {
      throw new Error('Cannot edit filter operator without edition data!');
    }

    const { filterId } = context.edition;
    const newOperator = event.data;
    let newEdition = null;

    const newFilters = context.filters.map((filter) => {
      const previousOperator = filter.operator!.value;

      if (filter.id !== filterId || previousOperator === newOperator.value) {
        return filter;
      }

      if (newOperator.value === OperatorKind['is-empty']) {
        return buildIsEmptyFilter({
          ...filter,
          active: false,
        });
      }

      if (previousOperator === OperatorKind['is-empty']) {
        filter.value = { value: '(no value)', label: t('query-builder.no-value', '(no value)') };
      }

      if (!isPartialFilter(filter) && isEditingOperatorMode(previousOperator, newOperator.value)) {
        newEdition = { ...context.edition, part: FilterPartKind.value };
      }

      return {
        ...filter,
        operator: newOperator,
        value:
          isMultipleValuesOperator(previousOperator) && !isMultipleValuesOperator(newOperator.value) && filter.value
            ? {
                value: filter.value.value.split('|').shift(),
                label: filter.value.label.split(', ').shift(),
              }
            : filter.value,
        active: false,
      };
    }) as Filters;

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
      edition: newEdition,
    };
  }),
  // FILTER VALUES
  setFilterValue: assign((context: QueryBuilderContext, event: SelectEvent) => {
    const newFilters = context.filters.map((filter) =>
      isPartialFilter(filter)
        ? {
            ...filter,
            type: FilterKind['attribute-operator-value'],
            active: false,
            value: event.data,
          }
        : filter
    ) as Filters;

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
    };
  }),
  editFilterValue: assign((context: QueryBuilderContext, event: SelectEvent) => {
    if (context.edition === null) {
      throw new Error('Cannot edit filter value without edition data!');
    }

    const { filterId } = context.edition;

    const newFilters = context.filters.map((filter) =>
      filter.id === filterId
        ? {
            ...filter,
            type: FilterKind['attribute-operator-value'],
            active: false,
            value: event.data,
          }
        : filter
    ) as Filters;

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
      edition: null,
    };
  }),
  // FILTER REMOVAL
  removeFilter: assign((context: QueryBuilderContext, event: RemoveFilterEvent) => {
    const filterId = event.data;
    const newFilters = toggleCompleteFilters(context.filters.filter(({ id }) => id !== filterId) as Filters, false);

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
    };
  }),
  removeLastFilter: assign((context: QueryBuilderContext) => {
    const { filters } = context;

    const lastFilter = getLastFilter(filters);
    if (!lastFilter) {
      return context;
    }

    if (isPartialFilter(lastFilter) && lastFilter.operator) {
      const newFilters = filters.slice(0, filters.length - 1).concat({ ...lastFilter, operator: undefined }) as Filters;

      return {
        ...context,
        filters: newFilters,
        // query doesn't have to change
        isQueryUpToDate: true,
      };
    }

    const newFilters = filters.slice(0, filters.length - 1).map((filter) => ({ ...filter, active: false })) as Filters;

    return {
      ...context,
      ...updateFiltersAndQuery(newFilters, context),
    };
  }),
  // MISC
  setEdition: assign({ edition: (context, event: EditEvent) => event.data }),
  changeInputParams: assign((context: QueryBuilderContext, event: ChangeInputParamsEvent) => {
    // TODO: remove this condition after migrating the legacy comparison pages to Scenes
    // because dataSourceUid will always be provided
    if (event.data.dataSourceUid) {
      labelsRepository.setApiClient(new LabelsApiClient({ dataSourceUid: event.data.dataSourceUid }));
    }

    return {
      inputParams: event.data,
      query: event.data.query,
      // See also buildStateMachine() in domain/stateMachine.ts
      filters: queryToFilters(event.data.query),
      isQueryUpToDate: true,
    };
  }),
  activateFilters: assign((context: QueryBuilderContext) => ({
    ...context,
    ...updateFiltersAndQuery(context.filters, context),
  })),
};
