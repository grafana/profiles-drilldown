import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';

export function getExportFilename(query: string, timeRange: TimeRange) {
  const { serviceId, profileMetricId } = parseQuery(query);
  const dateString = `${timeRange.from.format('YYYY-MM-DD_HHmm')}-to-${timeRange.to.format('YYYY-MM-DD_HHmm')}`;
  return `${serviceId.replace(/\//g, '-')}_${profileMetricId}_${dateString}`;
}
