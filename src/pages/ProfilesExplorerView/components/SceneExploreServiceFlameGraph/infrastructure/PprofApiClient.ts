import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { PprofProfile } from '@shared/types/PprofProfile';

import { hasStackFrameFilter, StackFrameFilter } from '../../../domain/StackFrameFilter';
import { DataSourceProxyClient } from '../../../infrastructure/series/http/DataSourceProxyClient';
import { appendFrameFilterToPprofRequest } from './encodeFrameFilter';
import { PprofRequest } from './PprofRequest';

type SelectMergeProfileParams = {
  query: string;
  timeRange: TimeRange;
  maxNodes: number;
  frameFilter?: StackFrameFilter;
  profileIdSelector?: string;
};

type SelectMergeProfileJsonParams = {
  profileMetricId: string;
  labelsSelector: string;
  start: number;
  end: number;
  stackTrace: string[];
  maxNodes: number;
  profileIdSelector?: string;
  frameFilter?: StackFrameFilter;
};

export class PprofApiClient extends DataSourceProxyClient {
  static buildPprofRequest(
    query: string,
    timeRange: TimeRange,
    maxNodes: number,
    frameFilter?: StackFrameFilter,
    profileIdSelector?: string
  ): Uint8Array {
    const { profileMetricId, labelsSelector } = parseQuery(query);

    const start = timeRange.from.unix() * 1000;
    const end = timeRange.to.unix() * 1000;

    const message = new PprofRequest(profileMetricId, labelsSelector, start, end, maxNodes);

    const request = PprofRequest.encode(message);
    if (frameFilter && hasStackFrameFilter(frameFilter)) {
      appendFrameFilterToPprofRequest(request, frameFilter);
    }
    if (profileIdSelector) {
      request.uint32(58).string(profileIdSelector);
    }
    return request.finish();
  }

  async selectMergeProfile({
    query,
    timeRange,
    maxNodes,
    frameFilter,
    profileIdSelector,
  }: SelectMergeProfileParams): Promise<Blob> {
    const response = await this.fetch('/querier.v1.QuerierService/SelectMergeProfile', {
      method: 'POST',
      headers: { 'content-type': 'application/proto' },
      body: new Blob([PprofApiClient.buildPprofRequest(query, timeRange, maxNodes, frameFilter, profileIdSelector)]),
    });

    return response.blob();
  }

  async selectMergeProfileJson({
    profileMetricId,
    labelsSelector,
    start,
    end,
    stackTrace,
    maxNodes,
    profileIdSelector,
    frameFilter,
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
          ...(frameFilter && hasStackFrameFilter(frameFilter) && { frameFilter }),
        },
        maxNodes,
        ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
      }),
    });

    return response.json();
  }
}
