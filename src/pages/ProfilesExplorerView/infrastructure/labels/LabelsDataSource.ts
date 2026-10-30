import {
  DataQueryResponse,
  FieldType,
  LegacyMetricFindQueryOptions,
  LoadingState,
  MetricFindValue,
  TestDataSourceResponse,
  TimeRange,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { RuntimeDataSource } from '@grafana/scenes';
import { isPrivateLabel } from '@shared/components/QueryBuilder/domain/helpers/isPrivateLabel';
import { labelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { logger } from '@shared/infrastructure/tracking/logger';
import pLimit from 'p-limit';

import { GroupByVariable } from '../../domain/variables/GroupByVariable/GroupByVariable';
import { computeRoundedTimeRange } from '../../helpers/computeRoundedTimeRange';
import { PYROSCOPE_LABELS_DATA_SOURCE } from '../pyroscope-data-sources';
import { safeInterpolate } from '../series/helpers/safeInterpolate';

const MAX_CONCURRENT_LABEL_VALUES_REQUESTS = 20;
const limit = pLimit(MAX_CONCURRENT_LABEL_VALUES_REQUESTS);

export class LabelsDataSource extends RuntimeDataSource {
  static MAX_TIMESERIES_LABEL_VALUES = 10;

  constructor() {
    super(PYROSCOPE_LABELS_DATA_SOURCE.type, PYROSCOPE_LABELS_DATA_SOURCE.uid);
  }

  async query(): Promise<DataQueryResponse> {
    return {
      state: LoadingState.Done,
      data: [
        {
          name: 'Labels',
          fields: [
            {
              name: 'Label',
              type: FieldType.other,
              values: [],
              config: {},
            },
          ],
          length: 0,
        },
      ],
    };
  }

  getParams(options: LegacyMetricFindQueryOptions) {
    const { scopedVars, range } = options;
    const sceneObject = scopedVars?.__sceneObject?.valueOf() as GroupByVariable;

    const dataSourceUid = safeInterpolate(sceneObject, '$dataSource');
    const serviceName = safeInterpolate(sceneObject, '$serviceName');
    const profileMetricId = safeInterpolate(sceneObject, '$profileMetricId');

    // we could interpolate ad hoc filters, but the Labels exploration type would reload all labels each time they are modified
    // const filters = sceneGraph.interpolate(sceneObject, '$filters');
    // const pyroscopeQuery = `${profileMetricId}{service_name="${serviceName}",${filters}}`;
    const query = `${profileMetricId}{service_name="${serviceName}"}`;

    const { from, to } = computeRoundedTimeRange(range as TimeRange);

    return {
      dataSourceUid,
      serviceName,
      profileMetricId,
      query,
      from,
      to,
    };
  }

  async fetchLabels(dataSourceUid: string, query: string, from: number, to: number, variableName?: string) {
    try {
      return await labelsRepository.listLabels({ dataSourceUid, query, from, to });
    } catch (error) {
      logger.error(error as Error, {
        info: 'Error while loading Pyroscope label names!',
        variableName: variableName || '',
      });

      throw error;
    }
  }

  async fetchLabelValues(
    dataSourceUid: string,
    query: string,
    from: number,
    to: number,
    labelName: string,
    variableName?: string
  ) {
    let values;

    try {
      values = await labelsRepository.listLabelValues({ dataSourceUid, query, from, to, label: labelName });
    } catch (error) {
      logger.error(error as Error, {
        info: 'Error while loading Pyroscope label values!',
        variableName: variableName || '',
      });
    }

    const count = values ? values.length : -1;

    return {
      value: {
        value: labelName,
        groupBy: {
          label: labelName,
          values: values || [],
        },
      },
      text: `${labelName} (${count > -1 ? count : '?'})`,
      count,
    };
  }

  async metricFindQuery(_: string, options: LegacyMetricFindQueryOptions): Promise<MetricFindValue[]> {
    const sceneObject = options.scopedVars?.__sceneObject?.valueOf() as GroupByVariable;

    // save bandwidth
    // TODO: remove this when we can declare the GroupByVariable in the Scene it's used
    // without messing up the variable URL sync
    if (!sceneObject.isActive) {
      return [];
    }

    const { dataSourceUid, serviceName, profileMetricId, query, from, to } = this.getParams(options);

    if (!serviceName || !profileMetricId) {
      logger.warn(
        'LabelsDataSource: either serviceName="%s" and/or profileMetricId="%s" is empty! Discarding request.',
        serviceName,
        profileMetricId
      );
      return [];
    }

    const labels = await this.fetchLabels(dataSourceUid, query, from, to, options.variable?.name);

    const labelsWithValuesAndCount = await Promise.all(
      labels
        .filter(({ value }) => !isPrivateLabel(value))
        .map(({ value }) =>
          limit(() => this.fetchLabelValues(dataSourceUid, query, from, to, value, options.variable?.name))
        )
    );

    const sortedLabels = labelsWithValuesAndCount
      .sort((a, b) => b.count - a.count)
      .map(({ value, text }, index) => {
        return {
          // TODO: check if there's a better way
          value: JSON.stringify({ ...value, index }),
          text,
        };
      });

    return [
      // we do this here because GroupByVariable may set its default value to the 1st element automatically
      {
        value: 'all',
        text: t('labels.data-source.all', 'All'),
      },
      ...sortedLabels,
    ];
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    return {
      status: 'success',
      message: t('labels.data-source.test-success', 'OK'),
    };
  }
}
