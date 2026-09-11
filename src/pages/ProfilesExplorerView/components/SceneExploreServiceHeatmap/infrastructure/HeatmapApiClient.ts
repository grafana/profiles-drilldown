import { HeatmapQueryType, SelectHeatmapResponse } from '@shared/pyroscope-api/querier/v1/querier_pb';
import { ExemplarType } from '@shared/pyroscope-api/types/v1/types_pb';

import { DataSourceProxyClient } from '../../../infrastructure/series/http/DataSourceProxyClient';

export { HeatmapQueryType, ExemplarType };
export type { SelectHeatmapResponse };

/**
 * JSON-serializable request for the SelectHeatmap Connect RPC.
 * Uses number for int64 fields (bigint is not JSON-serializable).
 */
export interface SelectHeatmapRequest {
  /** Profile Type ID string in the form <name>:<type>:<unit>:<period_type>:<period_unit>. */
  profileTypeID: string;
  labelSelector: string;
  /** Milliseconds since epoch */
  start: number;
  /** Milliseconds since epoch */
  end: number;
  /** Query resolution step width in seconds */
  step: number;
  groupBy: string[];
  queryType: HeatmapQueryType;
  exemplarType: ExemplarType;
  limit?: number;
}

export async function selectHeatmap(
  dataSourceUid: string,
  request: SelectHeatmapRequest
): Promise<SelectHeatmapResponse> {
  const client = new DataSourceProxyClient({ dataSourceUid });
  const response = await client.fetch('/querier.v1.QuerierService/SelectHeatmap', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return response.json();
}
