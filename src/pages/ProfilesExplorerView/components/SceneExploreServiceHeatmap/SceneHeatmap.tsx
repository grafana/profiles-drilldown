import { DataFrame, DataLinkClickEvent, LoadingState } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  PanelBuilders,
  SceneComponentProps,
  SceneDataNode,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  VizPanel,
} from '@grafana/scenes';
import { TooltipDisplayMode } from '@grafana/schema';
import { reportInteraction } from '@shared/domain/reportInteraction';
import React from 'react';

import { resolveExemplarTimestamp } from './domain/resolveExemplarTimestamp';
import { buildHighlightedExemplarDataFrame } from './infrastructure/buildHeatmapDataFrames';
import { SceneExploreServiceHeatmap } from './SceneExploreServiceHeatmap';

interface SceneHeatmapState extends SceneObjectState {
  body: VizPanel;
}

interface HeatmapPanelOptions {
  yAxis?: Record<string, unknown>;
  exemplars?: { color: string };
}

const EXEMPLAR_COLOR_DEFAULT = 'rgba(31, 120, 193, 0.7)';
const EXEMPLAR_COLOR_SELECTED = 'rgba(255, 152, 0, 1)';

export class SceneHeatmap extends SceneObjectBase<SceneHeatmapState> {
  constructor() {
    super({
      key: 'scene-heatmap',
      body: SceneHeatmap.buildPanel(),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  private static buildPanel(): VizPanel {
    return PanelBuilders.heatmap()
      .setTitle('Span Profile Heatmap')
      .setOption('calculate', false)
      .setOption('cellGap', 1)
      .setOption('color', { scheme: 'Spectral', steps: 64 })
      .setOption('tooltip', { mode: TooltipDisplayMode.Single, yHistogram: true, showColorScale: true })
      .setOption('exemplars', { color: EXEMPLAR_COLOR_DEFAULT })
      .setData(new SceneDataNode())
      .build();
  }

  onActivate() {
    let parent: SceneExploreServiceHeatmap | undefined;
    try {
      parent = sceneGraph.getAncestor(this, SceneExploreServiceHeatmap);
    } catch {
      return;
    }

    const parentSub = parent.subscribeToState((newState, prevState) => {
      if (
        newState.heatmapFrame !== prevState.heatmapFrame ||
        newState.exemplarFrame !== prevState.exemplarFrame ||
        newState.isLoading !== prevState.isLoading ||
        newState.selectedSpanId !== prevState.selectedSpanId ||
        newState.selectedTimestamp !== prevState.selectedTimestamp
      ) {
        this.updateData(
          newState.heatmapFrame,
          newState.exemplarFrame,
          newState.isLoading,
          newState.selectedSpanId,
          newState.selectedTimestamp,
          parent!
        );
      }
    });

    this.updateData(
      parent.state.heatmapFrame,
      parent.state.exemplarFrame,
      parent.state.isLoading,
      parent.state.selectedSpanId,
      parent.state.selectedTimestamp,
      parent
    );

    return () => parentSub.unsubscribe();
  }

  private updateData(
    frame: DataFrame | undefined,
    exemplarFrame: DataFrame | undefined,
    isLoading: boolean,
    selectedSpanId: string | undefined,
    selectedTimestamp: number | undefined,
    parent: SceneExploreServiceHeatmap
  ) {
    const timeRange = sceneGraph.getTimeRange(this).state.value;
    const annotations: DataFrame[] = [];
    const currentOptions = this.state.body.state.options as HeatmapPanelOptions;
    let options = {
      ...currentOptions,
      yAxis: {
        ...currentOptions.yAxis,
        min: getHeatmapYAxisMin(frame),
      },
    };

    if (exemplarFrame) {
      const idField = exemplarFrame.fields.find((f) => f.name === 'Id');
      const timeField = exemplarFrame.fields.find((f) => f.name === 'Time');

      if (idField) {
        idField.config = {
          ...idField.config,
          links: [
            {
              title: t('heatmap.exemplar.select', 'Select exemplar'),
              url: '',
              onClick: (event: DataLinkClickEvent) => {
                const spanId = getDataLinkString(event, [
                  '${__value.raw}',
                  '${__data.fields.Id}',
                  '${__data.fields[Id]}',
                  '${__data.fields["Id"]}',
                  '${__data.fields[2]}',
                ]);
                if (!spanId) {
                  return;
                }

                // The interpolated Time string is lossy (formatted, truncated to
                // seconds, parsed as local time), so we use it only to disambiguate
                // duplicate span ids, then snap to the exact raw Time value from the
                // frame. Matching the exact frame value is required for the selected
                // exemplar lookup (and the table row highlight) to succeed.
                const approxTimestamp = getDataLinkTimestamp(event);
                const timestamp = resolveExemplarTimestamp(idField, timeField, spanId, approxTimestamp);

                const isSelected =
                  spanId === parent.state.selectedSpanId && timestamp === parent.state.selectedTimestamp;
                reportInteraction('g_pyroscope_app_span_exemplar_selected', {
                  source: 'heatmap',
                  selected: !isSelected,
                });
                parent.setState({
                  selectedSpanId: isSelected ? undefined : spanId,
                  selectedProfileId: undefined,
                  selectedTimestamp: isSelected ? undefined : timestamp,
                });
              },
            },
          ],
        };
      }

      const highlightedFrame = buildHighlightedExemplarDataFrame(exemplarFrame, selectedSpanId, selectedTimestamp);
      annotations.push(highlightedFrame ?? exemplarFrame);

      const exemplarColor = highlightedFrame ? EXEMPLAR_COLOR_SELECTED : EXEMPLAR_COLOR_DEFAULT;
      options = { ...options, exemplars: { color: exemplarColor } };
    }

    this.state.body.setState({ options });

    (this.state.body.state.$data as SceneDataNode).setState({
      data: {
        state: isLoading ? LoadingState.Loading : LoadingState.Done,
        series: frame ? [frame] : [],
        annotations,
        timeRange,
      },
    });
  }

  static Component({ model }: SceneComponentProps<SceneHeatmap>) {
    const { body } = model.useState();
    return <body.Component model={body} />;
  }
}

export function getHeatmapYAxisMin(frame: DataFrame | undefined): number {
  const [lowestBucketStart, nextBucketStart] = getDistinctYBucketStarts(frame);
  if (lowestBucketStart === undefined) {
    return 0;
  }

  const bucketSize = nextBucketStart === undefined ? lowestBucketStart : nextBucketStart - lowestBucketStart;
  return Math.max(0, lowestBucketStart - bucketSize);
}

function getDistinctYBucketStarts(frame: DataFrame | undefined): number[] {
  const yMinField = frame?.fields.find((field) => field.name === 'yMin');
  if (!yMinField || yMinField.values.length === 0) {
    return [];
  }

  const bucketStarts = new Set<number>();
  for (let index = 0; index < yMinField.values.length; index++) {
    const value = yMinField.values[index];
    if (typeof value === 'number') {
      bucketStarts.add(value);
    }
  }

  return [...bucketStarts].sort((a, b) => a - b);
}

function getDataLinkString(event: DataLinkClickEvent, variableNames: string[]): string | undefined {
  for (const variableName of variableNames) {
    const value = event.replaceVariables?.(variableName);

    if (value && value !== variableName) {
      return value;
    }
  }

  return undefined;
}

function getDataLinkTimestamp(event: DataLinkClickEvent): number | undefined {
  const value = getDataLinkString(event, [
    '${__data.fields.Time}',
    '${__data.fields[Time]}',
    '${__data.fields["Time"]}',
    '${__data.fields[0]}',
  ]);

  if (!value) {
    return undefined;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
