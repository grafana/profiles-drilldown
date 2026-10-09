import { css, cx } from '@emotion/css';
import { SelectableValue } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { Button, useStyles2 } from '@grafana/ui';
import { usePrevious } from '@shared/components/QueryBuilder/ui/hooks';
import React, { memo, useCallback, useEffect } from 'react';
import { StateListener } from 'xstate/lib/interpreter';

import { Actor } from './domain/stateMachine';
import {
  CompleteFilter,
  CompleteFilters,
  Filter,
  FilterKind,
  FilterPartKind,
  QueryBuilderContext,
  QueryBuilderEvent,
  Suggestion,
  Suggestions,
} from './domain/types';
import { useStateMachine } from './domain/useStateMachine';
import { ChicletsList } from './ui/chiclets/ChicletsList';
import { DisabledSelect } from './ui/selects/DisabledSelect';
import { MultipleSelect } from './ui/selects/MultipleSelect';
import { SingleSelect } from './ui/selects/SingleSelect';

const getStyles = () => ({
  queryBuilder: css`
    display: flex;
    justify-content: flex-start;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
  `,
  controls: css`
    display: flex;
    align-self: flex-start;
    flex-grow: 1;
  `,
  executeButton: css`
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  `,
});

export type QueryBuilderProps = {
  id: string;
  // TODO: after migrate the legacy comparison pages to Scenes, dataSourceUid will be mandatory
  dataSourceUid?: string;
  query: string;
  from: number;
  to: number;
  onChangeQuery: (newQuery: string, filters: CompleteFilters) => void;
  className?: string;
  autoExecute?: boolean;
  /** Optional combined entry point; subsequent label steps use the standard builder. */
  renderLabelInput?: (onSelectLabel: (label: Suggestion) => void) => React.ReactNode;
  leadingFilters?: React.ReactNode;
};

function QueryBuilderComponent(props: QueryBuilderProps) {
  const styles = useStyles2(getStyles);

  const { actor, internalProps } = useStateMachine(props);
  const { filters, edition, isQueryUpToDate, suggestions } = internalProps;

  const { onClickChiclet, onRemoveChiclet } = useChicletHandlers(actor);
  const onSelectLabel = useCallback(
    (label: Suggestion) => {
      actor.send({ type: 'START_LABEL', data: label });
    },
    [actor]
  );
  const combinedInput = renderCombinedInput(props, edition, filters, onSelectLabel);

  const {
    onFocus,
    onChangeSingleSuggestion,
    onSingleSelectKeyDown,
    onCloseSingleMenu,
    onMultipleSelectKeyDown,
    onCloseMultipleMenu,
  } = useSelectHandlers(actor, suggestions, props.id);

  const onClickExecute = useCallback(() => {
    actor.send({ type: 'EXECUTE_QUERY' });
  }, [actor]);

  useEffect(() => {
    if (!props.autoExecute) {
      return;
    }

    const onTransition: StateListener<QueryBuilderContext, QueryBuilderEvent> = ({ value, context, event }) => {
      if (value === 'idle' && !context.isQueryUpToDate && event.type !== 'EXECUTE_QUERY') {
        actor.send({ type: 'EXECUTE_QUERY' });
      }
    };

    actor.onTransition(onTransition);

    return () => {
      actor.off(onTransition);
    };
  }, [actor, props.autoExecute]);

  return (
    <div id={props.id} className={cx(styles.queryBuilder, props.className)}>
      {props.leadingFilters}
      {filters.length > 0 ? (
        <ChicletsList
          filters={filters}
          onClickChiclet={onClickChiclet}
          onRemoveChiclet={onRemoveChiclet}
          edition={edition}
          suggestions={suggestions}
          onChangeSingleSuggestion={onChangeSingleSuggestion}
          onCloseSingleSuggestionsMenu={onCloseSingleMenu}
          onCloseMultipleSuggestionsMenu={onCloseMultipleMenu}
        />
      ) : null}

      <div className={styles.controls}>
        {combinedInput ? (
          combinedInput
        ) : edition ? (
          <DisabledSelect />
        ) : suggestions.multiple ? (
          <MultipleSelect
            suggestions={suggestions}
            onFocus={onFocus}
            onKeyDown={onMultipleSelectKeyDown}
            onCloseMenu={onCloseMultipleMenu}
          />
        ) : (
          <SingleSelect
            suggestions={suggestions}
            onFocus={onFocus}
            onChange={onChangeSingleSuggestion}
            onKeyDown={onSingleSelectKeyDown}
            onCloseMenu={onCloseSingleMenu}
          />
        )}

        {!props.autoExecute && (
          <Button
            onClick={onClickExecute}
            tooltip={
              !isQueryUpToDate
                ? t('query-builder.execute-tooltip', 'Execute new query')
                : t('query-builder.nothing-to-execute-tooltip', 'Nothing to execute, all filters applied')
            }
            className={styles.executeButton}
            disabled={isQueryUpToDate}
          >
            <Trans i18nKey="query-builder.execute">Execute</Trans>
          </Button>
        )}
      </div>
    </div>
  );
}

