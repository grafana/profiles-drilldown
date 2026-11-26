import { SessionLabelsRepository } from '@shared/infrastructure/query-session/DrilldownQuerySession';

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

describe('QueryBuilder session labels', () => {
  let repository: SessionLabelsRepository;
  beforeEach(() => {
    repository = {
      listLabels: jest.fn().mockResolvedValue([{ value: 'env', label: 'env' }]),
      listLabelValues: jest.fn().mockResolvedValue([{ value: 'prod', label: 'prod' }]),
      cancel: jest.fn(),
    };
  });

  it('passes the input datasource, matchers and range to the injected repository', async () => {
    const services = createServices({ labelsRepository: repository });
    expect(await services.fetchLabels(context, event)).toEqual([{ value: 'env', label: 'env' }]);
    expect(repository.listLabels).toHaveBeenCalledWith(context.inputParams);
  });

  it('fetches values for the partial filter', async () => {
    const services = createServices({ labelsRepository: repository });
    await services.fetchLabelValues(
      {
        ...context,
        filters: [{ id: 'env', type: FilterKind.partial, active: false, attribute: { value: 'env', label: 'env' } }],
      },
      event
    );
    expect(repository.listLabelValues).toHaveBeenCalledWith({ ...context.inputParams, label: 'env' });
  });

  it('cancels only its injected repository', () => {
    createActions({ labelsRepository: repository }).cancelAllLoad(context);
    expect(repository.cancel).toHaveBeenCalledWith({ dataSourceUid: 'pyroscope-abc', reason: 'Discarded by user' });
  });

  it('keeps the actor idle when input parameters change and disposes pending suggestions', () => {
    const { actor, dispose } = buildStateMachine(context.inputParams, repository);
    actor.start();
    actor.send({ type: 'CHANGE_INPUT_PARAMS', data: { ...context.inputParams, to: 3 } });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
    dispose();
    expect(repository.cancel).toHaveBeenCalled();
  });
});
