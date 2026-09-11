import { SelectHeatmapResponse } from '@shared/pyroscope-api/querier/v1/querier_pb';
import { HeatmapSeries } from '@shared/pyroscope-api/types/v1/types_pb';

import {
  appendEmptyHeatmapSlot,
  appendHeatmapSlot,
  appendHeatmapSlots,
  buildExemplarDataFrame,
  buildHeatmapDataFrame,
  buildHighlightedExemplarDataFrame,
  extractExemplarRows,
  getXBucketSize,
  HeatmapSlot,
  normalizeHeatmapSlotBuckets,
} from '../buildHeatmapDataFrames';

describe('buildHeatmapDataFrame', () => {
  it('returns null without slots or heatmap cells', () => {
    expect(buildHeatmapDataFrame({ slots: [] } as unknown as HeatmapSeries, 'ms')).toBeNull();
    expect(
      buildHeatmapDataFrame(
        { slots: [{ timestamp: 1000, yMin: [], counts: [] }] } as unknown as HeatmapSeries,
        'ms'
      )
    ).toBeNull();
  });

  it('adds one zero-count column to calibrate a sparse initial timestamp gap', () => {
    const series = {
      slots: [
        { timestamp: 1000, yMin: [0, 10], counts: [1, 2] },
        { timestamp: 4000, yMin: [0, 10], counts: [3, 4] },
        { timestamp: 5000, yMin: [0, 10], counts: [5, 6] },
      ],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms');

    expect(frame?.fields.map((field) => field.name)).toEqual(['xMax', 'yMin', 'count']);
    expect([...new Set(frame?.fields.find((field) => field.name === 'xMax')?.values)]).toEqual([
      1000, 2000, 4000, 5000,
    ]);
    expect(frame?.fields.find((field) => field.name === 'count')?.values).toEqual([1, 2, 0, 0, 3, 4, 5, 6]);
  });

  it('does not add a calibration column when the first two slots are one step apart', () => {
    const series = {
      slots: [
        { timestamp: 1000, yMin: [0, 10], counts: [1, 2] },
        { timestamp: 2000, yMin: [0, 10], counts: [3, 4] },
      ],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms', undefined, 1000);

    expect(frame?.fields.find((field) => field.name === 'xMax')?.values).toEqual([1000, 1000, 2000, 2000]);
    expect(frame?.fields.find((field) => field.name === 'count')?.values).toEqual([1, 2, 3, 4]);
  });

  it('uses the requested step when omitted slots make timestamps sparse', () => {
    const series = {
      slots: [
        { timestamp: 1000, yMin: [0], counts: [1] },
        { timestamp: 3000, yMin: [0], counts: [2] },
      ],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms', undefined, 1000);

    expect([...new Set(frame?.fields.find((field) => field.name === 'xMax')?.values)]).toEqual([1000, 2000, 3000]);
  });

  it('adds a complete calibration column for a single slot when the requested step is known', () => {
    const series = {
      slots: [{ timestamp: 1000, yMin: [0, 10], counts: [1, 2] }],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms', undefined, 1000);

    expect(frame?.fields.find((field) => field.name === 'xMax')?.values).toEqual([1000, 1000, 2000, 2000]);
    expect(frame?.fields.find((field) => field.name === 'yMin')?.values).toEqual([0, 10, 0, 10]);
    expect(frame?.fields.find((field) => field.name === 'count')?.values).toEqual([1, 2, 0, 0]);
  });

  it('preserves a nonzero bucket origin so Grafana infers the correct cell height', () => {
    const series = {
      slots: [{ timestamp: 1000, yMin: [10, 604, 1198], counts: [1, 2, 3] }],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms');
    const yMinValues = frame?.fields.find((field) => field.name === 'yMin')?.values;

    expect(yMinValues).toEqual([10, 604, 1198]);
    expect(yMinValues![1] - yMinValues![0]).toBe(594);
  });

  it('collapses duplicate bucket starts so Grafana infers the correct cell width', () => {
    const duplicateBuckets = Array(20).fill(10_000_000);
    const counts = [...Array(19).fill(0), 1];
    const series = {
      slots: [
        { timestamp: 1000, yMin: duplicateBuckets, counts },
        { timestamp: 2000, yMin: duplicateBuckets, counts },
      ],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ns');

    expect(frame?.fields.find((field) => field.name === 'xMax')?.values).toEqual([1000, 2000]);
    expect(frame?.fields.find((field) => field.name === 'yMin')?.values).toEqual([10_000_000, 10_000_000]);
    expect(frame?.fields.find((field) => field.name === 'count')?.values).toEqual([1, 1]);
  });

  it('sums counts from duplicate bucket starts without mutating the response', () => {
    const yMin = [0, 10, 10, 20];
    const counts = [1, 2, 3, 4];
    const series = {
      slots: [{ timestamp: 1000, yMin, counts }],
    } as unknown as HeatmapSeries;

    const frame = buildHeatmapDataFrame(series, 'ms');

    expect(frame?.fields.find((field) => field.name === 'yMin')?.values).toEqual([0, 10, 20]);
    expect(frame?.fields.find((field) => field.name === 'count')?.values).toEqual([1, 5, 4]);
    expect(yMin).toEqual([0, 10, 10, 20]);
    expect(counts).toEqual([1, 2, 3, 4]);
  });
});

describe('normalizeHeatmapSlotBuckets', () => {
  it('returns slots with unique bucket starts unchanged', () => {
    const slot = { timestamp: 1000, yMin: [0, 10], counts: [1, 2] } as unknown as HeatmapSlot;

    expect(normalizeHeatmapSlotBuckets(slot)).toBe(slot);
  });

  it('sorts duplicate bucket starts and sums their counts without mutating the slot', () => {
    const yMin = [20, 10, 10];
    const counts = [4, 2, 3];
    const slot = { timestamp: 1000, yMin, counts } as unknown as HeatmapSlot;

    expect(normalizeHeatmapSlotBuckets(slot)).toEqual({ timestamp: 1000, yMin: [10, 20], counts: [5, 4] });
    expect(yMin).toEqual([20, 10, 10]);
    expect(counts).toEqual([4, 2, 3]);
  });

  it('treats a missing count as zero', () => {
    const slot = { timestamp: 1000, yMin: [10, 10], counts: [2] } as unknown as HeatmapSlot;

    expect(normalizeHeatmapSlotBuckets(slot)).toEqual({ timestamp: 1000, yMin: [10], counts: [2] });
  });
});

describe('getXBucketSize', () => {
  it('returns the smallest positive difference between timestamps', () => {
    const slots = [4000, 1000, 1000, 3000].map((timestamp) => ({ timestamp }) as unknown as HeatmapSlot);

    expect(getXBucketSize(slots)).toBe(1000);
  });

  it('returns zero without two distinct timestamps', () => {
    const slots = [{ timestamp: 1000 }, { timestamp: 1000 }] as unknown as HeatmapSlot[];

    expect(getXBucketSize(slots)).toBe(0);
  });
});

describe('heatmap slot appenders', () => {
  it('appends a complete zero-count column', () => {
    const xMaxValues: number[] = [];
    const yMinValues: number[] = [];
    const countValues: number[] = [];

    appendEmptyHeatmapSlot(2000, [10, 20], xMaxValues, yMinValues, countValues);

    expect(xMaxValues).toEqual([2000, 2000]);
    expect(yMinValues).toEqual([10, 20]);
    expect(countValues).toEqual([0, 0]);
  });

  it('appends every bucket from a real slot, including zero counts', () => {
    const xMaxValues: number[] = [];
    const yMinValues: number[] = [];
    const countValues: number[] = [];
    const slot = { timestamp: 1000, yMin: [10, 20], counts: [1, 0] } as unknown as HeatmapSlot;

    appendHeatmapSlot(slot, xMaxValues, yMinValues, countValues);

    expect(xMaxValues).toEqual([1000, 1000]);
    expect(yMinValues).toEqual([10, 20]);
    expect(countValues).toEqual([1, 0]);
  });

  it('adds one calibration column when the second slot is not one step after the first', () => {
    const xMaxValues: number[] = [];
    const yMinValues: number[] = [];
    const countValues: number[] = [];
    const slots = [
      { timestamp: 1000, yMin: [10, 20], counts: [1, 2] },
      { timestamp: 4000, yMin: [10, 20], counts: [3, 4] },
    ] as unknown as HeatmapSlot[];

    appendHeatmapSlots(slots, 1000, xMaxValues, yMinValues, countValues);

    expect(xMaxValues).toEqual([1000, 1000, 2000, 2000, 4000, 4000]);
    expect(yMinValues).toEqual([10, 20, 10, 20, 10, 20]);
    expect(countValues).toEqual([1, 2, 0, 0, 3, 4]);
  });

  it('does not calibrate adjacent slots or a single slot without a bucket size', () => {
    const adjacentXMaxValues: number[] = [];
    const adjacentYMinValues: number[] = [];
    const adjacentCountValues: number[] = [];
    const adjacentSlots = [
      { timestamp: 1000, yMin: [10], counts: [1] },
      { timestamp: 2000, yMin: [10], counts: [2] },
    ] as unknown as HeatmapSlot[];

    appendHeatmapSlots(adjacentSlots, 1000, adjacentXMaxValues, adjacentYMinValues, adjacentCountValues);
    expect(adjacentXMaxValues).toEqual([1000, 2000]);

    const singleXMaxValues: number[] = [];
    appendHeatmapSlots(adjacentSlots.slice(0, 1), 0, singleXMaxValues, [], []);
    expect(singleXMaxValues).toEqual([1000]);
  });
});

describe('extractExemplarRows', () => {
  it('preserves duplicate span IDs at different timestamps', () => {
    const response = {
      series: [
        {
          labels: [{ name: 'span_name', value: 'GET /api' }],
          slots: [
            {
              exemplars: [
                { profileId: 'profile-1', spanId: 'span-a', timestamp: 1, value: 10, labels: [] },
                { profileId: 'profile-2', spanId: 'span-a', timestamp: 2, value: 20, labels: [] },
              ],
            },
          ],
        },
      ],
    } as unknown as SelectHeatmapResponse;

    expect(extractExemplarRows(response)).toEqual([
      { profileId: 'profile-2', timestamp: 2, value: 20, spanId: 'span-a', spanName: 'GET /api' },
      { profileId: 'profile-1', timestamp: 1, value: 10, spanId: 'span-a', spanName: 'GET /api' },
    ]);
  });

  it('skips unidentified exemplars and lets exemplar labels override series labels', () => {
    const response = {
      series: [
        {
          labels: [{ name: 'span.name', value: 'series span' }],
          slots: [
            {
              exemplars: [
                { profileId: '', spanId: '', timestamp: 1, value: 10, labels: [] },
                {
                  profileId: 'profile-1',
                  spanId: '',
                  timestamp: 2,
                  value: 20,
                  labels: [{ name: 'span.name', value: 'exemplar span' }],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as SelectHeatmapResponse;

    expect(extractExemplarRows(response)).toEqual([
      {
        profileId: 'profile-1',
        timestamp: 2,
        value: 20,
        spanId: undefined,
        spanName: 'exemplar span',
      },
    ]);
  });
});

describe('buildExemplarDataFrame', () => {
  it('returns null without exemplars', () => {
    expect(buildExemplarDataFrame({} as SelectHeatmapResponse, 'ns')).toBeNull();
  });

  it('merges series and exemplar labels into sorted fields', () => {
    const response = {
      series: [
        {
          labels: [
            { name: 'service', value: 'api' },
            { name: 'zone', value: 'series-zone' },
          ],
          slots: [
            {
              exemplars: [
                {
                  profileId: 'profile-1',
                  spanId: '',
                  timestamp: 1,
                  value: 10,
                  labels: [{ name: 'zone', value: 'exemplar-zone' }],
                },
                { profileId: 'profile-2', spanId: 'span-2', timestamp: 2, value: 20, labels: [] },
              ],
            },
          ],
        },
      ],
    } as unknown as SelectHeatmapResponse;

    const frame = buildExemplarDataFrame(response, 'ns');

    expect(frame?.fields.map(({ name }) => name)).toEqual(['Time', 'Value', 'Id', 'service', 'zone']);
    expect(frame?.fields.map(({ values }) => values)).toEqual([
      [1, 2],
      [10, 20],
      ['profile-1', 'span-2'],
      ['api', 'api'],
      ['exemplar-zone', 'series-zone'],
    ]);
  });
});

describe('buildHighlightedExemplarDataFrame', () => {
  it('selects the exact exemplar when a span ID occurs at multiple timestamps', () => {
    const response = {
      series: [
        {
          slots: [
            {
              exemplars: [
                { profileId: 'profile-1', spanId: 'span-a', timestamp: 1, value: 10, labels: [] },
                { profileId: 'profile-2', spanId: 'span-a', timestamp: 2, value: 20, labels: [] },
              ],
            },
          ],
        },
      ],
    } as unknown as SelectHeatmapResponse;
    const frame = buildExemplarDataFrame(response, 'ns');

    expect(buildHighlightedExemplarDataFrame(frame!, 'span-a', 2)?.fields.map(({ values }) => values)).toEqual([
      [2],
      [20],
      ['span-a'],
      ['true'],
    ]);

    expect(buildHighlightedExemplarDataFrame(frame!)).toBeUndefined();
    expect(buildHighlightedExemplarDataFrame(frame!, 'missing')).toBeUndefined();
    expect(
      buildHighlightedExemplarDataFrame({ ...frame!, length: frame!.length, fields: [] }, 'span-a')
    ).toBeUndefined();
    expect(buildHighlightedExemplarDataFrame(frame!, 'span-a')?.fields[0].values).toEqual([1]);
  });
});
