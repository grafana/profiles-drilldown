import { renderHook } from '@testing-library/react';

import { useDefaultDataSourceUid } from '../useDefaultDataSourceUid';
import { useSelectDefaultDataSourceUid } from '../useSelectDefaultDataSourceUid';

jest.mock('../useSelectDefaultDataSourceUid', () => ({
  useSelectDefaultDataSourceUid: jest.fn(),
}));

const useSelectDefaultDataSourceUidMock = jest.mocked(useSelectDefaultDataSourceUid);

describe('useDefaultDataSourceUid()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useSelectDefaultDataSourceUidMock.mockReturnValue({ loading: true, value: undefined, error: undefined });
  });

  it('should return the selected uid without waiting for the default', () => {
    const { result } = renderHook(() => useDefaultDataSourceUid({ selectedUid: 'pyroscope-abc' }));

    expect(result.current).toEqual({ uid: 'pyroscope-abc', loading: false, error: undefined });
  });

  it('should report loading while the default resolves', () => {
    const { result } = renderHook(() => useDefaultDataSourceUid());

    expect(result.current.loading).toBe(true);
  });

  it('should return the resolved default uid', () => {
    useSelectDefaultDataSourceUidMock.mockReturnValue({ loading: false, value: 'pyroscope-def' });

    const { result } = renderHook(() => useDefaultDataSourceUid());

    expect(result.current.uid).toBe('pyroscope-def');
  });

  it('should report a missing uid for an empty selected uid', () => {
    const { result } = renderHook(() => useDefaultDataSourceUid({ selectedUid: '' }));

    expect(result.current.error?.message).toBe('No datasource UID was selected.');
  });

  it('should pass the selection error through', () => {
    useSelectDefaultDataSourceUidMock.mockReturnValue({ loading: false, error: new Error('Datasource not found') });

    const { result } = renderHook(() => useDefaultDataSourceUid());

    expect(result.current.error?.message).toBe('Datasource not found');
  });
});
