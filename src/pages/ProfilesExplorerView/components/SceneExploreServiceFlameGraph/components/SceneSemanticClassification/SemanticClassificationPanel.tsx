import { css } from '@emotion/css';
import { DataFrame, GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { Alert, Button, IconButton, LinkButton, Stack, Text, useStyles2 } from '@grafana/ui';
import { ClassificationRun, REQUEST_TIMED_OUT } from '@shared/domain/semantic/runClassification';
import { Panel } from '@shared/ui/Panel/Panel';
import React from 'react';

import { RenderedProfile, SceneSemanticClassification, SemanticJob } from './SceneSemanticClassification';
import { categoryLabel } from './ui/categories';
import { SemanticDetails } from './ui/SemanticOccurrence';
import { SemanticSummary } from './ui/SemanticSummary';

interface SemanticClassificationPanelProps extends RenderedProfile {
  model: SceneSemanticClassification;
  onClose: () => void;
}

interface SemanticClassificationToggleProps extends RenderedProfile {
  model: SceneSemanticClassification;
  isOpen: boolean;
  onToggle: () => void;
}

export function SemanticClassificationToggle({
  model,
  frame,
  loadingState,
  isOpen,
  onToggle,
}: SemanticClassificationToggleProps) {
  const { category } = model.useState();
  const job = model.current({ frame, loadingState });
  if (model.availability() === 'hidden') {
    return null;
  }
  return (
    <>
      {job && category && (
        <Button
          size="sm"
          variant="secondary"
          fill="text"
          icon="times"
          aria-label={t('semantic.selection.clear', 'Clear classification selection')}
          onClick={() => model.selectCategory()}
        >
          {categoryLabel(category)}
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        fill="text"
        icon={job?.run?.done === false ? 'spinner' : 'filter'}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        {t('semantic.title', 'Function Classification')}
      </Button>
    </>
  );
}

export function SemanticClassificationPanel({ model, frame, loadingState, onClose }: SemanticClassificationPanelProps) {
  const styles = useStyles2(getStyles);
  model.useState();
  if (model.availability() === 'hidden') {
    return null;
  }
  const job = model.current({ frame, loadingState });
  return (
    <Panel
      className={styles.sidePanel}
      title={t('semantic.title', 'Function Classification')}
      isLoading={false}
      headerActions={
        <IconButton
          name="times-circle"
          variant="secondary"
          aria-label={t('semantic.panel.close', 'Close classification panel')}
          onClick={onClose}
        />
      }
      dataTestId="classification-panel"
    >
      <div className={styles.container} data-testid="semantic-classification">
        <div className={styles.categoryPanel}>
          <SemanticControls model={model} job={job} reason={model.unavailableReason({ frame, loadingState })} />
          {model.availability() === 'missing-key' && (
            <LinkButton
              variant="secondary"
              size="sm"
              href={`${config.appSubUrl ?? ''}/plugins/grafana-pyroscope-app?page=semantic`}
            >
              {t('semantic.configure', 'Configure classification')}
            </LinkButton>
          )}
          {job && <SemanticResults model={model} job={job} />}
        </div>
        {job?.error && (
          <Alert severity="warning" title={t('semantic.classify.invalid-profile', 'This profile cannot be classified')}>
            {job.error}
          </Alert>
        )}
      </div>
    </Panel>
  );
}

interface SemanticControlsProps {
  model: SceneSemanticClassification;
  job?: SemanticJob;
  reason?: string;
}

// Controls keep their positions for the whole run, so a double click cannot cancel or restart it.
function SemanticControls({ model, job, reason }: SemanticControlsProps) {
  const running = job?.run?.done === false;
  const status = runStatus(job?.run);
  return (
    <Stack alignItems="center" gap={1} wrap="wrap">
      <Button
        size="sm"
        variant="primary"
        icon={running ? 'spinner' : 'sync'}
        disabled={Boolean(reason) || running}
        onClick={() => model.classify()}
      >
        {t('semantic.classify.button', 'Classify')}
      </Button>
      {job && (
        <>
          <Button size="sm" variant="secondary" icon="times" disabled={!running} onClick={() => model.cancel()}>
            {t('semantic.classify.cancel', 'Cancel')}
          </Button>
          <Button size="sm" variant="secondary" fill="text" disabled={running} onClick={() => model.clear()}>
            {t('semantic.classify.clear', 'Clear')}
          </Button>
        </>
      )}
      {!status && (
        <Text color="secondary" variant="bodySmall">
          {reason ??
            t(
              'semantic.classify.application-notice',
              'Sends the service name and function and caller names to the configured classification provider when you click Classify.'
            )}
        </Text>
      )}
      {/* Always rendered: screen readers only announce changes to a live region that already exists. */}
      <Text role="status" variant="bodySmall">
        {status ?? ''}
      </Text>
    </Stack>
  );
}

function runStatus(run?: ClassificationRun): string | undefined {
  if (!run) {
    return undefined;
  }
  const count = run.results.length;
  if (!run.done) {
    const settled = run.results.filter((result) => result.status !== 'pending').length;
    return t('semantic.classify.progress', 'Classifying {{settled}} of {{count}} call context\u2026', {
      settled,
      count,
      defaultValue_other: 'Classifying {{settled}} of {{count}} call contexts\u2026',
    });
  }
  if (run.failure !== undefined) {
    return run.failure === REQUEST_TIMED_OUT
      ? t(
          'semantic.classify.timed-out',
          'Classification stopped because a request timed out. Remaining call contexts were skipped.'
        )
      : t(
          'semantic.classify.failed',
          'Classification stopped after a failed request. Remaining call contexts were skipped.'
        );
  }
  if (run.results.some((result) => result.status === 'cancelled')) {
    return t('semantic.classify.cancelled', 'Classification cancelled. Remaining call contexts were skipped.');
  }
  const invalid = run.results.filter((result) => result.status === 'error').length;
  if (invalid) {
    return t('semantic.classify.complete-with-invalid', 'Classification complete. {{count}} result unavailable.', {
      count: invalid,
      defaultValue_other: 'Classification complete. {{count}} results unavailable.',
    });
  }
  return t('semantic.classify.complete', 'Classification complete for {{count}} call context.', {
    count,
    defaultValue_other: 'Classification complete for {{count}} call contexts.',
  });
}

function SemanticResults({ model, job }: { model: SceneSemanticClassification; job: SemanticJob }) {
  const styles = useStyles2(getStyles);
  const { category, details } = model.useState();
  const { run, classification } = job;
  if (!run || !classification) {
    return null;
  }
  const settled = run.results.filter((result) => result.status !== 'pending').length;
  const unit = unitOf(job.input.frame);
  return (
    <div className={styles.results}>
      <SemanticSummary
        classification={classification}
        running={!run.done}
        unit={unit}
        category={category}
        onSelectCategory={(c) => model.selectCategory(c)}
        onPreviewCategory={(c) => model.previewCategory(c)}
      />
      {!run.done && (
        <div className={styles.progressRow}>
          <progress
            className={styles.progress}
            aria-label={t('semantic.progress.label', 'Call contexts classified')}
            value={settled}
            max={run.results.length || 1}
          />
          <span className={styles.progressCount}>
            {settled}/{run.results.length}
          </span>
        </div>
      )}
      {details && (
        <SemanticDetails
          request={details}
          occurrence={run.plan.profile.occurrences[details.row]}
          decision={classification.decisions[details.row]}
          confidenceThreshold={classification.confidenceThreshold}
          unit={unit}
          onClose={() => model.closeDetails()}
        />
      )}
    </div>
  );
}

function unitOf(frame: DataFrame): string | undefined {
  return frame.fields.find((field) => field.name === 'self')?.config.unit;
}

const getStyles = (theme: GrafanaTheme2) => ({
  sidePanel: css`
    width: 380px;
    max-width: 45%;
    flex-shrink: 0;
    align-self: flex-start;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    margin-left: ${theme.spacing(1)};
  `,
  container: css`
    padding: ${theme.spacing(1)};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(1)};
  `,
  categoryPanel: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
    padding: ${theme.spacing(1.5)};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
  `,
  progressRow: css`
    width: 100%;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1.5)};
  `,
  progressCount: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-variant-numeric: tabular-nums;
  `,
  progress: css`
    appearance: none;
    flex: 1;
    height: 6px;
    border: 0;
    border-radius: 3px;
    overflow: hidden;
    background: ${theme.colors.border.weak};
    &::-webkit-progress-bar {
      background: ${theme.colors.border.weak};
    }
    &::-webkit-progress-value {
      background: ${theme.colors.primary.main};
      transition: width 150ms;
    }
    &::-moz-progress-bar {
      background: ${theme.colors.primary.main};
    }
  `,
  results: css`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: ${theme.spacing(2)};
  `,
});
