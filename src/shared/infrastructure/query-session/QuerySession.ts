import { getDataSourceProxyUrl } from '../appUrl';

export type MetadataQuery = {
  query_type: 'QUERY_LABEL_NAMES' | 'QUERY_LABEL_VALUES' | 'QUERY_SERIES_LABELS';
  start: number;
  end: number;
  matchers: string[];
  label_names?: string[];
  name?: string;
};

export type MetadataResult = {
  names: string[];
  labelsSet: Array<{ labels: Array<{ name: string; value: string }> }>;
};

type Pending = {
  rootId: string;
  result: MetadataResult;
  nextToken?: string;
  resolve: (result: MetadataResult) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

/** Owned by one Drilldown scene. Never share this instance across scenes. */
export class QuerySession {
  private socket?: WebSocket;
  private opening?: Promise<void>;
  private rejectOpening?: (error: Error) => void;
  private connectTimeout?: ReturnType<typeof setTimeout>;
  private strings: string[] = [];
  private epoch = 0;
  private sequence = 0;
  private pending = new Map<string, Pending>();

  constructor(private readonly dataSourceUid: string, private readonly version: string) {}

  private open(): Promise<void> {
    if (this.opening) {
      return this.opening;
    }
    const url = new URL(
      `${getDataSourceProxyUrl(this.dataSourceUid)}/querier.v1.QuerierService/Session`,
      window.location.href
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('accept', 'application/json');
    url.searchParams.set('user-agent', `profiles-drilldown/${this.version}`);
    const socket = new WebSocket(url);
    this.socket = socket;
    this.opening = new Promise<void>((resolve, reject) => {
      this.rejectOpening = reject;
      this.connectTimeout = setTimeout(() => this.close(new Error('Query session connection timed out')), 10000);
      socket.onopen = () => {
        clearTimeout(this.connectTimeout);
        this.rejectOpening = undefined;
        resolve();
      };
      socket.onmessage = (event) => {
        try {
          this.receive(JSON.parse(event.data));
        } catch {
          this.close(new Error('Invalid query-session frame'));
        }
      };
      const failed = () => {
        const error = new Error('Query session disconnected; restart metadata queries');
        reject(error);
        this.close(error);
      };
      socket.onerror = failed;
      socket.onclose = failed;
    });
    return this.opening;
  }

  async query(query: MetadataQuery, signal?: AbortSignal): Promise<MetadataResult> {
    if (signal?.aborted) {
      throw new DOMException('Metadata query cancelled', 'AbortError');
    }
    await this.waitForOpen(signal);
    if (signal?.aborted) {
      throw new DOMException('Metadata query cancelled', 'AbortError');
    }
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const abort = () => {
        const entry = [...this.pending.entries()].find(([, pending]) => pending.rootId === id);
        if (!entry) {
          return;
        }
        this.cancel(id);
        this.pending.delete(entry[0]);
        entry[1].cleanup();
        reject(new DOMException('Metadata query cancelled', 'AbortError'));
      };
      const pending: Pending = {
        rootId: id,
        result: { names: [], labelsSet: [] },
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', abort),
      };
      this.pending.set(id, pending);
      signal?.addEventListener('abort', abort, { once: true });
      this.send({ id, query: { ...query, start: String(query.start), end: String(query.end), page_size: 10000 } });
    });
  }

  private waitForOpen(signal?: AbortSignal): Promise<void> {
    const opening = this.open();
    if (!signal) {
      return opening;
    }
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(new DOMException('Metadata query cancelled', 'AbortError'));
      };
      const settle = (error?: Error) => {
        signal.removeEventListener('abort', abort);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      signal.addEventListener('abort', abort, { once: true });
      opening.then(() => settle(), settle);
    });
  }

  private send(request: unknown) {
    if (!this.socket) {
      throw new Error('Query session is closed');
    }
    try {
      this.socket.send(JSON.stringify(request));
    } catch {
      this.close(new Error('Failed to send query-session request'));
    }
  }

  private cancel(targetId: string) {
    this.send({ id: String(++this.sequence), cancel: { target_id: targetId } });
  }

  private ref(index: number): string {
    const value = this.strings[index];
    if (!Number.isInteger(index) || value === undefined) {
      throw new Error('Unknown query-session string reference');
    }
    return value;
  }

  private receive(frame: any) {
    // Even cancelled requests can carry deltas needed by other requests.
    if (frame.table_reset) {
      if (frame.table_reset.epoch !== this.epoch + 1) {
        throw new Error('Invalid string-table epoch');
      }
      this.epoch = frame.table_reset.epoch;
      this.strings = [];
      return;
    }
    const pending = this.pending.get(frame.id);
    if (frame.page) {
      this.receivePage(frame.page, pending);
    } else if (pending && (frame.error || frame.complete)) {
      this.pending.delete(frame.id);
      this.receiveCompletion(frame, pending);
    }
  }

  private receivePage(page: any, pending?: Pending) {
    if ((page.table_epoch ?? 0) !== this.epoch) {
      throw new Error('Unexpected string-table epoch');
    }
    if (page.strings) {
      if ((page.strings.start ?? 0) !== this.strings.length) {
        throw new Error('Invalid string-table delta');
      }
      this.strings.push(...(page.strings.values ?? []));
    }
    const names = (page.refs ?? []).map((ref: number) => this.ref(ref));
    const labelsSet = (page.series ?? []).map((series: any) => ({
      labels: (series.labels ?? []).map((label: any) => ({
        name: this.ref(label.key ?? 0),
        value: this.ref(label.value ?? 0),
      })),
    }));
    if (pending) {
      pending.result.names.push(...names);
      pending.result.labelsSet.push(...labelsSet);
      pending.nextToken = page.next_token;
    }
  }

  private receiveCompletion(frame: any, pending: Pending) {
    if (frame.error) {
      this.cancel(pending.rootId);
      pending.cleanup();
      pending.reject(new Error(`${frame.error.code}: ${frame.error.message}`));
    } else if (frame.complete.query_complete) {
      this.cancel(pending.rootId);
      pending.cleanup();
      pending.resolve(pending.result);
    } else if (pending.nextToken) {
      const id = String(++this.sequence);
      this.pending.set(id, pending);
      this.send({ id, next: { next_token: pending.nextToken } });
    } else {
      this.cancel(pending.rootId);
      pending.cleanup();
      pending.reject(new Error('Incomplete metadata query without a cursor'));
    }
  }

  close(error = new Error('Query session closed')) {
    const socket = this.socket;
    clearTimeout(this.connectTimeout);
    this.rejectOpening?.(error);
    this.rejectOpening = undefined;
    this.socket = undefined;
    this.opening = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
    this.strings = [];
    this.epoch = 0;
  }
}
