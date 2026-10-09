import { formattedValueToString, getValueFormat } from '@grafana/data';
import { CONFIDENCE_THRESHOLD } from '@shared/domain/semantic/jevRubric';

export function weightFormatter(unit?: string): (weight: number) => string {
  const format = getValueFormat(unit);
  return (weight) => formattedValueToString(format(weight));
}

export function formatShare(weight: number, total: number): string {
  return total ? `${((100 * weight) / total).toFixed(1)}%` : '\u2013';
}

// Adds digits near the threshold so a rounded score never contradicts the accepted or rejected status.
export function formatConfidence(confidence: number, threshold = CONFIDENCE_THRESHOLD): string {
  const accepted = confidence >= threshold;
  for (let digits = 2; digits <= 6; digits++) {
    const text = confidence.toFixed(digits);
    if (Number(text) >= threshold === accepted) {
      return text;
    }
  }
  return String(confidence);
}

export function formatThreshold(threshold: number): string {
  const text = threshold.toFixed(2);
  return Number(text) === threshold ? text : String(threshold);
}
