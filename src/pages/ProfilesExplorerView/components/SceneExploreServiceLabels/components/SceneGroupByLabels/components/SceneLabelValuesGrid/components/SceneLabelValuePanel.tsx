import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { SceneComponentProps, SceneObjectBase, SceneObjectState, VizPanelState } from '@grafana/scenes';
import { useStyles2 } from '@grafana/ui';
import React from 'react';

import { EventTimeseriesDataReceived } from '../../../../../../../domain/events/EventTimeseriesDataReceived';
import { getSeriesStatsValue } from '../../../../../../../infrastructure/helpers/getSeriesStatsValue';
import { GridItemData } from '../../../../../../SceneByVariableRepeaterGrid/types/GridItemData';
import { SceneLabelValuesTimeseries } from '../../../../../../SceneLabelValuesTimeseries/SceneLabelValuesTimeseries';
import { GRID_AUTO_ROWS } from '../SceneLabelValuesGrid';
import { SceneStatsPanel } from './SceneStatsPanel/SceneStatsPanel';

interface SceneLabelValuesStatAndTimeseriesState extends SceneObjectState {
  statsPanel: SceneStatsPanel;
  timeseriesPanel: SceneLabelValuesTimeseries;
}

export class SceneLabelValuePanel extends SceneObjectBase<SceneLabelValuesStatAndTimeseriesState> {
  static buildPanelKey(item: GridItemData) {
    return `compare-panel-${item.value}`;
  }

  constructor({
    item,
    headerActions,
  }: {
    item: GridItemData;
    headerActions: (item: GridItemData) => VizPanelState['headerActions'];
  }) {
    super({
      key: 'label-value-panel',
      statsPanel: new SceneStatsPanel({ item }),
      timeseriesPanel: new SceneLabelValuesTimeseries({ item, headerActions }),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    const { statsPanel, timeseriesPanel } = this.state;

    const timeseriesSub = timeseriesPanel.subscribeToEvent(EventTimeseriesDataReceived, (event) => {
      const s = event.payload.series?.[0];

      if (!s) {
        statsPanel.updateStats({ allValuesSum: 0, unit: 'short' });
        return;
      }

      const allValuesSum = getSeriesStatsValue(s, 'allValuesSum') || 0;

      if (statsPanel.getStats()?.allValuesSum !== allValuesSum) {
        statsPanel.updateStats({
          allValuesSum,
          unit: s.fields[1].config.unit || 'short',
        });
      }
    });

    return () => {
      timeseriesSub.unsubscribe();
    };
  }

  static Component({ model }: SceneComponentProps<SceneLabelValuePanel>) {
    const styles = useStyles2(getStyles);
    const { statsPanel, timeseriesPanel } = model.useState();
    const { compareActionChecks } = statsPanel.useState();
    const isSelected = compareActionChecks[0] || compareActionChecks[1];

    return (
      <div className={cx(styles.container, isSelected && 'selected')}>
        <div className={styles.statsPanel}>
          <statsPanel.Component model={statsPanel} />
        </div>
        <div className={styles.timeseriesPanel}>
          <timeseriesPanel.Component model={timeseriesPanel} />
        </div>
      </div>
    );
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    min-width: 0px;
    min-height: ${GRID_AUTO_ROWS};
    flex-flow: row;

    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: ${theme.shape.radius.lg || theme.shape.radius.default};
    overflow: hidden;
    &.selected {
      border: 1px solid ${theme.colors.accent?.main ?? theme.colors.primary.main};
    }

    & > div {
      display: flex;
      position: relative;
      flex-direction: row;
      align-self: stretch;
      min-height: ${GRID_AUTO_ROWS};
    }
  `,
  statsPanel: css`
    width: ${SceneStatsPanel.WIDTH_IN_PIXELS}px;
  `,
  timeseriesPanel: css`
    flex-grow: 1;

    & [data-viz-panel-key] > * {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  `,
});
