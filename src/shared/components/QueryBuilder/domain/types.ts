import { State } from 'xstate';

export enum FilterKind {
  'partial' = 'partial',
  'attribute-operator-value' = 'attribute-operator-value',
  'attribute-operator' = 'attribute-operator',
}

export enum OperatorKind {
  '=' = '=',
  '!=' = '!=',
  'in' = 'in',
  'not-in' = 'not-in',
  'is-empty' = 'is-empty',
  '=~' = '=~',
  '!~' = '!~',
}

export type PartialFilter = {
  id: string;
  type: FilterKind;
  attribute: Suggestion;
  operator?: Suggestion;
  value?: Suggestion;
  active: boolean;
};

export type CompleteFilter = {
  id: string;
  type: FilterKind;
  attribute: Suggestion;
  operator: Suggestion;
  value: Suggestion;
  active: boolean;
};

export type Filter = PartialFilter | CompleteFilter;

export type CompleteFilters = CompleteFilter[];

export type Filters = [PartialFilter] | CompleteFilter[] | [...CompleteFilter[], PartialFilter];

export enum FilterPartKind {
  attribute = 'attribute',
  operator = 'operator',
  value = 'value',
}

export type Suggestion = {
  value: string;
  label: string;
  description?: string;
};

export type Suggestions = Suggestion[];

export enum SuggestionKind {
  'attribute' = 'attribute',
  'operator' = 'operator',
  'value' = 'value',
}

export type InputParams = {
  query: string;
  from: number;
  to: number;
  // TODO: after migrate the legacy comparison pages to Scenes, dataSourceUid will be mandatory
  dataSourceUid?: string;
};

export type Edition = {
  filterId: string;
  part: FilterPartKind;
};

export type QueryBuilderContext = {
  inputParams: InputParams;
  query: string;
  filters: Filters;
  isQueryUpToDate: boolean;
  edition: Edition | null;
  suggestions: {
    type: SuggestionKind | null;
    items: Suggestions;
    isVisible: boolean;
    isLoading: boolean;
    error: Error | null;
    placeholder: string;
    noOptionsMessage: string;
    allowCustomValue: boolean;
    multiple: boolean;
    disabled: boolean;
  };
};

export type QueryBuilderSchema = {
  states: {
    idle: State<QueryBuilderContext, QueryBuilderEvent>;
    loadLabels: State<QueryBuilderContext, QueryBuilderEvent>;
    displayLabels: State<QueryBuilderContext, QueryBuilderEvent>;
    loadLabelValues: State<QueryBuilderContext, QueryBuilderEvent>;
    loadOperators: State<QueryBuilderContext, QueryBuilderEvent>;
    displayOperators: State<QueryBuilderContext, QueryBuilderEvent>;
    displayLabelValues: State<QueryBuilderContext, QueryBuilderEvent>;
    autoSuggestProxy: State<QueryBuilderContext, QueryBuilderEvent>;
  };
};

type StartEvent = { type: 'START_INPUT' };
export type StartLabelEvent = { type: 'START_LABEL'; data: Suggestion };
export type SelectEvent = { type: 'SELECT_SUGGESTION'; data: Suggestion };
type DiscardEvent = { type: 'DISCARD_SUGGESTIONS' };
export type EditEvent = { type: 'EDIT_FILTER'; data: Edition };
export type RemoveFilterEvent = { type: 'REMOVE_FILTER'; data: string }; // data = filterId
type RemoveLastFilterEvent = { type: 'REMOVE_LAST_FILTER' };
export type ChangeInputParamsEvent = { type: 'CHANGE_INPUT_PARAMS'; data: InputParams };
type ExecuteQueryEvent = { type: 'EXECUTE_QUERY' };

export type QueryBuilderEvent =
  | StartEvent
  | StartLabelEvent
  | SelectEvent
  | DiscardEvent
  | EditEvent
  | RemoveFilterEvent
  | RemoveLastFilterEvent
  | ChangeInputParamsEvent
  | ExecuteQueryEvent;
