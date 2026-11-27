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
        expect.objectContaining({
          uid: 'pyroscope-abc',
          routePath: 'settings.v1.SettingsService/Get',
        })
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
