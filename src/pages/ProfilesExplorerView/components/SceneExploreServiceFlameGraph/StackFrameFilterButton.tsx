import { t } from '@grafana/i18n';
import { Button, Field, Modal, TextArea } from '@grafana/ui';
import React, { useState } from 'react';

import { emptyStackFrameFilter, hasStackFrameFilter, StackFrameFilter } from '../../domain/StackFrameFilter';

type FilterKey = keyof StackFrameFilter;

export function StackFrameFilterButton({
  value,
  onApply,
}: {
  value: StackFrameFilter;
  onApply: (filter: StackFrameFilter) => void;
}) {
  const fields: Array<{ key: FilterKey; label: string }> = [
    { key: 'includeFunctionNames', label: t('flame-graph.frame-filter-include-exact', 'Include exact function names') },
    { key: 'excludeFunctionNames', label: t('flame-graph.frame-filter-exclude-exact', 'Exclude exact function names') },
    {
      key: 'includeFunctionNameRegexes',
      label: t('flame-graph.frame-filter-include-regex', 'Include function name regexes'),
    },
    {
      key: 'excludeFunctionNameRegexes',
      label: t('flame-graph.frame-filter-exclude-regex', 'Exclude function name regexes'),
    },
  ];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<FilterKey, string>>({
    includeFunctionNames: '',
    excludeFunctionNames: '',
    includeFunctionNameRegexes: '',
    excludeFunctionNameRegexes: '',
  });

  const show = () => {
    setDraft({
      includeFunctionNames: value.includeFunctionNames.join('\n'),
      excludeFunctionNames: value.excludeFunctionNames.join('\n'),
      includeFunctionNameRegexes: value.includeFunctionNameRegexes.join('\n'),
      excludeFunctionNameRegexes: value.excludeFunctionNameRegexes.join('\n'),
    });
    setOpen(true);
  };

  const apply = () => {
    const filter = emptyStackFrameFilter();
    for (const { key } of fields) {
      filter[key] = draft[key]
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    onApply(filter);
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="secondary" fill="outline" onClick={show}>
        {hasStackFrameFilter(value)
          ? t('flame-graph.frame-filter-active', 'Stack frames: filtered')
          : t('flame-graph.frame-filter', 'Filter stack frames')}
      </Button>
      <Modal
        title={t('flame-graph.frame-filter-title', 'Filter samples by stack frames')}
        isOpen={open}
        onDismiss={() => setOpen(false)}
      >
        <p>
          {t(
            'flame-graph.frame-filter-help',
            'Enter one function name or RE2 regex per line. All include conditions must match the stack; any exclude condition removes it. This filters the flame graph and function details; the timeline remains unfiltered.'
          )}
        </p>
        {fields.map(({ key, label }) => (
          <Field key={key} label={label}>
            <TextArea
              rows={2}
              value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.currentTarget.value })}
            />
          </Field>
        ))}
        <Modal.ButtonRow>
          <Button
            variant="secondary"
            onClick={() => {
              onApply(emptyStackFrameFilter());
              setOpen(false);
            }}
          >
            {t('flame-graph.frame-filter-clear', 'Clear filters')}
          </Button>
          <Button onClick={apply}>{t('flame-graph.frame-filter-apply', 'Apply')}</Button>
        </Modal.ButtonRow>
      </Modal>
    </>
  );
}
