import { createDataFrame, DataFrame, DataFrameType, DataTopic, FieldType, MutableDataFrame } from '@grafana/data';
import { ScaleDistribution, ScaleDistributionConfig } from '@grafana/schema';
import { SelectHeatmapResponse } from '@shared/pyroscope-api/querier/v1/querier_pb';
import { HeatmapSeries } from '@shared/pyroscope-api/types/v1/types_pb';

export type HeatmapSlot = HeatmapSeries['slots'][number];

export interface ExemplarRow {
  profileId: string;
  timestamp: number;
  value: number;
  spanId?: string;
  spanName?: string;
}

/**
 * Builds a dense "heatmap-cells" DataFrame from a HeatmapSeries.
 *
 * All y buckets are emitted for every represented x slot because the Grafana heatmap panel
 * infers dimensions from the frame's rectangular scanline layout. When necessary, one
 * zero-count x column is inserted after the first slot to calibrate the requested bucket width.
 *
 * Fields: xMax (Time), yMin (Number, unit), count (Number).
 * frame.meta.type = DataFrameType.HeatmapCells
 */
export function buildHeatmapDataFrame(
  series: HeatmapSeries,
  unit: string,
  scaleDistribution: ScaleDistributionConfig = { type: ScaleDistribution.Linear },
  xBucketSize?: number
): MutableDataFrame | null {
  const slots = series?.slots;
  if (!slots?.length) {
    return null;
  }

  const sortedSlots = slots
    .map(normalizeHeatmapSlotBuckets)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  const xMaxValues: number[] = [];
  const yMinValues: number[] = [];
  const countValues: number[] = [];

  const resolvedXBucketSize = xBucketSize ?? getXBucketSize(sortedSlots);

  appendHeatmapSlots(sortedSlots, resolvedXBucketSize, xMaxValues, yMinValues, countValues);

  if (xMaxValues.length === 0) {
    return null;
  }

  // isHeatmapCellsDense returns true iff the frame has exactly one field named 'y', 'yMin',
  // or 'yMax'. With only yMin present it uses the linear scale and infers cell height from
  // the first two yMin values, so they must remain the response's evenly spaced bucket starts.
  const frame = new MutableDataFrame({
    name: 'heatmap',
    meta: {
      type: DataFrameType.HeatmapCells,
    },
    fields: [
      { name: 'xMax', type: FieldType.time, values: xMaxValues, config: {} },
      { name: 'yMin', type: FieldType.number, values: yMinValues, config: { unit, custom: { scaleDistribution } } },
      { name: 'count', type: FieldType.number, values: countValues, config: {} },
    ],
  });

  return frame;
}

export function normalizeHeatmapSlotBuckets(slot: HeatmapSlot): HeatmapSlot {
  const countsByBucketStart = new Map<number, number>();

  for (let index = 0; index < slot.yMin.length; index++) {
    const bucketStart = slot.yMin[index];
    countsByBucketStart.set(bucketStart, (countsByBucketStart.get(bucketStart) ?? 0) + (slot.counts[index] ?? 0));
  }

  if (countsByBucketStart.size === slot.yMin.length) {
    return slot;
  }

  const yMin = [...countsByBucketStart.keys()].sort((a, b) => a - b);
  return {
    ...slot,
    yMin,
    counts: yMin.map((bucketStart) => countsByBucketStart.get(bucketStart) ?? 0),
  };
}

export function getXBucketSize(slots: HeatmapSlot[]): number {
  const timestamps = slots.map((slot) => Number(slot.timestamp)).sort((a, b) => a - b);
  const diffs = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index])
    .filter((diff) => diff > 0);

  return diffs.length > 0 ? Math.min(...diffs) : 0;
}

export function appendEmptyHeatmapSlot(
  xMax: number,
  yBucketStarts: number[],
  xMaxValues: number[],
  yMinValues: number[],
  countValues: number[]
) {
  for (const bucketStart of yBucketStarts) {
    xMaxValues.push(xMax);
    yMinValues.push(bucketStart);
    countValues.push(0);
  }
}

export function appendHeatmapSlots(
  slots: HeatmapSlot[],
  xBucketSize: number,
  xMaxValues: number[],
  yMinValues: number[],
  countValues: number[]
) {
  const firstSlot = slots[0];
  appendHeatmapSlot(firstSlot, xMaxValues, yMinValues, countValues);

  const calibrationTimestamp = Number(firstSlot.timestamp) + xBucketSize;
  const secondTimestamp = slots[1] ? Number(slots[1].timestamp) : undefined;
  if (xBucketSize > 0 && secondTimestamp !== calibrationTimestamp) {
    appendEmptyHeatmapSlot(calibrationTimestamp, firstSlot.yMin, xMaxValues, yMinValues, countValues);
  }

  for (let index = 1; index < slots.length; index++) {
    appendHeatmapSlot(slots[index], xMaxValues, yMinValues, countValues);
  }
}

