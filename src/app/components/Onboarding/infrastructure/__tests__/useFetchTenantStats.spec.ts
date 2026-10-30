import { createDataSourceUidWrapper } from '@shared/infrastructure/datasource/testing/createDataSourceUidWrapper';
import { mockFetch } from '@shared/infrastructure/http/testing/mockFetch';
import { renderHook, waitFor } from '@testing-library/react';

import { useFetchTenantStats } from '../useFetchTenantStats';

describe('useFetchTenantStats()', () => {
  it('should fetch stats from the given datasource', async () => {
    const fetch = mockFetch();

    renderHook(() => useFetchTenantStats({ enabled: true, dataSourceUid: 'pyroscope-abc' }), {
      wrapper: createDataSourceUidWrapper(''),
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/pyroscope-abc/querier.v1.QuerierService/GetProfileStats',
        expect.anything()
      )
    );
  });

  it('should not fetch stats without a datasource uid', () => {
    mockFetch();

    const { result } = renderHook(() => useFetchTenantStats({ enabled: true, dataSourceUid: '' }), {
      wrapper: createDataSourceUidWrapper(''),
    });

    expect(result.current.isFetching).toBe(false);
  });
});
