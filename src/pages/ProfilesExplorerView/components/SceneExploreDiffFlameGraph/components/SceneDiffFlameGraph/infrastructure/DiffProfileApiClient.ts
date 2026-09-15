import { fromJson } from '@bufbuild/protobuf';
import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { DiffResponseSchema } from '@shared/pyroscope-api/querier/v1/querier_pb';
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

  async get(params: GetParams, signal?: AbortSignal): Promise<DiffProfileResponse> {
    const left = parseQuery(params.leftQuery);
    const right = parseQuery(params.rightQuery);
    if (left.profileMetricId !== right.profileMetricId) {
      throw new Error('Profile types must match');
    }

    // The default Diff format returns the graph. Its node limit belongs on
    // each selection, unlike the top-level function-table row limit.
    const maxNodes = params.maxNodes === null ? {} : { maxNodes: params.maxNodes };
    const response = await this.fetch('/querier.v1.QuerierService/Diff', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        left: {
          profileTypeID: left.profileMetricId,
          labelSelector: left.labelsSelector,
          start: params.leftTimeRange.from.valueOf(),
          end: params.leftTimeRange.to.valueOf(),
          ...maxNodes,
        },
        right: {
          profileTypeID: right.profileMetricId,
          labelSelector: right.labelsSelector,
          start: params.rightTimeRange.from.valueOf(),
          end: params.rightTimeRange.to.valueOf(),
          ...maxNodes,
        },
      }),
    });
    const { flamegraph } = fromJson(DiffResponseSchema, await response.json(), { ignoreUnknownFields: true });
    if (!flamegraph) {
      throw new Error('Diff response is missing the flame graph');
    }

    return {
      version: 1,
      flamebearer: {
        names: flamegraph.names,
        levels: flamegraph.levels.map((level) => level.values.map(Number)),
        numTicks: Number(flamegraph.total),
        maxSelf: Number(flamegraph.maxSelf),
      },
      metadata: flamebearerMetadata(left.profileMetricId),
      leftTicks: Number(flamegraph.leftTicks),
      rightTicks: Number(flamegraph.rightTicks),
    };
  }
}

function flamebearerMetadata(profileTypeId: string): FlamebearerProfile['metadata'] {
  const [, name, sampleUnit] = profileTypeId.split(':');
  let units = sampleUnit as FlamebearerProfile['metadata']['units'];
  let sampleRate = 100;

  // Keep Pyroscope's ExportToFlamebearer unit conventions for rendering and exports.
  switch (name) {
    case 'inuse_objects':
    case 'alloc_objects':
    case 'goroutine':
    case 'samples':
      units = 'objects';
      break;
    case 'cpu':
      units = 'samples';
      sampleRate = 1_000_000_000;
      break;
  }

  return { format: 'double', spyName: '', sampleRate, units, name };
}
