import { renderHook, waitFor } from '@testing-library/react';

import { createDataSourceUidWrapper } from '../../datasource/testing/createDataSourceUidWrapper';
import { mockGrafanaFetch } from '../../http/testing/mockGrafanaFetch';
import { useFetchRecordingRules } from '../useFetchRecordingRules';

describe('useFetchRecordingRules()', () => {
  it('should fetch recording rules from the context datasource', async () => {
    const fetch = mockGrafanaFetch();

    renderHook(() => useFetchRecordingRules(), { wrapper: createDataSourceUidWrapper('pyroscope-abc') });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'pyroscope-abc',
          routePath: 'settings.v1.RecordingRulesService/ListRecordingRules',
        })
      )
    );
  });

  it('should throw without a datasource uid', () => {
    mockGrafanaFetch();

    expect(() => renderHook(() => useFetchRecordingRules(), { wrapper: createDataSourceUidWrapper('') })).toThrow(
      'useDataSourceUid must be used inside DataSourceUidProvider'
    );
  });
});
