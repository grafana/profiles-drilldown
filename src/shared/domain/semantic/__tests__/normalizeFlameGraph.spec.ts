import { createDataFrame, DataFrame, FieldType } from '@grafana/data';

import { normalizeFlameGraph } from '../normalizeFlameGraph';

type Row = [level: number, label: string, value: number, self: number];

function flameGraph(rows: Row[]): DataFrame {
  return createDataFrame({
    name: 'response',
    meta: { preferredVisualisationType: 'flamegraph' },
    fields: [
      { name: 'level', type: FieldType.number, values: rows.map((r) => r[0]) },
      { name: 'label', type: FieldType.string, values: rows.map((r) => r[1]) },
      { name: 'self', type: FieldType.number, values: rows.map((r) => r[3]) },
      { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]) },
    ],
  });
}

// server and client both call parse; DFS order as produced by the Pyroscope data source.
const contexts: Row[] = [
  [0, 'total', 10, 0],
  [1, 'server', 6, 2],
  [2, 'parse', 4, 4],
  [1, 'client', 4, 1],
  [2, 'parse', 3, 3],
];

describe('normalizeFlameGraph', () => {
  it('keeps every original row as an occurrence with exact self accounting', () => {
    const profile = normalizeFlameGraph(flameGraph(contexts));

    expect(profile.total).toBe(10);
    expect(profile.occurrences.map((o) => [o.row, o.level, o.label, o.total, o.self])).toEqual(
      contexts.map(([level, label, value, self], row) => [row, level, label, value, self])
    );
    expect(profile.occurrences.reduce((sum, o) => sum + o.self, 0)).toBe(10);
  });

  it('keeps same-name functions in different contexts distinct', () => {
    const parses = normalizeFlameGraph(flameGraph(contexts)).occurrences.filter((o) => o.label === 'parse');

    expect(parses.map((o) => o.row)).toEqual([2, 4]);
    expect(parses[0].id).not.toBe(parses[1].id);
    expect(parses.map((o) => o.evidence)).toEqual([
      { target: 'parse', callers: ['server'] },
      { target: 'parse', callers: ['client'] },
    ]);
  });

  it('keeps duplicate same-name sibling rows distinguishable', () => {
    const profile = normalizeFlameGraph(
      flameGraph([
        [0, 'total', 5, 0],
        [1, 'main', 5, 0],
        [2, 'work', 2, 2],
        [2, 'work', 3, 3],
      ])
    );
    const [first, second] = profile.occurrences.slice(2);

    expect(first.id).not.toBe(second.id);
    expect(first.evidence).toEqual(second.evidence);
    expect([first.self, second.self]).toEqual([2, 3]);
  });

  it('derives identity from the call path rather than the row index', () => {
    const alone = normalizeFlameGraph(
      flameGraph([
        [0, 'total', 1, 0],
        [1, 'b', 1, 0],
        [2, 'x', 1, 1],
      ])
    );
    const withSibling = normalizeFlameGraph(
      flameGraph([
        [0, 'total', 2, 0],
        [1, 'a', 1, 0],
        [2, 'x', 1, 1],
        [1, 'b', 1, 0],
        [2, 'x', 1, 1],
      ])
    );

    expect(withSibling.occurrences[4].id).toBe(alone.occurrences[2].id);
    expect(withSibling.occurrences[2].id).not.toBe(alone.occurrences[2].id);
  });

  it('bounds evidence to the 512-character target and eight outermost-to-immediate callers', () => {
    const long = 'f'.repeat(600);
    const rows: Row[] = [[0, 'total', 1, 0]];
    for (let level = 1; level <= 11; level++) {
      rows.push([level, `c${level}`, 1, 0]);
    }
    rows.push([12, long, 1, 1]);
    const target = normalizeFlameGraph(flameGraph(rows)).occurrences[12];

    expect(target.label).toBe(long);
    expect(target.evidence.target).toBe(long.slice(0, 512));
    expect(target.evidence.callers).toEqual(['c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
    expect(Object.isFrozen(target.evidence)).toBe(true);
    expect(Object.isFrozen(target.evidence.callers)).toBe(true);
    expect(Object.isFrozen(target)).toBe(true);
  });

  it('excludes root, truncated, opaque and zero-self rows while retaining their mass', () => {
    const profile = normalizeFlameGraph(
      flameGraph([
        [0, 'total', 12, 0],
        [1, 'other', 2, 2],
        [1, '[unknown]', 1, 1],
        [1, '<anonymous>', 1, 1],
        [1, 'V8::ExitFrame', 1, 1],
        [1, '0x7fff1234', 1, 1],
        [1, 'libfoo.so!0x1a2b', 1, 1],
        [1, 'main', 5, 0],
        [2, 'work', 5, 5],
      ])
    );

    expect(profile.occurrences.map((o) => o.excluded)).toEqual([
      'root',
      'truncated',
      'opaque',
      'opaque',
      'opaque',
      'opaque',
      'opaque',
      'zero_self',
      undefined,
    ]);
    expect(profile.occurrences.reduce((sum, o) => sum + o.self, 0)).toBe(profile.total);
  });

  it('reads enum labels as produced by the Grafana Pyroscope data source', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0, 1] },
        {
          name: 'label',
          type: FieldType.enum,
          values: [0, 1],
          config: { type: { enum: { text: ['total', 'main'] } } },
        },
        { name: 'self', type: FieldType.number, values: [0, 3] },
        { name: 'value', type: FieldType.number, values: [3, 3] },
      ],
    });

    expect(normalizeFlameGraph(frame).occurrences.map((o) => o.label)).toEqual(['total', 'main']);
  });

  it('does not mutate the DataFrame', () => {
    const frame = flameGraph(contexts);
    frame.fields.forEach((f) => Object.freeze(f.values));
    Object.freeze(frame.fields);

    expect(normalizeFlameGraph(frame).total).toBe(10);
  });

  it('returns an empty profile for an empty frame', () => {
    expect(normalizeFlameGraph(flameGraph([]))).toEqual({ total: 0, occurrences: [] });
  });

  it('rejects diff flame graphs', () => {
    const frame = flameGraph(contexts);
    frame.fields.push(
      { name: 'selfRight', type: FieldType.number, config: {}, values: [0, 0, 0, 0, 0] },
      { name: 'valueRight', type: FieldType.number, config: {}, values: [0, 0, 0, 0, 0] }
    );

    expect(() => normalizeFlameGraph(frame)).toThrow('Diff flame graphs are not supported');
  });

  it.each([
    ['a missing field', (f: DataFrame) => f.fields.splice(0, 1), 'Flame graph is missing the level field'],
    ['a duplicate field', (f: DataFrame) => f.fields.push(f.fields[0]), 'Flame graph has duplicate level fields'],
    [
      'a mistyped field',
      (f: DataFrame) => (f.fields[2] = { ...f.fields[2], type: FieldType.string }),
      'Flame graph field self has an unsupported type',
    ],
    [
      'a short field',
      (f: DataFrame) => (f.fields[3] = { ...f.fields[3], values: [10] }),
      'Flame graph field value has the wrong length',
    ],
    ['a non-string label', (f: DataFrame) => (f.fields[1].values[2] = 7), 'Flame graph row 2 has an invalid label'],
  ])('rejects %s', (_name, change, message) => {
    const frame = flameGraph(contexts);
    change(frame);

    expect(() => normalizeFlameGraph(frame)).toThrow(message);
  });

  it('rejects enum labels outside the enum text', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: [0] },
        { name: 'label', type: FieldType.enum, values: [3], config: { type: { enum: { text: ['total'] } } } },
        { name: 'self', type: FieldType.number, values: [0] },
        { name: 'value', type: FieldType.number, values: [0] },
      ],
    });

    expect(() => normalizeFlameGraph(frame)).toThrow('Flame graph row 0 has an invalid label');
  });

  it.each<[string, Row[], string]>([
    ['an unsafe integer', [[0, 'total', 2 ** 53, 2 ** 53]], 'Flame graph row 0 has an invalid value'],
    ['a negative weight', [[0, 'total', -1, 0]], 'Flame graph row 0 has an invalid value'],
    ['a fractional weight', [[0, 'total', 1, 0.5]], 'Flame graph row 0 has an invalid self'],
    ['a NaN weight', [[0, 'total', NaN, 0]], 'Flame graph row 0 has an invalid value'],
    ['self above value', [[0, 'total', 1, 2]], 'Flame graph row 0 has self above value'],
    ['a fractional level', [[0.5, 'total', 0, 0]], 'Flame graph row 0 has an invalid level'],
    ['a non-root first row', [[1, 'total', 0, 0]], 'Flame graph must start with a single total root'],
    ['a renamed root', [[0, 'root', 0, 0]], 'Flame graph must start with a single total root'],
    [
      'a second root',
      [
        [0, 'total', 1, 1],
        [0, 'total', 1, 1],
      ],
      'Flame graph must start with a single total root',
    ],
    [
      'a skipped level',
      [
        [0, 'total', 1, 0],
        [2, 'a', 1, 1],
      ],
      'Flame graph row 1 skips a level',
    ],
    [
      'children heavier than their parent',
      [
        [0, 'total', 2, 0],
        [1, 'a', 1, 0],
        [2, 'b', 2, 2],
      ],
      'Profile mass is not conserved',
    ],
    [
      'missing mass',
      [
        [0, 'total', 3, 0],
        [1, 'a', 2, 1],
      ],
      'Profile mass is not conserved',
    ],
  ])('rejects %s', (_name, rows, message) => {
    expect(() => normalizeFlameGraph(flameGraph(rows))).toThrow(message);
  });

  it('accepts 1024 levels and rejects deeper profiles', () => {
    const chain = (levels: number): Row[] =>
      Array.from({ length: levels }, (_, level) => [
        level,
        level ? `f${level}` : 'total',
        1,
        level === levels - 1 ? 1 : 0,
      ]);

    expect(normalizeFlameGraph(flameGraph(chain(1024))).total).toBe(1);
    expect(() => normalizeFlameGraph(flameGraph(chain(1025)))).toThrow('Flame graph row 1024 has an invalid level');
  });

  it('rejects profiles with more than 100000 rows', () => {
    const rows: Row[] = [[0, 'total', 100_000, 0]];
    for (let i = 0; i < 100_000; i++) {
      rows.push([1, `f${i}`, 1, 1]);
    }

    expect(() => normalizeFlameGraph(flameGraph(rows))).toThrow('Flame graph has too many rows');
  });
});
