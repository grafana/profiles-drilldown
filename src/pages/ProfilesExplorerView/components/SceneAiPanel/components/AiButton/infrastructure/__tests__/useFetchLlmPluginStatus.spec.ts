import { getAppPluginHealth } from '@grafana/plugin-compat/apps';
import { HealthStatus, isAppPluginEnabled, isAppPluginInstalled } from '@grafana/runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useFetchLlmPluginStatus } from '../useFetchLlmPluginStatus';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  isAppPluginInstalled: jest.fn(),
  isAppPluginEnabled: jest.fn(),
}));

jest.mock('@shared/infrastructure/tracking/logger');

jest.mock('@grafana/plugin-compat/apps', () => ({
  getAppPluginHealth: jest.fn(),
}));

const isAppPluginInstalledMock = jest.mocked(isAppPluginInstalled);
const isAppPluginEnabledMock = jest.mocked(isAppPluginEnabled);
const getAppPluginHealthMock = jest.mocked(getAppPluginHealth);

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

interface ExpectCalls {
  installed?: boolean;
  enabled?: boolean;
  health?: boolean;
}

function expectCalls(
  { enabled = true, health = true, installed = true }: ExpectCalls = { enabled: true, health: true, installed: true }
) {
  expect(isAppPluginInstalledMock).toHaveBeenCalledTimes(installed ? 1 : 0);
  if (installed) {
    expect(isAppPluginInstalledMock).toHaveBeenCalledWith('grafana-llm-app');
  }

  expect(isAppPluginEnabledMock).toHaveBeenCalledTimes(enabled ? 1 : 0);
  if (enabled) {
    expect(isAppPluginEnabledMock).toHaveBeenCalledWith('grafana-llm-app');
  }

  expect(getAppPluginHealthMock).toHaveBeenCalledTimes(health ? 1 : 0);
  if (health) {
    expect(getAppPluginHealthMock).toHaveBeenCalledWith('grafana-llm-app');
  }
}

describe('useFetchLlmPluginStatus()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAppPluginInstalledMock.mockResolvedValue(false);
    isAppPluginEnabledMock.mockResolvedValue(false);
    getAppPluginHealthMock.mockResolvedValue({ status: HealthStatus.OK, details: {}, message: '' });
  });

  describe('when the Grafana LLM app is not installed', () => {
    it('does not call the enabled or health endpoint and returns isEnabled=false', async () => {
      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();

      expectCalls({ enabled: false, health: false });
    });
  });

  describe('when the Grafana LLM app is installed', () => {
    beforeEach(() => {
      isAppPluginInstalledMock.mockResolvedValue(true);
    });

    it('returns isEnabled=true when settings.enabled and the health check reports a configured, ok provider', async () => {
      isAppPluginEnabledMock.mockResolvedValue(true);
      getAppPluginHealthMock.mockResolvedValueOnce({
        status: HealthStatus.OK,
        details: { llmProvider: { configured: true, ok: true } },
        message: '',
      });

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isEnabled).toBe(true);
      });

      expectCalls();
    });

    it('returns isEnabled=false without calling the health endpoint when settings.enabled is false', async () => {
      isAppPluginEnabledMock.mockResolvedValue(false);

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);

      expectCalls({ health: false });
    });

    it('returns isEnabled=false when the health check reports the provider is not configured/ok', async () => {
      isAppPluginEnabledMock.mockResolvedValue(true);
      getAppPluginHealthMock.mockResolvedValueOnce({
        status: HealthStatus.OK,
        details: { llmProvider: { configured: false, ok: false } },
        message: '',
      });

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);

      expectCalls();
    });

    it('returns isEnabled=false, without an error or toast, when the settings endpoint returns a 403 (Access Denied)', async () => {
      isAppPluginEnabledMock.mockRejectedValueOnce(new HttpError(403, 'Access Denied'));

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();

      expectCalls({ health: false });
    });

    it('returns isEnabled=false when the settings endpoint is unreachable (plugin not installed server-side)', async () => {
      isAppPluginEnabledMock.mockRejectedValueOnce(new Error('not found'));

      const { result } = renderHook(() => useFetchLlmPluginStatus(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.isEnabled).toBe(false);
      expect(result.current.error).toBeFalsy();

      expectCalls({ health: false });
    });
  });
});
