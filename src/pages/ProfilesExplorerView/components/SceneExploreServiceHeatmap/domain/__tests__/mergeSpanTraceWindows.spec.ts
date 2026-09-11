import { mergeSpanTraceWindows } from '../mergeSpanTraceWindows';

describe('mergeSpanTraceWindows', () => {
  it('creates one window per span padded by the given duration', () => {
    const result = mergeSpanTraceWindows([{ spanId: 'span-a', timestamp: 1_000_000 }], 30_000, 30_000);

    expect(result).toEqual([{ spanIds: ['span-a'], from: 970_000, to: 1_030_000 }]);
  });

  it('uses a five-minute lookback and a 30-second lookahead by default', () => {
    const result = mergeSpanTraceWindows([{ spanId: 'span-a', timestamp: 1_000_000 }]);

    expect(result).toEqual([{ spanIds: ['span-a'], from: 700_000, to: 1_030_000 }]);
  });

  it('merges spans whose padded windows overlap', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 1_020_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([{ spanIds: ['span-a', 'span-b'], from: 970_000, to: 1_050_000 }]);
  });

  it('merges spans whose padded windows only touch at the boundary', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 1_060_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([{ spanIds: ['span-a', 'span-b'], from: 970_000, to: 1_090_000 }]);
  });

  it('keeps spans separate when their padded windows do not overlap', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 1_100_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([
      { spanIds: ['span-a'], from: 970_000, to: 1_030_000 },
      { spanIds: ['span-b'], from: 1_070_000, to: 1_130_000 },
    ]);
  });

  it('chains merges across more than two overlapping spans', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-b', timestamp: 1_020_000 },
        { spanId: 'span-c', timestamp: 1_040_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([{ spanIds: ['span-a', 'span-b', 'span-c'], from: 970_000, to: 1_070_000 }]);
  });

  it('sorts unordered input before merging', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-b', timestamp: 1_020_000 },
        { spanId: 'span-a', timestamp: 1_000_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([{ spanIds: ['span-a', 'span-b'], from: 970_000, to: 1_050_000 }]);
  });

  it('deduplicates repeated span IDs, keeping the first timestamp seen', () => {
    const result = mergeSpanTraceWindows(
      [
        { spanId: 'span-a', timestamp: 1_000_000 },
        { spanId: 'span-a', timestamp: 5_000_000 },
      ],
      30_000,
      30_000
    );

    expect(result).toEqual([{ spanIds: ['span-a'], from: 970_000, to: 1_030_000 }]);
  });

  it('returns an empty array for no spans', () => {
    expect(mergeSpanTraceWindows([])).toEqual([]);
  });
});