export function appendHeatmapSlot(
  slot: HeatmapSlot,
  xMaxValues: number[],
  yMinValues: number[],
  countValues: number[]
) {
  const xMax = Number(slot.timestamp);
  const { yMin, counts } = slot;

  // Emit all buckets including zeros so the panel knows the full y extent.
  for (let j = 0; j < counts.length; j++) {
    xMaxValues.push(xMax);
    yMinValues.push(yMin[j]);
    countValues.push(counts[j]);
  }
}

interface CollectedExemplar {
  timestamp: number;
  value: number;
  id: string;
  labels: Record<string, string>;
}

/**
 * Builds an annotation DataFrame for heatmap exemplar markers, matching the format
 * produced by exemplar/exemplar.go (PR #120995).
 *
 * Includes all label fields (series labels merged with per-exemplar labels) so the
 * heatmap tooltip shows the same context as the exemplar popover in the timeseries view.
 *
 * The heatmap panel picks up frames with `meta.dataTopic === 'annotations'` and
 * `frame.name === 'exemplar'` to render as diamond markers.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export function buildExemplarDataFrame(response: SelectHeatmapResponse, unit: string): MutableDataFrame | null {
  const collected: CollectedExemplar[] = [];

  for (const series of response.series ?? []) {
    const seriesLabels: Record<string, string> = {};
    for (const label of series.labels ?? []) {
      seriesLabels[label.name] = label.value;
    }

    for (const slot of series.slots ?? []) {
      for (const exemplar of slot.exemplars ?? []) {
        const labels: Record<string, string> = { ...seriesLabels };
        for (const label of exemplar.labels ?? []) {
          labels[label.name] = label.value;
        }
        collected.push({
          timestamp: Number(exemplar.timestamp),
          value: Number(exemplar.value),
          id: exemplar.spanId || exemplar.profileId,
          labels,
        });
      }
    }
  }

  if (collected.length === 0) {
    return null;
  }

  // Collect all unique label names across all exemplars (sorted for consistency)
  const uniqLabelNames = new Set<string>();
  for (const e of collected) {
    for (const name of Object.keys(e.labels)) {
      uniqLabelNames.add(name);
    }
  }
  const sortedLabelNames = [...uniqLabelNames].sort();

  return new MutableDataFrame({
    name: 'exemplar',
    meta: { dataTopic: DataTopic.Annotations },
    fields: [
      { name: 'Time', type: FieldType.time, values: collected.map((e) => e.timestamp), config: {} },
      { name: 'Value', type: FieldType.number, values: collected.map((e) => e.value), config: { unit } },
      {
        name: 'Id',
        type: FieldType.string,
        values: collected.map((e) => e.id),
        config: { displayName: 'Span ID' },
      },
      ...sortedLabelNames.map((name: string) => ({
        name,
        type: FieldType.string,
        values: collected.map((e) => e.labels[name] ?? ''),
        config: {},
      })),
    ],
  });
}

export function buildHighlightedExemplarDataFrame(
  exemplarFrame: DataFrame,
  selectedSpanId?: string,
  selectedTimestamp?: number
): DataFrame | undefined {
  if (!selectedSpanId) {
    return undefined;
  }

  const idField = exemplarFrame.fields.find(({ name }) => name === 'Id');
  const timeField = exemplarFrame.fields.find(({ name }) => name === 'Time');
  if (!idField || !timeField) {
    return undefined;
  }

  const matchingIndex = idField.values.findIndex(
    (spanId, index) =>
      spanId === selectedSpanId &&
      (selectedTimestamp === undefined || timeField.values[index] === selectedTimestamp)
  );
  if (matchingIndex < 0) {
    return undefined;
  }

  const highlightedFrame = createDataFrame({
    ...exemplarFrame,
    refId: 'highlightedExemplar',
  });
  highlightedFrame.length = 1;
  highlightedFrame.fields.forEach((field) => {
    field.values = [field.values[matchingIndex]];
  });
  highlightedFrame.fields.push({
    name: 'highlighted',
    type: FieldType.string,
    values: ['true'],
    config: {},
  });

  return highlightedFrame;
}

/**
 * Collects all exemplars from a SelectHeatmap response and sorts by value descending
 * for the exemplar table. Returns every exemplar so the table stays in sync with the
 * heatmap markers (which are not truncated); the table itself paginates the list.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export function extractExemplarRows(response: SelectHeatmapResponse): ExemplarRow[] {
  const rows: ExemplarRow[] = [];

  for (const series of response.series ?? []) {
    for (const slot of series.slots ?? []) {
      for (const exemplar of slot.exemplars ?? []) {
        if (!exemplar.spanId && !exemplar.profileId) {
          continue;
        }
        const labels: Record<string, string> = {};
        for (const label of series.labels ?? []) {
          labels[label.name] = label.value;
        }
        for (const label of exemplar.labels ?? []) {
          labels[label.name] = label.value;
        }
        rows.push({
          profileId: exemplar.profileId,
          timestamp: Number(exemplar.timestamp),
          value: Number(exemplar.value),
          spanId: exemplar.spanId || undefined,
          spanName: labels['span_name'] || labels['span.name'] || undefined,
        });
      }
    }
  }

  rows.sort((a, b) => b.value - a.value);
  return rows;
}
