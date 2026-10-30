import { createDataSourceUidWrapper } from '@shared/infrastructure/datasource/testing/createDataSourceUidWrapper';
import { mockFetch, mockPendingFetch } from '@shared/infrastructure/http/testing/mockFetch';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';

import { useUploadFile } from '../useUploadFile';

jest.mock('@shared/domain/reportInteraction', () => ({
  reportInteraction: jest.fn(),
}));

describe('useUploadFile()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should expose the uploaded profile', async () => {
    mockFetch(() => ({ id: 'profile-123', profileTypes: ['cpu'], flamebearerProfile: '{"version":1}' }));
    const { result } = renderHook(() => useUploadFile(), { wrapper: createDataSourceUidWrapper('pyroscope-abc') });

    await act(async () => {
      await result.current.processFile(new File(['pprof'], 'profile.pb.gz'));
    });

    expect(result.current).toMatchObject({
      id: 'profile-123',
      profileTypes: ['cpu'],
      profile: { version: 1 },
      isLoading: false,
    });
  });

  it('should upload the file to the context datasource', async () => {
    const fetch = mockFetch(() => ({ id: 'profile-123', profileTypes: ['cpu'], flamebearerProfile: '{"version":1}' }));
    const { result } = renderHook(() => useUploadFile(), { wrapper: createDataSourceUidWrapper('pyroscope-abc') });

    await act(async () => {
      await result.current.processFile(new File(['pprof'], 'profile.pb.gz'));
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/adhocprofiles.v1.AdHocProfileService/Upload',
      expect.anything()
    );
  });

  it('should not abort another upload when a file is removed', async () => {
    const fetch = mockPendingFetch();
    const { result } = renderHook(() => [useUploadFile(), useUploadFile()], {
      wrapper: createDataSourceUidWrapper('pyroscope-abc'),
    });

    act(() => void result.current[0].processFile(new File(['pprof'], 'left.pb.gz')));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    act(() => result.current[1].removeFile());

    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });
});
