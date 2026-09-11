import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { IconButton, Tooltip, useStyles2 } from '@grafana/ui';
import React from 'react';

type Props = {
  spanSelector: string;
  removeSpanSelector: () => void;
};

export function SpanSelectorLabel(props: Props) {
  const { spanSelector, removeSpanSelector } = props;
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.container}>
      <Tooltip
        content={t(
          'flame-graph.span-selector.tooltip',
          'You have added a span selector to the flamegraph query ({{spanSelector}}).',
          { spanSelector }
        )}
        placement="top"
      >
        <span
          aria-label={t('flame-graph.span-selector.filter-label', 'Filter label')}
          className={styles.label}
        >
          {t('flame-graph.span-selector.name', 'Span')}
        </span>
      </Tooltip>

      <span
        aria-label={t('flame-graph.span-selector.filter-operator', 'Filter operator')}
        className={styles.chip}
      >
        =
      </span>

      <span
        aria-label={t('flame-graph.span-selector.filter-value', 'Filter value')}
        className={styles.chip}
      >
        {spanSelector}
      </span>

      <IconButton
        aria-label={t('flame-graph.span-selector.remove', 'Remove span selector from query')}
        className={styles.removeButton}
        name="times"
        tooltip={t('flame-graph.span-selector.remove', 'Remove span selector from query')}
        onClick={removeSpanSelector}
      />
    </div>
  );
}

const activeBackgroundColor = 'rgb(61, 113, 217)';
const activeTextColor = '#fff';

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    margin-top: 5px;
    display: flex;
    align-items: center;
    border: 1px solid ${activeBackgroundColor};
    border-radius: 2px;

    & > :last-child {
      border-left: 1px solid ${activeBackgroundColor};
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  `,

  chip: css`
    align-items: center;
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.maxContrast};
    display: inline-flex;
    height: 30px;
    padding: ${theme.spacing(0, 1)};
  `,

  label: css`
    align-items: center;
    background: ${activeBackgroundColor};
    color: ${activeTextColor};
    display: inline-flex;
    height: 30px;
    padding: ${theme.spacing(0, 1)};
  `,

  removeButton: css`
    cursor: pointer;
    height: 30px;

    &:hover {
      background-color: ${theme.colors.background.secondary};
    }

    & svg {
      width: 12px;
      height: 12px;
    }
  `,

});
