import { createHash } from 'crypto';

import {
  batchJevRequests,
  buildJevRequest,
  CATEGORIES,
  Category,
  CONFIDENCE_THRESHOLD,
  JEV_MODEL,
  MAX_REQUEST_BYTES,
  parseJevReply,
  POLICY,
  RUBRIC_VERSION,
  TAXONOMY,
} from '../jevRubric';

const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const evidence = { target: 'JSON.stringify', callers: ['httpHandler'] };

function reply(choice: Category = 'serialization', confidence = 0.95, winning = 1) {
  const rest = (1 - winning) / (CATEGORIES.length - 1);
  return {
    model: 'typesafe/jev-1.13-20260917',
    usage: { input_tokens: 100, output_tokens: 10, cost: 0.001 },
    answers: {
      target: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(CATEGORIES.map((c) => [c, c === choice ? winning : rest])),
      },
    },
  };
}

describe('jevRubric', () => {
  it('pins rubric v5 taxonomy, policy, category order, model and threshold', () => {
    expect(RUBRIC_VERSION).toBe(5);
    expect(sha256(TAXONOMY)).toBe('c1ccdb7e60d7c3fbb354b02f4b0bf5b6bf9fad97cc4ec0f45b9d7b993a680184');
    expect(sha256(POLICY)).toBe('d8523acd2f5fce68fa42f1c67d053028728bc95be2fd8df1bf6518bdbf29bb6d');
    expect(CATEGORIES).toEqual([
      'runtime',
      'networking',
      'database_client',
      'serialization',
      'crypto_compression',
      'io',
      'observability',
      'standard_library',
      'application_logic',
      'unknown',
    ]);
    expect(JEV_MODEL).toBe('typesafe/jev-1.13');
    expect(CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it('includes each category definition only once in a multi-question request', () => {
    const body = batchJevRequests(
      Array.from({ length: 8 }, (_, i) => buildJevRequest({ target: `function${i}`, callers: ['caller'] }, 'pyroscope'))
    );
    expect(body.split(TAXONOMY.runtime)).toHaveLength(2);
    const request = JSON.parse(body);
    expect(request.state.categories.runtime).toBe(TAXONOMY.runtime);
    for (const question of Object.values(request.questions) as Array<{ criteria: object }>) {
      expect(Object.keys(question.criteria)).toEqual(CATEGORIES);
    }
  });

  it('builds the native Jev request with only target and callers as evidence', () => {
    const body = buildJevRequest({ ...evidence, self: 42, tenant: 'secret' } as typeof evidence);

    expect(body).toBe(
      JSON.stringify({
        model: 'typesafe/jev-1.13',
        state: { policy: POLICY, categories: TAXONOMY, evidence },
        questions: {
          target: {
            type: 'choice',
            instructions:
              'Follow state.policy. Classify state.evidence.target using state.evidence.callers only as context. Use state.categories for category definitions.',
            criteria: {
              runtime: 'VM execution, GC, allocation and scheduling; not all runtime-owned functions.',
              networking: 'Application protocols: HTTP/RPC servers, clients, routing, middleware and messaging.',
              database_client: 'Database/cache protocols, drivers, ORM and connection pools.',
              serialization: 'General data-format parsing and encoding, including JSON and protobuf.',
              crypto_compression: 'Encryption, cryptographic hashing, TLS record processing and compression.',
              io: 'Generic OS, filesystem and socket I/O.',
              observability: 'Instrumentation: logging, metrics, tracing and profiling.',
              standard_library:
                'General-purpose language or standard-library utilities without a more specific direct role.',
              application_logic: 'Application-specific workflows, orchestration and internal domain helpers.',
              unknown: 'Insufficient evidence or an operation outside the supplied categories.',
            },
          },
        },
      })
    );
  });

  it('adds application identity as a prior without changing the category set', () => {
    const body = JSON.parse(buildJevRequest(evidence, 'pyroscope'));

    expect(body.state.application).toBe('pyroscope');
    expect(body.state.rubricVersion).toBe(5);
    expect(body.state.evidence).toEqual(evidence);
    expect(Object.keys(body.questions.target.criteria)).toEqual(CATEGORIES);
    expect(body.state.policy).toContain('positive evidence');
    expect(body.state.policy).toContain('more specific direct category');
    expect(body.state.categories.application_logic).toContain('state.application');
    expect(buildJevRequest(evidence, 'pyroscope')).not.toBe(buildJevRequest(evidence, 'other-service'));
  });

  it.each(['', ' ', 'a'.repeat(513)])('rejects invalid application identity %p', (application) => {
    expect(() => buildJevRequest(evidence, application)).toThrow('Enter an application name or module path');
  });

  it('rejects requests over the provider payload budget', () => {
    const huge = { target: '\u0001'.repeat(512), callers: Array(8).fill('\u0001'.repeat(512)) };

    expect(new TextEncoder().encode(buildJevRequest(evidence)).length).toBeLessThan(MAX_REQUEST_BYTES);
    expect(() => buildJevRequest(huge)).toThrow('Evidence exceeds the provider payload budget');
  });

  it('keeps Jev confidence separate from the winning category probability', () => {
    const prediction = parseJevReply(reply('serialization', 0.6, 0.945));

    expect(prediction).toEqual({
      model: 'typesafe/jev-1.13-20260917',
      category: 'serialization',
      confidence: 0.6,
      probability: 0.945,
      probabilities: expect.objectContaining({ serialization: 0.945 }),
    });
    expect(Object.keys(prediction.probabilities)).toEqual(CATEGORIES);
    expect(Object.isFrozen(prediction)).toBe(true);
  });

  it('discards provider usage metadata at the parser boundary', () => {
    const prediction = parseJevReply({ ...reply(), usage: { huge: 'x'.repeat(100_000) } });

    expect(prediction).not.toHaveProperty('usage');
    expect(Object.keys(prediction).sort()).toEqual(['category', 'confidence', 'model', 'probabilities', 'probability']);
  });

  it.each(['typesafe/jev-1.13', 'typesafe/jev-1.13-20260917'])('accepts the pinned model %p', (model) => {
    expect(parseJevReply({ ...reply(), model }).model).toBe(model);
  });

  it.each([
    'openai/gpt-4o',
    'typesafe/jev-1.14',
    'typesafe/jev-1.14-20260917',
    'typesafe/jev-1.130',
    'typesafe/jev-1.130-20260917',
    'typesafe/jev-1.13.0',
    'typesafe/jev-1.13-2026091',
    'typesafe/jev-1.13-202609170',
    'typesafe/jev-1.13-20260917\n',
    ' typesafe/jev-1.13',
    'other/typesafe/jev-1.13',
  ])('rejects the unpinned model %p', (model) => {
    expect(() => parseJevReply({ ...reply(), model })).toThrow('Provider returned an unexpected model');
  });

  it.each([undefined, '', 13])('rejects the missing model %p', (model) => {
    expect(() => parseJevReply({ ...reply(), model })).toThrow('Provider omitted its model');
  });

  it.each([null, [], 'reply'])('rejects the non-object reply %p', (raw) => {
    expect(() => parseJevReply(raw)).toThrow('Expected an object');
  });

  it.each([
    ['a missing model', (r: any) => delete r.model, 'Provider omitted its model'],
    ['a missing answer', (r: any) => (r.answers = {}), 'Provider returned unexpected answers'],
    ['an extra answer', (r: any) => (r.answers.other = r.answers.target), 'Provider returned unexpected answers'],
    ['a renamed answer', (r: any) => (r.answers = { other: r.answers.target }), 'Provider returned unexpected answers'],
    ['a wrong answer type', (r: any) => (r.answers.target.type = 'noul'), 'Provider returned an invalid answer type'],
    ['an invalid category', (r: any) => (r.answers.target.choice = 'network'), 'Provider returned an invalid category'],
    [
      'incomplete probabilities',
      (r: any) => delete r.answers.target.probabilities.runtime,
      'Provider returned incomplete probabilities',
    ],
    [
      'a substituted probability key',
      (r: any) => {
        delete r.answers.target.probabilities.runtime;
        r.answers.target.probabilities.network = 0;
      },
      'Provider returned an invalid probability',
    ],
    [
      'an out-of-range probability',
      (r: any) => (r.answers.target.probabilities.runtime = 1.5),
      'Provider returned an invalid probability',
    ],
    [
      'probabilities that do not sum to one',
      (r: any) => (r.answers.target.probabilities.runtime = 0.5),
      'Provider returned inconsistent probabilities',
    ],
    [
      'a choice that is not the most probable',
      (r: any) => {
        r.answers.target.probabilities.serialization = 0.4;
        r.answers.target.probabilities.runtime = 0.6;
      },
      'Provider returned inconsistent probabilities',
    ],
    [
      'a missing confidence',
      (r: any) => delete r.answers.target.confidence,
      'Provider returned an invalid probability',
    ],
    ['a NaN confidence', (r: any) => (r.answers.target.confidence = NaN), 'Provider returned an invalid probability'],
  ])('rejects %s rather than treating it as unknown', (_name, change, message) => {
    const raw: any = reply();
    change(raw);

    expect(() => parseJevReply(raw)).toThrow(message);
  });
});
