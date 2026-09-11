import { getDisplayedExemplarRows } from '../domain/getDisplayedExemplarRows';
import { selectTempoDataSourceUid } from '../domain/selectTempoDataSourceUid';

describe('selectTempoDataSourceUid', () => {
  const datasources = [
    { uid: 'tempo-a', name: 'Tempo A' },
    { uid: 'tempo-b', name: 'Tempo B', isDefault: true },
  ];

  it('keeps the current data source when it is still available', () => {
    expect(selectTempoDataSourceUid(datasources, 'tempo-a')).toBe('tempo-a');
  });

  it('uses the Tempo data source linked to the current profiles data source', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'tempo-a', name: 'Tempo A', tracesToProfilesDataSourceUid: 'profiles-a' },
          { uid: 'tempo-b', name: 'Tempo B', isDefault: true, tracesToProfilesDataSourceUid: 'profiles-b' },
        ],
        undefined,
        'profiles-a'
      )
    ).toBe('tempo-a');
  });

  it('keeps an explicit selection instead of replacing it with the linked data source', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'tempo-a', name: 'Tempo A' },
          { uid: 'tempo-b', name: 'Tempo B', tracesToProfilesDataSourceUid: 'profiles-a' },
        ],
        'tempo-a',
        'profiles-a'
      )
    ).toBe('tempo-a');
  });

  it('does not choose arbitrarily when multiple Tempo data sources link to the current profiles data source', () => {
    expect(
      selectTempoDataSourceUid(
        [
          { uid: 'tempo-a', name: 'Tempo A', tracesToProfilesDataSourceUid: 'profiles-a' },
          { uid: 'tempo-b', name: 'Tempo B', tracesToProfilesDataSourceUid: 'profiles-a' },
        ],
        undefined,
        'profiles-a'
      )
    ).toBeUndefined();
  });

  it('uses the default data source when the current selection is unavailable', () => {
    expect(selectTempoDataSourceUid(datasources, 'missing')).toBe('tempo-b');
  });

  it('automatically selects the only Tempo data source', () => {
    expect(selectTempoDataSourceUid([{ uid: 'tempo-a', name: 'Tempo A' }])).toBe('tempo-a');
  });

  it('requires a selection when multiple data sources have no default', () => {
    expect(
      selectTempoDataSourceUid([
        { uid: 'tempo-a', name: 'Tempo A' },
        { uid: 'tempo-b', name: 'Tempo B' },
      ])
    ).toBeUndefined();
  });
});

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
