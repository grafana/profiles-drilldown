import { createDataFrame, FieldType } from '@grafana/data';

import { CATEGORIES, Category, JevPrediction, MAX_REQUEST_BYTES, parseJevReply } from '../jevRubric';
import { normalizeFlameGraph } from '../normalizeFlameGraph';
import { planClassification, SemanticPlan } from '../planClassification';
import {
  ClassificationRun,
  pendingRun,
  REQUEST_TIMED_OUT,
  REQUEST_TIMEOUT_MS,
  runClassification,
} from '../runClassification';

function planOf(children: Array<[label: string, self: number]>): SemanticPlan {
  const total = children.reduce((sum, [, self]) => sum + self, 0);
  const rows = [[0, 'total', total, 0], ...children.map(([label, self]) => [1, label, self, self])];
  const frame = createDataFrame({
    fields: [
      { name: 'level', type: FieldType.number, values: rows.map((r) => r[0]) },
      { name: 'label', type: FieldType.string, values: rows.map((r) => r[1]) },
      { name: 'self', type: FieldType.number, values: rows.map((r) => r[3]) },
      { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]) },
    ],
  });
  return planClassification(normalizeFlameGraph(frame));
}

function reply(choice: Category = 'serialization', confidence = 0.9) {
  return {
    model: 'typesafe/jev-1.13-20260917',
    answers: {
      target: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(CATEGORIES.map((c) => [c, c === choice ? 1 : 0])),
      },
    },
  };
}

const targetOf = (request: string): string => JSON.parse(request).state.evidence.target;

