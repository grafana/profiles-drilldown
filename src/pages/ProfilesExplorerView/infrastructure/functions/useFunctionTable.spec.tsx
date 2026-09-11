import { dateTime } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { SceneObjectBase } from '@grafana/scenes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useFunctionTable } from './useFunctionTable';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  config: { appSubUrl: '/', bootData: { user: { orgId: 1 } } },
}));

const left = {
  query: 'memory:alloc_space:bytes:space:bytes{service_name="pyroscope"}',
  timeRange: { from: dateTime(1700000000000), to: dateTime(1700000001000), raw: { from: 'now-1h', to: 'now' } },
};

function response(name: string, total: string): Response {
  return { ok: true, json: async () => ({ functions: { total, functions: [{ name, total }] } }) } as Response;
}

describe('useFunctionTable', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(() => {
    global.fetch = fetchMock;
  });

  function setup(refreshSource?: SceneObjectBase) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
      ({ uid }) => useFunctionTable({ dataSourceUid: uid, enabled: true, left, maxNodes: 5, refreshSource }),
      {
        wrapper,
        initialProps: { uid: 'baseline' },
      }
    );
  }

  it('cancels a previous selection and never displays its late response', async () => {
    let finishOld!: (response: Response) => void;
    let finishNew!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    );
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        })
    );
    const { result, rerender } = setup();
    expect(result.current.functionTable).toEqual({ total: 0, rows: [] });
    rerender({ uid: 'comparison' });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      finishNew(response('current', '200'));
    });
    await waitFor(() =>
      expect(result.current.functionTable).toEqual({ total: 200, rows: [{ name: 'current', self: 0, total: 200 }] })
    );
    await act(async () => {
      finishOld(response('stale', '100'));
    });
    expect(result.current.functionTable).toEqual({ total: 200, rows: [{ name: 'current', self: 0, total: 200 }] });
  });

  it('refreshes a fixed time range and removes the subscription on unmount', async () => {
    class RefreshSource extends SceneObjectBase {}
    const source = new RefreshSource({});
    fetchMock.mockResolvedValueOnce(response('before', '100')).mockResolvedValueOnce(response('after', '200'));
    const { result, unmount } = setup(source);
    await waitFor(() => expect(result.current.functionTable?.total).toBe(100));
    act(() => source.publishEvent(new RefreshEvent()));
    await waitFor(() => expect(result.current.functionTable?.rows[0].name).toBe('after'));
    expect(result.current.functionTable?.total).toBe(200);
    unmount();
    act(() => source.publishEvent(new RefreshEvent()));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps errors visible and suppresses the tree-derived table while the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('query failed'));
    const { result } = setup();
    await waitFor(() => expect(result.current.error?.message).toBe('query failed'));
    expect(result.current.functionTable).toEqual({ total: 0, rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows the existing table only when the server does not support the format', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ flamegraph: {} }) } as Response);
    const { result } = setup();
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.functionTable).toBeUndefined();
    expect(result.current.error).toBeNull();
  });
});
