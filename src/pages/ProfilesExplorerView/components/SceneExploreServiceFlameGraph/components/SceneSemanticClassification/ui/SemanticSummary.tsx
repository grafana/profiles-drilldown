import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Tooltip, useStyles2 } from '@grafana/ui';
import { CATEGORIES, KnownCategory } from '@shared/domain/semantic/jevRubric';
import { SemanticAccounting, SemanticClassification } from '@shared/domain/semantic/resolveClassification';
import React, { useMemo } from 'react';

import { categoryDescription, categoryLabel } from './categories';
import { formatShare, weightFormatter } from './format';

interface SemanticSummaryProps {
  classification: SemanticClassification;
  running: boolean;
  unit?: string;
  category?: KnownCategory;
  onSelectCategory: (category?: KnownCategory) => void;
  onPreviewCategory: (category?: KnownCategory | 'all') => void;
}

const KNOWN_CATEGORIES = CATEGORIES.filter((c): c is KnownCategory => c !== 'unknown');

export function SemanticSummary({
  classification,
  running,
  unit,
  category: selected,
  onSelectCategory,
  onPreviewCategory,
}: SemanticSummaryProps) {
  const styles = useStyles2(getStyles);
  const format = weightFormatter(unit);
  const awaiting = t('semantic.summary.awaiting-value', '–');
  const { accounting, decisions } = classification;
  const { totalSelf, categorySelf } = accounting;
  const classifiedCategories = useMemo(() => {
    const categories = new Set<KnownCategory>();
    for (const decision of decisions) {
      if (decision.status === 'accepted' && decision.prediction.category !== 'unknown') {
        categories.add(decision.prediction.category);
      }
    }
    return categories;
  }, [decisions]);
  const unclassified = unclassifiedRows(accounting).filter(([, self]) => self > 0);
  const unclassifiedSelf = unclassified.reduce((sum, [, self]) => sum + self, 0);

  return (
    <section
      className={styles.summary}
      data-testid="semantic-summary"
      aria-label={t('semantic.summary.label', 'Function classification results')}
    >
      <div
        className={styles.categories}
        role="group"
        aria-label={t('semantic.summary.categories', 'Function categories')}
      >
        <button
          type="button"
          className={styles.chip}
          aria-pressed={!selected}
          onClick={() => onSelectCategory()}
          onMouseEnter={() => onPreviewCategory('all')}
          onMouseLeave={() => onPreviewCategory()}
          onFocus={() => onPreviewCategory('all')}
          onBlur={() => onPreviewCategory()}
        >
          {t('semantic.summary.all-functions', 'All functions')}
        </button>
        {KNOWN_CATEGORIES.map((category) => (
          <span
            key={category}
            onMouseEnter={() => onPreviewCategory(category)}
            onMouseLeave={() => onPreviewCategory()}
            onFocus={() => onPreviewCategory(category)}
            onBlur={() => onPreviewCategory()}
          >
            <Tooltip content={categoryDescription(category)}>
              <button
                type="button"
                className={styles.chip}
                data-category-summary={classifiedCategories.has(category) || undefined}
                aria-label={categoryLabel(category)}
                aria-pressed={category === selected}
                onClick={() => onSelectCategory(category === selected ? undefined : category)}
              >
                <span data-summary-value>{categoryLabel(category)}</span>
                <span data-summary-value className={styles.weight}>
                  {running && !classifiedCategories.has(category) ? awaiting : format(categorySelf[category])}
                </span>
                <span data-summary-value className={styles.share}>
                  {running && !classifiedCategories.has(category)
                    ? awaiting
                    : formatShare(categorySelf[category], totalSelf)}
                </span>
              </button>
            </Tooltip>
          </span>
        ))}
      </div>
      <div className={styles.footer}>
        {accounting.statusSelf.pending > 0 && (
          <span>
            {t('semantic.summary.awaiting', '{{share}} awaiting classification', {
              share: formatShare(accounting.statusSelf.pending, totalSelf),
            })}
          </span>
        )}
        {unclassifiedSelf > 0 && (
          <details className={styles.unclassified}>
            <summary>
              {t('semantic.summary.unclassified', '{{share}} unclassified', {
                share: formatShare(unclassifiedSelf, totalSelf),
              })}
            </summary>
            <div className={styles.reasons}>
              {unclassified.map(([label, self]) => (
                <div key={label} data-category-summary className={styles.reason}>
                  <span data-summary-value>{label}</span>
                  <span data-summary-value>{format(self)}</span>
                  <span data-summary-value>{formatShare(self, totalSelf)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function unclassifiedRows({ statusSelf, excludedSelf }: SemanticAccounting): Array<[string, number]> {
  return [
    [t('semantic.summary.below-threshold', 'Below confidence threshold'), statusSelf.rejected],
    [t('semantic.summary.no-match', 'No matching category'), statusSelf.unknown],
    [
      t('semantic.summary.no-result', 'No usable result'),
      statusSelf.error + statusSelf.skipped + statusSelf.cancelled + statusSelf.unselected,
    ],
    [
      t('semantic.summary.missing-detail', 'Missing profile detail'),
      excludedSelf.truncated + excludedSelf.opaque + excludedSelf.root,
    ],
  ];
}

const getStyles = (theme: GrafanaTheme2) => ({
  summary: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-variant-numeric: tabular-nums;
  `,
  categories: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  chip: css`
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7ch 7ch;
    text-align: left;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1, 1.5)};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.primary};
    cursor: pointer;
    transition: border-color 100ms, background 100ms;
    &:hover,
    &:focus-visible {
      border-color: ${theme.colors.primary.main};
      background: ${theme.colors.action.hover};
    }
    &:focus-visible {
      outline: 2px solid ${theme.colors.primary.main};
      outline-offset: 2px;
    }
    &[aria-pressed='true'] {
      border-color: ${theme.colors.primary.main};
      box-shadow: inset 0 -2px ${theme.colors.primary.main};
    }
  `,
  weight: css`
    width: 7ch;
    flex-shrink: 0;
    white-space: nowrap;
    text-align: right;
    color: ${theme.colors.text.secondary};
  `,
  share: css`
    width: 7ch;
    flex-shrink: 0;
    white-space: nowrap;
    text-align: right;
    font-weight: ${theme.typography.fontWeightMedium};
    padding: ${theme.spacing(0.25, 0.75)};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.action.hover};
  `,
  footer: css`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: ${theme.spacing(2)};
    color: ${theme.colors.text.secondary};
  `,
  unclassified: css`
    summary {
      cursor: pointer;
    }
  `,
  reasons: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
    padding-top: ${theme.spacing(1)};
  `,
  reason: css`
    display: flex;
    gap: ${theme.spacing(1)};
  `,
});
