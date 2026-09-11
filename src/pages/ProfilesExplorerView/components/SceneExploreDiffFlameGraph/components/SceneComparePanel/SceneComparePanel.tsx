import { css, cx } from '@emotion/css';
import { AdHocVariableFilter, DataFrame, dateTime, FieldMatcherID, getValueFormat, GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  SceneComponentProps,
  SceneDataTransformer,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  SceneObjectUrlSyncConfig,
  SceneObjectUrlValues,
  SceneQueryRunner,
  SceneRefreshPicker,
  SceneTimePicker,
  SceneTimeRange,
  SceneTimeRangeLike,
  SceneTimeRangeState,
  SceneVariableValueChangedEvent,
  VariableDependencyConfig,
} from '@grafana/scenes';
import { IconButton, useStyles2 } from '@grafana/ui';
import { SceneTimePickerWithoutSync } from '@shared/components/SceneTimePickerWithoutSync/SceneTimePickerWithoutSync';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React from 'react';
import { Unsubscribable } from 'rxjs';

import { buildTimeRange } from '../../../../domain/buildTimeRange';
import { FiltersVariable } from '../../../../domain/variables/FiltersVariable/FiltersVariable';
import { formatSingleSeriesDisplayName } from '../../../../helpers/formatSingleSeriesDisplayName';
import { getSceneVariableValue } from '../../../../helpers/getSceneVariableValue';
import { getSeriesStatsValue } from '../../../../infrastructure/helpers/getSeriesStatsValue';
import { getProfileMetricLabel } from '../../../../infrastructure/series/helpers/getProfileMetricLabel';
import { PanelType } from '../../../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { addRefId, addStats } from '../../../SceneByVariableRepeaterGrid/infrastructure/data-transformations';
import { SceneLabelValuesTimeseries } from '../../../SceneLabelValuesTimeseries/SceneLabelValuesTimeseries';
import { CompareTarget } from '../../domain/types';
import { Preset } from '../ScenePresetsPicker/ScenePresetsPicker';
import {
  SceneTimeRangeWithAnnotations,
  TimeRangeWithAnnotationsMode,
} from './components/SceneTimeRangeWithAnnotations';
import {
  SwitchTimeRangeSelectionModeAction,
  TimerangeSelectionMode,
} from './domain/actions/SwitchTimeRangeSelectionModeAction';
import { EventSwitchTimerangeSelectionMode } from './domain/events/EventSwitchTimerangeSelectionMode';
import { EventSyncRefresh } from './domain/events/EventSyncRefresh';
import { EventSyncTimeRanges } from './domain/events/EventSyncTimeRanges';
import { buildCompareTimeSeriesQueryRunner } from './infrastructure/buildCompareTimeSeriesQueryRunner';
import { BASELINE_COLORS, COMPARISON_COLORS } from './ui/colors';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

interface SceneComparePanelState extends SceneObjectState {
  target: CompareTarget;
  filterKey: 'filtersBaseline' | 'filtersComparison';
  title: string;
  color: string;
  $timeRange?: SceneTimeRangeLike;
  timePicker: SceneTimePicker;
  refreshPicker: SceneRefreshPicker;
  timeseriesPanel: SceneLabelValuesTimeseries;
  lastSyncedStepSec?: number;
}

export class SceneComparePanel extends SceneObjectBase<SceneComparePanelState> {
  private readonly modeSelector = new SwitchTimeRangeSelectionModeAction();

  protected _variableDependency = new VariableDependencyConfig(this, {
    variableNames: ['profileMetricId'],
    onReferencedVariableValueChanged: () => {
      this.state.timeseriesPanel.updateItem({ label: this.buildTimeseriesTitle() });
    },
  });

  protected _urlSync: SceneObjectUrlSyncConfig | undefined;

