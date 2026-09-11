import { ExemplarRow } from '../infrastructure/buildHeatmapDataFrames';
import { getDisplayedExemplarRows } from './getDisplayedExemplarRows';
import { SpanTimestamp } from './mergeSpanTraceWindows';

/**
 * Returns the exemplar rows visible on the given table page, after applying the
 * current span selection filter (if any).
 */
export function getVisiblePageRows(
  rows: ExemplarRow[],
  selectedSpanId: string | undefined,
  selectedTimestamp: number | undefined,
  page: number,
  pageSize: number
): ExemplarRow[] {
  const displayedRows = getDisplayedExemplarRows(rows, selectedSpanId, selectedTimestamp);
  return displayedRows.slice(page * pageSize, (page + 1) * pageSize);
}

/**
 * Returns the first (spanId, timestamp) pair per unique span ID among the given
 * rows, preserving row order. Used to scope Tempo trace lookups to only the
 * spans currently visible in the table, deduplicating span IDs that appear at
 * multiple exemplar timestamps.
 */
export function uniqueSpanTimestamps(rows: ExemplarRow[]): SpanTimestamp[] {
  const timestampBySpanId = new Map<string, number>();
  for (const row of rows) {
    if (row.spanId && !timestampBySpanId.has(row.spanId)) {
      timestampBySpanId.set(row.spanId, row.timestamp);
    }
  }
  return [...timestampBySpanId.entries()].map(([spanId, timestamp]) => ({ spanId, timestamp }));
}
