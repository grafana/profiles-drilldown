export interface SpanTimestamp {
  spanId: string;
  timestamp: number;
}

export interface SpanTraceWindow {
  spanIds: string[];
  from: number;
  to: number;
}

// TraceQL filters by span start time, while an exemplar marks the profile sample
// time. Use a longer lookback for spans that started before the sample window.
export const TRACE_LOOKUP_PADDING_BEFORE_MS = 5 * 60_000;
export const TRACE_LOOKUP_PADDING_AFTER_MS = 30_000;

/**
 * Groups span IDs into narrow, non-overlapping time windows so that Tempo trace
 * lookups can be scoped to a tight range around each exemplar instead of the
 * full dashboard time range.
 *
 * Each span gets a `[timestamp - paddingBeforeMs, timestamp + paddingAfterMs]`
 * window. Spans whose windows overlap (or touch) are merged into a single group
 * sharing one `from`/`to` range, so they can be queried together in one request.
 */
export function mergeSpanTraceWindows(
  spans: SpanTimestamp[],
  paddingBeforeMs = TRACE_LOOKUP_PADDING_BEFORE_MS,
  paddingAfterMs = TRACE_LOOKUP_PADDING_AFTER_MS
): SpanTraceWindow[] {
  const firstTimestampBySpanId = new Map<string, number>();
  for (const { spanId, timestamp } of spans) {
    if (!firstTimestampBySpanId.has(spanId)) {
      firstTimestampBySpanId.set(spanId, timestamp);
    }
  }

  const uniqueSpans = [...firstTimestampBySpanId.entries()]
    .map(([spanId, timestamp]) => ({ spanId, from: timestamp - paddingBeforeMs, to: timestamp + paddingAfterMs }))
    .sort((a, b) => a.from - b.from);

  const windows: SpanTraceWindow[] = [];

  for (const span of uniqueSpans) {
    const current = windows[windows.length - 1];

    if (current && span.from <= current.to) {
      current.spanIds.push(span.spanId);
      current.to = Math.max(current.to, span.to);
      continue;
    }

    windows.push({ spanIds: [span.spanId], from: span.from, to: span.to });
  }

  return windows;
}
