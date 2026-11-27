import { dateTime, TimeRange } from '@grafana/data';
import { getSelectedDefaultDataSource } from '@shared/infrastructure/datasource/useSelectDefaultDataSourceUid';
import { mockGrafanaFetch } from '@shared/infrastructure/http/testing/mockGrafanaFetch';

import { SeriesDataSource } from '../SeriesDataSource';

jest.mock('@shared/infrastructure/datasource/useSelectDefaultDataSourceUid', () => ({
  getSelectedDefaultDataSource: jest.fn(),
}));

const getSelectedDefaultDataSourceMock = jest.mocked(getSelectedDefaultDataSource);

const range: TimeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: '1000', to: '2000' } };

describe('SeriesDataSource', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getSelectedDefaultDataSourceMock.mockResolvedValue({ uid: 'pyroscope-xyz' } as any);
  });

  it('should fetch series from the given datasource', async () => {
    const fetch = mockGrafanaFetch(() => ({ labelsSet: [] }));

    await new SeriesDataSource().fetchSeries('pyroscope-abc', range);

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'pyroscope-abc',
        routePath: 'querier.v1.QuerierService/Series',
      })
    );
  });

  it('should fall back to the selected default datasource', async () => {
    const fetch = mockGrafanaFetch(() => ({ labelsSet: [] }));

    await new SeriesDataSource().metricFindQuery('$dataSource $filtersAllServices and all services', { range });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'pyroscope-xyz',
        routePath: 'querier.v1.QuerierService/Series',
      })
    );
  });
});
