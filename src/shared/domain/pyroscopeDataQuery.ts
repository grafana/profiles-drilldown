import { DataQuery } from '@grafana/schema';

export type HeatmapQueryType = 'individual' | 'span';

/**
 * Pyroscope query model. Grafana 13.2 no longer publishes this generated type from
 * `@grafana/schema`; the Pyroscope datasource owns it.
 */
export interface GrafanaPyroscopeDataQuery extends DataQuery {
  annotations?: boolean;
  groupBy: string[];
  heatmapType: HeatmapQueryType;
  includeExemplars: boolean;
  includeHeatmap: boolean;
  labelSelector: string;
  limit?: number;
  maxNodes?: number;
  profileIdSelector?: string[];
  profileTypeId: string;
  spanSelector?: string[];
  stackTraceSelector?: string[];
  /** Label selector expression stored for the query library. */
  query?: string;
  datasource?: {
    type?: string;
    uid?: string;
  } | null;
}
