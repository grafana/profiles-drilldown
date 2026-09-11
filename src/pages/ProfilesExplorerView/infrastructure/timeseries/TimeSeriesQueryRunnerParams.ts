import { AdHocVariableFilter } from '@grafana/data';

export type TimeSeriesQueryRunnerParams = {
  serviceName?: string;
  profileMetricId?: string;
  groupBy?: {
    label: string;
  };
  filters?: AdHocVariableFilter[];
  extraFilterVariables?: string[];
};
