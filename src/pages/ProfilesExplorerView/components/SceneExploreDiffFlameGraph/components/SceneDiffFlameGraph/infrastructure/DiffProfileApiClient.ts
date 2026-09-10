import { TimeRange } from '@grafana/data';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';

import { DataSourceProxyClient } from '../../../../../infrastructure/series/http/DataSourceProxyClient';

type DiffProfileResponse = FlamebearerProfile;

type GetParams = {
  leftQuery: string;
  leftTimeRange: TimeRange;
  rightQuery: string;
  rightTimeRange: TimeRange;
  maxNodes: number | null;
};

export class DiffProfileApiClient extends DataSourceProxyClient {
  constructor(options: { dataSourceUid: string }) {
    super(options);
  }

  async get(params: GetParams): Promise<DiffProfileResponse> {
    const searchParams = new URLSearchParams({
      leftQuery: params.leftQuery,
      leftFrom: String(params.leftTimeRange.from.valueOf()),
      leftUntil: String(params.leftTimeRange.to.valueOf()),
      rightQuery: params.rightQuery,
      rightFrom: String(params.rightTimeRange.from.valueOf()),
      rightUntil: String(params.rightTimeRange.to.valueOf()),
    });

    if (params.maxNodes) {
      searchParams.set('max-nodes', String(params.maxNodes));
    }

    const response = await this.fetch(`/pyroscope/render-diff?${searchParams.toString()}`);

    const json = await response.json();

    return json;
  }
}
