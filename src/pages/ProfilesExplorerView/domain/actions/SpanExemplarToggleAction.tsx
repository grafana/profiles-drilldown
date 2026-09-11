import type { SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { RadioButtonGroup, Tooltip } from '@grafana/ui';
import { reportInteraction } from '@shared/domain/reportInteraction';
import React from 'react';

import { SpanProfilesToggled } from '../../components/SceneExploreServiceFlameGraph/domain/events/SpanProfilesToggled';

interface SpanExemplarToggleActionState extends SceneObjectState {
  showSpanHeatmap: boolean;
  hasSpanData?: boolean;
}

type SpanProfileVisualization = 'time-series' | 'span-heatmap';

const SPAN_HEATMAP = 'span-heatmap';

function getOptions(): Array<SelectableValue<SpanProfileVisualization>> {
  return [
    {
      label: t('actions.span-exemplar-toggle.time-series', 'Time series'),
      value: 'time-series',
      icon: 'chart-line',
    },
    {
      label: t('actions.span-exemplar-toggle.span-heatmap', 'Span heatmap'),
      value: SPAN_HEATMAP,
      icon: 'gf-grid',
    },
  ];
}

export class SpanExemplarToggleAction extends SceneObjectBase<SpanExemplarToggleActionState> {
  constructor(showSpanHeatmap: boolean) {
    super({ showSpanHeatmap });
  }

  public onChange = (visualization: SpanProfileVisualization) => {
    const showSpanHeatmap = visualization === SPAN_HEATMAP;
    if (showSpanHeatmap === this.state.showSpanHeatmap || (showSpanHeatmap && this.state.hasSpanData === false)) {
      return;
    }

    reportInteraction('g_pyroscope_app_span_heatmap_toggled', { showSpanHeatmap });
    this.setState({ showSpanHeatmap });
    this.publishEvent(new SpanProfilesToggled({ enabled: showSpanHeatmap }), true);
  };

  public static Component = ({ model }: SceneComponentProps<SpanExemplarToggleAction>) => {
    return <SpanProfileVisualizationPicker model={model} />;
  };
}

export function SpanProfileVisualizationPicker({ model }: { model: SpanExemplarToggleAction }) {
  const { showSpanHeatmap, hasSpanData } = model.useState();
  const radioGroup = (
    <RadioButtonGroup
      aria-label={t('actions.span-exemplar-toggle.aria-label', 'Profile timeline visualization')}
      options={getOptions()}
      value={showSpanHeatmap ? SPAN_HEATMAP : 'time-series'}
      disabledOptions={hasSpanData === false ? [SPAN_HEATMAP] : []}
      size="sm"
      onChange={model.onChange}
    />
  );

  if (hasSpanData !== false) {
    return radioGroup;
  }

  return (
    <Tooltip
      content={t(
        'actions.span-exemplar-toggle.unavailable',
        'No span profiles are available for the current service, filters, and time range'
      )}
      placement="top"
    >
      <div>{radioGroup}</div>
    </Tooltip>
  );
}
