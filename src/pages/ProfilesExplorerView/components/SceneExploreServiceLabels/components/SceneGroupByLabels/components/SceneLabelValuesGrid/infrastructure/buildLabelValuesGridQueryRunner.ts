import { SceneQueryRunner } from '@grafana/scenes';

import { PYROSCOPE_DATA_SOURCE } from '../../../../../../../infrastructure/pyroscope-data-sources';

export function buildLabelValuesGridQueryRunner({ label }: { label: string }) {
  const selector = 'service_name="$serviceName"${filters.filterExpressionWithLeadingComma}';

  return new SceneQueryRunner({
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
}
