import { css } from '@emotion/css';
import { DataFrame, DataTransformerID, LoadingState } from '@grafana/data';
import {
  PanelBuilders,
  SceneComponentProps,
  SceneDataTransformer,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  VizPanel,
  VizPanelState,
} from '@grafana/scenes';
import { useStyles2 } from '@grafana/ui';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React from 'react';

import { EventTimeseriesDataReceived } from '../domain/events/EventTimeseriesDataReceived';
import { ProfileMetricVariable } from '../domain/variables/ProfileMetricVariable';
import { getColorByIndex } from '../helpers/getColorByIndex';
import { getSceneVariableValue } from '../helpers/getSceneVariableValue';
import { findFakeMetricMapping } from '../infrastructure/fake-profiles-from-metrics/metricsProfileTypeMap';
import { resolveDataSourceKind } from '../infrastructure/fake-profiles-from-metrics/resolveDataSourceKind';
import { buildTimeSeriesQueryRunner } from '../infrastructure/timeseries/buildTimeSeriesQueryRunner';
import { GridItemData } from './SceneByVariableRepeaterGrid/types/GridItemData';

interface SceneLabelValuesTableState extends SceneObjectState {
  body: VizPanel;
}

export class SceneLabelValuesTable extends SceneObjectBase<SceneLabelValuesTableState> {
  constructor({
    item,
    headerActions,
  }: {
    item: GridItemData;
    headerActions: (item: GridItemData) => VizPanelState['headerActions'];
  }) {
    super({
      key: 'table-label-values',
      body: PanelBuilders.table()
        .setTitle(item.label)
        .setData(
          new SceneDataTransformer({
            $data: buildTimeSeriesQueryRunner(item.queryRunnerParams),
            transformations: [
              {
                id: DataTransformerID.reduce,
                options: {
                  reducers: ['max'],
                  labelsToFields: true,
                },
              },
              {
                id: DataTransformerID.filterFieldsByName,
                options: {
                  exclude: {
                    names: ['Field'],
                  },
                },
              },
              {
                id: DataTransformerID.renameByRegex,
                options: {
                  regex: 'Max',
                  renamePattern: 'max',
                },
              },
              {
                id: DataTransformerID.sortBy,
                options: {
                  sort: [
                    {
                      field: 'max',
                      desc: true,
                    },
                  ],
                },
              },
            ],
          })
        )
        .setHeaderActions(headerActions(item))
        .build(),
    });

    this.addActivationHandler(this.onActivate.bind(this, item));
  }

  onActivate(item: GridItemData) {
    const { body } = this.state;

    const sub = (body.state.$data as SceneDataTransformer)!.subscribeToState((newState) => {
      if (newState.data?.state !== LoadingState.Done) {
        return;
      }

      const { series } = newState.data;

      if (series?.length) {
        body.setState(this.getConfig(item, series));
      }

      // we publish the event only after setting the new config so that the subscribers can modify it
      this.publishEvent(new EventTimeseriesDataReceived({ series }), true);
    });

    return () => {
      sub.unsubscribe();
    };
  }

  getConfig(item: GridItemData, series: DataFrame[]) {
    const cardinality = series[0].fields[0].values.length;

    const profileMetricId = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable).state
      .value as ProfileMetricId;
    const dataSourceUid = getSceneVariableValue(this, 'dataSource');
    const unitValue =
      resolveDataSourceKind(dataSourceUid) === 'prometheus'
        ? findFakeMetricMapping(profileMetricId)?.unit ?? getProfileMetric(profileMetricId).unit
        : getProfileMetric(profileMetricId).unit;

    return {
      title: cardinality > 1 ? `${item.label} (${cardinality})` : item.label,
      fieldConfig: {
        defaults: {
          custom: {
            filterable: true,
            cellOptions: {},
          },
        },
        overrides: [
          {
            matcher: {
              id: 'byName',
              options: 'max',
            },
            properties: [
              {
                id: 'unit',
                value: unitValue,
              },
              {
                id: 'custom.width',
                value: 100,
              },
            ],
          },
        ],
      },
    };
  }

  static Component({ model }: SceneComponentProps<SceneLabelValuesTable>) {
    const styles = useStyles2(getStyles);
    const { body } = model.useState();

    return (
      <span className={styles.container}>
        <body.Component model={body} />
      </span>
    );
  }
}

const getStyles = () => ({
  // couldn't find a better way just by configuring the table panel :man_shrug:
  container: css`
    [data-testid='data-testid table body'] [role='row']:first-child {
      color: ${getColorByIndex(3)};
      font-weight: 500;
    }
  `,
});
