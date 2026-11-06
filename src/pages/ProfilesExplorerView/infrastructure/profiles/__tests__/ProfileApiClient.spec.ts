import { dateTime } from '@grafana/data';

import { ProfileApiClient } from '../ProfileApiClient';

jest.mock('@grafana/runtime', () => ({ config: { bootData: { user: { orgId: 1 } } } }));

const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: '1', to: '2' } };
const query = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api"}';

const runtime = globalThis as unknown as { fetch: jest.Mock };

function lastRequest() {
  const [url, init] = runtime.fetch.mock.calls.at(-1) as [string, RequestInit];
  return { url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

describe('ProfileApiClient', () => {
  const client = new ProfileApiClient({ dataSourceUid: 'pyroscope' });

  beforeEach(() => {
    runtime.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        flamegraph: { names: ['total'], levels: [{ values: ['0', '1', '1', '0'] }], total: '1', maxSelf: '1' },
      }),
      text: async () => '',
    }));
  });

  it('keeps using render when no selector is active', async () => {
    await client.get({ query, timeRange, format: 'json', maxNodes: 10 });

    expect(lastRequest().url).toContain('/pyroscope/render?');
  });

  it('sends a span selector to SelectMergeSpanProfile', async () => {
    const profile = await client.get({ query, timeRange, format: 'json', maxNodes: 10, spanSelector: 'span-1' });

    expect(lastRequest().url).toContain('/SelectMergeSpanProfile');
    expect(lastRequest().body.spanSelector).toEqual(['span-1']);
    expect(profile).toMatchObject({ metadata: { units: 'samples', sampleRate: 1_000_000_000 } });
  });

  it('sends a profile id to SelectMergeStacktraces', async () => {
    await client.get({
      query: 'memory:inuse_space:bytes:space:bytes{service_name="api"}',
      timeRange,
      format: 'json',
      maxNodes: 10,
      profileIdSelector: 'profile-1',
    });

    const { url, body } = lastRequest();
    expect(url).toContain('/SelectMergeStacktraces');
    expect(body.profileIdSelector).toEqual(['profile-1']);
    expect(body.spanSelector).toBeUndefined();
  });

  it('keeps the profile id and drops the span when both are set', async () => {
    await client.get({
      query: 'memory:inuse_space:bytes:space:bytes{service_name="api"}',
      timeRange,
      format: 'json',
      maxNodes: 10,
      profileIdSelector: 'profile-1',
      spanSelector: 'span-1',
    });

    const { url, body } = lastRequest();
    expect(url).toContain('/SelectMergeStacktraces');
    expect(body.profileIdSelector).toEqual(['profile-1']);
    expect(body.spanSelector).toBeUndefined();
  });

  it('maps count-based profile types to object units', async () => {
    const profile = await client.get({
      query: 'mutex:contentions:count:contentions:count{service_name="api"}',
      timeRange,
      format: 'json',
      maxNodes: 10,
      profileIdSelector: 'profile-1',
    });

    expect(profile).toMatchObject({ metadata: { units: 'objects', sampleRate: 100 } });
  });
});
