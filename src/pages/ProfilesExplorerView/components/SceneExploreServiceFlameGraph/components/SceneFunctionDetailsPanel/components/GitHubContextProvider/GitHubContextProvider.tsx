import { displayError } from '@shared/domain/displayStatus';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import React, { useCallback, useEffect, useState } from 'react';
import { DataSourceProxyClientBuilder } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClientBuilder';

import { VcsClient } from '../../infrastructure/VcsClient';
import { generateNonce } from './domain/generateNonce';
import { githubLogin } from './domain/githubLogin';
import { useGithubSessionCookie } from './domain/useGithubSessionCookie';
import { usePollGitHubPopup } from './domain/usePollGitHubPopup';
import { DEFAULT_GITHUB_CONTEXT, GitHubContext } from './GitHubContext';
import { PrivateVcsClient } from './infrastructure/PrivateVcsClient';

type GitHubContextProviderProps = {
  children: React.ReactNode;
};

export const nonce = generateNonce();

// Keep the data source UID in session storage to reuse it if the page is refreshed
const LOCAL_STORAGE_GITHUB_INTEGRATION_DATASOURCE_UID = `grafana-pyroscope-app.gitHubIntegration.dataSourceUid`;

export function GitHubContextProvider({ children }: GitHubContextProviderProps) {
  const dataSourceUid = useDataSourceUid();
  const vcsClient = DataSourceProxyClientBuilder.build(dataSourceUid, VcsClient);
  const privateVcsClient = DataSourceProxyClientBuilder.build(dataSourceUid, PrivateVcsClient);

  const [isLoginInProgress, setIsLoginInProgress] = useState(DEFAULT_GITHUB_CONTEXT.isLoginInProgress);
  const [sessionCookie, setSessionCookie] = useGithubSessionCookie();
  const [externalWindow, setExternalWindow] = useState<Window | null>();

  useEffect(() => {
    const gitHubIntegrationDataSourceUid = localStorage.getItem(LOCAL_STORAGE_GITHUB_INTEGRATION_DATASOURCE_UID);
    if (gitHubIntegrationDataSourceUid !== dataSourceUid) {
      setSessionCookie('');
      localStorage.setItem(LOCAL_STORAGE_GITHUB_INTEGRATION_DATASOURCE_UID, dataSourceUid || '');
    }
  }, [dataSourceUid]); // eslint-disable-line react-hooks/exhaustive-deps

  usePollGitHubPopup({ vcsClient, externalWindow, setExternalWindow, setSessionCookie, nonce });

  // Check if login window is open and toggle the login state accordingly. For
  // example, if the login window IS open and the login state is not
  // "in progress", then update the state to be "in progress".
  const newIsLoginInProgress = externalWindow ? !externalWindow.closed : false;
  if (newIsLoginInProgress !== isLoginInProgress) {
    setIsLoginInProgress(newIsLoginInProgress);
  }

  const login = useCallback(async () => {
    try {
      await githubLogin(vcsClient, privateVcsClient, sessionCookie, externalWindow, setExternalWindow);
    } catch (error) {
      displayError(error as Error, ['Failed to login to GitHub', (error as Error).message]);
    }
  }, [vcsClient, privateVcsClient, sessionCookie, externalWindow]);

  return (
    <GitHubContext.Provider
      value={{
        isLoginInProgress,
        isLoggedIn: Boolean(sessionCookie && !sessionCookie.isUserTokenExpired()),
        isSessionExpired: Boolean(sessionCookie?.isUserTokenExpired()),
        login,
        logout: () => setSessionCookie(''),
      }}
    >
      {children}
    </GitHubContext.Provider>
  );
}
