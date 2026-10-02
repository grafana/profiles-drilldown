import { isConfidenceThreshold } from './confidenceThreshold';
import { CATEGORIES, CONFIDENCE_THRESHOLD, JevPrediction, KnownCategory } from './jevRubric';
import { ExclusionReason, SemanticOccurrence } from './normalizeFlameGraph';
import { CaseResult, ClassificationRun } from './runClassification';

export type OccurrenceStatus =
  | 'excluded'
  | 'unselected'
  | 'pending'
  | 'skipped'
  | 'cancelled'
  | 'error'
  | 'accepted'
  | 'rejected'
  | 'unknown';

/**
 * Only answered occurrences carry a prediction. `rejected` keeps the below-threshold suggestion for inspection;
 * `unknown` takes priority over the threshold because neither outcome attributes the weight to a category.
 */
export type OccurrenceDecision =
  | { readonly status: 'excluded'; readonly reason: ExclusionReason }
  | { readonly status: 'unselected' | 'pending' | 'skipped' | 'cancelled' }
  | { readonly status: 'error'; readonly error: string }
  | {
      readonly status: 'accepted' | 'rejected' | 'unknown';
      readonly prediction: JevPrediction;
      readonly cacheHit: boolean;
    };

export interface SemanticAccounting {
  /** Root value: the denominator for every share, including excluded and unclassified weight. */
  readonly totalSelf: number;
  readonly acceptedSelf: number;
  /** acceptedSelf / totalSelf, or null for an empty profile. */
  readonly coverage: number | null;
  /** Sums to totalSelf. */
  readonly statusSelf: Readonly<Record<OccurrenceStatus, number>>;
  readonly excludedSelf: Readonly<Record<ExclusionReason, number>>;
  /** Accepted weight only. */
  readonly categorySelf: Readonly<Record<KnownCategory, number>>;
}

export interface SemanticClassification {
  readonly confidenceThreshold: number;
  /** Indexed by DataFrame row. */
  readonly decisions: readonly OccurrenceDecision[];
  readonly accounting: SemanticAccounting;
}

const UNSELECTED: OccurrenceDecision = Object.freeze({ status: 'unselected' });
const EXCLUDED: Record<ExclusionReason, OccurrenceDecision> = {
  root: Object.freeze({ status: 'excluded', reason: 'root' }),
  truncated: Object.freeze({ status: 'excluded', reason: 'truncated' }),
  opaque: Object.freeze({ status: 'excluded', reason: 'opaque' }),
  zero_self: Object.freeze({ status: 'excluded', reason: 'zero_self' }),
};

export function resolveClassification(
  run: ClassificationRun,
  confidenceThreshold = CONFIDENCE_THRESHOLD
): SemanticClassification {
  if (!isConfidenceThreshold(confidenceThreshold)) {
    throw new Error('Invalid confidence threshold');
  }
  const { profile, caseByRow } = run.plan;
  const caseDecisions = run.results.map((result) => decide(result, confidenceThreshold));
  const decisions = profile.occurrences.map((o) => {
    if (o.excluded && o.excluded !== 'zero_self') {
      return EXCLUDED[o.excluded];
    }
    const index = caseByRow.get(o.row);
    if (index !== undefined) {
      return caseDecisions[index];
    }
    return o.excluded ? EXCLUDED[o.excluded] : UNSELECTED;
  });
  return Object.freeze({
    confidenceThreshold,
    decisions: Object.freeze(decisions),
    accounting: account(profile.total, profile.occurrences, decisions),
  });
}

function decide(result: CaseResult, confidenceThreshold: number): OccurrenceDecision {
  if (result.status !== 'ok') {
    return result;
  }
  const { prediction, cacheHit } = result;
  let status: 'accepted' | 'rejected' | 'unknown' = 'rejected';
  if (prediction.category === 'unknown') {
    status = 'unknown';
  } else if (prediction.confidence >= confidenceThreshold) {
    status = 'accepted';
  }
  return Object.freeze({ status, prediction, cacheHit });
}

function account(
  totalSelf: number,
  occurrences: readonly SemanticOccurrence[],
  decisions: readonly OccurrenceDecision[]
): SemanticAccounting {
  const statusSelf = zeros<OccurrenceStatus>([
    'excluded',
    'unselected',
    'pending',
    'skipped',
    'cancelled',
    'error',
    'accepted',
    'rejected',
    'unknown',
  ]);
  const excludedSelf = zeros<ExclusionReason>(['root', 'truncated', 'opaque', 'zero_self']);
  const categorySelf = zeros(CATEGORIES.filter((c): c is KnownCategory => c !== 'unknown'));
  decisions.forEach((decision, row) => {
    const { self } = occurrences[row];
    statusSelf[decision.status] += self;
    if (decision.status === 'excluded') {
      excludedSelf[decision.reason] += self;
    } else if (decision.status === 'accepted') {
      categorySelf[decision.prediction.category as KnownCategory] += self;
    }
  });
  return Object.freeze({
    totalSelf,
    acceptedSelf: statusSelf.accepted,
    coverage: totalSelf ? statusSelf.accepted / totalSelf : null,
    statusSelf: Object.freeze(statusSelf),
    excludedSelf: Object.freeze(excludedSelf),
    categorySelf: Object.freeze(categorySelf),
  });
}

function zeros<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}
