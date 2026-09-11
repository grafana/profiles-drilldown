import { SceneQueryRunner } from '@grafana/scenes';
import { quoteLabelName } from '@shared/components/QueryBuilder/domain/helpers/quoteLabelName';

import { PYROSCOPE_DATA_SOURCE } from '../pyroscope-data-sources';
import { withPreventInvalidQuery } from '../withPreventInvalidQuery';
import { TimeSeriesQueryRunnerParams } from './TimeSeriesQueryRunnerParams';

export type TimeSeriesQuery = {
  refId: string;
  queryType: 'metrics';
  profileTypeId: string;
  labelSelector: string;
  groupBy: string[];
};

export function buildTimeSeriesQueryRunner(
  { serviceName, profileMetricId, groupBy, filters, extraFilterVariables }: TimeSeriesQueryRunnerParams,
  limit?: number,
  includeExemplars?: boolean
) {
  const completeFilters = filters ? [...filters] : [];
  completeFilters.unshift({ key: 'service_name', operator: '=', value: serviceName || '$serviceName' });

  const filterVariable = (name: string) => `\${${name}.filterExpressionWithLeadingComma}`;
  const extraVars = extraFilterVariables?.map(filterVariable).join('') ?? '';
  const selector = completeFilters
    .map(({ key, operator, value }) => `${quoteLabelName(key)}${operator}"${value}"`)
    .join(',');

  const queryRunner = new SceneQueryRunner({
    datasource: PYROSCOPE_DATA_SOURCE,
    queries: [
      {
        refId: `${profileMetricId || '$profileMetricId'}-${selector}-${groupBy?.label || 'no-group-by'}`,
        queryType: 'metrics',
        profileTypeId: profileMetricId || '$profileMetricId',
        labelSelector: `{${selector}${filterVariable('filters')}${extraVars}}`,
        groupBy: groupBy?.label ? [groupBy.label] : [],
        limit,
        includeExemplars,
      },
    ],
  });

  return withPreventInvalidQuery(queryRunner);
}
