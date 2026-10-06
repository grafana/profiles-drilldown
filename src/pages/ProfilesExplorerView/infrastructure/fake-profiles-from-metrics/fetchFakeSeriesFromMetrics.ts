import { TimeRange } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { logger } from '@shared/infrastructure/tracking/logger';

import { PyroscopeSeries } from '../series/http/SeriesApiClient';
import { buildMetricSelector, FAKE_METRICS_PROFILE_TYPE_MAP, SERVICE_LABEL } from './metricsProfileTypeMap';

// `matchers` come from Pyroscope-style `{...}` label selectors (e.g. the "all services" ad hoc filters); strip the braces to splice them into the PromQL selector.
function extractExtraSelector(matchers?: string[]): string {
  const inner = matchers?.[0]?.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  return inner || '';
}

export async function fetchFakeSeriesFromMetrics(
  dataSourceUid: string,
  timeRange: TimeRange,
  matchers?: string[]
): Promise<PyroscopeSeries> {
  const services: PyroscopeSeries['services'] = new Map();
  const profileMetrics: PyroscopeSeries['profileMetrics'] = new Map();

  const dataSource = await getDataSourceSrv().get(dataSourceUid);

  if (typeof dataSource.metricFindQuery !== 'function') {
    return { services, profileMetrics };
  }

  const extraSelector = extractExtraSelector(matchers);

  await Promise.all(
    FAKE_METRICS_PROFILE_TYPE_MAP.map(async ({ profileMetricId, promMetric }) => {
      const query = `label_values(${buildMetricSelector(promMetric, extraSelector)}, ${SERVICE_LABEL})`;
      const serviceNames = new Set<string>();

      try {
        const values = await dataSource.metricFindQuery!(query, { range: timeRange });

        for (const { value, text } of values ?? []) {
          const serviceName = String(value ?? text ?? '');

          if (!serviceName) {
            continue;
          }

          serviceNames.add(serviceName);

          const serviceProfileMetrics = services.get(serviceName) || new Map();
          serviceProfileMetrics.set(profileMetricId, getProfileMetric(profileMetricId as ProfileMetricId));
          services.set(serviceName, serviceProfileMetrics);
        }
      } catch (error) {
        logger.error(error as Error, { info: 'Error while faking Pyroscope series from Prometheus metrics!', query });
      }

      profileMetrics.set(profileMetricId, serviceNames);
    })
  );

  return { services, profileMetrics };
}