  constructor({
    target,
    clearDiffRange,
    filters,
  }: {
    target: SceneComparePanelState['target'];
    clearDiffRange: boolean;
    filters: AdHocVariableFilter[];
  }) {
    const filterKey = target === CompareTarget.BASELINE ? 'filtersBaseline' : 'filtersComparison';
    const title =
      target === CompareTarget.BASELINE
        ? t('diff-flame-graph.compare-panel.baseline', 'Baseline')
        : t('diff-flame-graph.compare-panel.comparison', 'Comparison');
    const color =
      target === CompareTarget.BASELINE ? BASELINE_COLORS.COLOR.toString() : COMPARISON_COLORS.COLOR.toString();
    super({
      key: `${target}-panel`,
      target,
      filterKey,
      title,
      color,
      timePicker: new SceneTimePickerWithoutSync({ isOnCanvas: true }),
      refreshPicker: new SceneRefreshPicker({ isOnCanvas: true }),
      timeseriesPanel: SceneComparePanel.buildTimeSeriesPanel({ target, filterKey, title, color }),
    });

    if (target === CompareTarget.COMPARISON) {
      this._urlSync = new SceneObjectUrlSyncConfig(this, {
        keys: ['comparisonFrom', 'comparisonTo'],
      });
    }

    this.addActivationHandler(this.onActivate.bind(this, clearDiffRange, filters));
  }

  onActivate(clearDiffRange: boolean, filters: AdHocVariableFilter[]) {
    const { target, timeseriesPanel, filterKey, $timeRange } = this.state;
    const { modeSelector } = this;

    if (clearDiffRange) {
      this.setDiffRange(null);
    }

    if (target === CompareTarget.COMPARISON && !$timeRange) {
      const globalTimeRange = sceneGraph.getTimeRange(this);
      this.setState({
        $timeRange: new SceneTimeRange({
          from: globalTimeRange.state.from,
          to: globalTimeRange.state.to,
        }),
      });
    }

    if (filters.length) {
      const filtersVariable = sceneGraph.findByKey(this, filterKey) as FiltersVariable;

      filtersVariable.setState({ filters });
    }

    timeseriesPanel.setState({
      headerActions: () => [modeSelector],
    });
    timeseriesPanel.updateItem({ label: this.buildTimeseriesTitle() });

    const eventSub = this.subscribeToEvents();

    return () => {
      eventSub.unsubscribe();
    };
  }

  getUrlState() {
    const { target, $timeRange } = this.state;

    if (target !== CompareTarget.COMPARISON || !$timeRange) {
      return {};
    }

    return {
      comparisonFrom: $timeRange.state.from,
      comparisonTo: $timeRange.state.to,
    };
  }

  updateFromUrl(values: SceneObjectUrlValues): void {
    const { target, $timeRange } = this.state;
    if (target !== CompareTarget.COMPARISON) {
      return;
    }

    const { comparisonFrom, comparisonTo } = values;
    if (!comparisonFrom || !comparisonTo) {
      return;
    }

    if ($timeRange) {
      $timeRange.setState({
        from: comparisonFrom as string,
        to: comparisonTo as string,
      });
    } else {
      this.setState({
        $timeRange: new SceneTimeRange({
          from: comparisonFrom as string,
          to: comparisonTo as string,
        }),
      });
    }
  }

  static buildTimeSeriesPanel({
    target,
    filterKey,
    title,
    color,
  }: {
    target: CompareTarget;
    filterKey: SceneComparePanelState['filterKey'];
    title: string;
    color: string;
  }): SceneLabelValuesTimeseries {
    const timeseriesPanel: SceneLabelValuesTimeseries = new SceneLabelValuesTimeseries({
      item: {
        index: 0,
        value: target,
        label: '',
        queryRunnerParams: {},
        panelType: PanelType.TIMESERIES,
      },
      data: new SceneDataTransformer({
        $data: buildCompareTimeSeriesQueryRunner({ filterKey }),
        transformations: [addRefId, addStats],
      }),
      overrides: (series: DataFrame[]) => SceneComparePanel.buildSeriesOverrides(series, color),
      headerActions: () => [],
    });

    SceneComparePanel.configureTimeRange(timeseriesPanel, target, title);
    return timeseriesPanel;
  }

  private static buildSeriesOverrides(series: DataFrame[], color: string): Array<{ matcher: any; properties: any[] }> {
    return series.map((s) => {
      const metricField = s.fields[1];
      const allValuesSum = getSeriesStatsValue(s, 'allValuesSum') || 0;

      const properLabel = SceneComparePanel.getProperLabel(s);
      const total = SceneComparePanel.formatTotalValue(allValuesSum, metricField.config.unit || 'short');

      const properties = [
        {
          id: 'displayName',
          value: `${properLabel} = ${total}`,
        },
        {
          id: 'color',
          value: { mode: 'fixed', fixedColor: color },
        },
      ];

      return {
        matcher: { id: FieldMatcherID.byFrameRefID, options: s.refId },
        properties,
      };
    });
  }

