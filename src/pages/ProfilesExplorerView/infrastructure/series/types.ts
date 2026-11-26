import { ProfileMetric } from '@shared/infrastructure/profile-metrics/getProfileMetric';

export type PyroscopeSeries = {
  services: Map<string, Map<ProfileMetric['id'], ProfileMetric>>;
  profileMetrics: Map<string, Set<string>>;
};
