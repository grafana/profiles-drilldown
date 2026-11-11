import { locationService } from '@grafana/runtime';
import { SceneTimeRange, UrlSyncContextProvider } from '@grafana/scenes';
import { DataSourceUidFallback } from '@shared/infrastructure/datasource/DataSourceUidFallback';
import { useDefaultDataSourceUid } from '@shared/infrastructure/datasource/useDefaultDataSourceUid';
import { queryClient } from '@shared/infrastructure/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { SceneProfilesExplorer } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/SceneProfilesExplorer';

import { EmbeddedProfilesExplorationState } from '../types';
import { initialServiceNames } from './initialServiceNames';

interface EmbeddedSceneProps extends EmbeddedProfilesExplorationState {
  initialDS: string;
}

export function buildProfilesExplorationFromState({
  initialTimeRange,
  onTimeRangeChange,
  initialFilters,
  initialAllServicesFilter,
  initialExplorationType,
  initialDS,
}: EmbeddedSceneProps) {
  const $timeRange = new SceneTimeRange({
    value: initialTimeRange,
    from: initialTimeRange.raw.from.toString(),
    to: initialTimeRange.raw.to.toString(),
  });

  $timeRange.subscribeToState((state) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(state.value);
    }
  });

  const exploration = new SceneProfilesExplorer({
    $timeRange,
    isEmbedded: true,
    initialExplorationType,
    initialFilters: initialFilters ? initialFilters.map((filter) => ({ ...filter })) : undefined,
    initialAllServicesFilter: initialAllServicesFilter?.map((filter) => ({ ...filter })),
    initialDS,
  });

  // Embedded inputs are authoritative when switching entities. Do not restore
  // filters from the previous embedded scene over the caller's new filters.
  if (initialAllServicesFilter !== undefined || initialFilters !== undefined) {
    const encodeFilter = (filter: NonNullable<typeof initialFilters>[number]) =>
      [filter.key, filter.operator, filter.value]
        .map((part) => part.replace(/\|/g, '__gfp__').replace(/,/g, '__gfc__').replace(/#/g, '__gfh__'))
        .join('|');
    const nonServiceFilters = initialFilters?.filter((filter) => filter.key !== 'service_name');
    const serviceNames = initialServiceNames([...(initialFilters ?? []), ...(initialAllServicesFilter ?? [])]);
    const currentService = new URLSearchParams(locationService.getLocation().search).get('pd-var-serviceName');
    locationService.partial(
      {
        'pd-var-filtersAllServices': initialAllServicesFilter?.map(encodeFilter) ?? null,
        'pd-var-filters': nonServiceFilters?.length ? nonServiceFilters.map(encodeFilter) : null,
        ...(currentService !== null && serviceNames.includes(currentService)
          ? {}
          : { 'pd-var-serviceName': serviceNames[0] ?? null }),
      },
      true
    );
  }
  // The namespaced UrlSyncContextProvider owns the initial URL sync. A manual
  // sync here would consume embedded defaults before the provider initializes.

  return exploration;
}

function EmbeddedScene(props: EmbeddedSceneProps) {
  const [exploration] = useState(() => buildProfilesExplorationFromState(props));

  return (
    <UrlSyncContextProvider namespace="pd" scene={exploration} updateUrlOnInit={false} createBrowserHistorySteps={true}>
      <QueryClientProvider client={queryClient}>
        <exploration.Component model={exploration} />
      </QueryClientProvider>
    </UrlSyncContextProvider>
  );
}

export default function EmbeddedProfilesExploration(props: EmbeddedProfilesExplorationState) {
  const dataSourceState = useDefaultDataSourceUid({ selectedUid: props.initialDS });

  if (!dataSourceState.uid) {
    return <DataSourceUidFallback dataSourceState={dataSourceState} />;
  }

  return <EmbeddedScene {...props} initialDS={dataSourceState.uid} />;
}