describe('runClassification', () => {
  const plan = planOf([
    ['a', 4],
    ['b', 3],
    ['c', 2],
    ['d', 1],
  ]);

  it('reuses individual answers after batch size and case order change', async () => {
    const transport = jest.fn(async (request: string) => {
      const body = JSON.parse(request);
      return {
        model: reply().model,
        answers: Object.fromEntries(Object.keys(body.questions).map((key) => [key, reply('io').answers.target])),
      };
    });
    const cache = new Map<string, JevPrediction>();
    const options = { transport, cache, batchSize: 2 };
    const run = await runClassification(plan, options);

    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.parse(transport.mock.calls[0][0]).state.evidence.f0.target).toBe('a');
    expect(JSON.parse(transport.mock.calls[1][0]).state.evidence.f0.target).toBe('c');
    expect(run.results.every((result) => result.status === 'ok' && result.prediction.category === 'io')).toBe(true);
    const reordered = planOf([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    const cached = await runClassification(reordered, { ...options, batchSize: 3 });
    expect(cached.results.every((result) => result.status === 'ok' && result.cacheHit)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('sends only missing cases and keeps cached answers aligned with the plan', async () => {
    const cache = new Map([
      [plan.cases[1].request!, parseJevReply(reply('runtime'))],
      [plan.cases[3].request!, parseJevReply(reply('networking'))],
    ]);
    const transport = jest.fn(async (request: string) => {
      const evidence: Record<string, { target: string }> = JSON.parse(request).state.evidence;
      expect(Object.values(evidence).map((e) => e.target)).toEqual(['a', 'c']);
      return {
        model: reply().model,
        answers: {
          f0: reply('io').answers.target,
          f1: reply('serialization').answers.target,
        },
      };
    });
    const run = await runClassification(plan, { transport, cache, batchSize: 2 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      run.results.map((result) => result.status === 'ok' && [result.prediction.category, result.cacheHit])
    ).toEqual([
      ['io', false],
      ['runtime', true],
      ['serialization', false],
      ['networking', true],
    ]);
    transport.mockClear();
    const cached = await runClassification(plan, { transport, cache });
    expect(cached.results.every((result) => result.status === 'ok' && result.cacheHit)).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });

  it('sends a single request when only one case is missing from the cache', async () => {
    const cache = new Map(plan.cases.slice(1).map((c) => [c.request!, parseJevReply(reply('runtime'))]));
    const transport = jest.fn(async () => reply('io'));
    const run = await runClassification(plan, { transport, cache, batchSize: 2 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]).toEqual([plan.cases[0].request, expect.any(AbortSignal)]);
    expect(run.results.map((result) => result.status === 'ok' && result.cacheHit)).toEqual([false, true, true, true]);
  });

  it('bounds concurrency to eight batches and preserves case order when replies arrive out of order', async () => {
    jest.useFakeTimers();
    try {
      const concurrentPlan = planOf(Array.from({ length: 20 }, (_, i) => [`function${i}`, 20 - i]));
      let active = 0;
      let maximum = 0;
      const transport = jest.fn(async (request: string) => {
        const body = JSON.parse(request);
        maximum = Math.max(maximum, ++active);
        await new Promise((resolve) => setTimeout(resolve, body.state.evidence.f0.target === 'function0' ? 50 : 5));
        active--;
        return {
          model: reply().model,
          answers: Object.fromEntries(
            Object.keys(body.questions).map((key) => [
              key,
              reply(body.state.evidence[key].target === 'function0' ? 'runtime' : 'io').answers.target,
            ])
          ),
        };
      });
      const pending = runClassification(concurrentPlan, { transport, batchSize: 2, concurrency: 99 });
      expect(transport).toHaveBeenCalledTimes(8);
      await jest.runAllTimersAsync();
      const run = await pending;
      expect(maximum).toBe(8);
      expect(transport).toHaveBeenCalledTimes(10);
      expect(run.failure).toBeUndefined();
      expect(
        run.results.map((result) => (result.status === 'ok' ? result.prediction.category : result.status))
      ).toEqual(['runtime', ...Array(19).fill('io')]);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['cancel', 'failure'])('stops every concurrent request on %s without caching late replies', async (stop) => {
    const concurrentPlan = planOf(Array.from({ length: 20 }, (_, i) => [`function${i}`, 1]));
    const controller = new AbortController();
    const cache = new Map<string, JevPrediction>();
    const signals: AbortSignal[] = [];
    const completions: Array<{ resolve: (reply: unknown) => void; reject: (error: Error) => void }> = [];
    const transport = jest.fn((_request: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise((resolve, reject) => completions.push({ resolve, reject }));
    });
    const pending = runClassification(concurrentPlan, {
      transport,
      cache,
      signal: controller.signal,
      batchSize: 2,
      concurrency: 4,
    });
    expect(transport).toHaveBeenCalledTimes(4);
    if (stop === 'cancel') {
      controller.abort();
    } else {
      completions[0].reject(new Error('Offline'));
    }
    const run = await pending;
    expect(signals.every((signal) => signal.aborted)).toBe(stop === 'cancel');
    expect(signals.slice(1).every((signal) => signal.aborted)).toBe(true);
    expect(run.failure).toBe(stop === 'failure' ? 'Offline' : undefined);
    expect(run.results.some((result) => result.status === 'pending')).toBe(false);
    completions.forEach(({ resolve }) =>
      resolve({ model: reply().model, answers: { f0: reply().answers.target, f1: reply().answers.target } })
    );
    await Promise.resolve();
    expect(cache.size).toBe(0);
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it('packs thirty-six compact questions into two requests', async () => {
    const transport = jest.fn(async (request: string) => ({
      model: reply().model,
      answers: Object.fromEntries(
        Object.keys(JSON.parse(request).questions).map((key) => [key, reply().answers.target])
      ),
    }));
    const run = await runClassification(planOf(Array.from({ length: 36 }, (_, i) => [`function${i}`, 1])), {
      transport,
      batchSize: 32,
    });
    expect(run.results.every((result) => result.status === 'ok')).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('splits batches to stay within the provider payload budget', async () => {
    const large = planOf(Array.from({ length: 36 }, (_, i) => [`function${i}`, 1]));
    const transport = jest.fn(async (request: string) => {
      expect(new TextEncoder().encode(request).length).toBeLessThanOrEqual(MAX_REQUEST_BYTES);
      const body = JSON.parse(request);
      return {
        model: reply().model,
        answers: Object.fromEntries(Object.keys(body.questions).map((key) => [key, reply('io').answers.target])),
      };
    });
    const run = await runClassification(large, { transport, batchSize: 32 });
    expect(run.failure).toBeUndefined();
    expect(run.results).toHaveLength(36);
    expect(run.results.every((result) => result.status === 'ok')).toBe(true);
    expect(transport.mock.calls.length).toBeLessThan(36);
    expect(
      transport.mock.calls.reduce((sum, [request]) => sum + Object.keys(JSON.parse(request).questions).length, 0)
    ).toBe(36);
  });

  it('rejects incomplete batch replies without caching partial results or retrying', async () => {
    const transport = jest.fn(async () => reply());
    const cache = new Map<string, JevPrediction>();
    const run = await runClassification(plan, { transport, cache, batchSize: 2 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(run.failure).toBe('Provider returned unexpected answers');
    expect(run.results.map((result) => result.status)).toEqual(['error', 'error', 'skipped', 'skipped']);
    expect(cache.size).toBe(0);
  });

  it('leaves invalid individual answers unclassified and continues subsequent batches', async () => {
    const invalid = reply('io').answers.target;
    invalid.probabilities.io = 0.2;
    invalid.probabilities.serialization = 0.8;
    const transport = jest.fn(async () => ({
      model: reply().model,
      answers: { f0: invalid, f1: reply('io').answers.target },
    }));
    const cache = new Map<string, JevPrediction>();
    const run = await runClassification(plan, { transport, cache, batchSize: 2 });
    expect(run.done).toBe(true);
    expect(run.failure).toBeUndefined();
    expect(run.results.map((result) => result.status)).toEqual(['error', 'ok', 'error', 'ok']);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it('does not cache an in-flight batch after cancellation', async () => {
    const controller = new AbortController();
    const cache = new Map<string, JevPrediction>();
    const transport = jest.fn(async () => {
      controller.abort();
      return { model: reply().model, answers: { f0: reply().answers.target, f1: reply().answers.target } };
    });
    const run = await runClassification(plan, { transport, cache, signal: controller.signal, batchSize: 2 });
    expect(run.results.map((result) => result.status)).toEqual(['cancelled', 'cancelled', 'skipped', 'skipped']);
    expect(cache.size).toBe(0);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('starts with every case pending', () => {
    expect(pendingRun(plan)).toEqual({ plan, results: plan.cases.map(() => ({ status: 'pending' })), done: false });
  });

  it('classifies cases sequentially, heaviest first, with exactly one call each', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const transport = jest.fn<Promise<unknown>, [string, AbortSignal]>(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return reply();
    });

    const run = await runClassification(plan, { transport });

    expect(transport.mock.calls.map(([request]) => targetOf(request))).toEqual(['a', 'b', 'c', 'd']);
    expect(transport.mock.calls.map(([request]) => request)).toEqual(plan.cases.map((c) => c.request));
    expect(maxInFlight).toBe(1);
    expect(run.done).toBe(true);
    expect(run.failure).toBeUndefined();
    expect(run.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('reuses and fills a parent-owned cache keyed by the exact request', async () => {
    const cached = { category: 'io' } as JevPrediction;
    const cache = new Map([[plan.cases[1].request!, cached]]);
    const transport = jest.fn(async () => reply());

    const run = await runClassification(plan, { transport, cache });

    expect(transport).toHaveBeenCalledTimes(3);
    expect(run.results[1]).toEqual({ status: 'ok', prediction: cached, cacheHit: true });
    expect(run.results[0]).toMatchObject({ status: 'ok', cacheHit: false });
    expect([...cache.keys()]).toEqual(expect.arrayContaining(plan.cases.map((c) => c.request)));
  });

  it('stops at the first failure, skips the rest and never retries', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(reply())
      .mockRejectedValueOnce(new Error('Provider is unavailable (HTTP 503).'));
    const cache = new Map<string, JevPrediction>();

    const run = await runClassification(plan, { transport, cache });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(run.failure).toBe('Provider is unavailable (HTTP 503).');
    expect(run.results.map((r) => r.status)).toEqual(['ok', 'error', 'skipped', 'skipped']);
    expect(cache.size).toBe(1);
  });

  it('treats a malformed answer as a failure, not as unknown', async () => {
    const bad = reply();
    bad.answers.target.probabilities.runtime = 1;
    const cache = new Map<string, JevPrediction>();

    const run = await runClassification(plan, { transport: async () => bad, cache });

    expect(run.results.map((r) => r.status)).toEqual(['error', 'skipped', 'skipped', 'skipped']);
    expect(run.failure).toBe('Provider returned inconsistent probabilities');
    expect(cache.size).toBe(0);
  });

  it('fails a case whose evidence cannot be sent without calling the transport', async () => {
    const escaped = '\u0001'.repeat(512);
    const deep = [
      [0, 'total', 1, 0],
      ...Array.from({ length: 9 }, (_, i) => [i + 1, `${escaped}${i}`, 1, i === 8 ? 1 : 0]),
    ];
    const frame = createDataFrame({
      fields: [
        { name: 'level', type: FieldType.number, values: deep.map((r) => r[0]) },
        { name: 'label', type: FieldType.string, values: deep.map((r) => r[1]) },
        { name: 'self', type: FieldType.number, values: deep.map((r) => r[3]) },
        { name: 'value', type: FieldType.number, values: deep.map((r) => r[2]) },
      ],
    });
    const transport = jest.fn();

    const run = await runClassification(planClassification(normalizeFlameGraph(frame)), { transport });

    expect(transport).not.toHaveBeenCalled();
    expect(run.failure).toBe('Evidence exceeds the provider payload budget');
  });

  it('publishes immutable progress snapshots after each case', async () => {
    const snapshots: ClassificationRun[] = [];

    await runClassification(plan, { transport: async () => reply(), onProgress: (run) => snapshots.push(run) });

    expect(snapshots.map((s) => s.results.map((r) => r.status))).toEqual([
      ['ok', 'pending', 'pending', 'pending'],
      ['ok', 'ok', 'pending', 'pending'],
      ['ok', 'ok', 'ok', 'pending'],
      ['ok', 'ok', 'ok', 'ok'],
    ]);
    expect(snapshots.map((s) => s.done)).toEqual([false, false, false, true]);
    expect(Object.isFrozen(snapshots[0].results)).toBe(true);
  });

  it('aborts the in-flight call, even if the transport ignores the signal, and stops publishing', async () => {
    const controller = new AbortController();
    const onProgress = jest.fn();
    const signals: AbortSignal[] = [];
    const transport = jest.fn((_request: string, signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 2) {
        controller.abort();
        return new Promise<never>(() => {});
      }
      return Promise.resolve(reply());
    });

    const run = await runClassification(plan, { transport, signal: controller.signal, onProgress });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(true);
    expect(run.done).toBe(true);
    expect(run.failure).toBeUndefined();
    expect(run.results.map((r) => r.status)).toEqual(['ok', 'cancelled', 'skipped', 'skipped']);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('never caches a valid response that arrives after cancellation', async () => {
    const controller = new AbortController();
    const cache = new Map<string, JevPrediction>();
    const set = jest.spyOn(cache, 'set');
    let respond: (value: unknown) => void = () => {};
    const transport = jest.fn(
      () =>
        new Promise((resolve) => {
          respond = resolve;
          controller.abort();
        })
    );

    const run = await runClassification(plan, { transport, signal: controller.signal, cache });
    respond(reply());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(run.results[0]).toEqual({ status: 'cancelled' });
    expect(run.failure).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('cancels a reply that resolves in the same turn as the abort, before its continuation runs', async () => {
    const controller = new AbortController();
    const cache = new Map<string, JevPrediction>();
    const set = jest.spyOn(cache, 'set');
    const onProgress = jest.fn();
    let respond: (value: unknown) => void = () => {};
    const transport = jest.fn(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        })
    );

    const pending = runClassification(plan, { transport, signal: controller.signal, cache, onProgress });
    respond(reply());
    controller.abort();
    const run = await pending;

    expect(transport).toHaveBeenCalledTimes(1);
    expect(run.results.map((r) => r.status)).toEqual(['cancelled', 'skipped', 'skipped', 'skipped']);
    expect(run.failure).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each([1, 2])('does not use cached answers when already aborted (batch size %s)', async (batchSize) => {
    const transport = jest.fn();
    const cache = new Map(plan.cases.map((c) => [c.request!, parseJevReply(reply())]));

    const run = await runClassification(plan, { transport, cache, batchSize, signal: AbortSignal.abort() });

    expect(transport).not.toHaveBeenCalled();
    expect(run.failure).toBeUndefined();
    expect(run.results.map((r) => r.status)).toEqual(['cancelled', 'skipped', 'skipped', 'skipped']);
  });

  it('reports a request that fails after cancellation as cancelled, not as an error', async () => {
    const controller = new AbortController();
    const transport = jest.fn(async () => {
      controller.abort();
      throw new Error('Jev classification request failed.');
    });

    const run = await runClassification(plan, { transport, signal: controller.signal });

    expect(run.failure).toBeUndefined();
    expect(run.results.map((r) => r.status)).toEqual(['cancelled', 'skipped', 'skipped', 'skipped']);
  });

  describe('with the per-request timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const hung = (signals: AbortSignal[]) => (_request: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>(() => {});
    };

    function track(pending: Promise<ClassificationRun>) {
      const state = { settled: false };
      pending.then(() => (state.settled = true));
      return state;
    }

    it('stops a hung, signal-ignoring call after 20 seconds', async () => {
      const signals: AbortSignal[] = [];
      const transport = jest.fn(hung(signals));

      const pending = runClassification(plan, { transport });
      const state = track(pending);
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);

      expect(REQUEST_TIMEOUT_MS).toBe(20_000);
      expect(state.settled).toBe(false);
      expect(signals[0].aborted).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      const run = await pending;

      expect(signals[0].aborted).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(run.failure).toBe(REQUEST_TIMED_OUT);
      expect(run.results.map((r) => r.status)).toEqual(['error', 'skipped', 'skipped', 'skipped']);
    });

    it('gives every call its own 20-second budget', async () => {
      const signals: AbortSignal[] = [];
      const transport = jest.fn((request: string, signal: AbortSignal) =>
        signals.length < 2
          ? new Promise((resolve) => {
              signals.push(signal);
              setTimeout(() => resolve(reply()), 15_000);
            })
          : hung(signals)(request, signal)
      );

      const pending = runClassification(plan, { transport });
      const state = track(pending);
      await jest.advanceTimersByTimeAsync(30_000);

      expect(transport).toHaveBeenCalledTimes(3);
      expect(signals.slice(0, 2).map((s) => s.aborted)).toEqual([false, false]);

      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);

      expect(state.settled).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      const run = await pending;

      expect(run.results.map((r) => r.status)).toEqual(['ok', 'ok', 'error', 'skipped']);
      expect(run.failure).toBe(REQUEST_TIMED_OUT);
    });

    it('never caches a valid response that arrives after the request timeout', async () => {
      const cache = new Map<string, JevPrediction>();
      const set = jest.spyOn(cache, 'set');
      let respond: (value: unknown) => void = () => {};
      const transport = jest.fn(
        () =>
          new Promise((resolve) => {
            respond = resolve;
          })
      );

      const pending = runClassification(plan, { transport, cache });
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      const run = await pending;
      respond(reply());
      await jest.advanceTimersByTimeAsync(0);

      expect(run.failure).toBe(REQUEST_TIMED_OUT);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
      expect(cache.size).toBe(0);
    });

    it('still cancels a call before its timeout', async () => {
      const controller = new AbortController();
      const signals: AbortSignal[] = [];

      const pending = runClassification(plan, { transport: hung(signals), signal: controller.signal });
      await jest.advanceTimersByTimeAsync(1_000);
      controller.abort();
      const run = await pending;

      expect(signals[0].aborted).toBe(true);
      expect(run.results.map((r) => r.status)).toEqual(['cancelled', 'skipped', 'skipped', 'skipped']);
      expect(run.failure).toBeUndefined();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
