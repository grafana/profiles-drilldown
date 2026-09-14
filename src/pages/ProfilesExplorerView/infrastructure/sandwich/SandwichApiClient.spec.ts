import { SandwichApiClient, sandwichRequest } from './SandwichApiClient';

jest.mock('@shared/domain/url-params/parseQuery', () => ({
  parseQuery: (query: string) => ({
    profileMetricId: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
    labelsSelector: query,
  }),
}));

const timeRange = { from: { valueOf: () => 1000 }, to: { valueOf: () => 2000 } } as never;

describe('sandwichRequest', () => {
  it('asks for the sandwich format and names the function', () => {
    expect(
      sandwichRequest({ function: 'runtime.mallocgc', query: '{service_name="svc"}', timeRange, maxNodes: 16384 })
    ).toEqual({
      profileTypeID: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
      labelSelector: '{service_name="svc"}',
      start: 1000,
      end: 2000,
      format: 'PROFILE_FORMAT_SANDWICH',
      sandwichFunction: 'runtime.mallocgc',
      maxNodes: 16384,
    });
  });

  it('passes the span and profile id selectors only when set', () => {
    const withSelectors = sandwichRequest({
      function: 'f',
      query: '{}',
      timeRange,
      spanSelector: 'span-1',
      profileIdSelector: 'profile-1',
    });
    expect(withSelectors).toMatchObject({ spanSelector: ['span-1'], profileIdSelector: ['profile-1'] });
    expect(sandwichRequest({ function: 'f', query: '{}', timeRange })).not.toHaveProperty('spanSelector');
  });
});

describe('SandwichApiClient', () => {
  const client = new SandwichApiClient({ dataSourceUid: 'ds' });
  const request = sandwichRequest({ function: 'f', query: '{}', timeRange, maxNodes: 16384 });

  const respondWith = (body: unknown) => {
    jest
      .spyOn(client, 'fetch' as never)
      .mockResolvedValue({ json: async () => body } as never);
  };

  afterEach(() => jest.restoreAllMocks());

  it('resolves the shared name table into both halves', async () => {
    respondWith({
      sandwich: {
        names: ['f', 'caller', 'callee'],
        callers: { nameIndex: 0, total: '15', children: [{ nameIndex: 1, total: '15' }] },
        callees: { nameIndex: 0, total: '15', self: '2', children: [{ nameIndex: 2, total: '13', self: '13' }] },
        total: '15',
        self: '2',
      },
    });

    const result = await client.query(request);
    expect(result).toEqual({
      label: 'f',
      total: 15,
      self: 2,
      callers: { name: 'f', total: 15, self: 0, children: [{ name: 'caller', total: 15, self: 0 }] },
      callees: { name: 'f', total: 15, self: 2, children: [{ name: 'callee', total: 13, self: 13 }] },
    });
  });

  it('keeps the truncation flag, which is what marks a sandwich as partial', async () => {
    respondWith({
      sandwich: {
        names: ['f', 'other'],
        callees: { nameIndex: 0, total: '10', children: [{ nameIndex: 1, total: '4', self: '4', truncated: true }] },
        total: '10',
      },
    });
    const result = await client.query(request);
    expect(result!.callees!.children![0]).toEqual({ name: 'other', total: 4, self: 4, truncated: true });
  });

  it('returns null when the server ignored the format', async () => {
    // An older server answers with a flamegraph, and the flame graph then computes the sandwich
    // from the tree it already has.
    respondWith({ flamegraph: { names: [], levels: [] } });
    expect(await client.query(request)).toBeNull();
  });

  it('tolerates a name index the table does not cover', async () => {
    respondWith({ sandwich: { names: ['f'], callers: { nameIndex: 9, total: '1' }, total: '1' } });
    const result = await client.query(request);
    expect(result!.callers!.name).toBe('');
  });
});