  private static getProperLabel(s: DataFrame): string {
    const displayNameWithLabel = formatSingleSeriesDisplayName('', s);
    const labelMatch = displayNameWithLabel.match(/^(avg|total)/);
    return labelMatch ? labelMatch[1] : 'total';
  }

  private static formatTotalValue(allValuesSum: number, displayUnit: string): string {
    const safeDisplayUnit = displayUnit || 'short';
    const formattedValue = getValueFormat(safeDisplayUnit)(allValuesSum);

    return `${formattedValue.text}${formattedValue.suffix}`;
  }

  private static configureTimeRange(timeseriesPanel: SceneLabelValuesTimeseries, target: string, title: string) {
    timeseriesPanel.state.body.setState({
      $timeRange: new SceneTimeRangeWithAnnotations({
        key: `${target}-annotation-timerange`,
        mode: TimeRangeWithAnnotationsMode.ANNOTATIONS,
        annotationColor:
          target === CompareTarget.BASELINE ? BASELINE_COLORS.OVERLAY.toString() : COMPARISON_COLORS.OVERLAY.toString(),
        annotationTitle: t('diff-flame-graph.compare-panel.annotation-title', '{{title}} flame graph range', { title }),
      }),
    });
  }

  subscribeToEvents() {
    const { timeseriesPanel } = this.state;

    const $annotationTimeRange = timeseriesPanel.state.body.state.$timeRange as SceneTimeRangeWithAnnotations;

    const switchSub = this.subscribeToEvent(EventSwitchTimerangeSelectionMode, (event) => {
      // this triggers a timeseries request to the API
      // TODO: caching?
      $annotationTimeRange.setState({
        mode:
          event.payload.mode === TimerangeSelectionMode.FLAMEGRAPH
            ? TimeRangeWithAnnotationsMode.ANNOTATIONS
            : TimeRangeWithAnnotationsMode.DEFAULT,
      });
    });

    // Subscribe to data changes for step synchronization
    const dataSub = timeseriesPanel.state.body.state.$data?.subscribeToState((newState) => {
      if (newState.data?.state === 'Done' && newState.data.series?.length) {
        this.syncStepSizeWithSibling(newState.data.series);
      }
    });

    // Reset the comparison time range if the service name or data source changes.
    const variableSubs: Unsubscribable[] = [];
    if (this.state.target === CompareTarget.COMPARISON) {
      for (const name of ['serviceName', 'dataSource']) {
        const variable = sceneGraph.lookupVariable(name, this);
        if (!variable) {
          continue;
        }

        const sub = variable.subscribeToEvent(SceneVariableValueChangedEvent, () => {
          if (!this.state.$timeRange || !this.parent) {
            return;
          }

          const globalTimeRange = sceneGraph.getTimeRange(this.parent);
          this.setTimeRange(globalTimeRange.state);
        });
        variableSubs.push(sub);
      }
    }

    return {
      unsubscribe() {
        switchSub.unsubscribe();
        dataSub?.unsubscribe();
        variableSubs.forEach((s) => s.unsubscribe());
      },
    };
  }

  buildTimeseriesTitle() {
    const profileMetricId = getSceneVariableValue(this, 'profileMetricId');
    const { description } = getProfileMetric(profileMetricId as ProfileMetricId);
    return description || getProfileMetricLabel(profileMetricId);
  }

  useDiffTimeRange() {
    return (this.state.timeseriesPanel.state.body.state.$timeRange as SceneTimeRangeWithAnnotations).useState();
  }

  applyPreset({ from, to, diffFrom, diffTo }: Preset) {
    this.setDiffRange({ from: diffFrom, to: diffTo });

    this.setTimeRange(buildTimeRange(from, to));
  }

