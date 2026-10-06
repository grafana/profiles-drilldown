import { SceneQueryRunner } from '@grafana/scenes';

import { withHybridDataSourceQuery } from '../../../../../../../infrastructure/fake-profiles-from-metrics/withHybridDataSourceQuery';
import { PYROSCOPE_DATA_SOURCE } from '../../../../../../../infrastructure/pyroscope-data-sources';

export function buildLabelValuesGridQueryRunner({
  label,
  serviceName,
  profileMetricId,
}: {
  label: string;
  serviceName?: string;
  profileMetricId?: string;
}) {
  const selector = 'service_name="$serviceName"';

  const queryRunner = new SceneQueryRunner({
    datasource: PYROSCOPE_DATA_SOURCE,
    queries: [
      {
        refId: `$profileMetricId-${selector}-${label}`,
        queryType: 'metrics',
        profileTypeId: '$profileMetricId',
        labelSelector: `{${selector}}`,
        groupBy: [label],
      },
    ],
  });

  // Passed literally: live interpolation can be transiently empty here, and the consumer only listens for one data update.
  return withHybridDataSourceQuery(queryRunner, { groupBy: { label }, serviceName, profileMetricId });
}
