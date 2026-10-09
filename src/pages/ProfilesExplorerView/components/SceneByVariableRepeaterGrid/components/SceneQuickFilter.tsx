import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  SceneComponentProps,
  SceneObjectBase,
  SceneObjectState,
  SceneObjectUrlSyncConfig,
  SceneObjectUrlValues,
} from '@grafana/scenes';
import { Icon, IconButton, Input, Tag, useStyles2 } from '@grafana/ui';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { debounce } from 'lodash';
import React from 'react';

export interface SceneQuickFilterState extends SceneObjectState {
  placeholder: string;
  searchText: string;
  inputText: string;
  onChange?: (searchText: string) => void;
  resultsCount: string;
}

export class SceneQuickFilter extends SceneObjectBase<SceneQuickFilterState> {
  protected _urlSync = new SceneObjectUrlSyncConfig(this, { keys: ['searchText'] });

  static DEFAULT_SEARCH_TEXT = '';

  static DEBOUNCE_DELAY = 250;

  private commitSearchText = debounce((searchText: string) => {
    this.setState({ searchText });
  }, SceneQuickFilter.DEBOUNCE_DELAY);

  constructor({ placeholder }: { placeholder: string }) {
    super({
      key: 'quick-filter',
      placeholder,
      searchText: SceneQuickFilter.DEFAULT_SEARCH_TEXT,
      inputText: SceneQuickFilter.DEFAULT_SEARCH_TEXT,
      resultsCount: '',
    });

    this.addActivationHandler(() => () => this.commitSearchText.cancel());
  }

  setPlaceholder(placeholder: string) {
    this.setState({ placeholder });
  }

  setResultsCount(resultsCount: number) {
    this.setState({ resultsCount: String(resultsCount) });
  }

  getUrlState() {
    return {
      searchText: this.state.searchText,
    };
  }

  updateFromUrl(values: SceneObjectUrlValues) {
    const stateUpdate: Partial<SceneQuickFilterState> = {};

    if (typeof values.searchText === 'string') {
      this.commitSearchText.cancel();
      stateUpdate.searchText = values.searchText;
      stateUpdate.inputText = values.searchText;
    }

    this.setState(stateUpdate);
  }

  onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputText = e.target.value;
    this.setState({ inputText });
    this.commitSearchText(inputText);
  };

  reset() {
    this.commitSearchText.cancel();
    this.setState({ placeholder: '', searchText: '', inputText: '', resultsCount: '' });
  }

  clearSearchText = () => {
    this.commitSearchText.cancel();
    this.setState({ searchText: '', inputText: '' });
  };

  onFocus = () => {
    reportInteraction('g_pyroscope_app_quick_filter_focused');
  };

  static Component = ({ model }: SceneComponentProps<SceneQuickFilter>) => {
    const styles = useStyles2(getStyles);
    const { placeholder, inputText, resultsCount } = model.useState();

    return (
      <Input
        type="text"
        className="quick-filter"
        aria-label={t('grid.quick-filter.aria-label', 'Quick filter')}
        placeholder={placeholder}
        value={inputText}
        prefix={<Icon name="search" />}
        suffix={
          <>
            {resultsCount !== '' && (
              <Tag
                className={styles.resultsCount}
                name={resultsCount}
                colorIndex={9}
                data-testid="quick-filter-results-count"
              />
            )}
            <IconButton
              name="times"
              aria-label={t('grid.quick-filter.clear', 'Clear search')}
              onClick={model.clearSearchText}
            />
          </>
        }
        onChange={model.onChange}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') {
            model.clearSearchText();
          }
        }}
        onFocus={model.onFocus}
      />
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  resultsCount: css`
    margin-right: ${theme.spacing(1)};
    border-radius: ${theme.shape.radius.pill || '11px'};
    padding: 2px 8px;
    color: ${theme.colors.text.primary};
    background-color: ${theme.colors.background.secondary};
  `,
});
