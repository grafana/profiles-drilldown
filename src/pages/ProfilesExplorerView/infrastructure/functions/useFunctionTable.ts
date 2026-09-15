import type { FunctionTable } from '@grafana/flamegraph';
import { RefreshEvent } from '@grafana/runtime';
import type { SceneObject } from '@grafana/scenes';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { FunctionTableApiClient, FunctionTableQuery, functionTableRequest } from './FunctionTableApiClient';

const emptyTable: FunctionTable = { total: 0, rows: [] };
const emptyDiffTable: FunctionTable = { total: 0, totalRight: 0, rows: [] };

export function useFunctionTable({
  dataSourceUid,
  enabled,
  refreshSource,
  ...params
}: FunctionTableQuery & { dataSourceUid: string; enabled: boolean; refreshSource?: SceneObject }) {
  const client = useMemo(() => new FunctionTableApiClient({ dataSourceUid }), [dataSourceUid]);
  const request = functionTableRequest(params);
  const query = useQuery({
    queryKey: ['function-table', dataSourceUid, request],
    queryFn: ({ signal }) => client.query(request, signal),
    enabled,
    retry: false,
  });
  const { refetch } = query;
  useEffect(() => {
    if (!enabled || !refreshSource) {
      return;
    }
    // Fixed time ranges keep the same query key when the user clicks Refresh.
    const subscription = refreshSource.subscribeToEvent(RefreshEvent, () => {
      void refetch();
    });
    return () => subscription.unsubscribe();
  }, [enabled, refreshSource, refetch]);

  return {
    // A missing API uses the legacy table. While loading or on an actual query
    // failure, an empty supplied table prevents showing inexact tree-derived rows.
    functionTable: query.data === null ? undefined : query.data ?? (params.right ? emptyDiffTable : emptyTable),
    isFetching: query.isFetching,
    error: query.error,
  };
}
