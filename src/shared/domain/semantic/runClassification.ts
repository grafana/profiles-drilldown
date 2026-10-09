import { batchJevRequests, JevPrediction, parseJevBatchReply, parseJevReply } from './jevRubric';
import { SemanticCase, SemanticPlan } from './planClassification';

export const REQUEST_TIMED_OUT = 'Provider request timed out';
export const REQUEST_TIMEOUT_MS = 20_000;

export type CaseResult =
  | { readonly status: 'pending' }
  | { readonly status: 'ok'; readonly prediction: JevPrediction; readonly cacheHit: boolean }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'cancelled' | 'skipped' };

export interface ClassificationRun {
  readonly plan: SemanticPlan;
  /** Aligned with `plan.cases`. */
  readonly results: readonly CaseResult[];
  readonly done: boolean;
  /** Fatal request error. Individual invalid answers remain case errors without stopping the run. */
  readonly failure?: string;
}

/**
 * Sends one request body and resolves with the parsed JSON reply. Error messages are kept in run results, so
 * they must not contain credentials or provider bodies.
 */
export type JevTransport = (request: string, signal: AbortSignal) => Promise<unknown>;

export interface PredictionCache {
  get(request: string): JevPrediction | undefined;
  set(request: string, prediction: JevPrediction): void;
}

export interface RunOptions {
  transport: JevTransport;
  /** Aborting cancels the in-flight or next case and skips the remaining cases. */
  signal?: AbortSignal;
  cache?: PredictionCache;
  batchSize?: number;
  concurrency?: number;
  /** Receives an immutable snapshot after each case settles; never called once `signal` is aborted. */
  onProgress?: (run: ClassificationRun) => void;
}

const PENDING: CaseResult = Object.freeze({ status: 'pending' });
const CANCELLED: CaseResult = Object.freeze({ status: 'cancelled' });
const SKIPPED: CaseResult = Object.freeze({ status: 'skipped' });

export function pendingRun(plan: SemanticPlan): ClassificationRun {
  return snapshot(
    plan,
    plan.cases.map(() => PENDING),
    false
  );
}

/**
 * Classifies without retries, using bounded concurrent batches when requested.
 */
export async function runClassification(plan: SemanticPlan, options: RunOptions): Promise<ClassificationRun> {
  const batchSize = Math.min(options.batchSize ?? 1, 32);
  if (batchSize > 1 && plan.cases.length > batchSize) {
    return runBatches(plan, options, batchSize);
  }
  return runCases(plan, options);
}

async function runCases(plan: SemanticPlan, options: RunOptions): Promise<ClassificationRun> {
  const results = plan.cases.map(() => PENDING);
  let failure: string | undefined;
  let stopped = false;
  for (let i = 0; i < plan.cases.length && !stopped; i++) {
    const result = await classifyCase(plan.cases[i], options);
    results[i] = result;
    stopped = result.status !== 'ok';
    if (stopped) {
      failure = result.status === 'error' ? result.error : undefined;
      results.fill(SKIPPED, i + 1);
    }
    publish(options, snapshot(plan, results, stopped || i === plan.cases.length - 1, failure));
  }
  return snapshot(plan, results, true, failure);
}

