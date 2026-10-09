import { CATEGORIES, Category, JevPrediction } from '@shared/domain/semantic/jevRubric';

import { PredictionStore } from '../predictionCache';

const ORG_1_DS_A = { orgId: 1, datasourceUid: 'ds-a' };

function prediction(category: Category, usage?: unknown): JevPrediction {
  const probabilities = Object.fromEntries(CATEGORIES.map((c) => [c, c === category ? 1 : 0])) as Record<
    Category,
    number
  >;
  return Object.freeze({ model: 'typesafe/jev-1.13', category, confidence: 0.9, probability: 1, probabilities, usage });
}

test('returns a prediction only within the organization and data source that stored it', () => {
  const store = new PredictionStore();
  store.scoped(ORG_1_DS_A)!.set('request', prediction('io'));

  expect(store.scoped(ORG_1_DS_A)!.get('request')?.category).toBe('io');
  expect(store.scoped({ orgId: 2, datasourceUid: 'ds-a' })!.get('request')).toBeUndefined();
  expect(store.scoped({ orgId: 1, datasourceUid: 'ds-b' })!.get('request')).toBeUndefined();
  expect(store.scoped(ORG_1_DS_A)!.get('other request')).toBeUndefined();
});

test('cannot be confused by scope values that look like delimiters', () => {
  const store = new PredictionStore();
  store.scoped({ orgId: 1, datasourceUid: 'a"],["b' })!.set('request', prediction('io'));

  expect(store.scoped({ orgId: 1, datasourceUid: 'a' })!.get('"],["b\u0000request')).toBeUndefined();
});

test('is unavailable without a valid organization and data source', () => {
  const store = new PredictionStore();

  expect(store.scoped({ orgId: 0, datasourceUid: 'ds-a' })).toBeUndefined();
  expect(store.scoped({ orgId: 1.5, datasourceUid: 'ds-a' })).toBeUndefined();
  expect(store.scoped({ orgId: 1, datasourceUid: '' })).toBeUndefined();
});

test('retains predictions for a full 16,385-context profile by default', () => {
  const store = new PredictionStore();
  const cache = store.scoped(ORG_1_DS_A)!;
  const answer = prediction('io');
  for (let i = 0; i < 16_385; i++) {
    cache.set(`request${i}`, answer);
  }
  expect(store.size).toBe(16_385);
  expect(cache.get('request0')).toEqual(answer);
});

test('evicts the least recently used prediction beyond its bound', () => {
  const store = new PredictionStore(2);
  const cache = store.scoped(ORG_1_DS_A)!;
  cache.set('a', prediction('io'));
  cache.set('b', prediction('runtime'));
  cache.get('a');
  cache.set('c', prediction('serialization'));

  expect(cache.get('a')?.category).toBe('io');
  expect(cache.get('b')).toBeUndefined();
  expect(cache.get('c')?.category).toBe('serialization');
  expect(store.size).toBe(2);
});

test('shares the bound across scopes', () => {
  const store = new PredictionStore(1);
  store.scoped(ORG_1_DS_A)!.set('request', prediction('io'));
  store.scoped({ orgId: 2, datasourceUid: 'ds-a' })!.set('request', prediction('runtime'));

  expect(store.scoped(ORG_1_DS_A)!.get('request')).toBeUndefined();
  expect(store.size).toBe(1);
});

test('stores only bounded prediction fields, never provider usage metadata', () => {
  const store = new PredictionStore();
  const cache = store.scoped(ORG_1_DS_A)!;
  cache.set('request', prediction('io', { huge: 'x'.repeat(100_000) }));

  const cached = cache.get('request')!;
  expect(cached).not.toHaveProperty('usage');
  expect(cached).toEqual({
    model: 'typesafe/jev-1.13',
    category: 'io',
    confidence: 0.9,
    probability: 1,
    probabilities: expect.objectContaining({ io: 1, runtime: 0 }),
  });
  expect(Object.isFrozen(cached)).toBe(true);
});

test('drops writes after the owning run is aborted', () => {
  const store = new PredictionStore();
  const controller = new AbortController();
  const cache = store.scoped(ORG_1_DS_A, controller.signal)!;
  controller.abort();
  cache.set('request', prediction('io'));

  expect(store.scoped(ORG_1_DS_A)!.get('request')).toBeUndefined();
});
