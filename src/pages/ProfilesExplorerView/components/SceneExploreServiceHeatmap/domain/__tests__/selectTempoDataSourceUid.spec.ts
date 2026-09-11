import { selectTempoDataSourceUid } from '../selectTempoDataSourceUid';

describe('selectTempoDataSourceUid', () => {
  const tempoDataSources = [
    { uid: 'tempo-a', name: 'Tempo A', tracesToProfilesDataSourceUid: 'profiles-a' },
    { uid: 'tempo-b', name: 'Tempo B', tracesToProfilesDataSourceUid: 'profiles-b' },
  ];

  it('selects the Tempo datasource linked to the current Pyroscope datasource', () => {
    expect(selectTempoDataSourceUid(tempoDataSources, undefined, 'profiles-b')).toBe('tempo-b');
  });
});
