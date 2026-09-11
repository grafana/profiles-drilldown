import { createDataFrame, FieldType } from '@grafana/data';

import { resolveExemplarTimestamp } from '../domain/resolveExemplarTimestamp';

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
