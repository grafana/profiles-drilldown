import { css } from '@emotion/css';
import { GrafanaTheme2, PageLayoutType } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { ErrorBoundary, useStyles2 } from '@grafana/ui';
import { OpenFeaturePluginScope } from '@shared/infrastructure/featureFlags/openFeature';
import { queryClient } from '@shared/infrastructure/react-query/queryClient';
import { initFaro } from '@shared/infrastructure/tracking/faro/faro';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

import { Onboarding } from './components/Onboarding/Onboarding';
import { Routes } from './Routes';
import { ErrorPage } from './ui/ErrorPage';

initFaro();

export function App() {
  const styles = useStyles2(getStyles);
  const [error, setError] = useState<Error>();

  if (error) {
    return <ErrorPage error={error} />;
  }

  return (
    <ErrorBoundary onError={setError}>
      {() => (
        <OpenFeaturePluginScope>
          <QueryClientProvider client={queryClient}>
            <Onboarding>
              <div className={styles.pageContainer}>
                <PluginPage layout={PageLayoutType.Custom}>
                  <div className={`pyroscope-app ${styles.content}`}>
                    <Routes />
                  </div>
                </PluginPage>
              </div>
            </Onboarding>
          </QueryClientProvider>
        </OpenFeaturePluginScope>
      )}
    </ErrorBoundary>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  pageContainer: css`
    display: flex;
    flex-direction: column;
    flex-basis: 100%;
    flex-grow: 1;
  `,
  content: css`
    padding: 0 ${theme.spacing(2)} ${theme.spacing(2)} ${theme.spacing(2)};
  `,
});
