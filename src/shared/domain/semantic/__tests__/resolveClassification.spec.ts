import { createDataFrame, FieldType } from '@grafana/data';

import { CATEGORIES, Category } from '../jevRubric';
import { normalizeFlameGraph, SemanticProfile } from '../normalizeFlameGraph';
import { planClassification } from '../planClassification';
import { resolveClassification } from '../resolveClassification';
import { pendingRun, runClassification } from '../runClassification';

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

function reply(choice: Category, confidence: number, winning = 1) {
  const rest = (1 - winning) / (CATEGORIES.length - 1);
  return {
    model: 'typesafe/jev-1.13-20260917',
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

// Distinct self weights make each function's case order explicit: heaviest first.
const profile = profileOf([
  [0, 'total', 100, 0],
  [1, 'JSON.parse', 30, 30],
  [1, 'Date.now', 20, 20],
  [1, 'mystery', 15, 15],
  [1, 'vague', 10, 10],
  [1, 'Builtins_ArrayPush', 8, 8],
  [1, '[unknown]', 7, 7],
  [1, 'other', 6, 6],
  [1, 'main', 4, 0],
  [2, 'lightweight', 1, 1],
  [2, 'epoll_wait', 3, 3],
]);
const replies: Record<string, ReturnType<typeof reply>> = {
  'JSON.parse': reply('serialization', 0.85, 0.5),
  'Date.now': reply('standard_library', 0.7, 0.95),
  mystery: reply('unknown', 0.95),
  vague: reply('unknown', 0.3),
  Builtins_ArrayPush: reply('standard_library', 0.8),
  lightweight: reply('application_logic', 0.9),
  epoll_wait: reply('io', 0.99),
};
const transport = async (request: string) => replies[JSON.parse(request).state.evidence.target];

describe('resolveClassification', () => {
  const plan = planClassification(profile);

  it('labels zero-self callers in a full plan without counting their inclusive CPU', async () => {
    const full = planClassification(
      profileOf([
        [0, 'total', 10, 0],
        [1, 'handler', 10, 0],
        [2, 'read', 10, 10],
      ]),
      Infinity,
      'my-service'
    );
    const run = await runClassification(full, {
      transport: async (request) =>
        reply(JSON.parse(request).state.evidence.target === 'handler' ? 'application_logic' : 'io', 0.99),
    });
    const result = resolveClassification(run);
    expect(result.decisions[1]).toMatchObject({ status: 'accepted', prediction: { category: 'application_logic' } });
    expect(result.accounting.categorySelf.application_logic).toBe(0);
    expect(result.accounting.categorySelf.io).toBe(10);
    expect(result.accounting.statusSelf.unselected).toBe(0);
    expect(result.accounting.acceptedSelf).toBe(10);
  });

  it('applies the 0.8 threshold to Jev confidence, not to the winning probability', async () => {
    const { decisions } = resolveClassification(await runClassification(plan, { transport }));

    expect(decisions[1]).toMatchObject({
      status: 'accepted',
      prediction: { category: 'serialization', confidence: 0.85, probability: 0.5 },
    });
    expect(decisions[2]).toMatchObject({
      status: 'rejected',
      prediction: { category: 'standard_library', confidence: 0.7, probability: 0.95 },
    });
    expect(decisions[5]).toMatchObject({ status: 'accepted', prediction: { confidence: 0.8 } });
  });

  it('reuses the same predictions under a different threshold', async () => {
    const run = await runClassification(plan, { transport });
    const lower = resolveClassification(run, 0.7);
    const higher = resolveClassification(run, 0.9);

    expect(lower.confidenceThreshold).toBe(0.7);
    expect(lower.decisions[2]).toMatchObject({ status: 'accepted' });
    expect(lower.accounting).toMatchObject({ totalSelf: 100, acceptedSelf: 62 });
    expect(higher.confidenceThreshold).toBe(0.9);
    expect(higher.decisions[1]).toMatchObject({ status: 'rejected' });
    expect(higher.accounting).toMatchObject({ totalSelf: 100, acceptedSelf: 4 });
    expect(resolveClassification(run).accounting.acceptedSelf).toBe(42);
  });

  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid threshold %p', (threshold) => {
    expect(() => resolveClassification(pendingRun(plan), threshold)).toThrow('Invalid confidence threshold');
  });

  it.each([0, 1])('accepts the endpoint %p without classifying unknown answers', async (threshold) => {
    const endpoints = profileOf([
      [0, 'total', 3, 0],
      [1, 'certain', 1, 1],
      [1, 'uncertain', 1, 1],
      [1, 'mystery', 1, 1],
    ]);
    const values: Record<string, ReturnType<typeof reply>> = {
      certain: reply('runtime', 1),
      uncertain: reply('runtime', 0),
      mystery: reply('unknown', 1),
    };
    const run = await runClassification(planClassification(endpoints), {
      transport: async (request) => values[JSON.parse(request).state.evidence.target],
    });
    const result = resolveClassification(run, threshold);
    expect(result.decisions.map((d) => d.status)).toEqual([
      'excluded',
      'accepted',
      threshold === 0 ? 'accepted' : 'rejected',
      'unknown',
    ]);
    expect(Object.values(result.accounting.statusSelf).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('reports unknown answers as unknown at any confidence', async () => {
    const { decisions } = resolveClassification(await runClassification(plan, { transport }));

    expect(decisions[3]).toMatchObject({ status: 'unknown', prediction: { confidence: 0.95 } });
    expect(decisions[4]).toMatchObject({ status: 'unknown', prediction: { confidence: 0.3 } });
  });

  it('never attaches predictions to excluded, unselected, pending, skipped or failed occurrences', async () => {
    const unselected = resolveClassification(pendingRun(planClassification(profile, 1))).decisions;
    const failed = resolveClassification(
      await runClassification(plan, {
        transport: jest.fn().mockResolvedValueOnce(replies['JSON.parse']).mockRejectedValueOnce(new Error('HTTP 503')),
      })
    ).decisions;

    expect(unselected.map((d) => d.status)).toEqual([
      'excluded',
      'pending',
      'unselected',
      'unselected',
      'unselected',
      'unselected',
      'excluded',
      'excluded',
      'excluded',
      'unselected',
      'unselected',
    ]);
    expect(unselected.slice(6, 9)).toEqual([
      { status: 'excluded', reason: 'opaque' },
      { status: 'excluded', reason: 'truncated' },
      { status: 'excluded', reason: 'zero_self' },
    ]);
    expect(failed.map((d) => d.status)).toEqual([
      'excluded',
      'accepted',
      'error',
      'skipped',
      'skipped',
      'skipped',
      'excluded',
      'excluded',
      'excluded',
      'skipped',
      'skipped',
    ]);
    expect(failed[2]).toEqual({ status: 'error', error: 'HTTP 503' });
    for (const decision of [...unselected, ...failed.slice(2)]) {
      expect(decision).not.toHaveProperty('prediction');
    }
  });

  it('accounts for every unit of self weight against the full profile', async () => {
    const { accounting } = resolveClassification(await runClassification(plan, { transport }));

    expect(accounting).toEqual({
      totalSelf: 100,
      acceptedSelf: 42,
      coverage: 0.42,
      statusSelf: {
        excluded: 13,
        unselected: 0,
        pending: 0,
        skipped: 0,
        cancelled: 0,
        error: 0,
        accepted: 42,
        rejected: 20,
        unknown: 25,
      },
      excludedSelf: { root: 0, truncated: 6, opaque: 7, zero_self: 0 },
      categorySelf: expect.objectContaining({
        serialization: 30,
        standard_library: 8,
        io: 3,
        application_logic: 1,
        runtime: 0,
      }),
    });
    expect(Object.keys(accounting.categorySelf)).toEqual(CATEGORIES.filter((c) => c !== 'unknown'));
  });

  it('keeps skipped, pending and unselected mass in the denominator', async () => {
    const failed = resolveClassification(
      await runClassification(plan, { transport: jest.fn().mockRejectedValue(new Error('HTTP 429')) })
    );
    const partial = resolveClassification(pendingRun(planClassification(profile, 1)));

    expect(failed.accounting).toMatchObject({ totalSelf: 100, acceptedSelf: 0, coverage: 0 });
    expect(failed.accounting.statusSelf).toMatchObject({ error: 30, skipped: 57, excluded: 13 });
    expect(partial.accounting.statusSelf).toMatchObject({ pending: 30, unselected: 57, excluded: 13 });
  });

  it('keeps cancelled weight apart from failed weight and never attaches a prediction to it', async () => {
    const controller = new AbortController();
    const cancelling = jest
      .fn()
      .mockResolvedValueOnce(replies['JSON.parse'])
      .mockImplementationOnce(() => {
        controller.abort();
        return new Promise(() => {});
      });

    const { decisions, accounting } = resolveClassification(
      await runClassification(plan, { transport: cancelling, signal: controller.signal })
    );

    expect(decisions[2]).toEqual({ status: 'cancelled' });
    expect(accounting.statusSelf).toMatchObject({ accepted: 30, cancelled: 20, error: 0, skipped: 37, excluded: 13 });
    expect(accounting.coverage).toBe(0.3);
  });

  it('gives each occurrence of shared evidence its own weight from one call', async () => {
    const shared = profileOf([
      [0, 'total', 5, 0],
      [1, 'main', 5, 0],
      [2, 'work', 2, 2],
      [2, 'work', 3, 3],
    ]);
    const call = jest.fn(async () => reply('application_logic', 0.9));

    const { decisions, accounting } = resolveClassification(
      await runClassification(planClassification(shared), { transport: call })
    );

    expect(call).toHaveBeenCalledTimes(1);
    expect(decisions.slice(2).map((d) => d.status)).toEqual(['accepted', 'accepted']);
    expect(accounting.categorySelf.application_logic).toBe(5);
    expect(accounting.coverage).toBe(1);
  });

  it('does not propagate a category to callers or callees', async () => {
    const nested = profileOf([
      [0, 'total', 10, 0],
      [1, 'handleRequest', 10, 8],
      [2, 'JSON.stringify', 2, 2],
    ]);

    const { decisions, accounting } = resolveClassification(
      await runClassification(planClassification(nested, 1), { transport: async () => reply('networking', 0.9) })
    );

    expect(decisions.map((d) => d.status)).toEqual(['excluded', 'accepted', 'unselected']);
    expect(accounting.categorySelf.networking).toBe(8);
  });

  it('sends V8 and builtin symbols to Jev instead of labelling them runtime', async () => {
    const v8 = profileOf([
      [0, 'total', 2, 0],
      [1, 'v8::internal::Factory::NewJSObjectFromMap', 1, 1],
      [1, 'Builtins_ArrayPrototypePush', 1, 1],
    ]);
    const call = jest.fn(async () => reply('standard_library', 0.9));

    const { accounting } = resolveClassification(await runClassification(planClassification(v8), { transport: call }));

    expect(call).toHaveBeenCalledTimes(2);
    expect(accounting.categorySelf).toMatchObject({ standard_library: 2, runtime: 0 });
  });

  it('reports null coverage for an empty profile', () => {
    const empty = profileOf([]);

    expect(resolveClassification(pendingRun(planClassification(empty))).accounting.coverage).toBeNull();
  });
});
