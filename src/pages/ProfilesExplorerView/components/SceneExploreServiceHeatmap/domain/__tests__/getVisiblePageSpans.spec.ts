import { ExemplarRow } from '../../infrastructure/buildHeatmapDataFrames';
import { getVisiblePageRows, uniqueSpanTimestamps } from '../getVisiblePageSpans';

function buildRow(profileId: string, spanId: string | undefined, timestamp: number): ExemplarRow {
  return { profileId, spanId, timestamp, value: 1 };
}

const rows: ExemplarRow[] = [
  buildRow('profile-1', 'span-a', 1),
  buildRow('profile-2', 'span-b', 2),
  buildRow('profile-3', 'span-c', 3),
  buildRow('profile-4', 'span-d', 4),
  buildRow('profile-5', 'span-e', 5),
  buildRow('profile-6', 'span-f', 6),
];

describe('getVisiblePageRows', () => {
  it('returns only the rows for the requested page', () => {
    expect(getVisiblePageRows(rows, undefined, undefined, 0, 5)).toEqual(rows.slice(0, 5));
    expect(getVisiblePageRows(rows, undefined, undefined, 1, 5)).toEqual(rows.slice(5, 6));
  });

  it('returns an empty array for a page past the end of the data', () => {
    expect(getVisiblePageRows(rows, undefined, undefined, 2, 5)).toEqual([]);
  });

  it('applies the span selection filter before paginating', () => {
    const selectedRows: ExemplarRow[] = [
      buildRow('profile-1', 'span-a', 1),
      buildRow('profile-2', 'span-a', 2),
      buildRow('profile-3', 'span-b', 3),
    ];

    expect(getVisiblePageRows(selectedRows, 'span-a', undefined, 0, 5)).toEqual([
      buildRow('profile-1', 'span-a', 1),
      buildRow('profile-2', 'span-a', 2),
    ]);
  });
});

describe('uniqueSpanTimestamps', () => {
  it('returns one entry per unique span ID, keeping the first timestamp seen', () => {
    const withDuplicates: ExemplarRow[] = [
      buildRow('profile-1', 'span-a', 1),
      buildRow('profile-2', 'span-a', 2),
      buildRow('profile-3', 'span-b', 3),
    ];

    expect(uniqueSpanTimestamps(withDuplicates)).toEqual([
      { spanId: 'span-a', timestamp: 1 },
      { spanId: 'span-b', timestamp: 3 },
    ]);
  });

  it('ignores rows without a span ID', () => {
    const withoutSpan: ExemplarRow[] = [buildRow('profile-1', undefined, 1)];

    expect(uniqueSpanTimestamps(withoutSpan)).toEqual([]);
  });

  it('returns an empty array for no rows', () => {
    expect(uniqueSpanTimestamps([])).toEqual([]);
  });
});
