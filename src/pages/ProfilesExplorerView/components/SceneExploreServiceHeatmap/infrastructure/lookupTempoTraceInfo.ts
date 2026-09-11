import { DataFrame, DataQuery, DataQueryRequest, DataQueryResponse, DataSourceApi, dateTime, Field } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { lastValueFrom, Observable } from 'rxjs';

import { mergeSpanTraceWindows, SpanTimestamp } from '../domain/mergeSpanTraceWindows';

export interface TraceInfo {
  traceId: string;
  spanName?: string;
  duration?: number;
}

export interface TraceLookupResult {
  traceInfoBySpanId: Record<string, TraceInfo | null>;
  failed: boolean;
}

interface TempoSpanQuery extends DataQuery {
  queryType: 'traceql';
  tableType: 'spans';
  query: string;
  limit: number;
}

/**
 * Looks up Tempo trace info for a small set of spans, scoping each request to a
 * narrow asymmetric time window around the span's exemplar timestamp instead of
 * the full dashboard time range. The window extends further backwards because
 * TraceQL filters by a span's start time. Spans with overlapping windows are
 * batched into a single request; spans far apart in time are queried independently.
 */
export async function lookupTempoTraceInfo(
  tempoDataSourceUid: string,
  spans: SpanTimestamp[],
  paddingBeforeMs?: number,
  paddingAfterMs?: number
): Promise<TraceLookupResult> {
  const dataSource: DataSourceApi = await getDataSourceSrv().get(tempoDataSourceUid);
  const windows = mergeSpanTraceWindows(spans, paddingBeforeMs, paddingAfterMs);

  const results = await Promise.allSettled(
    windows.map((window) => queryTraceInfoForWindow(dataSource, tempoDataSourceUid, window))
  );

  const traceInfoBySpanId: Record<string, TraceInfo | null> = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      Object.assign(traceInfoBySpanId, result.value);
    }
  }

  return { traceInfoBySpanId, failed: results.some((result) => result.status === 'rejected') };
}

async function queryTraceInfoForWindow(
  dataSource: DataSourceApi,
  tempoDataSourceUid: string,
  window: { spanIds: string[]; from: number; to: number }
): Promise<Record<string, TraceInfo | null>> {
  const { spanIds, from, to } = window;
  const conditions = spanIds.map((id) => `span:id="${id}"`).join(' || ');
  const request: DataQueryRequest<TempoSpanQuery> = {
    requestId: `span-trace-lookup-${from}-${to}`,
    targets: [
      {
        refId: 'A',
        queryType: 'traceql',
        tableType: 'spans',
        query: `{${conditions}}`,
        limit: spanIds.length,
        datasource: { type: 'tempo', uid: tempoDataSourceUid },
      },
    ],
    range: {
      from: dateTime(from),
      to: dateTime(to),
      raw: { from: dateTime(from), to: dateTime(to) },
    },
    interval: '1s',
    intervalMs: 1000,
    maxDataPoints: spanIds.length,
    scopedVars: {},
    timezone: 'browser',
    app: 'explore',
    startTime: Date.now(),
  };
  const result = dataSource.query(request) as Observable<DataQueryResponse> | Promise<DataQueryResponse>;
  const response = result instanceof Promise ? await result : await lastValueFrom(result);
  return parseTraceInfo(response, spanIds);
}

function parseTraceInfo(response: DataQueryResponse, spanIds: string[]): Record<string, TraceInfo | null> {
  const traceInfoBySpanId: Record<string, TraceInfo | null> = {};

  for (const frame of response.data ?? []) {
    addFrameTraceInfo(frame, traceInfoBySpanId);
  }

  for (const spanId of spanIds) {
    traceInfoBySpanId[spanId] ??= null;
  }

  return traceInfoBySpanId;
}

function addFrameTraceInfo(frame: DataFrame, traceInfoBySpanId: Record<string, TraceInfo | null>) {
  const traceIdField = frame.fields.find((field: Field) => field.name === 'traceIdHidden');
  const spanIdField = frame.fields.find((field: Field) => field.name === 'spanID');
  const spanNameField = frame.fields.find((field: Field) => field.name === 'name');
  const durationField = frame.fields.find((field: Field) => field.name === 'duration');

  if (!traceIdField || !spanIdField) {
    return;
  }

  for (let index = 0; index < frame.length; index++) {
    const spanId = spanIdField.values[index];
    const traceId = traceIdField.values[index];
    if (spanId && traceId) {
      traceInfoBySpanId[spanId] = {
        traceId,
        spanName: spanNameField?.values[index],
        duration: durationField?.values[index],
      };
    }
  }
}
