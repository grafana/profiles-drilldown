import type { TimeRange } from '@grafana/data';
import type { SandwichNode, SuppliedSandwich } from '@grafana/flamegraph';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { HttpClientError } from '@shared/infrastructure/http/HttpClientError';

import { DataSourceProxyClient } from '../series/http/DataSourceProxyClient';

export type SandwichQuery = {
  function: string;
  query: string;
  timeRange: TimeRange;
  spanSelector?: string;
  profileIdSelector?: string;
  maxNodes?: number | null;
};

type SampleValue = string | number;
type WireNode = {
  nameIndex?: number;
  total?: SampleValue;
  self?: SampleValue;
  truncated?: boolean;
  children?: WireNode[];
};

export function sandwichRequest({ function: fn, query, timeRange, spanSelector, profileIdSelector, maxNodes }: SandwichQuery) {
  const { profileMetricId, labelsSelector } = parseQuery(query);
  return {
    profileTypeID: profileMetricId,
    labelSelector: labelsSelector,
    start: timeRange.from.valueOf(),
    end: timeRange.to.valueOf(),
    format: 'PROFILE_FORMAT_SANDWICH',
    sandwichFunction: fn,
    maxNodes,
    ...(spanSelector && { spanSelector: [spanSelector] }),
    ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
  };
}

/** Names arrive once per report rather than on every node, so they are resolved here. */
function toNode(node: WireNode | undefined, names: string[]): SandwichNode | undefined {
  if (!node) {
    return undefined;
  }
  const index = node.nameIndex ?? 0;
  return {
    name: names[index] ?? '',
    total: Number(node.total ?? 0),
    self: Number(node.self ?? 0),
    ...(node.truncated && { truncated: true }),
    ...(node.children?.length && { children: node.children.map((c) => toNode(c, names)!) }),
  };
}

export class SandwichApiClient extends DataSourceProxyClient {
  async query(request: ReturnType<typeof sandwichRequest>, signal?: AbortSignal): Promise<SuppliedSandwich | null> {
    let response: Response;
    try {
      response = await this.fetch('/querier.v1.QuerierService/SelectMergeStacktraces', {
        method: 'POST',
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      if (error instanceof HttpClientError && error.response.status === 501) {
        return null;
      }
      throw error;
    }

    const json = await response.json();
    // Older servers ignore the format and return a flamegraph instead.
    if (!json.sandwich) {
      return null;
    }
    const report = json.sandwich as {
      names?: string[];
      callers?: WireNode;
      callees?: WireNode;
      total?: SampleValue;
      self?: SampleValue;
    };
    const names = report.names ?? [];
    return {
      label: request.sandwichFunction,
      total: Number(report.total ?? 0),
      self: Number(report.self ?? 0),
      callers: toNode(report.callers, names),
      callees: toNode(report.callees, names),
    };
  }
}
