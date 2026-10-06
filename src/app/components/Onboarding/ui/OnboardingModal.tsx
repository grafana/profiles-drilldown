import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';
import DecreaseLatency from '@img/decrease-latency.png';
import HeroImage from '@img/hero-image.png';
import ReduceCosts from '@img/reduce-costs.png';
import ResolveIncidents from '@img/resolve-incidents.png';
import React from 'react';

import { useOnboardingModal } from '../domain/useOnboardingModal';
import { HowToGetStarted } from './HowToGetStarted';
import { StyledLink } from './StyledLink';

/** This was extracted from the former `styles.module.scss` */
const getStyles = (theme: GrafanaTheme2) => {
  return {
    onboardingRow: css`
      background: ${theme.colors.background.secondary};
      display: flex;
      margin-top: 16px;
      gap: 20px;
      padding: 20px;
      margin-bottom: 2.5rem;
    `,
    onboardingParagraph: css`
      padding: 20px 64px;
      text-align: center;
      line-height: 2;
      flex: 1;
      margin: 0;
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
    onboardingPanelImage: css`
      width: 5rem;
      margin-bottom: 1em;
    `,
    hero: css`
      display: flex;
      flex-direction: row;
    `,
    heroTitles: css`
      flex: 1;
    `,
    heroImage: css`
      width: 40%;
      margin-left: 16px;
      margin-top: 16px;
      margin-bottom: 16px;
      border-radius: ${theme.shape.radius.lg || theme.shape.radius.default};
    `,
    onboardingPanelDescription: css`
      text-align: justify;
      text-align: center;
      line-height: 1.66;
      margin-top: 0;
    `,
    title: css`
      margin-bottom: 0.5em;
      line-height: 1.5;
    `,
    subtitle: css`
      margin-bottom: 1em;
      line-height: 1.5;
      font-size: 1.25rem;
    `,
  };
};

export function OnboardingModal() {
  const styles = useStyles2(getStyles);
  const { data } = useOnboardingModal();

  return (
    <div data-testid="onboarding-modal">
      <div className={styles.hero} data-testid="hero">
        <div className={styles.heroTitles}>
          <h1 className={styles.title}>
            <Trans i18nKey="onboarding.modal.title">Welcome to Grafana Profiles Drilldown</Trans>
          </h1>
          <h2 className={styles.subtitle}>
            <Trans i18nKey="onboarding.modal.subtitle">
              Optimize infrastructure spend, simplify debugging, and enhance application performance
            </Trans>
          </h2>
          {/* <Button>Continue to Pyroscope</Button> */}
        </div>
        <img src={HeroImage} className={styles.heroImage}></img>
      </div>

      <div data-testid="what-you-can-do">
        <h3>
          <Trans i18nKey="onboarding.modal.what-you-can-do">What You Can Do</Trans>
        </h3>
        <div className={styles.onboardingRow}>
          <div className={styles.onboardingPanel}>
            <img className={styles.onboardingPanelImage} src={ReduceCosts}></img>
            <h3 className={styles.onboardingPanelHeader}>
              <Trans i18nKey="onboarding.modal.reduce-costs.title">Reduce Costs</Trans>
            </h3>
            <p className={styles.onboardingPanelDescription}>
              <Trans i18nKey="onboarding.modal.reduce-costs.description">
                Spot CPU spikes, memory leaks, and other inefficiencies with code-level visibility into resource usage.
                Teams can then optimize their code and lower infrastructure costs.
              </Trans>
            </p>
          </div>
          <div className={styles.onboardingPanel}>
            <img className={styles.onboardingPanelImage} src={DecreaseLatency}></img>
            <h3 className={styles.onboardingPanelHeader}>
              <Trans i18nKey="onboarding.modal.decrease-latency.title">Decrease Latency</Trans>
            </h3>
            <p className={styles.onboardingPanelDescription}>
              <Trans i18nKey="onboarding.modal.decrease-latency.description">
                Maintain high speed and efficiency and improve application performance. In a competitive digital world,
                decreasing latency translates to increasing revenue.
              </Trans>
            </p>
          </div>
          <div className={styles.onboardingPanel}>
            <img className={styles.onboardingPanelImage} src={ResolveIncidents}></img>
            <h3 className={styles.onboardingPanelHeader}>
              <Trans i18nKey="onboarding.modal.resolve-incidents.title">Resolve Incidents Faster</Trans>
            </h3>
            <p className={styles.onboardingPanelDescription}>
              <Trans i18nKey="onboarding.modal.resolve-incidents.description">
                Cut down the mean time to resolution (MTTR) by correlating continuous profiling data with metrics, logs,
                and traces to quickly identify the root cause of any issue.
              </Trans>
            </p>
          </div>
        </div>
      </div>

      <HowToGetStarted />

      {data.isCloud && (
        <div data-testid="how-billing-works">
          <h3>
            <Trans i18nKey="onboarding.modal.billing.title">How Billing Works</Trans>
          </h3>
          <div className={styles.onboardingRow}>
            <p className={styles.onboardingParagraph}>
              <Trans i18nKey="onboarding.modal.billing.description">
                Usage of Grafana Cloud Profiles is subject to{' '}
                <StyledLink href="https://grafana.com/pricing/">Grafana Cloud Pricing</StyledLink> for Profiles.
                <br></br>
                For additional information, read the announcement&nbsp;
                <StyledLink href="https://grafana.com/blog/2023/08/09/grafana-cloud-profiles-for-continuous-profiling/">
                  blog post
                </StyledLink>
                .
              </Trans>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
