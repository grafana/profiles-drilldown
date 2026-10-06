import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { useOnboardingModal } from '../domain/useOnboardingModal';
import { StyledLink } from './StyledLink';

const getStyles = (theme: GrafanaTheme2) => {
  const numberColor = theme.colors.accent?.main ?? theme.visualization.getColorByName('orange');

  return {
    onboardingRow: css`
      background: ${theme.colors.background.secondary};
      display: flex;
      margin-top: 16px;
      gap: 20px;
      padding: 20px;
      margin-bottom: 2.5rem;
    `,
    onboardingPanel: css`
      flex: 1;
      display: flex;
      flex-flow: column wrap;
      -webkit-box-align: center;
      align-items: center;
      margin-top: 16px;
      text-align: center;
    `,
    onboardingPanelHeader: css`
      line-height: 1.5;
      margin-bottom: 1em;
    `,
    onboardingPanelNumber: css`
      color: ${numberColor};
      text-align: center;
      display: grid;
      place-items: center;
      background-image: linear-gradient(135deg, currentcolor, 75%, ${theme.colors.border.medium});
      border-radius: 100%;
      font-size: 2.5rem;
      line-height: 5rem;
      height: 5rem;
      width: 5rem;
      margin-bottom: 1em;
    `,
    color2: css`
      color: ${theme.visualization.getColorByName('purple')};
    `,
    color3: css`
      color: ${theme.visualization.getColorByName('blue')};
    `,
    onboardingPanelNumberSpan: css`
      color: ${theme.colors.getContrastText(numberColor)};
    `,
    onboardingPanelDescription: css`
      text-align: justify;
      text-align: center;
      line-height: 1.66;
      margin-top: 0;
    `,
  };
};

export function HowToGetStarted() {
  const styles = useStyles2(getStyles);
  const { data } = useOnboardingModal();

  return (
    <div data-testid="how-to-get-started">
      <h3>
        <Trans i18nKey="onboarding.modal.how-to-get-started">How to Get Started</Trans>
      </h3>
      <div className={styles.onboardingRow}>
        {data.isCloud ? (
          <>
            <div className={styles.onboardingPanel}>
              <div className={styles.onboardingPanelNumber}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>1</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.cloud.step1.title">Add Profiling to Your Application</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.cloud.step1.description">
                  Use{' '}
                  <StyledLink href="https://grafana.com/docs/pyroscope/latest/configure-client/grafana-alloy/">
                    Grafana Alloy
                  </StyledLink>{' '}
                  or{' '}
                  <StyledLink href="https://grafana.com/docs/pyroscope/next/configure-client/language-sdks/">
                    Pyroscope SDKs
                  </StyledLink>{' '}
                  to push profiles from your applications to Grafana Cloud.
                </Trans>
              </p>
            </div>
            <div className={styles.onboardingPanel}>
              <div className={cx(styles.onboardingPanelNumber, styles.color2)}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>2</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.cloud.step2.title">Configure Your Applications</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.cloud.step2.description">
                  Go to <StyledLink href={data.settingsUrl}>Grafana Cloud Stack settings</StyledLink> to find your
                  Grafana Cloud Credentials.
                </Trans>
              </p>
            </div>
            <div className={styles.onboardingPanel}>
              <div className={cx(styles.onboardingPanelNumber, styles.color3)}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>3</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.cloud.step3.title">Start Getting Performance Insights</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.cloud.step3.description">
                  Once you&apos;re done with initial setup, refresh this page to see your profiling data.
                </Trans>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className={styles.onboardingPanel}>
              <div className={styles.onboardingPanelNumber}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>1</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.self-hosted.step1.title">Set Up Your Pyroscope Server</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.self-hosted.step1.description">
                  Install <StyledLink href="https://grafana.com/docs/pyroscope/latest/">Pyroscope Server</StyledLink> on
                  your infrastructure. Or if you want to use a hosted service, go to{' '}
                  <StyledLink href={data.settingsUrl}>Grafana Cloud Stack settings</StyledLink> to find your Grafana
                  Cloud Credentials.
                </Trans>
              </p>
            </div>
            <div className={styles.onboardingPanel}>
              <div className={cx(styles.onboardingPanelNumber, styles.color2)}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>2</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.self-hosted.step2.title">Configure Grafana</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.self-hosted.step2.description">
                  Add a new <StyledLink href="/connections/datasources/new">Pyroscope datasource</StyledLink>. Use your
                  Pyroscope server URL and appropriate security credentials if you use Grafana Cloud Profiles.
                </Trans>
              </p>
            </div>
            <div className={styles.onboardingPanel}>
              <div className={cx(styles.onboardingPanelNumber, styles.color3)}>
                {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
                <span className={styles.onboardingPanelNumberSpan}>3</span>
              </div>
              <h3 className={styles.onboardingPanelHeader}>
                <Trans i18nKey="onboarding.modal.self-hosted.step3.title">Add Profiling to Your Application</Trans>
              </h3>
              <p className={styles.onboardingPanelDescription}>
                <Trans i18nKey="onboarding.modal.self-hosted.step3.description">
                  Use{' '}
                  <StyledLink href="https://grafana.com/docs/pyroscope/latest/configure-client/grafana-alloy/">
                    Grafana Alloy
                  </StyledLink>{' '}
                  or{' '}
                  <StyledLink href="https://grafana.com/docs/pyroscope/next/configure-client/language-sdks/">
                    Pyroscope SDKs
                  </StyledLink>{' '}
                  to push profiles from your applications to Grafana Cloud.
                </Trans>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
