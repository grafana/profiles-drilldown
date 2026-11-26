import { SessionLabelsRepository } from '@shared/infrastructure/query-session/DrilldownQuerySession';
import { createMachine, interpret, Interpreter, type MachineConfig, type MachineOptions } from 'xstate';

import { createActions } from './actions';
import { guards } from './guards';
import { queryToFilters } from './helpers/queryToFilters';
import { createServices } from './services';
import { autoSuggestProxy } from './states/autoSuggestProxy';
import { idle } from './states/idle';
import { displayLabels, loadLabels } from './states/loadLabels';
import { displayLabelValues, loadLabelValues } from './states/loadLabelValues';
import { displayOperators, loadOperators } from './states/loadOperators';
import { InputParams, QueryBuilderContext, QueryBuilderEvent, QueryBuilderSchema } from './types';

export const defaultContext: QueryBuilderContext = Object.freeze({
  inputParams: {
    dataSourceUid: '',
    query: '',
    from: 0,
    to: 0,
  },
  query: '',
  filters: [],
  isQueryUpToDate: true,
  edition: null,
  suggestions: {
    type: null,
    items: [],
    isVisible: false,
    isLoading: false,
    error: null,
    placeholder: '',
    noOptionsMessage: '',
    allowCustomValue: false,
    multiple: false,
    disabled: false,
  },
});

const config = (
  context: QueryBuilderContext
): MachineConfig<QueryBuilderContext, QueryBuilderSchema, QueryBuilderEvent> => ({
  id: 'query-builder',
  initial: 'idle',
  context,
  predictableActionArguments: true,
  states: {
    idle,
    loadLabels,
    displayLabels,
    loadOperators,
    displayOperators,
    loadLabelValues,
    displayLabelValues,
    autoSuggestProxy,
  },
});

export type Actor = Interpreter<QueryBuilderContext, QueryBuilderSchema, QueryBuilderEvent>;

export function buildStateMachine(inputParams: InputParams, labelsRepository: SessionLabelsRepository) {
  const { query } = inputParams;

  const initialContext: QueryBuilderContext = {
    ...defaultContext,
    inputParams,
    query,
    // See changeInputParams() in domain/actions.ts
    filters: queryToFilters(query),
  };

  const options: MachineOptions<QueryBuilderContext, QueryBuilderEvent> = {
    guards,
    actions: createActions({ labelsRepository }),
    services: createServices({ labelsRepository }),
  };

  const stateMachine = createMachine(config(initialContext), options);

  const actor = interpret(stateMachine) as unknown as Actor;

  return {
    actor,
    initialContext,
    dispose: () =>
      labelsRepository.cancel({ dataSourceUid: inputParams.dataSourceUid, reason: 'Query builder unmounted' }),
  };
}
