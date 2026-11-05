import { getDisplayedExemplarRows } from '../domain/getDisplayedExemplarRows';

describe('getDisplayedExemplarRows', () => {
  const rows = [
    { profileId: 'profile-1', spanId: 'span-a', timestamp: 1 },
    { profileId: 'profile-2', spanId: 'span-a', timestamp: 2 },
    { profileId: 'profile-3', spanId: 'span-a', timestamp: 2 },
    { profileId: 'profile-4', spanId: 'span-b', timestamp: 3 },
  ];

  it('returns all rows without a selection', () => {
    expect(getDisplayedExemplarRows(rows)).toBe(rows);
  });

  it('returns every exemplar matching the selected span ID and timestamp', () => {
    expect(getDisplayedExemplarRows(rows, 'span-a', 2)).toEqual([
      { profileId: 'profile-2', spanId: 'span-a', timestamp: 2 },
      { profileId: 'profile-3', spanId: 'span-a', timestamp: 2 },
    ]);
  });
});
