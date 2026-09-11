import { dateTime } from '@grafana/data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useFetchDiffProfile } from './useFetchDiffProfile';

jest.mock('@grafana/runtime', () => ({ config: { appSubUrl: '/', bootData: { user: { orgId: 1 } } } }));
jest.mock('@shared/domain/url-params/useMaxNodesFromUrl', () => ({ useMaxNodesFromUrl: () => [5] }));

const timeRange = {
  from: dateTime(1700000000123),
  to: dateTime(1700000001123),
  raw: { from: 'now-1h', to: 'now' },
};
const query = 'memory:alloc_space:bytes:space:bytes{service_name="pyroscope"}';

it('preserves profile totals for exports and cancels a graph request when the datasource changes', async () => {
  const fetchMock = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ flamegraph: { total: '300', leftTicks: '100', rightTicks: '200' } }),
    } as Response);
  global.fetch = fetchMock;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(
    ({ uid }) =>
      useFetchDiffProfile({
        enabled: true,
        dataSourceUid: uid,
        baselineQuery: query,
        comparisonQuery: query,
        baselineTimeRange: timeRange,
        comparisonTimeRange: timeRange,
      }),
    { wrapper, initialProps: { uid: 'first' } }
  );
  rerender({ uid: 'second' });
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await waitFor(() => expect(result.current.profile?.leftTicks).toBe(100));
  expect(result.current.profile?.rightTicks).toBe(200);
  expect(result.current.profile?.metadata).toEqual({
    name: 'alloc_space',
    format: 'double',
    spyName: '',
    units: 'bytes',
    sampleRate: 100,
  });
  expect(result.current.error).toBeNull();
});
