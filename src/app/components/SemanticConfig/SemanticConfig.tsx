import { t } from '@grafana/i18n';
import { Alert, Button, Field, InlineSwitch, Input, Spinner } from '@grafana/ui';
import { isConfidenceThreshold } from '@shared/domain/semantic/confidenceThreshold';
import { CONFIDENCE_THRESHOLD } from '@shared/domain/semantic/jevRubric';
import { isJevAdmin, loadJevConfiguration, saveJevConfiguration } from '@shared/infrastructure/semantic/jevProxy';
import React, { useEffect, useId, useState } from 'react';

export function SemanticConfig() {
  if (!isJevAdmin()) {
    return (
      <Alert
        title={t('semantic.config.admin-only', 'Classification configuration requires a Grafana organization admin.')}
        severity="warning"
      />
    );
  }
  return <SemanticConfigForm />;
}

function SemanticConfigForm() {
  const enabledId = useId();
  const keyId = useId();
  const thresholdId = useId();
  const [threshold, setThreshold] = useState(String(CONFIDENCE_THRESHOLD));
  const confidenceThreshold = threshold.trim() === '' ? NaN : Number(threshold);
  const invalidThreshold = !isConfidenceThreshold(confidenceThreshold);
  const [enabled, setEnabled] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'failed'>();

  useEffect(() => {
    let active = true;
    loadJevConfiguration()
      .then((configuration) => {
        if (active) {
          setEnabled(configuration.enabled);
          setKeyConfigured(configuration.keyConfigured);
          setThreshold(String(configuration.confidenceThreshold));
        }
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <Spinner />;
  }
  if (error) {
    return (
      <Alert title={t('semantic.config.load-error', 'Could not load classification configuration.')} severity="error" />
    );
  }
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || invalidThreshold) {
          return;
        }
        setSaving(true);
        setSaveStatus(undefined);
        try {
          await saveJevConfiguration(enabled, apiKey, confidenceThreshold);
          setKeyConfigured(keyConfigured || Boolean(apiKey.trim()));
          setApiKey('');
          setSaveStatus('saved');
        } catch {
          setSaveStatus('failed');
        } finally {
          setSaving(false);
        }
      }}
    >
      <p>
        {t(
          'semantic.config.privacy',
          'Function Classification sends the selected service name and function and caller names to OpenRouter only when you click Classify. The API key is encrypted in Grafana settings.'
        )}{' '}
        {t('semantic.config.transport-privacy', "Grafana's proxy can also forward the connecting client's IP address.")}
      </p>
      <Field label={t('semantic.config.enabled', 'Enable function classification')} htmlFor={enabledId}>
        <InlineSwitch
          id={enabledId}
          value={enabled}
          disabled={saving}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
      </Field>
      <Field
        label={t('semantic.config.key', 'OpenRouter API key')}
        htmlFor={keyId}
        description={
          <span id={`${keyId}-description`}>
            {t(
              'semantic.config.key-help',
              'Use a standard OpenRouter API key with access to typesafe/jev-1.13 and available spending allowance. Usage is billed to your OpenRouter account.'
            )}
          </span>
        }
      >
        <Input
          id={keyId}
          aria-label={t('semantic.config.key', 'OpenRouter API key')}
          aria-describedby={`${keyId}-description`}
          type="password"
          autoComplete="new-password"
          value={apiKey}
          disabled={saving}
          placeholder={keyConfigured ? t('semantic.config.configured', 'Configured') : ''}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          width={60}
        />
      </Field>
      <Field
        label={t('semantic.config.threshold', 'Confidence threshold')}
        htmlFor={thresholdId}
        description={
          <span id={`${thresholdId}-description`}>
            {t(
              'semantic.config.threshold-description',
              'Lower values accept more suggestions, not more accurate predictions.'
            )}
          </span>
        }
        invalid={invalidThreshold}
        error={
          invalidThreshold ? (
            <span id={`${thresholdId}-error`}>
              {t('semantic.config.threshold-error', 'Enter a number from 0 to 1.')}
            </span>
          ) : undefined
        }
      >
        <Input
          id={thresholdId}
          type="number"
          min={0}
          max={1}
          step="any"
          value={threshold}
          disabled={saving}
          invalid={invalidThreshold}
          aria-invalid={invalidThreshold}
          aria-label={t('semantic.config.threshold', 'Confidence threshold')}
          aria-describedby={
            invalidThreshold ? `${thresholdId}-description ${thresholdId}-error` : `${thresholdId}-description`
          }
          onChange={(event) => setThreshold(event.currentTarget.value)}
          width={20}
        />
      </Field>
      <Button type="submit" disabled={saving || invalidThreshold || (enabled && !keyConfigured && !apiKey.trim())}>
        {t('semantic.config.save', 'Save')}
      </Button>
      {saveStatus === 'saved' && (
        <Alert title={t('semantic.config.saved', 'Configuration saved.')} severity="success" />
      )}
      {saveStatus === 'failed' && (
        <Alert
          title={t('semantic.config.save-error', 'Could not save classification configuration.')}
          severity="error"
        />
      )}
    </form>
  );
}
