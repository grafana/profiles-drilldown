import { DataSourceProxyClient } from '../series/http/DataSourceProxyClient';

export interface ProfileSelection {
  profileTypeID: string;
  labelSelector: string;
  start: number;
  end: number;
  profileIdSelector?: string[];
  spanSelector?: string[];
  traceIdSelector?: string[];
}

export interface ProjectionSnapshot {
  dataSourceUid: string;
  left: ProfileSelection;
  right?: ProfileSelection;
}

export type TreeQuery = {
  selection: 'ROOT_PATH' | 'FUNCTION_CHAIN';
  direction: 'CALLEES' | 'CALLERS' | 'BOTH';
  /** Always root-first, including caller chains. */
  path: string[];
  depth?: number;
};

export interface FunctionStats {
  name: string;
  total: number;
  self: number;
}

export interface FunctionTable {
  functions: FunctionStats[];
  total: number;
  totalFunctions: number;
}

export interface FunctionTreeNode extends FunctionStats {
  children: FunctionTreeNode[];
  hasChildren: boolean;
}

export interface FunctionTree {
  callers?: { root?: FunctionTreeNode };
  callees?: { root?: FunctionTreeNode };
}

export interface ProjectionResult<T> {
  left: T;
  right?: T;
}

type Int64 = string | number;
type WireStats = { name?: string; total?: Int64; self?: Int64 };
type WireNode = WireStats & { children?: WireNode[]; hasChildren?: boolean };
type WireTree = { callers?: { root?: WireNode }; callees?: { root?: WireNode } };
type WireTable = { functions?: WireStats[]; total?: Int64; totalFunctions?: Int64 };

function stats(row: WireStats): FunctionStats {
  return { name: row.name ?? '', total: Number(row.total ?? 0), self: Number(row.self ?? 0) };
}

function table(value: WireTable): FunctionTable {
  return {
    functions: (value.functions ?? []).map(stats),
    total: Number(value.total ?? 0),
    totalFunctions: Number(value.totalFunctions ?? 0),
  };
}

function node(value: WireNode): FunctionTreeNode {
  return { ...stats(value), children: (value.children ?? []).map(node), hasChildren: value.hasChildren ?? false };
}

function tree(value: WireTree): FunctionTree {
  return {
    ...(value.callers && { callers: { root: value.callers.root && node(value.callers.root) } }),
    ...(value.callees && { callees: { root: value.callees.root && node(value.callees.root) } }),
  };
}

function validateTreeQuery(query: TreeQuery) {
  if (query.depth !== undefined && (!Number.isInteger(query.depth) || query.depth < 0 || query.depth > 128)) {
    throw new Error('Tree depth must be an integer between 0 and 128');
  }
  if (query.selection === 'ROOT_PATH' && query.direction !== 'CALLEES') {
    throw new Error('ROOT_PATH only supports CALLEES');
  }
  if (query.selection === 'FUNCTION_CHAIN' && !query.path.length) {
    throw new Error('FUNCTION_CHAIN requires a function');
  }
  if (query.direction === 'BOTH' && query.path.length !== 1) {
    throw new Error('BOTH requires a single function');
  }
}

export function projectionRequest(snapshot: ProjectionSnapshot, query?: TreeQuery) {
  if (snapshot.right && snapshot.left.profileTypeID !== snapshot.right.profileTypeID) {
    throw new Error('Diff projections require the same profile type');
  }
  if (query) {
    validateTreeQuery(query);
  }
  const options = query
    ? {
        format: 'PROFILE_FORMAT_FUNCTION_TREE',
        formatOptions: {
          functionTree: {
            selection: `FUNCTION_TREE_SELECTION_${query.selection}`,
            direction: `FUNCTION_TREE_DIRECTION_${query.direction}`,
            ...(query.depth !== undefined && { maxDepth: query.depth }),
          },
        },
      }
    : { format: 'PROFILE_FORMAT_FUNCTIONS', formatOptions: { functions: { limit: '0' } } };
  const select = (profile: ProfileSelection) => ({
    profileTypeID: profile.profileTypeID,
    labelSelector: profile.labelSelector,
    start: profile.start,
    end: profile.end,
    profileIdSelector: profile.profileIdSelector,
    spanSelector: profile.spanSelector,
    traceIdSelector: profile.traceIdSelector,
    ...(query && { stackTraceSelector: { callSite: query.path.map((name) => ({ name })) } }),
  });
  const left = { ...select(snapshot.left), ...options };
  return snapshot.right ? { left, right: select(snapshot.right) } : left;
}

