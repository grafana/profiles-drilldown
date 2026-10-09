import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { FlameGraphFrame } from '@grafana/flamegraph';
import { t } from '@grafana/i18n';
import { IconButton, Text, useStyles2 } from '@grafana/ui';
import { ExclusionReason, SemanticOccurrence } from '@shared/domain/semantic/normalizeFlameGraph';
import { OccurrenceDecision, SemanticClassification } from '@shared/domain/semantic/resolveClassification';
import { REQUEST_TIMED_OUT } from '@shared/domain/semantic/runClassification';
import React, { useEffect, useRef } from 'react';

import { categoryLabel } from './categories';
import { formatConfidence, formatThreshold, weightFormatter } from './format';

// Values are translated text rendered by React, which escapes it; i18next escaping would show "/" as "&#x2F;".
const UNESCAPED = { interpolation: { escapeValue: false } };

function exclusionLabel(reason: ExclusionReason): string {
  switch (reason) {
    case 'root':
      return t('semantic.occurrence.excluded-root', 'root frame');
    case 'truncated':
      return t('semantic.occurrence.excluded-truncated', 'truncated frame');
    case 'opaque':
      return t('semantic.occurrence.excluded-opaque', 'unsymbolized frame');
    default:
      return t('semantic.occurrence.excluded-zero-self', 'no self samples');
  }
}

function statusLabel(decision: OccurrenceDecision, threshold: number): string {
  switch (decision.status) {
    case 'accepted':
      return t('semantic.occurrence.accepted', 'applied');
    case 'rejected':
      return t('semantic.occurrence.rejected', 'below {{threshold}}, unclassified', {
        threshold: formatThreshold(threshold),
      });
    case 'unknown':
      return t('semantic.occurrence.unknown', 'unclassified');
    case 'pending':
      return t('semantic.occurrence.pending', 'pending');
    case 'unselected':
      return t('semantic.occurrence.unselected', 'not selected for classification');
    case 'skipped':
      return t('semantic.occurrence.skipped', 'skipped after the run stopped');
    case 'cancelled':
      return t('semantic.occurrence.cancelled', 'cancelled');
    case 'error':
      return decision.error === REQUEST_TIMED_OUT
        ? t('semantic.occurrence.timed-out', 'request timed out')
        : t('semantic.occurrence.error', 'request failed');
    default:
      return t('semantic.occurrence.excluded', 'excluded ({{reason}})', {
        ...UNESCAPED,
        reason: exclusionLabel(decision.reason),
      });
  }
}

interface SemanticFrameTooltipProps {
  frame: FlameGraphFrame;
  classification: SemanticClassification;
}

/** A derived frame merges several call contexts, so no single occurrence's result may be shown for it. */
export function SemanticFrameTooltip({ frame, classification }: SemanticFrameTooltipProps) {
  if (frame.kind === 'derived') {
    return (
      <div>
        {t('semantic.tooltip.derived', 'Classification is available for individual frames, not merged call contexts.')}
      </div>
    );
  }
  const decision = classification.decisions[frame.row];
  if (!decision) {
    return null;
  }
  const status =
    decision.status === 'pending'
      ? t('semantic.tooltip.pending', 'Not classified yet')
      : t('semantic.tooltip.unclassified', 'Unclassified');
  const category =
    decision.status === 'rejected'
      ? t('semantic.tooltip.unclassified-category', 'Unclassified · {{category}}', {
          ...UNESCAPED,
          category: categoryLabel(decision.prediction.category),
        })
      : decision.status === 'accepted'
      ? categoryLabel(decision.prediction.category)
      : status;
  return (
    <div>
      {'prediction' in decision
        ? t('semantic.tooltip.prediction', '{{category}} · Confidence {{confidence}}', {
            ...UNESCAPED,
            category,
            confidence: formatConfidence(decision.prediction.confidence, classification.confidenceThreshold),
          })
        : status}
    </div>
  );
}

interface SemanticDetailsProps {
  /** Focus moves here for every new request because the details open far from the clicked frame. */
  request: object;
  occurrence: SemanticOccurrence;
  decision: OccurrenceDecision;
  confidenceThreshold: number;
  unit?: string;
  onClose: () => void;
}

export function SemanticDetails({
  request,
  occurrence,
  decision,
  confidenceThreshold,
  unit,
  onClose,
}: SemanticDetailsProps) {
  const styles = useStyles2(getStyles);
  const ref = useRef<HTMLElement>(null);
  const { callers } = occurrence.evidence;
  const title = t('semantic.details.title', 'Classification details');

  useEffect(() => {
    ref.current?.focus();
  }, [request]);

  return (
    <section ref={ref} tabIndex={-1} aria-label={title} className={styles.details}>
      <div className={styles.header}>
        <Text weight="medium" truncate>
          {occurrence.label}
        </Text>
        <IconButton
          name="times"
          size="sm"
          aria-label={t('semantic.details.close', 'Close classification details')}
          onClick={onClose}
        />
      </div>
      <dl className={styles.fields}>
        <dt>{t('semantic.details.self', 'Self')}</dt>
        <dd>{weightFormatter(unit)(occurrence.self)}</dd>
        {callers.length > 0 && (
          <>
            <dt>{t('semantic.details.callers', 'Called from')}</dt>
            <dd>{callers.join(' \u203a ')}</dd>
          </>
        )}
        <dt>{t('semantic.details.status', 'Status')}</dt>
        <dd>{statusLabel(decision, confidenceThreshold)}</dd>
        {'prediction' in decision && (
          <>
            <dt>{t('semantic.details.category', 'Suggested category')}</dt>
            <dd>{categoryLabel(decision.prediction.category)}</dd>
            <dt>{t('semantic.details.confidence', 'Confidence')}</dt>
            <dd>{formatConfidence(decision.prediction.confidence, confidenceThreshold)}</dd>
          </>
        )}
      </dl>
      <Text color="secondary" variant="bodySmall">
        {t(
          'semantic.details.confidence-notice',
          'Confidence is reported by the model, not a measure of validated accuracy. Suggestions below {{threshold}} stay unclassified.',
          { threshold: formatThreshold(confidenceThreshold) }
        )}
      </Text>
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  details: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
    max-width: 480px;
    padding: ${theme.spacing(1)};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.secondary};
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    min-width: 0;
  `,
  fields: css`
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: ${theme.spacing(0.25, 1)};
    margin: 0;
    font-size: ${theme.typography.bodySmall.fontSize};

    dt {
      color: ${theme.colors.text.secondary};
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
});
