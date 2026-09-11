import { css } from '@emotion/css';
import { AdHocVariableFilter, GrafanaTheme2, VariableRefresh } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  MultiValueVariable,
  MultiValueVariableState,
  QueryVariable,
  SceneComponentProps,
  VariableValueOption,
} from '@grafana/scenes';
import { Cascader, Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { generateUUID } from '@shared/domain/generateUUID';
import { prepareHistoryEntry } from '@shared/domain/prepareHistoryEntry';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { userStorage } from '@shared/infrastructure/userStorage';
import React, { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';

import { PYROSCOPE_SERIES_DATA_SOURCE } from '../../../infrastructure/pyroscope-data-sources';
import { buildServiceNameCascaderOptions } from './domain/useBuildServiceNameOptions';

const SERVICE_NAME_LABEL_DEFAULT = 'Service';

type QueryVariableInitialState = ConstructorParameters<typeof QueryVariable>[0];

type ServiceNameVariableState = {
  query?: string;
  skipUrlSync?: boolean;
  initialFilters?: AdHocVariableFilter[];
};

export class ServiceNameVariable extends QueryVariable {
  // hack: subscribe to changes of dataSource and filtersAllServices
  static QUERY_DEFAULT = '$dataSource $filtersAllServices and all services';

  // hack: subscribe to changes of dataSource and profileMetricId
  static QUERY_PROFILE_METRIC_DEPENDENT = '$dataSource and only $profileMetricId services';

  // subscribe to changes of dataSource, profileMetricId, and filtersAllServices
  static QUERY_PROFILE_METRIC_AND_FILTERS = '$dataSource $profileMetricId $filtersAllServices';

  private initialFilters?: AdHocVariableFilter[];

  constructor(state?: ServiceNameVariableState) {
    const { initialFilters, ...restState } = state ?? {};
    super({
      key: 'serviceName',
      name: 'serviceName',
      label: SERVICE_NAME_LABEL_DEFAULT,
      datasource: PYROSCOPE_SERIES_DATA_SOURCE,
      query: ServiceNameVariable.QUERY_DEFAULT,
      // Must be false so SceneByVariableRepeaterGrid.onActivate can call update().
      // If true, update() returns immediately and never fetches — e.g. when switching
      // back from flame graph to All services (new instance, grid stuck on spinner).
      loading: false,
      refresh: VariableRefresh.onTimeRangeChanged,
      // Used by the custom renderer to avoid showing "selected service missing from catalog" before the first fetch finishes.
      serviceCatalogFetched: false,
      ...restState,
    } as QueryVariableInitialState);

    this.initialFilters = initialFilters;
    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    this.setState({ label: t('variables.service-name.label', SERVICE_NAME_LABEL_DEFAULT) });
    this.setInitialValue();

    this.subscribeToState((newState, prevState) => {
      if (newState.value && newState.value !== prevState.value) {
        const storage = userStorage.get(userStorage.KEYS.PROFILES_EXPLORER) || {};
        storage.serviceName = newState.value;
        userStorage.set(userStorage.KEYS.PROFILES_EXPLORER, storage);
      }
    });
  }

  /**
   * Precedence: `service_name` with `=` from embed/initialFilters wins over userStorage.
   * If there is no such filter and the variable is still empty, restore the last service from userStorage.
   */
  setInitialValue() {
    const { serviceName: serviceNameFromStorage } = userStorage.get(userStorage.KEYS.PROFILES_EXPLORER) || {};

    const initialServiceName = this.initialFilters?.find(
      (filter: AdHocVariableFilter) => filter.key === 'service_name' && filter.operator === '='
    )?.value;

    if (serviceNameFromStorage && !this.state.value && !initialServiceName) {
      this.setState({ value: serviceNameFromStorage });
    } else if (initialServiceName) {
      this.setState({ value: initialServiceName });
    }
  }

  /**
   * MultiValueVariable validation replaces a value that is not in the new options with the first option.
   * For serviceName we keep the previous selection when it drops out of the catalog (time range, DS, etc.)
   * so URL/deep links stay stable and the UI can warn instead of silently switching services.
   * Capture prev from this.state before super — stateUpdate already reflects the "corrected" value.
   */
  protected interceptStateUpdateAfterValidation(stateUpdate: Partial<MultiValueVariableState>): void {
    const options = stateUpdate.options ?? this.state.options;
    const prev = ServiceNameVariable.nameStr(this.state.value);
    const prevText = typeof this.state.text === 'string' && this.state.text ? this.state.text : prev;

    super.interceptStateUpdateAfterValidation(stateUpdate);

    if (prev && !options.some((o) => String(o.value) === prev)) {
      stateUpdate.value = prev;
      stateUpdate.text = prevText;
    }
    (stateUpdate as { serviceCatalogFetched?: boolean }).serviceCatalogFetched = true;
  }

  async update() {
    if (this.state.loading) {
      return;
    }

    let options: VariableValueOption[] = [];
    let error = null;

    this.setState({ loading: true, options: [], error: null });

    try {
      options = await lastValueFrom(this.getValueOptions({}));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ loading: false, options, error, serviceCatalogFetched: true } as QueryVariableInitialState);
    }
  }

  /** Normalizes variable value (string vs legacy array) for comparisons and tooltip copy. */
  private static nameStr(v: unknown): string {
    if (typeof v === 'string') {
      return v;
    }
    return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '';
  }

  selectNewValue = (newValue: string) => {
    reportInteraction('g_pyroscope_app_service_name_selected');

    if (!this.state.skipUrlSync) {
      prepareHistoryEntry();
    }

    this.changeValueTo(newValue);
  };

  static Component = ({ model }: SceneComponentProps<MultiValueVariable & { selectNewValue?: any }>) => {
    const styles = useStyles2(getStyles);
    const { loading, value, options, error, serviceCatalogFetched } = model.useState() as MultiValueVariableState & {
      serviceCatalogFetched?: boolean;
    };
    const cascaderOptions = useMemo(
      () => buildServiceNameCascaderOptions(options.map(({ label }) => label)),
      [options]
    );
    const name = ServiceNameVariable.nameStr(value);
    // After at least one successful options load: show warning if the current selection is not in the catalog (and not while loading).
    const warn = Boolean(serviceCatalogFetched) && !loading && !!name && !options.some((o) => String(o.value) === name);

    if (error) {
      return (
        <Tooltip theme="error" content={error.toString()}>
          <Icon className={styles.iconError} name="exclamation-triangle" size="xl" />
        </Tooltip>
      );
    }

    return (
      <div className={styles.row}>
        {warn && (
          <Tooltip
            content={t(
              'variables.service-name.unmatched-tooltip',
              '"{{serviceName}}" does not appear in the list of services returned for this data source and time range. Please select a different service from the dropdown.',
              { serviceName: name }
            )}
          >
            <Icon name="exclamation-triangle" size="xl" className={styles.iconWarn} tabIndex={0} />
          </Tooltip>
        )}
        <div className={styles.cascader}>
          <Cascader
            // we add a key to ensure that the Cascader selects the initial value properly when landing on the page
            // and when switching exploration types, because the value might also be changed after the component has been rendered by SceneProfilesExplorer
            // (e.g. in SceneExploreServiceProfileTypes)
            key={generateUUID()}
            aria-label={t('variables.service-name.aria-label', 'Services list')}
            width={32}
            separator="/"
            displayAllSelectedLevels
            placeholder={
              loading
                ? t('variables.service-name.loading', 'Loading services...')
                : t('variables.service-name.placeholder', 'Select a service ({{count}})', { count: options.length })
            }
            options={cascaderOptions}
            initialValue={value as string}
            changeOnSelect={false}
            onSelect={model.selectNewValue}
          />
        </div>
      </div>
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    min-width: 0;
  `,
  cascader: css`
    flex: 1;
    min-width: 0;
  `,
  iconWarn: css`
    flex-shrink: 0;
    color: ${theme.colors.warning.text};
    cursor: help;
  `,
  iconError: css`
    height: 32px;
    align-self: center;
    color: ${theme.colors.error.text};
  `,
});
