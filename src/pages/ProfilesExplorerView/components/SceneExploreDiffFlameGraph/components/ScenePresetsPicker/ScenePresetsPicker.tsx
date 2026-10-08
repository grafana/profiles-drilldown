import { css } from '@emotion/css';
import { t } from '@grafana/i18n';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Combobox, ComboboxOption, useStyles2 } from '@grafana/ui';
import { reportInteraction } from '@shared/domain/reportInteraction';
import React from 'react';

import { CompareTarget } from '../../domain/types';
import { SceneComparePanel } from '../SceneComparePanel/SceneComparePanel';

export type Preset = {
  from: string;
  to: string;
  diffFrom: string;
  diffTo: string;
};

export type PresetOption = {
  baseline: Preset;
  comparison: Preset;
};

interface ScenePresetsPickerState extends SceneObjectState {
  name: string;
  label: string;
  value: string | null;
}

// Shared English defaults (same string appears in multiple `t(...)` or fallback + `t()`).
const PRESETS_LABEL_DEFAULT = 'Comparison presets';
const PRESET_DESCRIPTION_1H_WINDOW_DEFAULT = '1h window';

export class ScenePresetsPicker extends SceneObjectBase<ScenePresetsPickerState> {
  /** Must not call `t()` at module load — embedded extensions initialize i18n after lazy chunks run. */
  private static getOptions(): Array<ComboboxOption<string>> {
    return [
      {
        label: t('diff-flame-graph.presets.1h-ago-vs-now', '1h ago vs now'),
        value: '1h ago vs now',
        description: t('diff-flame-graph.presets.1h-ago-vs-now-description', '30m window'),
      },
      {
        label: t('diff-flame-graph.presets.6h-ago-vs-now', '6h ago vs now'),
        value: '6h ago vs now',
        description: t('diff-flame-graph.presets.6h-ago-vs-now-description', PRESET_DESCRIPTION_1H_WINDOW_DEFAULT),
      },
      {
        label: t('diff-flame-graph.presets.24h-ago-vs-now', '24h ago vs now'),
        value: '24h ago vs now',
        description: t('diff-flame-graph.presets.24h-ago-vs-now-description', PRESET_DESCRIPTION_1H_WINDOW_DEFAULT),
      },
    ];
  }

  private static PRESETS: Record<string, PresetOption> = {
    '1h ago vs now': {
      baseline: { from: 'now-1h', to: 'now', diffFrom: 'now-1h', diffTo: 'now-30m' },
      comparison: { from: 'now-1h', to: 'now', diffFrom: 'now-30m', diffTo: 'now' },
    },
    '6h ago vs now': {
      baseline: { from: 'now-6h', to: 'now-5h', diffFrom: 'now-6h', diffTo: 'now-5h' },
      comparison: { from: 'now-1h', to: 'now', diffFrom: 'now-1h', diffTo: 'now' },
    },
    '24h ago vs now': {
      baseline: { from: 'now-24h', to: 'now-23h', diffFrom: 'now-24h', diffTo: 'now-23h' },
      comparison: { from: 'now-1h', to: 'now', diffFrom: 'now-1h', diffTo: 'now' },
    },
  };

  constructor() {
    super({
      name: 'compare-presets',
      // English fallback until `onActivate` runs `t()` — constructors run before i18n in embedded lazy chunks (same default as PRESETS_LABEL_DEFAULT).
      label: PRESETS_LABEL_DEFAULT,
      value: null,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    this.setState({ label: t('diff-flame-graph.presets.label', PRESETS_LABEL_DEFAULT) });

    [CompareTarget.BASELINE, CompareTarget.COMPARISON].forEach((compareTarget) => {
      const panel = sceneGraph.findByKeyAndType(this, `${compareTarget}-panel`, SceneComparePanel);
      const timeRange = sceneGraph.getTimeRange(panel);
      this._subs.add(
        timeRange.subscribeToState((newState, prevState) => {
          if (newState.from !== prevState.from || newState.to !== prevState.to) {
            this.setState({ value: null });
          }
        })
      );
    });
  }

  onChange = (option: ComboboxOption<string>) => {
    reportInteraction('g_pyroscope_app_diff_preset_selected', { value: option.value });

    const presets = ScenePresetsPicker.PRESETS[option.value];
    [CompareTarget.BASELINE, CompareTarget.COMPARISON].forEach((compareTarget) => {
      const panel = sceneGraph.findByKeyAndType(this, `${compareTarget}-panel`, SceneComparePanel);
      panel.applyPreset(presets[compareTarget]);
    });

    this.setState({ value: option.value });
  };

  static Component({ model }: SceneComponentProps<ScenePresetsPicker>) {
    const { value } = model.useState();
    const styles = useStyles2(getStyles);

    return (
      <div className={styles.presetsContainer}>
        <Combobox
          placeholder={t('diff-flame-graph.presets.placeholder', 'Choose a preset')}
          value={value}
          options={ScenePresetsPicker.getOptions()}
          onChange={model.onChange}
        />
      </div>
    );
  }
}

const getStyles = () => ({
  presetsContainer: css`
    display: flex;
  `,
});
