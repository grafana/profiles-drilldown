import { SceneQueryRunner } from '@grafana/scenes';

import { PYROSCOPE_DATA_SOURCE } from '../../../../../infrastructure/pyroscope-data-sources';
import { withPreventInvalidQuery } from '../../../../../infrastructure/withPreventInvalidQuery';

export function buildCompareTimeSeriesQueryRunner({
  filterKey,
}: {
  filterKey: 'filtersBaseline' | 'filtersComparison';
}) {
  const queryRunner = new SceneQueryRunner({
    datasource: PYROSCOPE_DATA_SOURCE,
    queries: [
      {
        refId: `$profileMetricId-$serviceName-${filterKey}}`,
        queryType: 'metrics',
        profileTypeId: '$profileMetricId',
        labelSelector: `{service_name="$serviceName"\${${filterKey}.filterExpressionWithLeadingComma}}`,
      },
    ],
  });

  return withPreventInvalidQuery(queryRunner);
}
