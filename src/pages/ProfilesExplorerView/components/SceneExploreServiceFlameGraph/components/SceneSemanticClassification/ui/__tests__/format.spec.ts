import { formatConfidence, formatShare } from '../format';

describe('formatConfidence', () => {
  it.each([
    [0.44, '0.44'],
    [0.91, '0.91'],
    [0.8, '0.80'],
    [1, '1.00'],
    [0, '0.00'],
    [0.799, '0.799'],
    [0.7996, '0.7996'],
    [0.79949, '0.799'],
    [0.804, '0.80'],
  ])('shows %p as %p without contradicting the 0.80 threshold', (confidence, text) => {
    expect(formatConfidence(confidence)).toBe(text);
    expect(Number(formatConfidence(confidence)) >= 0.8).toBe(confidence >= 0.8);
  });

  it.each([
    [0.4399, 0.44],
    [0.8011, 0.801],
    [0.0000051, 0.000005],
    [0.99999999, 1],
    [0, 0],
    [1, 1],
  ])('keeps confidence %p on the correct side of threshold %p', (confidence, threshold) => {
    expect(Number(formatConfidence(confidence, threshold)) >= threshold).toBe(confidence >= threshold);
  });

  it('falls back to the exact value when fixed digits cannot separate it from the threshold', () => {
    expect(formatConfidence(0.79999999)).toBe('0.79999999');
  });
});

describe('formatShare', () => {
  it('uses the whole profile as denominator and is safe for an empty profile', () => {
    expect(formatShare(7e9, 10e9)).toBe('70.0%');
    expect(formatShare(0, 0)).toBe('\u2013');
  });
});
