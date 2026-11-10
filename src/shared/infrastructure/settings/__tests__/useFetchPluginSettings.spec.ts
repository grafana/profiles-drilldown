import { renderHook, waitFor } from '@testing-library/react';

import { createDataSourceUidWrapper } from '../../datasource/testing/createDataSourceUidWrapper';
import { mockGrafanaFetch } from '../../http/testing/mockGrafanaFetch';
import { useFetchPluginSettings } from '../useFetchPluginSettings';

describe('useFetchPluginSettings()', () => {
  it('should fetch settings from the context datasource', async () => {
    const fetch = mockGrafanaFetch();

    renderHook(() => useFetchPluginSettings(), { wrapper: createDataSourceUidWrapper('pyroscope-abc') });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/pyroscope-abc/settings.v1.SettingsService/Get',
        expect.anything()
      )
    );
  });

  it('should throw without a datasource uid', () => {
    mockGrafanaFetch();

    expect(() => renderHook(() => useFetchPluginSettings(), { wrapper: createDataSourceUidWrapper('') })).toThrow(
      'useDataSourceUid must be used inside DataSourceUidProvider'
    );
  });
});
