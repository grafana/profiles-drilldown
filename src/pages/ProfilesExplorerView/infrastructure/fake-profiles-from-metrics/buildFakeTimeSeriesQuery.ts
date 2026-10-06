import { buildMetricSelector, findFakeMetricMapping, SERVICE_LABEL } from './metricsProfileTypeMap';

export type FakePrometheusTarget = {
  refId: string;
  expr: string;
  range: boolean;
};

export function buildFakeTimeSeriesQuery(params: {
  serviceName?: string;
  profileMetricId?: string;
  groupBy?: { label: string };
  extraSelector?: string;
}): FakePrometheusTarget | undefined {
  const { serviceName, profileMetricId, groupBy, extraSelector } = params;
  const mapping = findFakeMetricMapping(profileMetricId);

  if (!mapping || !serviceName) {
    return undefined;
  }

  const selector = buildMetricSelector(mapping.promMetric, `${SERVICE_LABEL}="${serviceName}"${extraSelector ?? ''}`);
  const vector = mapping.kind === 'rate' ? `rate(${selector}[$__rate_interval])` : selector;
  const expr = groupBy?.label ? `sum by (${groupBy.label}) (${vector})` : `sum(${vector})`;

  return {
    refId: `${profileMetricId}-fake`,
    expr,
    range: true,
  };
}
