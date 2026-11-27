import { mockGrafanaFetch, mockPendingGrafanaFetch } from '../../http/testing/mockGrafanaFetch';
import { labelsRepository } from '../labelsRepository';

const respondWithRoutePath = ({ routePath }: { routePath: string }) => ({ names: [routePath] });

describe('labelsRepository', () => {
  describe('listLabels()', () => {
    it('should fetch labels from the given datasource', async () => {
      mockGrafanaFetch(respondWithRoutePath);

      const labels = await labelsRepository.listLabels({ dataSourceUid: 'pyroscope-abc', query: 'q1', from: 1, to: 2 });

      expect(labels).toEqual([
        {
          value: 'querier.v1.QuerierService/LabelNames',
          label: 'querier.v1.QuerierService/LabelNames',
        },
      ]);
    });

    it('should not reuse the cached labels of another datasource', async () => {
      const fetch = mockGrafanaFetch(respondWithRoutePath);

      await labelsRepository.listLabels({ dataSourceUid: 'pyroscope-abc', query: 'q2', from: 1, to: 2 });
      await labelsRepository.listLabels({ dataSourceUid: 'pyroscope-def', query: 'q2', from: 1, to: 2 });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toMatchObject({
        uid: 'pyroscope-abc',
        routePath: 'querier.v1.QuerierService/LabelNames',
      });
      expect(fetch.mock.calls[1][0]).toMatchObject({
        uid: 'pyroscope-def',
        routePath: 'querier.v1.QuerierService/LabelNames',
      });
    });
  });

  describe('listLabelValues()', () => {
    it('should fetch label values from the given datasource', async () => {
      mockGrafanaFetch(respondWithRoutePath);

      const values = await labelsRepository.listLabelValues({
        dataSourceUid: 'pyroscope-abc',
        label: 'env',
        query: 'q5',
        from: 1,
        to: 2,
      });

      expect(values).toEqual([
        {
          value: 'querier.v1.QuerierService/LabelValues',
          label: 'querier.v1.QuerierService/LabelValues',
        },
      ]);
    });

    it('should not reuse the cached label values of another datasource', async () => {
      const fetch = mockGrafanaFetch(respondWithRoutePath);

      await labelsRepository.listLabelValues({
        dataSourceUid: 'pyroscope-abc',
        label: 'env',
        query: 'q6',
        from: 1,
        to: 2,
      });
      await labelsRepository.listLabelValues({
        dataSourceUid: 'pyroscope-def',
        label: 'env',
        query: 'q6',
        from: 1,
        to: 2,
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toMatchObject({
        uid: 'pyroscope-abc',
        routePath: 'querier.v1.QuerierService/LabelValues',
      });
      expect(fetch.mock.calls[1][0]).toMatchObject({
        uid: 'pyroscope-def',
        routePath: 'querier.v1.QuerierService/LabelValues',
      });
    });
  });

  describe('cancel()', () => {
    it("should abort the given datasource's pending request", () => {
      const fetch = mockPendingGrafanaFetch();

      labelsRepository.listLabels({ dataSourceUid: 'pyroscope-abc', query: 'q3', from: 1, to: 2 });
      labelsRepository.cancel({ dataSourceUid: 'pyroscope-abc', reason: 'Discarded by user' });

      expect(fetch.mock.calls[0][0].options.signal?.aborted).toBe(true);
    });

    it("should not abort another datasource's pending request", () => {
      const fetch = mockPendingGrafanaFetch();

      labelsRepository.listLabels({ dataSourceUid: 'pyroscope-def', query: 'q4', from: 1, to: 2 });
      labelsRepository.cancel({ dataSourceUid: 'pyroscope-abc', reason: 'Discarded by user' });

      expect(fetch.mock.calls[0][0].options.signal?.aborted).toBe(false);
    });
  });
});