async function runBatches(plan: SemanticPlan, options: RunOptions, batchSize: number): Promise<ClassificationRun> {
  const results: CaseResult[] = plan.cases.map(({ request }) => {
    const prediction = !options.signal?.aborted && request !== null ? options.cache?.get(request) : undefined;
    return prediction ? Object.freeze({ status: 'ok', prediction, cacheHit: true }) : PENDING;
  });
  // Read all hits before new predictions can evict them from the LRU.
  const pending = results.flatMap((result, index) => (result.status === 'pending' ? [index] : []));
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) {
    abort();
  }
  const batchOptions = { ...options, signal: controller.signal };
  let next = 0;
  let settled = results.length - pending.length;
  let failure: string | undefined;

  const stopAfterFailure = (error: unknown): CaseResult => {
    if (options.signal?.aborted) {
      return CANCELLED;
    }
    if (failure) {
      return SKIPPED;
    }
    failure = messageOf(error);
    abort();
    return failed(failure);
  };

  const worker = async () => {
    while (next < pending.length && !controller.signal.aborted) {
      const { indices, requests, body } = takeBatch(plan.cases, pending, next, batchSize);
      const count = indices.length;
      next += count;
      const first = plan.cases[indices[0]];
      try {
        if (body === null) {
          throw new Error(first.error ?? 'Evidence cannot be classified');
        }
        const answers = await classifyBatch(body, requests, batchOptions);
        answers.forEach((answer, index) => {
          results[indices[index]] = answer;
        });
      } catch (error) {
        const result = stopAfterFailure(error);
        indices.forEach((index) => {
          results[index] = result;
        });
      }
      settled += count;
      publish(options, snapshot(plan, results, settled === plan.cases.length, failure));
    }
  };

  try {
    const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 1));
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
  if (options.signal?.aborted && !results.some((result) => result.status === 'cancelled')) {
    const pending = results.findIndex((result) => result.status === 'pending');
    if (pending >= 0) {
      results[pending] = CANCELLED;
    }
  }
  results.forEach((result, index) => {
    if (result.status === 'pending') {
      results[index] = SKIPPED;
    }
  });
  const run = snapshot(plan, results, true, failure);
  publish(options, run);
  return run;
}

function takeBatch(cases: readonly SemanticCase[], pending: readonly number[], next: number, batchSize: number) {
  const indices = [pending[next++]];
  let body = cases[indices[0]].request;
  const requests = body === null ? [] : [body];
  while (requests.length && requests.length < batchSize && next < pending.length) {
    const candidate = cases[pending[next]].request;
    if (candidate === null) {
      break;
    }
    try {
      body = batchJevRequests([...requests, candidate]);
      requests.push(candidate);
      indices.push(pending[next++]);
    } catch {
      break;
    }
  }
  return { indices, requests, body };
}

async function classifyBatch(body: string, requests: readonly string[], options: RunOptions): Promise<CaseResult[]> {
  const reply = await send(body, options);
  options.signal?.throwIfAborted();
  const predictions = requests.length === 1 ? [parseJevReply(reply)] : parseJevBatchReply(reply, requests.length);
  return predictions.map((prediction, index) => {
    if (prediction instanceof Error) {
      return failed(prediction.message);
    }
    options.cache?.set(requests[index], prediction);
    return Object.freeze({ status: 'ok', prediction, cacheHit: false });
  });
}

async function classifyCase(c: SemanticCase, options: RunOptions): Promise<CaseResult> {
  if (options.signal?.aborted) {
    return CANCELLED;
  }
  if (c.request === null) {
    return failed(c.error ?? 'Evidence cannot be classified');
  }
  const cached = options.cache?.get(c.request);
  if (cached) {
    return Object.freeze({ status: 'ok', prediction: cached, cacheHit: true });
  }
  try {
    const reply = await send(c.request, options);
    // A reply can win the race when it resolves in the same turn as the abort.
    if (options.signal?.aborted) {
      return CANCELLED;
    }
    const prediction = parseJevReply(reply);
    options.cache?.set(c.request, prediction);
    return Object.freeze({ status: 'ok', prediction, cacheHit: false });
  } catch (error) {
    return options.signal?.aborted ? CANCELLED : failed(messageOf(error));
  }
}

async function send(request: string, options: RunOptions): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort);
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, REQUEST_TIMEOUT_MS);
  // Settles on abort even when the transport ignores its signal.
  const stopped = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('Provider request aborted')));
  });
  try {
    return await Promise.race([options.transport(request, controller.signal), stopped]);
  } catch (error) {
    throw timedOut ? new Error(REQUEST_TIMED_OUT) : error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Classification request failed';
}

function publish(options: RunOptions, run: ClassificationRun) {
  if (!options.signal?.aborted) {
    options.onProgress?.(run);
  }
}

function failed(error: string): CaseResult {
  return Object.freeze({ status: 'error', error });
}

function snapshot(plan: SemanticPlan, results: CaseResult[], done: boolean, failure?: string): ClassificationRun {
  return Object.freeze({ plan, results: Object.freeze([...results]), done, failure });
}
