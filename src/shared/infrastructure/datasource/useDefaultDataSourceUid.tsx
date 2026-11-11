import { DataSourceUidState } from './DataSourceUidContext';
import { getMissingUidError } from './getMissingUidError';
import { SelectedDataSourceUidInput, useSelectDefaultDataSourceUid } from './useSelectDefaultDataSourceUid';

export function useDefaultDataSourceUid({ selectedUid }: SelectedDataSourceUidInput = {}): DataSourceUidState {
  const { value, error, loading } = useSelectDefaultDataSourceUid({ selectedUid });
  const needsDefault = selectedUid === undefined;
  const uid = selectedUid ?? value;
  const isLoading = needsDefault && loading;
  const dataSourceError = needsDefault ? error : undefined;

  if (!isLoading && !uid) {
    return { uid: undefined, loading: false, error: dataSourceError ?? getMissingUidError() };
  }

  return { uid, loading: isLoading, error: dataSourceError };
}
