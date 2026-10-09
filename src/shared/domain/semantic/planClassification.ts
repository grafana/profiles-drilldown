import { buildJevRequest, Evidence } from './jevRubric';
import { SemanticOccurrence, SemanticProfile } from './normalizeFlameGraph';

export const MAX_SELECTED_OCCURRENCES = 40;

export interface SemanticCase {
  readonly evidence: Evidence;
  /** Selected rows sharing this evidence; each keeps its own self weight. */
  readonly rows: readonly number[];
  readonly self: number;
  /** Single-case request, used directly or combined into a bounded batch. */
  readonly request: string | null;
  readonly error?: string;
}

export interface SemanticPlan {
  readonly profile: SemanticProfile;
  /** Distinct evidence to classify, heaviest combined self first. */
  readonly cases: readonly SemanticCase[];
  /** Case index for every selected row; unselected rows are absent. */
  readonly caseByRow: ReadonlyMap<number, number>;
}

/**
 * Selects up to `limit` eligible occurrences: the `Math.ceil(limit / 2)` heaviest by self weight, then the rest
 * in path-fingerprint (`id`) order, so the selection does not depend on row order. Returns rows in selection order.
 */
export function selectOccurrences(profile: SemanticProfile, limit = MAX_SELECTED_OCCURRENCES): number[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SELECTED_OCCURRENCES) {
    throw new Error('Invalid selection limit');
  }
  const eligible = profile.occurrences.filter((o) => !o.excluded);
  const heaviest = [...eligible].sort((a, b) => b.self - a.self || byId(a, b)).slice(0, Math.ceil(limit / 2));
  const selected = new Set(heaviest.map((o) => o.row));
  for (const occurrence of eligible.sort(byId)) {
    if (selected.size >= limit) {
      break;
    }
    selected.add(occurrence.row);
  }
  return [...selected];
}

export function planClassification(
  profile: SemanticProfile,
  limit = MAX_SELECTED_OCCURRENCES,
  application?: string
): SemanticPlan {
  const selected =
    limit === Infinity
      ? profile.occurrences.filter((o) => o.total > 0 && (!o.excluded || o.excluded === 'zero_self')).map((o) => o.row)
      : selectOccurrences(profile, limit);
  const groups = new Map<string, { evidence: Evidence; rows: number[]; self: number }>();
  for (const row of selected) {
    const { evidence, self } = profile.occurrences[row];
    const key = JSON.stringify(evidence);
    const group = groups.get(key) ?? { evidence, rows: [], self: 0 };
    group.rows.push(row);
    group.self += self;
    groups.set(key, group);
  }
  const cases = [...groups]
    .sort(([keyA, a], [keyB, b]) => b.self - a.self || compare(keyA, keyB))
    .map(([, group]) => createCase(group, application));
  const caseByRow = new Map(cases.flatMap((c, index) => c.rows.map((row) => [row, index] as const)));
  return Object.freeze({ profile, cases: Object.freeze(cases), caseByRow });
}

function createCase(
  { evidence, rows, self }: { evidence: Evidence; rows: number[]; self: number },
  application?: string
): SemanticCase {
  let request: string | null = null;
  let error: string | undefined;
  try {
    request = buildJevRequest(evidence, application);
  } catch (e) {
    error = (e as Error).message;
  }
  return Object.freeze({ evidence, rows: Object.freeze(rows), self, request, error });
}

function byId(a: SemanticOccurrence, b: SemanticOccurrence): number {
  return compare(a.id, b.id);
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