  setTimeRange(newTimeRange: SceneTimeRangeState) {
    const timeRange = sceneGraph.getTimeRange(this);
    if (!timeRange) {
      return;
    }

    const { from, to } = timeRange.state.value;
    if (!from.isSame(newTimeRange.value.from) || !to.isSame(newTimeRange.value.to)) {
      timeRange.setState({
        from: newTimeRange.from,
        to: newTimeRange.to,
        value: newTimeRange.value,
      });
      timeRange.onRefresh();
    }
  }

  setDiffRange(options: { from: string; to: string } | null) {
    if (options === null) {
      return;
    }

    const $diffTimeRange = this.state.timeseriesPanel.state.body.state.$timeRange as SceneTimeRangeWithAnnotations;
    const { annotationTimeRange } = $diffTimeRange.state;
    const newAnnotationTimeRange = $diffTimeRange.buildAnnotationTimeRange(options.from, options.to);
    if (
      !annotationTimeRange.from.isSame(newAnnotationTimeRange.from) ||
      !annotationTimeRange.to.isSame(newAnnotationTimeRange.to)
    ) {
      $diffTimeRange.setAnnotationTimeRange(newAnnotationTimeRange, true);
    }
  }

  /**
   * This function is responsible for automatically selecting half of the time range (from the time picker) that will be used to build the diff flame graph
   * For the baseline panel, the leftmost part, for the comparison one, the rightmost part.
   * In the future, we might want to be smarter and provides a way to select (e.g.) the region with the lowest resource consumption on the baseline panel vs
   * the region with the highest consumption on the comparison panel.
   */
  autoSelectDiffRange(selectWholeRange: boolean) {
    const timeRange = sceneGraph.getTimeRange(this);
    if (!timeRange) {
      return;
    }

    const { from, to } = timeRange.state.value;

    if (selectWholeRange) {
      this.setDiffRange({ from: from.toISOString(), to: to.toISOString() });
      return;
    }

    const diff = to.diff(from);

    // ensure that we don't kill the backend when selecting long periods like 7d
    const range = Math.min(Math.round(diff * 0.25), ONE_DAY_IN_MS);

    const { target } = this.state;
    if (target === CompareTarget.BASELINE) {
      // we have to create a new instance because add() mutates the original one
      this.setDiffRange({ from: from.toISOString(), to: dateTime(from).add(range).toISOString() });
    } else {
      // we have to create a new instance because subtract() mutates the original one
      this.setDiffRange({ from: dateTime(to).subtract(range).toISOString(), to: to.toISOString() });
    }
  }

  onClickTimeRangeSync = () => {
    const { target, timeseriesPanel } = this.state;
    const $annotationTimeRange = timeseriesPanel.state.body.state.$timeRange as SceneTimeRangeWithAnnotations;
    const timeRange = sceneGraph.getTimeRange(this);

    this.publishEvent(
      new EventSyncTimeRanges({
        source: target,
        timeRange: timeRange.state,
        annotationTimeRange: $annotationTimeRange.state.annotationTimeRange,
      }),
      true
    );
  };

  onClickRefresh = () => {
    this.publishEvent(new EventSyncRefresh({ source: this.state.target }), true);
  };

  refreshTimeseries() {
    sceneGraph.getTimeRange(this)?.onRefresh();
  }

  private syncStepSizeWithSibling(myData: DataFrame[]) {
    const siblingPanel = this.getSiblingPanel();
    if (!siblingPanel) {
      return;
    }

    const siblingData = this.getSiblingData(siblingPanel);
    if (!siblingData?.length) {
      return;
    }

    this.performStepSynchronization(myData, siblingData);
  }

  private getSiblingPanel(): SceneComparePanel | null {
    const siblingKey = this.state.target === CompareTarget.BASELINE ? 'comparison-panel' : 'baseline-panel';
    try {
      return sceneGraph.findByKeyAndType(this, siblingKey, SceneComparePanel);
    } catch {
      return null;
    }
  }

  private getSiblingData(siblingPanel: SceneComparePanel): DataFrame[] | null {
    return siblingPanel.state.timeseriesPanel.state.body.state.$data?.state.data?.series || null;
  }

