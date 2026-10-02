import { SceneQueryRunner } from '@grafana/scenes';
import { quoteLabelName } from '@shared/components/QueryBuilder/domain/helpers/quoteLabelName';

import { hasStackFrameFilter, StackFrameFilter } from '../../domain/StackFrameFilter';
import { PYROSCOPE_DATA_SOURCE } from '../pyroscope-data-sources';
import { TimeSeriesQueryRunnerParams } from '../timeseries/TimeSeriesQueryRunnerParams';
import { withPreventInvalidQuery } from '../withPreventInvalidQuery';

type FlameGraphQueryRunnerParams = TimeSeriesQueryRunnerParams & {
  maxNodes?: number;
  spanSelector?: string;
  profileIdSelector?: string;
  frameFilter?: StackFrameFilter;
};

export function buildFlameGraphQueryRunner({
  filters,
  maxNodes,
  spanSelector,
  profileIdSelector,
  frameFilter,
  extraFilterVariables,
}: FlameGraphQueryRunnerParams) {
  const completeFilters = filters ? [...filters] : [];
  completeFilters.unshift({ key: 'service_name', operator: '=', value: '$serviceName' });

  const filterVariable = (name: string) => `\${${name}.filterExpressionWithLeadingComma}`;
  const extraVars = extraFilterVariables?.map(filterVariable).join('') ?? '';
  const selector = completeFilters
    .map(({ key, operator, value }) => `${quoteLabelName(key)}${operator}"${value}"`)
    .join(',');

  const queryRunner = new SceneQueryRunner({
    datasource: PYROSCOPE_DATA_SOURCE,
    queries: [
      {
        refId: 'profile',
        queryType: 'profile',
        profileTypeId: '$profileMetricId',
        labelSelector: `{${selector}${filterVariable('filters')}${extraVars}}`,
        maxNodes,
        ...(spanSelector && { spanSelector: [spanSelector] }),
        ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
        ...(frameFilter && hasStackFrameFilter(frameFilter) && { frameFilter }),
      },
    ],
  });

  return withPreventInvalidQuery(queryRunner);
}
