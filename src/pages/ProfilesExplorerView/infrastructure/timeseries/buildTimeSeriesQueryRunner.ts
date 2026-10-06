import { SceneQueryRunner } from '@grafana/scenes';
import { quoteLabelName } from '@shared/components/QueryBuilder/domain/helpers/quoteLabelName';

import { HybridQueryParams, withHybridDataSourceQuery } from '../fake-profiles-from-metrics/withHybridDataSourceQuery';
import { PYROSCOPE_DATA_SOURCE } from '../pyroscope-data-sources';
import { withPreventInvalidQuery } from '../withPreventInvalidQuery';
import { TimeSeriesQueryRunnerParams } from './TimeSeriesQueryRunnerParams';

export type TimeSeriesQuery = {
  refId: string;
  queryType: 'metrics';
  profileTypeId: string;
  labelSelector: string;
  groupBy: string[];
  limit?: number;
  includeExemplars?: boolean;
};

// Split out so callers patching an already-active runner elsewhere don't need to build and discard a whole SceneQueryRunner just for this.
export function buildTimeSeriesQuery(
  { serviceName, profileMetricId, groupBy, filters, extraFilterVariables }: TimeSeriesQueryRunnerParams,
  limit?: number,
  includeExemplars?: boolean
): { queries: TimeSeriesQuery[]; hybridParams: HybridQueryParams } {
  const completeFilters = filters ? [...filters] : [];
  completeFilters.unshift({ key: 'service_name', operator: '=', value: serviceName || '$serviceName' });

  const filterVariable = (name: string) => `\${${name}.filterExpressionWithLeadingComma}`;
  const extraVars = extraFilterVariables?.map(filterVariable).join('') ?? '';
  const selector = completeFilters
    .map(({ key, operator, value }) => `${quoteLabelName(key)}${operator}"${value}"`)
    .join(',');

  const queries: TimeSeriesQuery[] = [
    {
      refId: `${profileMetricId || '$profileMetricId'}-${selector}-${groupBy?.label || 'no-group-by'}`,
      queryType: 'metrics',
      profileTypeId: profileMetricId || '$profileMetricId',
      labelSelector: `{${selector}${filterVariable('filters')}${extraVars}}`,
      groupBy: groupBy?.label ? [groupBy.label] : [],
      limit,
      includeExemplars,
    },
  ];

  const staticExtraFilters = (filters ?? [])
    .map(({ key, operator, value }) => `${quoteLabelName(key)}${operator}"${value}"`)
    .join(',');
  const staticExtraFiltersPrefix = staticExtraFilters ? `,${staticExtraFilters}` : '';
  const filtersExpr = `${staticExtraFiltersPrefix}${filterVariable('filters')}${extraVars}`;

  return {
    queries,
    hybridParams: {
      serviceName,
      profileMetricId,
      groupBy,
      filtersExpr,
      filterVariableNames: ['filters', ...(extraFilterVariables ?? [])],
    },
  };
}

export function buildTimeSeriesQueryRunner(
  params: TimeSeriesQueryRunnerParams,
  limit?: number,
  includeExemplars?: boolean
) {
  const { queries, hybridParams } = buildTimeSeriesQuery(params, limit, includeExemplars);

  const queryRunner = new SceneQueryRunner({
    datasource: PYROSCOPE_DATA_SOURCE,
    queries,
  });

  return withHybridDataSourceQuery(withPreventInvalidQuery(queryRunner), hybridParams);
}
