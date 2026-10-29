import { renderHook } from '@testing-library/react';
import React, { ReactNode } from 'react';

import { DataSourceUidProvider, useDataSourceUid } from '../DataSourceUidContext';

describe('useDataSourceUid()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return the provider uid', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <DataSourceUidProvider uid="pyroscope-abc">{children}</DataSourceUidProvider>
    );

    const { result } = renderHook(() => useDataSourceUid(), { wrapper });

    expect(result.current).toBe('pyroscope-abc');
  });

  it('should throw when there is no context', () => {
    expect(() => renderHook(() => useDataSourceUid())).toThrow(
      'useDataSourceUid must be used inside DataSourceUidProvider'
    );
  });
});
