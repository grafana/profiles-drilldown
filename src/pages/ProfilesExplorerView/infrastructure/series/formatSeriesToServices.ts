import { MetricFindValue } from '@grafana/data';
import { localeCompare } from '@shared/domain/localeCompare';

import { PyroscopeSeries } from './types';

export function formatSeriesToServices(pyroscopeSeries: PyroscopeSeries, profileMetricId?: string): MetricFindValue[] {
  if (profileMetricId) {
    const servicesSet = pyroscopeSeries.profileMetrics.get(profileMetricId) || new Set();

    return Array.from(servicesSet)
      .sort(localeCompare)
      .map((serviceName) => ({
        text: serviceName,
        value: serviceName,
      }));
  }

  return Array.from(pyroscopeSeries.services.keys())
    .sort(localeCompare)
    .map((serviceName) => ({
      text: serviceName,
      value: serviceName,
    }));
}
