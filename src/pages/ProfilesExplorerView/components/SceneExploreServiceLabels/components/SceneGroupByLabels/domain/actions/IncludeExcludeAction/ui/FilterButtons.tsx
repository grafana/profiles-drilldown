import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { Button, useStyles2 } from '@grafana/ui';
import React, { memo } from 'react';

type FilterButtonsProps = {
  label: string;
  status: 'included' | 'excluded' | 'clear';
  onInclude: () => void;
  onExclude: () => void;
  onClear: () => void;
};

function getStatus({ status, label, onInclude, onExclude, onClear }: FilterButtonsProps) {
  const isIncludeSelected = status === 'included';
  const includeTooltip = !isIncludeSelected
    ? t('labels.filter.include-tooltip', 'Include "{{label}}" in the filters', { label })
    : t('labels.filter.clear-tooltip', 'Clear "{{label}}" from the filters', { label });

  const isExcludeSelected = status === 'excluded';
  const excludeTooltip = !isExcludeSelected
    ? t('labels.filter.exclude-tooltip', 'Exclude "{{label}}" in the filters', { label })
    : t('labels.filter.clear-tooltip', 'Clear "{{label}}" from the filters', { label });

  return {
    include: {
      isSelected: isIncludeSelected,
      tooltip: includeTooltip,
      onClick: isIncludeSelected ? onClear : onInclude,
    },
    exclude: {
      isSelected: isExcludeSelected,
      tooltip: excludeTooltip,
      onClick: isExcludeSelected ? onClear : onExclude,
    },
  };
}

// Kindly borrowed and adapted from https://github.com/grafana/explore-logs/blob/main/src/Components/FilterButton.tsx :)
const FilterButtonsComponent = (props: FilterButtonsProps) => {
  const styles = useStyles2(getStyles);

  const { include, exclude } = getStatus(props);

  return (
    <div className={styles.container}>
      <Button
        size="sm"
        fill="outline"
        variant={include.isSelected ? 'primary' : 'secondary'}
        aria-selected={include.isSelected}
        className={cx(styles.includeButton, include.isSelected && 'selected')}
        onClick={include.onClick}
        tooltip={include.tooltip}
        tooltipPlacement="top"
        data-testid="filter-button-include"
      >
        <Trans i18nKey="labels.filter.include">Include</Trans>
      </Button>
      <Button
        size="sm"
        fill="outline"
        variant={exclude.isSelected ? 'primary' : 'secondary'}
        aria-selected={exclude.isSelected}
        className={cx(styles.excludeButton, exclude.isSelected && 'selected')}
        onClick={exclude.onClick}
        tooltip={exclude.tooltip}
        tooltipPlacement="top"
        data-testid="filter-button-exclude"
      >
        <Trans i18nKey="labels.filter.exclude">Exclude</Trans>
      </Button>
    </div>
  );
};

export const FilterButtons = memo(FilterButtonsComponent);

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css`
      display: flex;
      justify-content: center;
    `,
    includeButton: css`
      border-radius: ${theme.shape.radius.md || theme.shape.radius.default} 0 0 ${theme.shape.radius.md || theme.shape.radius.default};

      &:not(.selected) {
        border-right: none;
      }
    `,
    excludeButton: css`
      border-radius: 0 ${theme.shape.radius.md || theme.shape.radius.default} ${theme.shape.radius.md || theme.shape.radius.default} 0;

      &:not(.selected) {
        border-left: none;
      }
    `,
  };
};
