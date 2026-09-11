import { Field } from '@grafana/data';

/**
 * Resolves the exact raw timestamp for a clicked span ID. The timestamp interpolated
 * by the data link is lossy, so it is only used to disambiguate duplicate span IDs.
 */
export function resolveExemplarTimestamp(
  idField: Field | undefined,
  timeField: Field | undefined,
  spanId: string,
  approxTimestamp: number | undefined
): number | undefined {
  if (!idField || !timeField) {
    return approxTimestamp;
  }

  const ids = idField.values;
  const times = timeField.values;
  const candidates: number[] = [];

  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === spanId) {
      candidates.push(times[i]);
    }
  }

  if (candidates.length === 0) {
    return approxTimestamp;
  }

  if (candidates.length === 1 || approxTimestamp === undefined) {
    return candidates[0];
  }

  return candidates.reduce(
    (best, timestamp) =>
      Math.abs(timestamp - approxTimestamp) < Math.abs(best - approxTimestamp) ? timestamp : best,
    candidates[0]
  );
}
