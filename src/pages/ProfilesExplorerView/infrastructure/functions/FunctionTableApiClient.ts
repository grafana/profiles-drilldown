import type { TimeRange } from '@grafana/data';
import type { FunctionTable } from '@grafana/flamegraph';
import { parseQuery } from '@shared/domain/url-params/parseQuery';
import { HttpClientError } from '@shared/infrastructure/http/HttpClientError';

import { DataSourceProxyClient } from '../series/http/DataSourceProxyClient';

export type FunctionTableSelection = {
  query: string;
  timeRange: TimeRange;
  spanSelector?: string;
  profileIdSelector?: string;
};

export type FunctionTableQuery = {
  left: FunctionTableSelection;
  right?: FunctionTableSelection;
  maxNodes?: number | null;
};

type SampleValue = string | number;
type FunctionRow = { name: string; self?: SampleValue; total?: SampleValue };
type FunctionDiffRow = {
  name: string;
  leftSelf?: SampleValue;
  leftTotal?: SampleValue;
  rightSelf?: SampleValue;
  rightTotal?: SampleValue;
};

function selectionRequest({ query, timeRange, spanSelector, profileIdSelector }: FunctionTableSelection) {
  const { profileMetricId, labelsSelector } = parseQuery(query);
  return {
    profileTypeID: profileMetricId,
    labelSelector: labelsSelector,
    start: timeRange.from.valueOf(),
    end: timeRange.to.valueOf(),
    ...(spanSelector && { spanSelector: [spanSelector] }),
    ...(profileIdSelector && { profileIdSelector: [profileIdSelector] }),
  };
}

export function functionTableRequest({ left, right, maxNodes }: FunctionTableQuery) {
  const format = 'PROFILE_FORMAT_FUNCTIONS';
  return right
    ? { method: 'Diff', body: { left: selectionRequest(left), right: selectionRequest(right), format, maxNodes } }
    : { method: 'SelectMergeStacktraces', body: { ...selectionRequest(left), format, maxNodes } };
}

export class FunctionTableApiClient extends DataSourceProxyClient {
  async query(request: ReturnType<typeof functionTableRequest>, signal?: AbortSignal): Promise<FunctionTable | null> {
    let response: Response;
    try {
      response = await this.fetch(`/querier.v1.QuerierService/${request.method}`, {
        method: 'POST',
        body: JSON.stringify(request.body),
        signal,
      });
    } catch (error) {
      if (error instanceof HttpClientError && error.response.status === 501) {
        return null;
      }
      throw error;
    }

    const json = await response.json();
    // Older servers may ignore the format and return a flamegraph instead.
    if (!json.functions) {
      return null;
    }
    if (request.method === 'Diff') {
      const table = json.functions as {
        functions?: FunctionDiffRow[];
        leftTotal?: SampleValue;
        rightTotal?: SampleValue;
      };
      return {
        total: Number(table.leftTotal ?? 0),
        totalRight: Number(table.rightTotal ?? 0),
        rows: (table.functions ?? []).map((row) => ({
          name: row.name,
          self: Number(row.leftSelf ?? 0),
          total: Number(row.leftTotal ?? 0),
          selfRight: Number(row.rightSelf ?? 0),
          totalRight: Number(row.rightTotal ?? 0),
        })),
      };
    }

    const table = json.functions as { functions?: FunctionRow[]; total?: SampleValue };
    return {
      total: Number(table.total ?? 0),
      rows: (table.functions ?? []).map((row) => ({
        name: row.name,
        self: Number(row.self ?? 0),
        total: Number(row.total ?? 0),
      })),
    };
  }
}
