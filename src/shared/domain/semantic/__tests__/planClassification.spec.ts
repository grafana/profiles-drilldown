import { createDataFrame, FieldType } from '@grafana/data';

import { buildJevRequest } from '../jevRubric';
import { normalizeFlameGraph, SemanticProfile } from '../normalizeFlameGraph';
import { MAX_SELECTED_OCCURRENCES, planClassification, selectOccurrences } from '../planClassification';

type Row = [level: number, label: string, value: number, self: number];

function profileOf(rows: Row[]): SemanticProfile {
  return normalizeFlameGraph(
    createDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: rows.map((r) => r[0]) },
        { name: 'label', type: FieldType.string, values: rows.map((r) => r[1]) },
        { name: 'self', type: FieldType.number, values: rows.map((r) => r[3]) },
        { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]) },
      ],
    })
  );
}

function flat(children: Array<[label: string, self: number]>): Row[] {
  const total = children.reduce((sum, [, self]) => sum + self, 0);
  return [[0, 'total', total, 0], ...children.map(([label, self]): Row => [1, label, self, self])];
}

const idsOf = (profile: SemanticProfile, rows: readonly number[]) => rows.map((row) => profile.occurrences[row].id);

describe('selectOccurrences', () => {
  it('takes the heaviest half, fills by stable identity and never selects excluded mass', () => {
    const profile = profileOf(
      flat([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
        ['[unknown]', 100],
      ])
    );
    const selected = selectOccurrences(profile, 3);
    const labels = selected.map((row) => profile.occurrences[row].label);

    expect(selected).toHaveLength(3);
    expect(labels.slice(0, 2)).toEqual(['e', 'd']);
    expect(labels).not.toContain('[unknown]');
  });

  it('does not depend on row order', () => {
    const children: Array<[string, number]> = Array.from({ length: 60 }, (_, i) => [`f${i}`, (i % 7) + 1]);
    const forward = profileOf(flat(children));
    const reversed = profileOf(flat([...children].reverse()));

    expect(new Set(idsOf(forward, selectOccurrences(forward)))).toEqual(
      new Set(idsOf(reversed, selectOccurrences(reversed)))
    );
  });

  it('selects at most 40 occurrences', () => {
    const profile = profileOf(flat(Array.from({ length: 60 }, (_, i) => [`f${i}`, 1])));

    expect(MAX_SELECTED_OCCURRENCES).toBe(40);
    expect(new Set(selectOccurrences(profile)).size).toBe(40);
  });

  it.each([0, 41, 1.5])('rejects the limit %p', (limit) => {
    expect(() => selectOccurrences(profileOf(flat([['a', 1]])), limit)).toThrow('Invalid selection limit');
  });
});

describe('planClassification', () => {
  it('selects every named occurrence, including zero-self callers, with an unlimited plan', () => {
    const profile = profileOf([
      [0, 'total', 64, 0],
      [1, 'dispatcher', 64, 0],
      ...Array.from({ length: 60 }, (_, i): Row => [2, `function${i}`, 1, 1]),
      [2, '[unknown]', 2, 2],
      [2, 'other', 2, 2],
    ]);
    const plan = planClassification(profile, Infinity, 'my-service');

    expect(plan.caseByRow.size).toBe(61);
    expect(plan.caseByRow.has(1)).toBe(true);
    expect(plan.cases.reduce((sum, c) => sum + c.self, 0)).toBe(60);
    expect(plan.cases.every((c) => !['total', '[unknown]', 'other'].includes(c.evidence.target))).toBe(true);
  });

  it('shares one case between selected occurrences with identical evidence', () => {
    const profile = profileOf([
      [0, 'total', 9, 0],
      [1, 'main', 9, 0],
      [2, 'work', 2, 2],
      [2, 'work', 3, 3],
      [2, 'other_work', 4, 4],
    ]);
    const plan = planClassification(profile);

    expect(plan.cases.map((c) => [c.evidence.target, c.rows, c.self])).toEqual([
      ['work', [3, 2], 5],
      ['other_work', [4], 4],
    ]);
    expect(plan.caseByRow).toEqual(
      new Map([
        [2, 0],
        [3, 0],
        [4, 1],
      ])
    );
  });

  it('freezes the evidence and the exact request sent for it', () => {
    const profile = profileOf(flat([['JSON.stringify', 3]]));
    const [only] = planClassification(profile).cases;

    expect(only.evidence).toBe(profile.occurrences[1].evidence);
    expect(only.request).toBe(buildJevRequest(only.evidence));
    expect(Object.isFrozen(only)).toBe(true);
    expect(Object.isFrozen(only.rows)).toBe(true);
  });

  it('keeps evidence that exceeds the payload budget as a failed case', () => {
    const escaped = '\u0001'.repeat(600);
    const rows: Row[] = [[0, 'total', 1, 0]];
    for (let level = 1; level <= 9; level++) {
      rows.push([level, `${escaped}${level}`, 1, level === 9 ? 1 : 0]);
    }
    const [only] = planClassification(profileOf(rows)).cases;

    expect(only.request).toBeNull();
    expect(only.error).toBe('Evidence exceeds the provider payload budget');
  });
});
