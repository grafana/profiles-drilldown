export function buildSpanTimeRange(timestamp: number) {
  return {
    from: new Date(timestamp).toISOString(),
    to: new Date(timestamp + 1).toISOString(),
  };
}
