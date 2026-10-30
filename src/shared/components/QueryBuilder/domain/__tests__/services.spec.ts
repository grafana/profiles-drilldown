import { mockFetch, mockPendingFetch } from '@shared/infrastructure/http/testing/mockFetch';
import { labelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { MemoryCacheClient } from '@shared/infrastructure/MemoryCacheClient';

import { QueryBuilderLabelsRepository } from '../../infrastructure/QueryBuilderLabelsRepository';
import { createActions } from '../actions';
import { createServices } from '../services';
import { buildStateMachine, defaultContext } from '../stateMachine';
import { FilterKind, QueryBuilderEvent } from '../types';

const context = {
  ...defaultContext,
  query: '{}',
  inputParams: { dataSourceUid: 'pyroscope-abc', query: '{}', from: 1, to: 2 },
};
const event = {} as QueryBuilderEvent;

describe('QueryBuilder labels', () => {
  let actions: ReturnType<typeof createActions>;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    const labelsRepository = new QueryBuilderLabelsRepository({ cacheClient: new MemoryCacheClient() });
    actions = createActions({ labelsRepository });
    services = createServices({ labelsRepository });
  });

  it('should fetch labels from the input datasource', async () => {
    const fetch = mockFetch(() => ({ names: [] }));

    await services.fetchLabels(context, event);

    expect(fetch).toHaveBeenCalledWith(
      '/api/datasources/proxy/uid/pyroscope-abc/querier.v1.QuerierService/LabelNames',
      expect.anything()
    );
  });

  it('should not abort shared labels when query-builder inputs change', () => {
    const fetch = mockPendingFetch();
    const { actor } = buildStateMachine({
      dataSourceUid: 'pyroscope-abc',
      query: '{test="idle-update"}',
      from: 1,
      to: 2,
    });

    actor.start();
    try {
      void labelsRepository.listLabels({
        dataSourceUid: 'pyroscope-abc',
        query: '{test="idle-update"}',
        from: 1,
        to: 2,
      });

      actor.send({
        type: 'CHANGE_INPUT_PARAMS',
        data: {
          dataSourceUid: 'pyroscope-abc',
          query: '{test="idle-update"}',
          from: 1,
          to: 3,
        },
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
      expect(actor.getSnapshot().value).toBe('idle');
    } finally {
      actor.stop();
    }
  });

  it('should cancel query-builder labels without aborting shared labels', () => {
    const fetch = mockPendingFetch();

    void labelsRepository.listLabels({
      dataSourceUid: 'pyroscope-abc',
      query: '{test="domain-isolation"}',
      from: 1,
      to: 2,
    });
    void services.fetchLabels({ ...context, query: '{test="domain-isolation"}' }, event);

    actions.cancelAllLoad(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it('should cancel query-builder label values without aborting shared label values', () => {
    const fetch = mockPendingFetch();

    void labelsRepository.listLabelValues({
      dataSourceUid: 'pyroscope-abc',
      query: '{test="value-domain-isolation"}',
      from: 1,
      to: 2,
      label: 'env',
    });
    void services.fetchLabelValues(
      {
        ...context,
        query: '{test="value-domain-isolation"}',
        filters: [
          {
            id: 'env-filter',
            type: FilterKind.partial,
            active: false,
            attribute: { value: 'env', label: 'env' },
          },
        ],
      },
      event
    );

    actions.cancelAllLoad(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it('should reuse pending and completed query-builder label requests', async () => {
    const fetch = mockFetch(() => ({ names: ['env'] }));
    const cacheContext = { ...context, query: '{test="cache-reuse"}' };

    await Promise.all([services.fetchLabels(cacheContext, event), services.fetchLabels(cacheContext, event)]);
    await services.fetchLabels(cacheContext, event);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should not abort query-builder requests for another datasource', () => {
    const fetch = mockPendingFetch();

    void services.fetchLabels({ ...context, query: '{test="datasource-isolation"}' }, event);
    void services.fetchLabels(
      {
        ...context,
        query: '{test="datasource-isolation"}',
        inputParams: { ...context.inputParams, dataSourceUid: 'pyroscope-def' },
      },
      event
    );

    actions.cancelAllLoad(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(false);
  });

  it('should cancel pending requests to the input datasource', () => {
    const fetch = mockPendingFetch();

    void services.fetchLabels({ ...context, query: '{pending}' }, event);
    actions.cancelAllLoad(context);

    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
