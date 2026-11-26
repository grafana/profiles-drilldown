import { MetricFindValue } from '@grafana/data';
import { localeCompare } from '@shared/domain/localeCompare';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';

import { PyroscopeSeries } from './types';

export function formatSeriesToProfileMetrics(
  pyroscopeSeries: PyroscopeSeries,
  serviceName?: string
): MetricFindValue[] {
  if (serviceName) {
    const profileMetricsMap = pyroscopeSeries.services.get(serviceName) || new Map();

    return Array.from(profileMetricsMap.values())
      .sort((a, b) => localeCompare(b.group, a.group))
      .map(({ id, type, group }) => ({
        value: id,
        text: `${type} (${group})`,
      }));
  }

  return Array.from(pyroscopeSeries.profileMetrics.keys())
    .map((id) => getProfileMetric(id as ProfileMetricId))
    .sort((a, b) => localeCompare(b.group, a.group))
    .map(({ id, type, group }) => ({
      value: id,
      text: `${type} (${group})`,
    }));
}
