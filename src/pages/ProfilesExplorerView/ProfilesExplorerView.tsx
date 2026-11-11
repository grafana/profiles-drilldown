import { UrlSyncContextProvider } from '@grafana/scenes';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { useReportPageInitialized } from '@shared/infrastructure/tracking/useReportPageInitialized';
import React, { useState } from 'react';

import { SceneProfilesExplorer } from './components/SceneProfilesExplorer/SceneProfilesExplorer';

export default function ProfilesExplorerView() {
  const initialDS = useDataSourceUid();
  const [sceneProfilesExplorer] = useState(() => new SceneProfilesExplorer({ initialDS }));
  useReportPageInitialized('explore');

  return (
    <UrlSyncContextProvider scene={sceneProfilesExplorer} updateUrlOnInit={false} createBrowserHistorySteps={true}>
      <sceneProfilesExplorer.Component model={sceneProfilesExplorer} />
    </UrlSyncContextProvider>
  );
}
