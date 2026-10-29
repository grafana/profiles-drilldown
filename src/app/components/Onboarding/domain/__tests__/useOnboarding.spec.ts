import { useDefaultDataSourceUid } from '@shared/infrastructure/datasource/useDefaultDataSourceUid';
import { usePyroscopeDataSources } from '@shared/infrastructure/datasource/useSelectDefaultDataSourceUid';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useFetchTenantStats } from '../../infrastructure/useFetchTenantStats';
import { useOnboarding } from '../useOnboarding';

jest.mock('@shared/infrastructure/datasource/useSelectDefaultDataSourceUid', () => ({
  usePyroscopeDataSources: jest.fn(),
}));

jest.mock('../../infrastructure/useFetchTenantStats', () => ({
  useFetchTenantStats: jest.fn(),
}));

jest.mock('@shared/infrastructure/datasource/useDefaultDataSourceUid', () => ({
  useDefaultDataSourceUid: jest.fn(),
}));

const usePyroscopeDataSourcesMock = jest.mocked(usePyroscopeDataSources);
const useFetchTenantStatsMock = jest.mocked(useFetchTenantStats);
const useDefaultDataSourceUidMock = jest.mocked(useDefaultDataSourceUid);

describe('useOnboarding()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: false, datasources: [], error: undefined });
    useFetchTenantStatsMock.mockReturnValue({ isFetching: false, error: null, refetch: jest.fn() });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: undefined, error: undefined });
  });

  it('should show the loading page while the datasource uid resolves', () => {
    useDefaultDataSourceUidMock.mockReturnValue({ loading: true, uid: undefined, error: undefined });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowLoadingPage).toBe(true);
  });

  it('should fetch stats from the resolved datasource uid', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: false, datasources: [{}] as any, error: undefined });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: 'pyroscope-abc', error: undefined });

    renderHook(() => useOnboarding());

    expect(useFetchTenantStatsMock).toHaveBeenCalledWith({ enabled: true, dataSourceUid: 'pyroscope-abc' });
  });

  it('should not fetch stats without Pyroscope datasources', () => {
    renderHook(() => useOnboarding());

    expect(useFetchTenantStatsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('should show the loading page while the datasources load', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: true, datasources: undefined, error: undefined });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: 'pyroscope-abc', error: undefined });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowLoadingPage).toBe(true);
  });

  it('should hide the loading page when the stats request fails', () => {
    useFetchTenantStatsMock.mockReturnValue({
      isFetching: true,
      error: new Error('Service unavailable'),
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowLoadingPage).toBe(false);
  });

  it('should hide the loading page when loading the datasources fails', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({
      loading: true,
      datasources: undefined,
      error: new Error('Forbidden'),
    });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowLoadingPage).toBe(false);
  });

  it('should show the onboarding page without Pyroscope datasources', () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowOnboardingPage).toBe(true);
  });

  it('should show the onboarding page when the tenant has no ingested data', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: false, datasources: [{}] as any, error: undefined });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: 'pyroscope-abc', error: undefined });
    useFetchTenantStatsMock.mockReturnValue({
      isFetching: false,
      error: null,
      stats: { hasIngestedData: false, oldestProfileTime: 0, newestProfileTime: 0 },
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowOnboardingPage).toBe(true);
  });

  it('should show the onboarding page when the stats request fails', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: false, datasources: [{}] as any, error: undefined });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: 'pyroscope-abc', error: undefined });
    useFetchTenantStatsMock.mockReturnValue({
      isFetching: false,
      error: new Error('Service unavailable'),
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowOnboardingPage).toBe(true);
  });

  it('should hide the onboarding page once the modal is closed', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.actions.closeModal());

    expect(result.current.data.shouldShowOnboardingPage).toBe(false);
  });

  it('should hide the onboarding page when the tenant has data', () => {
    usePyroscopeDataSourcesMock.mockReturnValue({ loading: false, datasources: [{}] as any, error: undefined });
    useDefaultDataSourceUidMock.mockReturnValue({ loading: false, uid: 'pyroscope-abc', error: undefined });
    useFetchTenantStatsMock.mockReturnValue({
      isFetching: false,
      error: null,
      stats: { hasIngestedData: true, oldestProfileTime: 0, newestProfileTime: 0 },
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.data.shouldShowOnboardingPage).toBe(false);
  });
});