function renderCombinedInput(
  props: QueryBuilderProps,
  edition: QueryBuilderContext['edition'],
  filters: QueryBuilderContext['filters'],
  onSelectLabel: (label: Suggestion) => void
) {
  if (edition || filters.some((filter) => filter.type === FilterKind.partial)) {
    return undefined;
  }
  return props.renderLabelInput?.(onSelectLabel);
}

function useChicletHandlers(actor: Actor) {
  const onClickChiclet = useCallback(
    (event: any, filter: Filter, part: FilterPartKind) => {
      actor.send({ type: 'EDIT_FILTER', data: { filterId: filter.id, part } });
    },
    [actor]
  );

  const onRemoveChiclet = useCallback(
    (event: any, filter: CompleteFilter) => {
      actor.send({ type: 'REMOVE_FILTER', data: filter.id });
    },
    [actor]
  );

  return {
    onClickChiclet,
    onRemoveChiclet,
  };
}

function useSelectHandlers(actor: Actor, suggestions: QueryBuilderContext['suggestions'], queryBuilderId: string) {
  /* single & multiple */
  const onFocus = useCallback(() => {
    actor.send({ type: 'START_INPUT' });
  }, [actor]);

  /* single only */
  const onChangeSingleSuggestion = useCallback(
    (suggestion: SelectableValue<string>) => {
      const { value = '', label = '' } = suggestion;

      actor.send({ type: 'SELECT_SUGGESTION', data: { value, label } });
    },
    [actor]
  );

  const onSingleSelectKeyDown = useCallback(
    (event: any) => {
      if (event.code === 'Backspace' && !event.target.value) {
        actor.send({ type: 'REMOVE_LAST_FILTER' });
      }
    },
    [actor]
  );

  const onCloseSingleMenu = useCallback(() => {
    actor.send({ type: 'DISCARD_SUGGESTIONS' });
  }, [actor]);

  /* multiple only */
  const onMultipleSelectKeyDown = useCallback(
    (event: any, values: Suggestions) => {
      if (event.code === 'Backspace' && !event.target.value && !values.length) {
        actor.send({ type: 'REMOVE_LAST_FILTER' });
      }
    },

    [actor]
  );

  const onCloseMultipleMenu = useCallback(
    (values: Suggestions) => {
      if (values.length) {
        actor.send({
          type: 'SELECT_SUGGESTION',
          data: { value: values.map((v) => v.value).join('|'), label: values.map((v) => v.label).join(', ') },
        });
      } else {
        actor.send({ type: 'DISCARD_SUGGESTIONS' });
      }
    },
    [actor]
  );

  /* misc */

  const previousSuggestionsIsVisible = usePrevious(suggestions.isVisible);

  useEffect(() => {
    if (!suggestions.isVisible && previousSuggestionsIsVisible) {
      // ensures that the input is blurred when a filter has been completed.
      // we could have used blurInputOnSelect but this allows us to handle properly the case of
      // editing a complete filter operator from (e.g.) =~ to = (and vice-versa).
      // indeed, in such cases, we know if the input should be blurred only after selecting a
      // suggestion, when the select is already rendered.
      (document.querySelector(`#${queryBuilderId} input`) as HTMLInputElement)?.blur();
    }
  }, [suggestions.isVisible, previousSuggestionsIsVisible, queryBuilderId]);

  return {
    onFocus,
    onChangeSingleSuggestion,
    onSingleSelectKeyDown,
    onMultipleSelectKeyDown,
    onCloseSingleMenu,
    onCloseMultipleMenu,
  };
}

export const QueryBuilder = memo(QueryBuilderComponent);
