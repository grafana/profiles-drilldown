import { AdHocVariableFilter, dateTime, TimeRange } from '@grafana/data';
import {
  AdHocFiltersVariable,
  ConstantVariable,
  EmbeddedScene,
  SceneCanvasText,
  SceneVariableSet,
} from '@grafana/scenes';
import { SessionLabelsRepository } from '@shared/infrastructure/query-session/DrilldownQuerySession';

import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from '../../../domain/variables/FiltersVariable/filterExpressionWithLeadingComma';
import { LabelsDataSource } from '../LabelsDataSource';

class TestFiltersVariable extends AdHocFiltersVariable {
  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }
}

const range = {
  from: dateTime(1_700_000_000_000),
  to: dateTime(1_700_000_060_000),
  raw: { from: 'now-1m', to: 'now' },
} as TimeRange;

function paramsFor(filters: AdHocVariableFilter[]) {
  const scene = new EmbeddedScene({
    $variables: new SceneVariableSet({
      variables: [
        new ConstantVariable({ name: 'dataSource', value: 'pyroscope' }),
        new ConstantVariable({ name: 'serviceName', value: 'api' }),
        new ConstantVariable({ name: 'profileMetricId', value: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds' }),
        new TestFiltersVariable({ name: 'filters', filters, applyMode: 'manual' }),
      ],
    }),
    body: new SceneCanvasText({ text: '' }),
  });

  return new LabelsDataSource().getParams({
    range,
    scopedVars: {
      __sceneObject: { valueOf: () => scene },
    },
  } as any);
}

describe('LabelsDataSource.getParams', () => {
  it('queries label values for the service when no ad-hoc filters are set', () => {
    expect(paramsFor([]).query).toBe('process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api"}');
  });

  it('includes ad-hoc filters so label value counts match the current selection', () => {
    expect(paramsFor([{ key: 'cluster', operator: '=', value: 'A' }]).query).toBe(
      'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api",cluster="A"}'
    );
  });

  it('keeps every ad-hoc filter, including the label being counted', () => {
    expect(
      paramsFor([
        { key: 'instance_id', operator: '=', value: 'X' },
        { key: 'cluster', operator: '!=', value: 'B' },
      ]).query
    ).toBe('process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api",instance_id="X",cluster!="B"}');
  });
});

describe('LabelsDataSource', () => {
  it('should fetch labels from the given datasource', async () => {
    const repository: SessionLabelsRepository = {
      listLabels: jest.fn().mockResolvedValue([{ value: 'env', label: 'env' }]),
      listLabelValues: jest.fn(),
      cancel: jest.fn(),
    };
    const labels = await new LabelsDataSource().fetchLabels(repository, 'pyroscope-abc', 'q', 1, 2);
    expect(repository.listLabels).toHaveBeenCalledWith({ dataSourceUid: 'pyroscope-abc', query: 'q', from: 1, to: 2 });
    expect(labels).toEqual([{ value: 'env', label: 'env' }]);
  });

  it('should fetch label values from the given datasource', async () => {
    const repository: SessionLabelsRepository = {
      listLabels: jest.fn(),
      listLabelValues: jest.fn().mockResolvedValue([]),
      cancel: jest.fn(),
    };
    await new LabelsDataSource().fetchLabelValues(repository, 'pyroscope-abc', 'q', 1, 2, 'env');
    expect(repository.listLabelValues).toHaveBeenCalledWith({
      dataSourceUid: 'pyroscope-abc',
      query: 'q',
      from: 1,
      to: 2,
      label: 'env',
    });
  });
});
