import { t, Trans } from '@grafana/i18n';
import { UrlSyncContextProvider } from '@grafana/scenes';
import { Alert, Icon } from '@grafana/ui';
import { useReportPageInitialized } from '@shared/infrastructure/tracking/useReportPageInitialized';
import React from 'react';

import { SceneProfilesExplorer } from './components/SceneProfilesExplorer/SceneProfilesExplorer';
import { useProfilesExploration } from './domain/useProfilesExploration';

export default function ProfilesExplorerView() {
  const { scene, error } = useProfilesExploration({
    createScene: (initialDS) => new SceneProfilesExplorer({ initialDS }),
  });
  useReportPageInitialized('explore');

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
        <Trans i18nKey="pages.ProfilesExplorerView.loading">Loading profiling data sources... </Trans>
        <Icon name="fa fa-spinner" />
      </>
    );
  }

  return (
    <UrlSyncContextProvider scene={scene} updateUrlOnInit={false} createBrowserHistorySteps={true}>
      <scene.Component model={scene} />
    </UrlSyncContextProvider>
  );
}
