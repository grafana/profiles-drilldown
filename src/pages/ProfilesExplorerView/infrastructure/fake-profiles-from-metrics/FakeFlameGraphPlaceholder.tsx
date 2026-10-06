import { css } from '@emotion/css';
import { DataFrame, GrafanaTheme2 } from '@grafana/data';
import { FlameGraph } from '@grafana/flamegraph';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { HowToGetStarted } from '../../../../app/components/Onboarding/ui/HowToGetStarted';
import { SAMPLE_FLAME_GRAPH_DATA } from './sampleFlameGraphData';

export function FakeFlameGraphPlaceholder({
  getTheme,
  data = SAMPLE_FLAME_GRAPH_DATA,
  title,
  description,
}: {
  getTheme: () => GrafanaTheme2;
  data?: DataFrame;
  title: React.ReactNode;
  description: React.ReactNode;
}) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.wrapper}>
      <div className={styles.blur} aria-hidden="true">
        <FlameGraph data={data} getTheme={getTheme as any} enableNewUI={true} />
      </div>

      <div className={styles.overlay}>
        <div className={styles.card}>
          <h3>{title}</h3>
          <p>{description}</p>
          <HowToGetStarted />
        </div>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    position: relative;
    min-height: 420px;
    max-height: 620px;
    overflow: hidden;
  `,
  blur: css`
    filter: blur(4px);
    opacity: 0.6;
    pointer-events: none;
    user-select: none;
  `,
  overlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: ${theme.spacing(3)};
  `,
  card: css`
    max-width: 720px;
    padding: ${theme.spacing(3)};
    border-radius: ${theme.shape.radius.lg || theme.shape.radius.default};
    background: ${theme.colors.background.canvas}e6;
    box-shadow: ${theme.shadows.z3};
    text-align: center;
  `,
});