  private performStepSynchronization(myData: DataFrame[], siblingData: DataFrame[]) {
    const myStep = this.extractStepDuration(myData);
    const siblingStep = this.extractStepDuration(siblingData);

    if (myStep && siblingStep && Math.abs(myStep - siblingStep) > 0.001) {
      const targetStep = Math.max(myStep, siblingStep); // Use highest step (lowest resolution) to reduce data points

      if (this.state.lastSyncedStepSec !== targetStep) {
        this.setState({ lastSyncedStepSec: targetStep });
        this.updateQueryStep(targetStep);
      }
    }
  }

  private extractStepDuration(data: DataFrame[]): number | null {
    if (!data?.length) {
      return null;
    }

    const timeField = data[0].fields.find((f) => f.type === 'time');
    if (!timeField?.values?.length || timeField.values.length < 2) {
      return null;
    }

    const times = timeField.values as number[];
    const stepDurationMs = times[1] - times[0];
    const stepDurationSec = stepDurationMs / 1000;
    return stepDurationSec;
  }

  private updateQueryStep(targetStepSec: number) {
    const queryRunner = this.state.timeseriesPanel.state.body.state.$data?.state.$data as SceneQueryRunner;
    if (!queryRunner?.setState || !queryRunner?.runQueries) {
      return;
    }

    const currentQueries = queryRunner.state.queries;

    const updatedQueries = currentQueries.map((query) => ({
      ...query,
      step: targetStepSec,
    }));

    queryRunner.setState({ queries: updatedQueries });
    queryRunner.runQueries();
  }

  public static Component = ({ model }: SceneComponentProps<SceneComparePanel>) => {
    const {
      target,
      color,
      title,
      timeseriesPanel: timeseries,
      timePicker,
      refreshPicker,
      filterKey,
    } = model.useState();

    const styles = useStyles2(getStyles, color);

    const filtersVariable = sceneGraph.findByKey(model, filterKey) as FiltersVariable;
    const timeRange = sceneGraph.getTimeRange(model);

    return (
      <div className={styles.panel} data-testid={`panel-${target}`}>
        <div className={styles.panelHeader}>
          <h6>
            <div className={styles.colorCircle} />
            {title}
          </h6>

          <div className={styles.timeControls}>
            <timePicker.Component model={timePicker} />

            <div onClick={model.onClickRefresh}>
              <refreshPicker.Component model={refreshPicker} />
            </div>

            <IconButton
              className={cx(styles.syncButton)}
              name="link"
              aria-label={t('diff-flame-graph.compare-panel.sync-time-ranges', 'Sync time ranges')}
              tooltip={t('diff-flame-graph.compare-panel.sync-time-ranges', 'Sync time ranges')}
              onClick={model.onClickTimeRangeSync}
            />
          </div>
        </div>

        <div className={styles.filter}>
          <filtersVariable.Component model={filtersVariable} timeRange={timeRange} />
        </div>

        <div className={styles.timeseries}>{timeseries && <timeseries.Component model={timeseries} />}</div>
      </div>
    );
  };
}

const getStyles = (theme: GrafanaTheme2, color: string) => ({
  panel: css`
    background-color: ${theme.colors.background.primary};
    padding: ${theme.spacing(1)} ${theme.spacing(1)} 0 ${theme.spacing(1)};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: 2px;
    width: 100%;
  `,
  panelHeader: css`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: ${theme.spacing(2)};
    flex-wrap: wrap;

    & > h6 {
      font-size: 15px;
      height: 32px;
      line-height: 32px;
      margin: 0 ${theme.spacing(1)} 0 0;
    }
  `,
  colorCircle: css`
    display: inline-block;
    background-color: ${color};
    border-radius: 50%;
    width: 9px;
    height: 9px;
    margin-right: 6px;
  `,
  timeControls: css`
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  `,
  syncButton: css`
    z-index: unset;
    padding: ${theme.spacing(0, 1)};
    margin: 0;
    background: ${theme.colors.secondary.main};
    border: 1px solid ${theme.colors.secondary.border};
    border-radius: ${theme.shape.radius.default};

    &:hover {
      background: ${theme.colors.secondary.shade};
    }
  `,
  filter: css`
    display: flex;
    margin-bottom: ${theme.spacing(3)};
  `,
  timeseries: css`
    height: 200px;

    & [data-viz-panel-key] > * {
      border: 0 none;
    }

    & [data-viz-panel-key] [data-testid='uplot-main-div'] {
      cursor: crosshair;
    }
  `,
});
