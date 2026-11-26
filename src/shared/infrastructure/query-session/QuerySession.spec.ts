import { QuerySession } from './QuerySession';

jest.mock('../appUrl', () => ({ getDataSourceProxyUrl: () => '/api/datasources/proxy/uid/test' }));

class Socket {
  static instances: Socket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  sent: any[] = [];
  constructor(public url: URL) {
    Socket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close = jest.fn();
  frame(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const query = {
  query_type: 'QUERY_LABEL_NAMES' as const,
  start: 1,
  end: 2,
  matchers: [],
};

describe('QuerySession', () => {
  const original = global.WebSocket;
  beforeEach(() => {
    Socket.instances = [];
    global.WebSocket = Socket as unknown as typeof WebSocket;
  });
  afterEach(() => {
    global.WebSocket = original;
  });

  it('multiplexes queries on one socket and identifies Drilldown', async () => {
    const session = new QuerySession('test', '3.1.0');
    const first = session.query(query);
    const second = session.query(query);
    expect(Socket.instances).toHaveLength(1);
    const socket = Socket.instances[0];
    expect(socket.url.searchParams.get('user-agent')).toBe('profiles-drilldown/3.1.0');
    socket.onopen?.();
    await Promise.resolve();
    socket.frame({ id: '1', page: { strings: { values: ['service_name'] }, refs: [0] } });
    socket.frame({ id: '2', page: { refs: [0] } });
    socket.frame({ id: '2', complete: { query_complete: true } });
    socket.frame({ id: '1', complete: { query_complete: true } });
    expect((await first).names).toEqual(['service_name']);
    expect((await second).names).toEqual(['service_name']);
    session.close();
  });

  it('follows cursors and applies ordered dictionary resets', async () => {
    const session = new QuerySession('test', '3.1.0');
    const result = session.query(query);
    const socket = Socket.instances[0];
    socket.onopen?.();
    await Promise.resolve();
    socket.frame({ id: '1', page: { strings: { values: ['first'] }, refs: [0], next_token: 'cursor' } });
    socket.frame({ id: '1', complete: {} });
    expect(socket.sent[1]).toEqual({ id: '2', next: { next_token: 'cursor' } });
    socket.frame({ table_reset: { epoch: 1 } });
    socket.frame({ id: '2', page: { table_epoch: 1, strings: { values: ['second'] }, refs: [0] } });
    socket.frame({ id: '2', complete: { query_complete: true } });
    expect((await result).names).toEqual(['first', 'second']);
    expect(socket.sent.at(-1)).toEqual({ id: '3', cancel: { target_id: '1' } });
    session.close();
  });

  it('decodes projected series labels including omitted protobuf zero indices', async () => {
    const session = new QuerySession('test', '3.1.0');
    const result = session.query({ ...query, query_type: 'QUERY_SERIES_LABELS' });
    const socket = Socket.instances[0];
    socket.onopen?.();
    await Promise.resolve();
    socket.frame({
      id: '1',
      page: {
        strings: { values: ['service_name', 'api'] },
        series: [{ labels: [{ value: 1 }] }],
      },
    });
    socket.frame({ id: '1', complete: { query_complete: true } });
    expect((await result).labelsSet).toEqual([{ labels: [{ name: 'service_name', value: 'api' }] }]);
    expect(socket.sent[0].query.start).toBe('1');
    session.close();
  });

  it('retains deltas from cancelled requests for other multiplexed queries', async () => {
    const session = new QuerySession('test', '3.1.0');
    const controller = new AbortController();
    const cancelled = session.query(query, controller.signal);
    const rejected = cancelled.catch((error) => error);
    const result = session.query(query);
    const socket = Socket.instances[0];
    socket.onopen?.();
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }
    // The unsignalled request resumes first; the cancellable request gets ID 2.
    controller.abort();
    expect(await rejected).toMatchObject({ name: 'AbortError' });
    socket.frame({ id: '2', page: { strings: { values: ['env'] }, refs: [0] } });
    socket.frame({ id: '1', page: { refs: [0] } });
    socket.frame({ id: '1', complete: { query_complete: true } });
    expect((await result).names).toEqual(['env']);
    session.close();
  });

  it.each([
    { page: { refs: [8] } },
    { page: { table_epoch: 1 } },
    { page: { strings: { start: 4, values: ['bad'] } } },
    { table_reset: { epoch: 2 } },
  ])('fails all active requests on invalid dictionary frames: %j', async (frame) => {
    const session = new QuerySession('test', '3.1.0');
    const result = session.query(query);
    const rejected = result.catch((error) => error);
    const socket = Socket.instances[0];
    socket.onopen?.();
    await Promise.resolve();
    socket.frame({ id: '1', ...frame });
    expect(await rejected).toMatchObject({ message: 'Invalid query-session frame' });
    expect(socket.close).toHaveBeenCalled();
  });

  it('rejects requests on disconnect and starts with a fresh dictionary on reconnect', async () => {
    const session = new QuerySession('test', '3.1.0');
    const first = session.query(query);
    const rejected = first.catch((error) => error);
    const socket = Socket.instances[0];
    socket.onopen?.();
    await Promise.resolve();
    socket.frame({ id: '1', page: { strings: { values: ['old'] }, refs: [0] } });
    socket.onclose?.();
    expect(await rejected).toBeInstanceOf(Error);
    const second = session.query(query);
    const replacement = Socket.instances[1];
    replacement.onopen?.();
    await Promise.resolve();
    const id = replacement.sent[0].id;
    replacement.frame({ id, page: { strings: { values: ['new'] }, refs: [0] } });
    replacement.frame({ id, complete: { query_complete: true } });
    expect((await second).names).toEqual(['new']);
    session.close();
  });

  it('settles requests when the scene closes during connection establishment', async () => {
    const session = new QuerySession('test', '3.1.0');
    const result = session.query(query);
    session.close();
    await expect(result).rejects.toThrow('Query session closed');
  });

  it('allows cancelling one request during connection establishment', async () => {
    const session = new QuerySession('test', '3.1.0');
    const controller = new AbortController();
    const result = session.query(query, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(Socket.instances[0].close).not.toHaveBeenCalled();
    session.close();
  });
});
