export interface TempoDataSourceOption {
  uid: string;
  name: string;
  isDefault?: boolean;
  tracesToProfilesDataSourceUid?: string;
}

export function selectTempoDataSourceUid(
  tempoDataSources: TempoDataSourceOption[],
  currentTempoDataSourceUid?: string,
  profilesDataSourceUid?: string
): string | undefined {
  if (tempoDataSources.some(({ uid }) => uid === currentTempoDataSourceUid)) {
    return currentTempoDataSourceUid;
  }

  const linkedTempoDataSources = tempoDataSources.filter(
    ({ tracesToProfilesDataSourceUid }) => tracesToProfilesDataSourceUid === profilesDataSourceUid
  );
  if (linkedTempoDataSources.length === 1) {
    return linkedTempoDataSources[0].uid;
  }

  const defaultTempoDataSourceUid = tempoDataSources.find(({ isDefault }) => isDefault)?.uid;
  if (defaultTempoDataSourceUid) {
    return defaultTempoDataSourceUid;
  }

  return tempoDataSources.length === 1 ? tempoDataSources[0].uid : undefined;
}
