import { css } from '@emotion/css';
import { GrafanaTheme2, VariableRefresh } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  MultiValueVariable,
  MultiValueVariableState,
  QueryVariable,
  SceneComponentProps,
  VariableValueOption,
} from '@grafana/scenes';
import { Cascader, CascaderOption, Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { generateUUID } from '@shared/domain/generateUUID';
import { localeCompare } from '@shared/domain/localeCompare';
import { prepareHistoryEntry } from '@shared/domain/prepareHistoryEntry';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React, { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';

import { PYROSCOPE_SERIES_DATA_SOURCE } from '../../infrastructure/pyroscope-data-sources';

const PROFILE_METRIC_LABEL_DEFAULT = 'Profile type';

type ProfileMetricOptions = Array<{
  value: string;
  label: string;
  type: string;
  group: string;
}>;

type ProfileMetricVariableState = {
  query: string;
  skipUrlSync: boolean;
};

export class ProfileMetricVariable extends QueryVariable {
  static DEFAULT_VALUE = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds';

  // hack: subscribe to changes of dataSource and filtersAllServices
  static QUERY_DEFAULT = '$dataSource $filtersAllServices and all profile metrics';

  // hack: subscribe to changes of dataSource and serviceName to avoid showing options that don't have any data associated
  static QUERY_SERVICE_NAME_DEPENDENT = '$dataSource and only $serviceName profile metrics';

  constructor(state?: ProfileMetricVariableState) {
    super({
      key: 'profileMetricId',
      name: 'profileMetricId',
      label: PROFILE_METRIC_LABEL_DEFAULT,
      datasource: PYROSCOPE_SERIES_DATA_SOURCE,
      query: ProfileMetricVariable.QUERY_DEFAULT,
      loading: true,
      refresh: VariableRefresh.onTimeRangeChanged,
      ...state,
    });

    this.changeValueTo = this.changeValueTo.bind(this);

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    this.setState({
      label: t('variables.profile-metric.label', PROFILE_METRIC_LABEL_DEFAULT),
      ...(!this.state.value ? { value: ProfileMetricVariable.DEFAULT_VALUE } : {}),
    });
  }

  /**
   * Whenever URL sync (or anything else) tries to set an empty profile type, use the default instead.
   * Same pattern as ServiceNameVariable uses for its own URL/state edge cases.
   */
  protected interceptStateUpdateAfterValidation(stateUpdate: Partial<MultiValueVariableState>): void {
    const hadEmptyValue = 'value' in stateUpdate && (stateUpdate.value === '' || stateUpdate.value == null);

    super.interceptStateUpdateAfterValidation(stateUpdate);

    if (hadEmptyValue) {
      stateUpdate.value = ProfileMetricVariable.DEFAULT_VALUE;
    }
  }

  async update(force = false) {
    if (!force && this.state.loading) {
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
      this.setState({ loading: false, options, error });
    }
  }

  static buildCascaderOptions(options: ProfileMetricOptions): CascaderOption[] {
    const optionsMap = new Map();

    for (const { value } of options) {
      const profileMetric = getProfileMetric(value as ProfileMetricId);
      const { group, type } = profileMetric;

      const nameSpaceServices = optionsMap.get(group) || {
        value: group,
        label: group,
        items: [],
      };

      const items = nameSpaceServices.items || [];

      items.push({
        value,
        label: type,
      });

      nameSpaceServices.items = items;

      optionsMap.set(group, nameSpaceServices);
    }

    return Array.from(optionsMap.values()).sort((a, b) => localeCompare(b.label, a.label));
  }

  onSelect = (newValue: string) => {
    reportInteraction('g_pyroscope_app_profile_metric_selected');

    if (!this.state.skipUrlSync) {
      prepareHistoryEntry();
    }
    this.changeValueTo(newValue);
  };

  static Component = ({ model }: SceneComponentProps<MultiValueVariable & { onSelect?: any }>) => {
    const styles = useStyles2(getStyles);
    const { loading, value, options, error } = model.useState();

    const cascaderOptions = useMemo(() => {
      return ProfileMetricVariable.buildCascaderOptions(options as ProfileMetricOptions);
    }, [options]);

    if (error) {
      return (
        <Tooltip theme="error" content={error.toString()}>
          <Icon className={styles.iconError} name="exclamation-triangle" size="xl" />
        </Tooltip>
      );
    }

    return (
      <Cascader
        // we add a key to ensure that the Cascader selects the initial value or available options properly when landing on the page
        // and when switching exploration types, because the value might also be changed after the component has been rendered by SceneProfilesExplorer
        key={generateUUID()}
        aria-label={t('variables.profile-metric.aria-label', 'Profile metrics list')}
        width={24}
        separator="/"
        displayAllSelectedLevels
        placeholder={
          loading
            ? t('variables.profile-metric.loading', 'Loading...')
            : t('variables.profile-metric.placeholder', 'Select a profile metric ({{count}})', {
                count: options.length,
              })
        }
        options={cascaderOptions}
        initialValue={value as string}
        changeOnSelect={false}
        onSelect={model.onSelect}
      />
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  iconError: css`
    height: 32px;
    align-self: center;
    color: ${theme.colors.error.text};
  `,
});
