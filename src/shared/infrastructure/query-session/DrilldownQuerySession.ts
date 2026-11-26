import { SceneObject } from '@grafana/scenes';
import { Suggestions } from '@shared/components/QueryBuilder/domain/types';
import pLimit from 'p-limit';
import { createContext, useContext } from 'react';
import { formatSeriesResponse } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/formatSeriesResponse';

import packageJson from '../../../../package.json';
import { MetadataQuery, MetadataResult, QuerySession } from './QuerySession';
import { queryToMatchers } from './queryToMatchers';

type LabelsOptions = { dataSourceUid: string; query: string; from: number; to: number };
export interface SessionLabelsRepository {
  listLabels(options: LabelsOptions): Promise<Suggestions>;
  listLabelValues(options: LabelsOptions & { label: string }): Promise<Suggestions>;
  cancel(options: { dataSourceUid: string; reason: string }): void;
}

/** One owner per Drilldown, including embedded Drilldowns on the same page. */
export class DrilldownQuerySession {
  private session?: QuerySession;
  private uid?: string;
  private generation = 0;
  private active = true;
  // Keep below the server's default eight active page requests.
  private limit = pLimit(4);
  private cache = new Map<string, Promise<MetadataResult>>();

  activate() {
    this.active = true;
  }

  selectDataSource(uid: string) {
    if (uid !== this.uid) {
      this.reset();
      this.uid = uid;
    }
  }

  private reset() {
    this.generation++;
    this.session?.close();
    this.session = undefined;
    this.cache.clear();
  }

  close() {
    this.active = false;
    this.reset();
  }

  private query(uid: string, query: MetadataQuery, signal?: AbortSignal): Promise<MetadataResult> {
    if (!this.active) {
      return Promise.reject(new DOMException('Drilldown is inactive', 'AbortError'));
    }
    this.selectDataSource(uid);
    const generation = this.generation;
    // Cache only uncancellable reads. A consumer must never cancel another's work.
    const key = JSON.stringify(query);
    if (!signal && this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const promise = this.limit(async () => {
      if (generation !== this.generation || !this.active || signal?.aborted) {
        throw new DOMException('Metadata query superseded', 'AbortError');
      }
      this.session ??= new QuerySession(uid, packageJson.version);
      return this.session.query(query, signal);
    });
    if (!signal) {
      // Bound scene-local caching, including fulfilled promises.
      if (this.cache.size >= 100) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(key, promise);
      void promise.catch(() => {
        if (this.cache.get(key) === promise) {
          this.cache.delete(key);
        }
      });
    }
    return promise;
  }

  async series(dataSourceUid: string, from: number, to: number, matchers: string[]) {
    return formatSeriesResponse(
      await this.query(dataSourceUid, {
        query_type: 'QUERY_SERIES_LABELS',
        start: from,
        end: to,
        matchers,
        label_names: ['service_name', '__profile_type__'],
      })
    );
  }

  /** Each query builder gets its own cancellation controller, not its own socket. */
  labels(): SessionLabelsRepository {
    let controller = new AbortController();
    const cache = new Map<string, Promise<MetadataResult>>();
    const read = (uid: string, query: MetadataQuery) => {
      this.selectDataSource(uid);
      const key = JSON.stringify([this.generation, uid, query]);
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      const promise = this.query(uid, query, controller.signal);
      if (cache.size >= 100) {
        cache.delete(cache.keys().next().value!);
      }
      cache.set(key, promise);
      void promise.catch(() => {
        if (cache.get(key) === promise) {
          cache.delete(key);
        }
      });
      return promise;
    };
    return {
      listLabels: async ({ dataSourceUid, query, from, to }) => {
        const result = await read(dataSourceUid, {
          query_type: 'QUERY_LABEL_NAMES',
          start: from,
          end: to,
          matchers: queryToMatchers(query),
        });
        return [...new Set(result.names.filter((name) => !/^(__.+__|service_name)$/.test(name)))].map((name) => ({
          value: name,
          label: name,
        }));
      },
      listLabelValues: async ({ dataSourceUid, label, query, from, to }) => {
        const result = await read(dataSourceUid, {
          query_type: 'QUERY_LABEL_VALUES',
          start: from,
          end: to,
          matchers: queryToMatchers(query),
          name: label,
        });
        return result.names.map((name) => ({ value: name, label: name }));
      },
      cancel: () => {
        controller.abort();
        controller = new AbortController();
        cache.clear();
      },
    };
  }
}

const owners = new WeakMap<SceneObject, DrilldownQuerySession>();
export function registerQuerySession(scene: SceneObject, session: DrilldownQuerySession) {
  owners.set(scene, session);
}
export function getQuerySession(scene: SceneObject): DrilldownQuerySession {
  let current: SceneObject | undefined = scene;
  while (current) {
    const owner = owners.get(current);
    if (owner) {
      return owner;
    }
    current = current.parent;
  }
  throw new Error('Metadata queries require a Drilldown query-session owner');
}

const QuerySessionContext = createContext<DrilldownQuerySession | undefined>(undefined);
export const QuerySessionProvider = QuerySessionContext.Provider;
export function useQuerySession() {
  const session = useContext(QuerySessionContext);
  if (!session) {
    throw new Error('QueryBuilder requires a Drilldown query-session provider');
  }
  return session;
}
