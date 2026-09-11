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
import { ApiClient } from '@shared/infrastructure/http/ApiClient';
import { logger } from '@shared/infrastructure/tracking/logger';

import { ProfileMetricVariable } from '../../domain/variables/ProfileMetricVariable';
import { ServiceNameVariable } from '../../domain/variables/ServiceNameVariable/ServiceNameVariable';
import { PYROSCOPE_SERIES_DATA_SOURCE } from '../pyroscope-data-sources';
import { formatSeriesToProfileMetrics } from './formatSeriesToProfileMetrics';
import { formatSeriesToServices } from './formatSeriesToServices';
import { safeInterpolate } from './helpers/safeInterpolate';
import { DataSourceProxyClientBuilder } from './http/DataSourceProxyClientBuilder';
import { SeriesApiClient } from './http/SeriesApiClient';
import { seriesRepository } from './http/seriesRepository';

export class SeriesDataSource extends RuntimeDataSource {
  constructor() {
    super(PYROSCOPE_SERIES_DATA_SOURCE.type, PYROSCOPE_SERIES_DATA_SOURCE.uid);
  }

  async fetchSeries(dataSourceUid: string, timeRange: TimeRange, variableName?: string, matchers?: string[]) {
    seriesRepository.setApiClient(DataSourceProxyClientBuilder.build(dataSourceUid, SeriesApiClient));

    try {
      return await seriesRepository.list({ timeRange, matchers });
    } catch (error) {
      logger.error(error as Error, {
        info: 'Error while loading Pyroscope series!',
        variableName: variableName || '',
      });

      throw error;
    }
  }

  async query(): Promise<DataQueryResponse> {
    return {
      state: LoadingState.Done,
      data: [
        {
          name: 'PyroscopeSeries',
          fields: [
            {
              name: 'PyroscopeSeries',
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

  async metricFindQuery(query: string, options: LegacyMetricFindQueryOptions): Promise<MetricFindValue[]> {
    const sceneObject = options.scopedVars?.__sceneObject?.valueOf() as ServiceNameVariable | ProfileMetricVariable;

    let dataSourceUid = safeInterpolate(sceneObject, '$dataSource');
    const serviceName = safeInterpolate(sceneObject, '$serviceName');
    const profileMetricId = safeInterpolate(sceneObject, '$profileMetricId');
    const filtersAllServices = safeInterpolate(sceneObject, '$filtersAllServices');

    // Fallback to default datasource if interpolation not ready yet
    if (!dataSourceUid) {
      dataSourceUid = ApiClient.selectDefaultDataSource().uid as string;
    }

    const pyroscopeSeries = await this.fetchSeries(dataSourceUid, options.range as TimeRange, options.variable?.name, [
      `{${filtersAllServices}}`,
    ]);

    switch (query) {
      // queries that depend only on the selected data source
      case '$dataSource $filtersAllServices and all services':
        return formatSeriesToServices(pyroscopeSeries);

      case '$dataSource $filtersAllServices and all profile metrics':
        return formatSeriesToProfileMetrics(pyroscopeSeries);

      // queries that depend on the selected profile metric, selected service, or filters
      case '$dataSource and only $profileMetricId services':
      case '$dataSource $profileMetricId $filtersAllServices':
        return formatSeriesToServices(pyroscopeSeries, profileMetricId);

      case '$dataSource and only $serviceName profile metrics':
        return formatSeriesToProfileMetrics(pyroscopeSeries, serviceName);

      default:
        throw new TypeError(`Unsupported query "${query}"!`);
    }
  }

  async testDatasource(): Promise<TestDataSourceResponse> {
    return {
      status: 'success',
      message: t('series.data-source.test-success', 'OK'),
    };
  }
}
