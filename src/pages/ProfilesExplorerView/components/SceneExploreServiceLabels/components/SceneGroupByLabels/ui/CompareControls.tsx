import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Button, useStyles2 } from '@grafana/ui';
import { noOp } from '@shared/domain/noOp';
import React, { useMemo } from 'react';

import { CompareTarget } from '../../../../SceneExploreDiffFlameGraph/domain/types';
import { SceneStatsPanel } from '../components/SceneLabelValuesGrid/components/SceneStatsPanel/SceneStatsPanel';
import { SceneGroupByLabelsState } from '../SceneGroupByLabels';

type CompareButtonProps = {
  compare: SceneGroupByLabelsState['compare'];
  onClickCompare: () => void;
  onClickClear: () => void;
};

export function CompareControls({ compare, onClickCompare, onClickClear }: CompareButtonProps) {
  const styles = useStyles2(getStyles);
  const compareIsDisabled = compare.size < 2;
  const hasSelection = compare.size > 0;

  const tooltip = useMemo(() => {
    if (compare.size === 2) {
      return t('labels.compare.tooltip-ready', 'Compare "{{baseline}}" vs "{{comparison}}"', {
        baseline: compare.get(CompareTarget.BASELINE)?.label,
        comparison: compare.get(CompareTarget.COMPARISON)?.label,
      });
    }
    if (compare.size === 0) {
      return t(
        'labels.compare.tooltip-empty',
        'Select both a baseline and a comparison panel to compare their flame graphs'
      );
    }

    return compare.has(CompareTarget.BASELINE)
      ? t('labels.compare.tooltip-select-comparison', 'Select another panel to compare against "{{label}}"', {
          label: compare.get(CompareTarget.BASELINE)?.label,
        })
      : t('labels.compare.tooltip-select-baseline', 'Select another panel to compare against "{{label}}"', {
          label: compare.get(CompareTarget.COMPARISON)?.label,
        });
  }, [compare]);

  return (
    <div className={styles.container}>
      <Button
        aria-label={t('labels.compare.aria-label', 'Compare')}
        className={styles.compareButton}
        variant="primary"
        disabled={compareIsDisabled}
        onClick={compareIsDisabled ? noOp : onClickCompare}
        tooltip={tooltip}
      >
        {t('labels.compare.button', 'Compare ({{count}}/2)', { count: compare.size })}
      </Button>

      <Button
        aria-label={t('labels.compare.clear-tooltip', 'Clear comparison selection')}
        data-testid="clearComparison"
        className={cx(styles.clearButton, !compareIsDisabled ? styles.clearButtonActive : undefined)}
        icon="times"
        variant="secondary"
        tooltip={hasSelection ? t('labels.compare.clear-tooltip', 'Clear comparison selection') : ''}
        disabled={!hasSelection}
        onClick={!hasSelection ? noOp : onClickClear}
      />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    align-items: center;
    width: ${SceneStatsPanel.WIDTH_IN_PIXELS}px;
  `,
  compareButton: css`
    width: ${SceneStatsPanel.WIDTH_IN_PIXELS - 32}px;
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  `,
  clearButton: css`
    box-sizing: border-box;
    width: 32px !important;
    height: 32px !important;
    color: ${theme.colors.text.secondary};
    background-color: transparent;
    border-left: none !important;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;

    &:not([disabled]),
    &:not([disabled]):hover {
      background-color: transparent;
      box-shadow: none;
    }
  `,
  clearButtonActive: css`
    border-color: ${theme.colors.border.medium};

    &:hover {
      border-color: ${theme.colors.border.medium};
    }
  `,
});
