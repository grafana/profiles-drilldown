import { logger } from '@shared/infrastructure/tracking/logger';

import { operatorsRepository } from '../infrastructure/operatorsRepository';
import type { QueryBuilderLabelsRepository } from '../infrastructure/QueryBuilderLabelsRepository';
import { filtersToQuery } from './helpers/filtersToQuery';
import { getLastFilter } from './helpers/getLastFilter';
import { isPrivateLabel } from './helpers/isPrivateLabel';
import { FilterKind, Filters, QueryBuilderContext, QueryBuilderEvent, Suggestions } from './types';

type ServiceFn<TContext, TEvent> = (context: TContext, event: TEvent) => Promise<Suggestions | Error>;
type Services<TContext, TEvent> = Record<string, ServiceFn<TContext, TEvent>>;

function handleError(error: Error, info: string) {
  const isAbortError = error instanceof DOMException && error.name === 'AbortError';
  if (isAbortError) {
    return [];
  }

  logger.error(error, { info });
  throw error;
}

export const createServices = ({
  labelsRepository,
}: {
  labelsRepository: QueryBuilderLabelsRepository;
}): Services<QueryBuilderContext, QueryBuilderEvent> => ({
  fetchLabels: async (context) => {
    const { dataSourceUid, from, to } = context.inputParams;

    try {
      const labels = await labelsRepository.listLabels({ dataSourceUid, query: context.query, from, to });

      const publicLabels: Suggestions = [];
      const privateLabels: Suggestions = [];

      // place private labels at the bottom of the suggestions list
      labels.forEach((label) => {
        if (isPrivateLabel(label.value)) {
          privateLabels.push(label);
        } else {
          publicLabels.push(label);
        }
      });

      return [...publicLabels, ...privateLabels];
    } catch (error) {
      return handleError(error as Error, 'Error while fetching labels!');
    }
  },
  fetchOperators: async () => {
    try {
      return await operatorsRepository.list();
    } catch (error) {
      return handleError(error as Error, 'Error while fetching operators!');
    }
  },
  // TODO: refactor indeed

  fetchLabelValues: async (context) => {
    let { query, edition, suggestions } = context;
    let targetFilter;

    try {
      if (edition) {
        const filters = context.filters.filter((filter) => {
          if (filter.id === edition!.filterId) {
            targetFilter = filter;
            return false;
          }

          return true;
        }) as Filters;

        if (!targetFilter) {
          throw new Error(`Impossible to edit filter id="${edition.filterId}": no filter found!`);
        }

        query = filtersToQuery(query, filters);
      } else {
        targetFilter = getLastFilter(context.filters);

        if (targetFilter?.type !== FilterKind.partial) {
          throw new Error('Impossible to load label values: no partial filter found!');
        }
      }

      if (suggestions.disabled) {
        return [];
      }

      const labelId = targetFilter.attribute.value;
      const { dataSourceUid, from, to } = context.inputParams;

      return await labelsRepository.listLabelValues({ dataSourceUid, label: labelId, query, from, to });
    } catch (error) {
      return handleError(error as Error, 'Error while fetching label values!');
    }
  },
});
