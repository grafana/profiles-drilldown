import type { SuppliedSandwich } from '@grafana/flamegraph';
import { RefreshEvent } from '@grafana/runtime';
import type { SceneObject } from '@grafana/scenes';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { SandwichApiClient, sandwichRequest, type SandwichQuery } from './SandwichApiClient';

export function useSandwich({
  dataSourceUid,
  enabled,
  refreshSource,
  ...params
}: Omit<SandwichQuery, 'function'> & {
  function: string | undefined;
  dataSourceUid: string;
  enabled: boolean;
  refreshSource?: SceneObject;
}) {
  const client = useMemo(() => new SandwichApiClient({ dataSourceUid }), [dataSourceUid]);
  const fn = params.function;
  const request = fn ? sandwichRequest({ ...params, function: fn }) : undefined;
  const query = useQuery({
    queryKey: ['sandwich', dataSourceUid, request],
    queryFn: ({ signal }) => client.query(request!, signal),
    enabled: enabled && Boolean(request),
    retry: false,
  });
  const { refetch } = query;

  useEffect(() => {
    if (!enabled || !refreshSource || !fn) {
      return;
    }
    // Fixed time ranges keep the same query key when the user clicks Refresh.
    const subscription = refreshSource.subscribeToEvent(RefreshEvent, () => {
      void refetch();
    });
    return () => subscription.unsubscribe();
  }, [enabled, refreshSource, fn, refetch]);

  return {
    // A server without the format, or a failed query, leaves the flame graph to compute the
    // sandwich from the tree it has. That is incomplete, but it is what shipped before this.
    sandwich: (query.data ?? undefined) as SuppliedSandwich | undefined,
    isFetching: query.isFetching,
    error: query.error,
  };
}
