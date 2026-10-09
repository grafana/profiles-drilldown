import { createMachine, interpret, Interpreter, type MachineConfig, type MachineOptions } from 'xstate';

import { actions } from './actions';
import { guards } from './guards';
import { queryToFilters } from './helpers/queryToFilters';
import { services } from './services';
import { autoSuggestProxy } from './states/autoSuggestProxy';
import { idle } from './states/idle';
import { displayLabels, loadLabels } from './states/loadLabels';
import { displayLabelValues, loadLabelValues } from './states/loadLabelValues';
import { displayOperators, loadOperators } from './states/loadOperators';
import { InputParams, QueryBuilderContext, QueryBuilderEvent, QueryBuilderSchema } from './types';

export const defaultContext: QueryBuilderContext = Object.freeze({
  inputParams: {
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
  on: {
    START_LABEL: {
      target: '.loadOperators',
      actions: ['setFilterAttribute'],
    },
  },
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

const options: MachineOptions<QueryBuilderContext, QueryBuilderEvent> = {
  guards,
  services,
  actions,
};

export type Actor = Interpreter<QueryBuilderContext, QueryBuilderSchema, QueryBuilderEvent>;

export function buildStateMachine(inputParams: InputParams) {
  const { query } = inputParams;

  const initialContext: QueryBuilderContext = {
    ...defaultContext,
    inputParams,
    query,
    // See changeInputParams() in domain/actions.ts
    filters: queryToFilters(query),
  };

  const stateMachine = createMachine(config(initialContext), options);

  const actor = interpret(stateMachine) as unknown as Actor;

  return { actor, initialContext };
}
