import { JEV_MODEL, JevPrediction, RUBRIC_VERSION } from '@shared/domain/semantic/jevRubric';
import { PredictionCache } from '@shared/domain/semantic/runClassification';

const MAX_ENTRIES = 20_000;

interface PredictionScope {
  readonly orgId: number;
  readonly datasourceUid: string;
}

/** Memory-only LRU of Jev predictions, namespaced so no prediction is reused across organizations or data sources. */
export class PredictionStore {
  private readonly entries = new Map<string, JevPrediction>();

  constructor(private readonly maxEntries = MAX_ENTRIES) {}

  get size() {
    return this.entries.size;
  }

  /** Drops writes once `signal` aborts, so a cancelled or replaced run cannot add predictions. */
  scoped(scope: PredictionScope, signal?: AbortSignal): PredictionCache | undefined {
    if (!Number.isSafeInteger(scope.orgId) || scope.orgId <= 0 || !scope.datasourceUid) {
      return undefined;
    }
    // JSON escapes control characters, so the separator cannot occur inside the namespace.
    const namespace = `${JSON.stringify([scope.orgId, scope.datasourceUid, JEV_MODEL, RUBRIC_VERSION])}\u0000`;
    return {
      get: (request) => this.get(namespace + request),
      set: (request, prediction) => {
        if (!signal?.aborted) {
          this.set(namespace + request, prediction);
        }
      },
    };
  }

  private get(key: string): JevPrediction | undefined {
    const prediction = this.entries.get(key);
    if (prediction) {
      this.entries.delete(key);
      this.entries.set(key, prediction);
    }
    return prediction;
  }

  private set(key: string, { model, category, confidence, probability, probabilities }: JevPrediction) {
    this.entries.delete(key);
    this.entries.set(key, Object.freeze({ model, category, confidence, probability, probabilities }));
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

export const predictionStore = new PredictionStore();
