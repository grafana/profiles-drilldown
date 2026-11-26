import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { logger } from '@shared/infrastructure/tracking/logger';

import { PyroscopeSeries } from '../types';

type Labels = Array<{ name: string; value: string }>;

function findServiceNameAndProfileMetricId(labels: Labels) {
  let serviceName;
  let profileMetricId;

  for (const { name, value } of labels) {
    if (name === 'service_name') {
      serviceName = value;
    }

    if (name === '__profile_type__') {
      profileMetricId = value;
    }

    if (serviceName && profileMetricId) {
      return [serviceName, profileMetricId];
    }
  }

  return [];
}

export function formatSeriesResponse(data: { labelsSet: Array<{ labels: Labels }> }): PyroscopeSeries {
  const services: PyroscopeSeries['services'] = new Map();
  const profileMetrics: PyroscopeSeries['profileMetrics'] = new Map();

  if (!data.labelsSet) {
    logger.warn('Pyroscope SeriesApiClient: no data received!');
    return { services, profileMetrics };
  }

  for (const { labels } of data.labelsSet) {
    const [serviceName, profileMetricId] = findServiceNameAndProfileMetricId(labels);

    if (!serviceName || !profileMetricId) {
      logger.warn(
        'Pyroscope ServicesApiClient: "service_name" and/or "__profile_type__" are missing in the labels received!',
        labels
      );
      continue;
    }

    const serviceProfileMetrics = services.get(serviceName) || new Map();
    serviceProfileMetrics.set(profileMetricId, getProfileMetric(profileMetricId as ProfileMetricId));
    services.set(serviceName, serviceProfileMetrics);

    const profileMetricServices = profileMetrics.get(profileMetricId) || new Set();
    profileMetricServices.add(serviceName);
    profileMetrics.set(profileMetricId, profileMetricServices);
  }

  return { services, profileMetrics };
}