/** One instance per resolved source snapshot; dispose when that source changes. */
export class FunctionProjections {
  readonly sourceId: string;
  private readonly snapshot: ProjectionSnapshot;
  private readonly client: DataSourceProxyClient;
  private readonly controller = new AbortController();
  private readonly requests = new Map<string, Promise<unknown>>();
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(snapshot: ProjectionSnapshot) {
    // Isolate requests from subsequent mutation of scene queries, selectors or relative ranges.
    this.snapshot = JSON.parse(JSON.stringify(snapshot));
    this.sourceId = JSON.stringify({
      dataSourceUid: snapshot.dataSourceUid,
      request: projectionRequest(this.snapshot),
    });
    this.client = new DataSourceProxyClient({ dataSourceUid: snapshot.dataSourceUid });
  }

  dispose() {
    this.controller.abort();
    this.requests.clear();
    this.active = 0;
    this.waiting.splice(0).forEach((resume) => resume());
  }

  getFunctions(): Promise<ProjectionResult<FunctionTable>> {
    return this.request<WireTable, FunctionTable>('functions', table);
  }

  getTree(query: TreeQuery): Promise<ProjectionResult<FunctionTree>> {
    const { direction } = query;
    return this.request<WireTree, FunctionTree>(
      'functionTree',
      (value) => {
        const result = tree(value);
        if ((direction !== 'CALLEES' && !result.callers) || (direction !== 'CALLERS' && !result.callees)) {
          throw new Error('Missing requested function tree direction');
        }
        return result;
      },
      query
    );
  }

  private request<W, T>(field: string, decode: (value: W) => T, query?: TreeQuery): Promise<ProjectionResult<T>> {
    const body = JSON.stringify(projectionRequest(this.snapshot, query));
    const cached = this.requests.get(body);
    if (cached) {
      return cached as Promise<ProjectionResult<T>>;
    }
    const result = this.fetch(body).then((response) => {
      this.controller.signal.throwIfAborted();
      const value = response[field] as W | { left?: W; right?: W } | undefined;
      if (!value) {
        throw new Error(`Missing ${field} projection`);
      }
      if (this.snapshot.right) {
        const diff = value as { left?: W; right?: W };
        if (!diff.left || !diff.right) {
          throw new Error(`Missing ${field} diff side`);
        }
        return { left: decode(diff.left), right: decode(diff.right) };
      }
      return { left: decode(value as W) };
    });
    this.requests.set(body, result);
    result.catch(() => this.requests.delete(body));
    return result;
  }

  private async fetch(body: string): Promise<Record<string, unknown>> {
    const { signal } = this.controller;
    signal.throwIfAborted();
    if (this.active >= 4) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      signal.throwIfAborted();
      // Explicit source cancellation avoids backendSrv's mutually aborting request IDs.
      const response = await this.client.fetch(
        `/querier.v1.QuerierService/${this.snapshot.right ? 'Diff' : 'SelectMergeStacktraces'}`,
        { method: 'POST', body, signal }
      );
      const value = await response.json();
      signal.throwIfAborted();
      return value;
    } finally {
      if (!signal.aborted) {
        const next = this.waiting.shift();
        if (next) {
          next();
        } else {
          this.active--;
        }
      }
    }
  }
}

/** Scoped to the datasource/auth context by its owner, not cached globally across organizations. */
export function functionProjectionsCapability(dataSourceUid: string): () => Promise<boolean> {
  const client = new DataSourceProxyClient({ dataSourceUid });
  let pending: Promise<boolean> | undefined;
  return () => {
    pending ??= client
      .fetch('/capabilities.v1.FeatureFlagsService/GetFeatureFlags', { method: 'POST', body: '{}' })
      .then((response) => response.json())
      .then((response: { featureFlags?: Array<{ name?: string; enabled?: boolean }> }) =>
        Boolean(response.featureFlags?.some((flag) => flag.name === 'functionProjections' && flag.enabled === true))
      )
      .catch(() => false);
    return pending;
  };
}
