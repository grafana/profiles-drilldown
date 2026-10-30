import { mockFetch } from '@shared/infrastructure/http/testing/mockFetch';

import { LabelsDataSource } from '../LabelsDataSource';

describe('LabelsDataSource', () => {
  it('should fetch labels from the given datasource', async () => {
    const fetch = mockFetch(() => ({ names: ['env'] }));

    const labels = await new LabelsDataSource().fetchLabels('pyroscope-abc', 'q', 1, 2);

    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/querier.v1.QuerierService/LabelNames',
      expect.anything()
    );
    expect(labels).toEqual([{ value: 'env', label: 'env' }]);
  });

  it('should fetch label values from the given datasource', async () => {
    const fetch = mockFetch(() => ({ names: [] }));

    await new LabelsDataSource().fetchLabelValues('pyroscope-abc', 'q', 1, 2, 'env');

    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/querier.v1.QuerierService/LabelValues',
      expect.anything()
    );
  });
});
