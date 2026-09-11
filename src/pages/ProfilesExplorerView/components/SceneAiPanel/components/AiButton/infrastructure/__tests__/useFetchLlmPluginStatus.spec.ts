import { isAppPluginInstalled } from '@grafana/runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useFetchLlmPluginStatus } from '../useFetchLlmPluginStatus';

const mockGet = jest.fn();

jest.mock('@grafana/runtime', () => ({
  isAppPluginInstalled: jest.fn(),
  getBackendSrv: () => ({
    get: (...args: unknown[]) => mockGet(...args),
  }),
}));

jest.mock('@shared/infrastructure/tracking/logger');

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
};

describe('useFetchLlmPluginStatus()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAppPluginInstalled as jest.Mock).mockResolvedValue(false);
  });

  describe('when the Grafana LLM app is not installed', () => {
    it('does not call the settings endpoint and returns isEnabled=false', async () => {
      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(mockGet).not.toHaveBeenCalled();
      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();
    });
  });

  describe('when the Grafana LLM app is installed', () => {
    beforeEach(() => {
      (isAppPluginInstalled as jest.Mock).mockResolvedValue(true);
    });

    it('returns isEnabled=true when settings.enabled and the health check reports a configured, ok provider', async () => {
      mockGet.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({
        details: { llmProvider: { configured: true, ok: true } },
      });

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isEnabled).toBe(true);
      });

      expect(mockGet).toHaveBeenCalledWith(
        '/api/plugins/grafana-llm-app/settings',
        undefined,
        undefined,
        expect.objectContaining({ showErrorAlert: false, showSuccessAlert: false })
      );
    });

    it('returns isEnabled=false without calling the health endpoint when settings.enabled is false', async () => {
      mockGet.mockResolvedValueOnce({ enabled: false });

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('returns isEnabled=false when the health check reports the provider is not configured/ok', async () => {
      mockGet.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({
        details: { llmProvider: { configured: false, ok: false } },
      });

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
    });

    it('returns isEnabled=false, without an error or toast, when the settings endpoint returns a 403 (Access Denied)', async () => {
      mockGet.mockRejectedValueOnce(new HttpError(403, 'Access Denied'));

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();
      expect(mockGet).toHaveBeenCalledWith(
        '/api/plugins/grafana-llm-app/settings',
        undefined,
        undefined,
        expect.objectContaining({ showErrorAlert: false, showSuccessAlert: false })
      );
    });

    it('returns isEnabled=false when the settings endpoint is unreachable (plugin not installed server-side)', async () => {
      mockGet.mockRejectedValueOnce(new Error('not found'));

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();
    });
  });
});
