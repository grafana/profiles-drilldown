import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';

import { DataSourceProxyClient } from '../series/http/DataSourceProxyClient';

type DiffProfileResponse = string | FlamebearerProfile;

type GetParams = {
  query: string;
  timeRange: TimeRange;
  format: 'dot' | 'json';
  maxNodes: number;
  profileIdSelector?: string;
  spanSelector?: string;
};

export class ProfileApiClient extends DataSourceProxyClient {
  constructor(options: { dataSourceUid: string }) {
    super(options);
  }

  async get(params: GetParams): Promise<DiffProfileResponse> {
    if (params.format === 'json' && (params.profileIdSelector || params.spanSelector)) {
      return this.getFilteredFlamebearer(params);
    }

    const searchParams = new URLSearchParams({
      query: params.query,
      from: String(params.timeRange.from.valueOf()),
      until: String(params.timeRange.to.valueOf()),
      format: params.format,
    });

    if (params.maxNodes) {
      searchParams.set('max-nodes', String(params.maxNodes));
    }

    const response = await this.fetch(`/pyroscope/render?${searchParams.toString()}`);

    switch (params.format) {
      case 'dot':
        return response.text();

      case 'json':
        return response.json();

      default:
        throw new TypeError(`Unknown format "${params.format}"!`);
    }
  }

  private async getFilteredFlamebearer(params: GetParams): Promise<FlamebearerProfile> {
    const { profileMetricId, labelsSelector } = parseQuery(params.query);

    const response = await this.fetch('/querier.v1.QuerierService/SelectMergeStacktraces', {
      method: 'POST',
      body: JSON.stringify({
        profileTypeID: profileMetricId,
        labelSelector: labelsSelector,
        start: params.timeRange.from.valueOf(),
        end: params.timeRange.to.valueOf(),
        format: 'PROFILE_FORMAT_FLAMEGRAPH',
        ...(params.maxNodes && { maxNodes: params.maxNodes }),
        ...(params.profileIdSelector && { profileIdSelector: [params.profileIdSelector] }),
        ...(params.spanSelector && { spanSelector: [params.spanSelector] }),
      }),
    });

    const { flamegraph } = (await response.json()) as {
      flamegraph?: {
        names?: string[];
        levels?: Array<{ values?: Array<string | number> }>;
        total?: string | number;
        maxSelf?: string | number;
      };
    };
    const [, sampleType = '', sampleUnit = ''] = profileMetricId.split(':');
    const units = flamebearerUnits(sampleType, sampleUnit);

    return {
      version: 1,
      flamebearer: {
        names: flamegraph?.names ?? [],
        levels: (flamegraph?.levels ?? []).map((level) => (level.values ?? []).map(Number)),
        numTicks: Number(flamegraph?.total ?? 0),
        maxSelf: Number(flamegraph?.maxSelf ?? 0),
      },
      metadata: {
        format: 'single',
        name: sampleType,
        units,
        sampleRate: sampleType === 'cpu' ? 1_000_000_000 : 100,
        spyName: 'unknown',
      },
    };
  }
}

function flamebearerUnits(sampleType: string, sampleUnit: string): FlamebearerProfile['metadata']['units'] {
  if (sampleType === 'cpu') {
    return 'samples';
  }

  if (['inuse_objects', 'alloc_objects', 'goroutine', 'samples'].includes(sampleType) || sampleUnit === 'count') {
    return 'objects';
  }

  if (sampleUnit === 'bytes' || sampleUnit === 'lock_nanoseconds' || sampleUnit === 'lock_samples') {
    return sampleUnit;
  }

  return 'nanoseconds';
}
