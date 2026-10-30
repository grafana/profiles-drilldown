import { getDataSourceInstanceList } from '@grafana/plugin-compat/datasources';
import { renderHook, waitFor } from '@testing-library/react';

import { usePyroscopeDataSources } from '../useSelectDefaultDataSourceUid';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
}));

const getDataSourceInstanceListMock = jest.mocked(getDataSourceInstanceList);

describe('usePyroscopeDataSources()', () => {
  it('should return the Pyroscope datasources', async () => {
    getDataSourceInstanceListMock.mockResolvedValue([{ uid: 'pyroscope-abc' }] as any);

    const { result } = renderHook(() => usePyroscopeDataSources());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.datasources).toEqual([{ uid: 'pyroscope-abc' }]);
    expect(getDataSourceInstanceListMock).toHaveBeenCalledWith({ pluginId: 'grafana-pyroscope-datasource' });
  });
});
