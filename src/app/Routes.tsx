import React from 'react';
import { Navigate, Routes as ReactRouterRoutes, Route } from 'react-router-dom';

import { PLUGIN_BASE_URL, ROUTES } from '../constants';
import AdHocView from '../pages/AdHocView/AdHocView';
import GitHubCallback from '../pages/ProfilesExplorerView/components/SceneExploreServiceFlameGraph/components/SceneFunctionDetailsPanel/ui/GitHubCallbackView';
import ProfilesExplorerView from '../pages/ProfilesExplorerView/ProfilesExplorerView';
import RecordingRulesView from '../pages/RecordingRulesView/RecordingRulesView';
import SettingsView from '../pages/SettingsView/SettingsView';
import { WithDataSourceUid } from './WithDataSourceUid';

export function Routes() {
  return (
    <ReactRouterRoutes>
      <Route element={<WithDataSourceUid />}>
        <Route path={ROUTES.EXPLORE} element={<ProfilesExplorerView />} />
        <Route path={ROUTES.ADHOC} element={<AdHocView />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsView />} />
        <Route path={ROUTES.RECORDING_RULES} element={<RecordingRulesView />} />
      </Route>
      <Route path={ROUTES.GITHUB_CALLBACK} element={<GitHubCallback />} />
      {/* Default Route */}
      <Route path="/*" element={<Navigate to={`${PLUGIN_BASE_URL}${ROUTES.EXPLORE}`} replace />} />
    </ReactRouterRoutes>
  );
}
