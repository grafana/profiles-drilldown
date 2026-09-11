export function getDisplayedExemplarRows<T extends { spanId?: string; timestamp: number }>(
  rows: T[],
  selectedSpanId?: string,
  selectedTimestamp?: number
): T[] {
  if (!selectedSpanId) {
    return rows;
  }

  return rows.filter(
    (row) =>
      row.spanId === selectedSpanId && (selectedTimestamp === undefined || row.timestamp === selectedTimestamp)
  );
}
