import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { ProfileSchema } from '@shared/pyroscope-api/google/v1/profile_pb';
import {
  ProfileFormat,
  SelectMergeStacktracesRequestSchema,
  SelectMergeStacktracesResponseSchema,
} from '@shared/pyroscope-api/querier/v1/querier_pb';
import { PprofProfile } from '@shared/types/PprofProfile';

import { DataSourceProxyClient } from '../../../infrastructure/series/http/DataSourceProxyClient';

type SelectMergeProfileParams = {
  query: string;
  timeRange: TimeRange;
  maxNodes: number;
  profileIdSelector?: string;
  spanSelector?: string;
};

type SelectMergeProfileJsonParams = {
  profileMetricId: string;
  labelsSelector: string;
  start: number;
  end: number;
  stackTrace: string[];
  maxNodes: number;
  profileIdSelector?: string;
};

export class PprofApiClient extends DataSourceProxyClient {
  async selectMergeProfile({
    query,
    timeRange,
    maxNodes,
    profileIdSelector,
    spanSelector,
  }: SelectMergeProfileParams): Promise<Blob> {
    const { profileMetricId, labelsSelector } = parseQuery(query);
    const request = create(SelectMergeStacktracesRequestSchema, {
      profileTypeID: profileMetricId,
      labelSelector: labelsSelector,
      start: BigInt(timeRange.from.valueOf()),
      end: BigInt(timeRange.to.valueOf()),
      ...(maxNodes > 0 && { maxNodes: BigInt(maxNodes) }),
      format: ProfileFormat.PPROF,
      ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
      ...(spanSelector && { spanSelector: [spanSelector] }),
    });

    const response = await this.fetch('/querier.v1.QuerierService/SelectMergeStacktraces', {
      method: 'POST',
      headers: { 'content-type': 'application/proto' },
      body: toBinary(SelectMergeStacktracesRequestSchema, request).slice(),
    });

    const decoded = fromBinary(SelectMergeStacktracesResponseSchema, new Uint8Array(await response.arrayBuffer()));
    const profile = decoded.pprof?.profile;
    if (!profile) {
      throw new Error('pprof response missing profile; backend may not support PROFILE_FORMAT_PPROF');
    }

    return new Blob([toBinary(ProfileSchema, profile).slice()]);
  }

  async selectMergeProfileJson({
    profileMetricId,
    labelsSelector,
    start,
    end,
    stackTrace,
    maxNodes,
    profileIdSelector,
  }: SelectMergeProfileJsonParams): Promise<PprofProfile> {
    const response = await this.fetch('/querier.v1.QuerierService/SelectMergeProfile', {
      method: 'POST',
      body: JSON.stringify({
        profile_typeID: profileMetricId,
        label_selector: labelsSelector,
        start: start * 1000,
        end: end * 1000,
        stackTraceSelector: {
          call_site: stackTrace.map((name) => ({ name })),
        },
        maxNodes,
        ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
      }),
    });

    return response.json();
  }
}
