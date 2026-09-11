import { createDataFrame, FieldType } from '@grafana/data';

jest.mock('../SceneExploreServiceHeatmap', () => ({
  SceneExploreServiceHeatmap: class SceneExploreServiceHeatmap {},
}));

import { resolveExemplarTimestamp } from '../domain/resolveExemplarTimestamp';
import { getHeatmapYAxisMin } from '../SceneHeatmap';

describe('getHeatmapYAxisMin', () => {
  it('leaves one y bucket of room below multiple buckets', () => {
    const frame = createDataFrame({
      fields: [{ name: 'yMin', type: FieldType.number, values: [200, 210, 220, 200, 210, 220] }],
    });

    expect(getHeatmapYAxisMin(frame)).toBe(190);
  });

  it('clamps the lower padding at zero', () => {
    const frame = createDataFrame({
      fields: [{ name: 'yMin', type: FieldType.number, values: [10, 20, 30] }],
    });

    expect(getHeatmapYAxisMin(frame)).toBe(0);
  });

  it('uses the lowest bucket start as the size for a single bucket', () => {
    const frame = createDataFrame({
      fields: [{ name: 'yMin', type: FieldType.number, values: [10, 10] }],
    });

    expect(getHeatmapYAxisMin(frame)).toBe(0);
  });
});

describe('resolveExemplarTimestamp', () => {
  it('selects the exact timestamp when a span ID has multiple exemplars', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [1_000, 2_000] },
        { name: 'Id', type: FieldType.string, values: ['span-a', 'span-a'] },
      ],
    });

    expect(
      resolveExemplarTimestamp(
        frame.fields.find(({ name }) => name === 'Id'),
        frame.fields.find(({ name }) => name === 'Time'),
        'span-a',
        1_900
      )
    ).toBe(2_000);
  });
});
