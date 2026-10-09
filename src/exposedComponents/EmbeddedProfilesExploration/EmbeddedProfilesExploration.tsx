import { t, Trans } from '@grafana/i18n';
import { SceneTimeRange, sceneUtils, UrlSyncContextProvider } from '@grafana/scenes';
import { Alert, Icon } from '@grafana/ui';
import { queryClient } from '@shared/infrastructure/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SceneProfilesExplorer } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/SceneProfilesExplorer';
import { useProfilesExploration } from 'src/pages/ProfilesExplorerView/domain/useProfilesExploration';

import { EmbeddedProfilesExplorationState } from '../types';

function buildProfilesExplorationFromState({
  initialTimeRange,
  onTimeRangeChange,
  initialFilters,
  initialDS,
}: EmbeddedProfilesExplorationState) {
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
    initialFilters: initialFilters ? initialFilters.map((filter) => ({ ...filter })) : undefined,
    initialDS,
  });

  const params = new URLSearchParams(window.location.search);
  sceneUtils.syncStateFromSearchParams(exploration, params);

  return exploration;
}

export default function EmbeddedProfilesExploration(props: EmbeddedProfilesExplorationState) {
  const { scene, error } = useProfilesExploration({
    initialDS: props.initialDS,
    createScene: (initialDS) => buildProfilesExplorationFromState({ ...props, initialDS }),
  });

  if (error) {
    return (
      <Alert title={t('explorer.initialization-error', 'Failed to initialize profiles exploration')} severity="error">
        {error.message}
      </Alert>
    );
  }

  if (!scene) {
    return (
      <>
        <Trans i18nKey="exposedComponents.EmbeddedProfilesExploration.loading">
          Loading profiling data sources...{' '}
        </Trans>
        <Icon name="fa fa-spinner" />
      </>
    );
  }

  return (
    <UrlSyncContextProvider namespace="pd" scene={scene} updateUrlOnInit={false} createBrowserHistorySteps={true}>
      <QueryClientProvider client={queryClient}>
        <scene.Component model={scene} />
      </QueryClientProvider>
    </UrlSyncContextProvider>
  );
}
