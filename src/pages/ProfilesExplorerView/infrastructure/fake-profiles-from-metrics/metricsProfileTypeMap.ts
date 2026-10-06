export type FakeMetricMapping = {
  profileMetricId: string;
  promMetric: string;
  kind: 'rate' | 'instant';
  /** Grafana field unit for the resulting series: a `rate()` over a `_seconds_total` counter is fractional CPU cores, not the "ns" profile-metrics.json lists for this profileMetricId. */
  unit: string;
};

export const SERVICE_LABEL = 'container';

export const FAKE_METRICS_PROFILE_TYPE_MAP: FakeMetricMapping[] = [
  {
    profileMetricId: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
    promMetric: 'container_cpu_usage_seconds_total',
    kind: 'rate',
    unit: 'suffix:cores',
  },
  {
    profileMetricId: 'memory:inuse_space:bytes:space:bytes',
    promMetric: 'container_memory_working_set_bytes',
    kind: 'instant',
    unit: 'bytes',
  },
];

const EXCLUDE_PSEUDO_CONTAINERS = `${SERVICE_LABEL}!="",${SERVICE_LABEL}!="POD"`;

export function buildMetricSelector(promMetric: string, extraSelector?: string) {
  const selector = extraSelector ? `${EXCLUDE_PSEUDO_CONTAINERS},${extraSelector}` : EXCLUDE_PSEUDO_CONTAINERS;
  return `${promMetric}{${selector}}`;
}

export function findFakeMetricMapping(profileMetricId?: string) {
  return FAKE_METRICS_PROFILE_TYPE_MAP.find((mapping) => mapping.profileMetricId === profileMetricId);
}
