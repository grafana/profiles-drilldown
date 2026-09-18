import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { Button, Icon, IconButton, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';

import { useGitHubContext } from './GitHubContextProvider/useGitHubContext';

const getStyles = (theme: GrafanaTheme2) => ({
  ellipsis: css`
    color: ${theme.colors.text.link};
    text-overflow: ellipsis;
    overflow: hidden;
    direction: rtl;
    white-space: nowrap;
  `,
});

type GitHubRepositoryProps = {
  enableIntegration: boolean;
  repository: {
    name: string;
    commitUrl: string;
    commitName: string;
  };
};

export const GitHubRepository = ({ enableIntegration, repository }: GitHubRepositoryProps) => {
  const styles = useStyles2(getStyles);
  const { isLoginInProgress, isLoggedIn, login, logout } = useGitHubContext();

  if (!enableIntegration) {
    return <>-</>;
  }

  // enableIntegration=true
  if (isLoginInProgress) {
    return (
      <>
        <Spinner />
        <span>
          <Trans i18nKey="function-details.github.connecting">Connecting to GitHub...</Trans>
        </span>
      </>
    );
  }

  // enableIntegration=true, isLoginInProgress=false
  if (!isLoggedIn) {
    return (
      <Button
        icon="github"
        variant="primary"
        onClick={login}
        tooltip={t(
          'function-details.github.connect-tooltip',
          'Once connected, the GitHub code will be accessible only from this browser session.'
        )}
        tooltipPlacement="top"
      >
        <Trans i18nKey="function-details.github.connect-button" values={{ name: repository.name }}>
          Connect to {{ name: repository.name } as any}
        </Trans>
      </Button>
    );
  }

  // enableIntegration=true, isLoginInProgress=false, isLoggedIn=true
  return (
    <>
      <Icon name="github" size="lg" />
      <a
        className={styles.ellipsis}
        href={repository.commitUrl}
        target="_blank"
        rel="noreferrer"
        title={t('function-details.github.view-commit', 'View commit')}
      >
        <Icon name="external-link-alt" />
        &nbsp;
        {repository.commitName}
      </a>
      <IconButton
        name="signout"
        onClick={() => logout()}
        aria-label={t('function-details.github.disconnect', 'Disconnect from GitHub')}
        title={t('function-details.github.disconnect', 'Disconnect from GitHub')}
      />
    </>
  );
};
