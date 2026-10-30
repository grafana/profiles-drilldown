import { AdHocVariableFilter } from '@grafana/data';
import { AdHocFiltersVariable, EmbeddedScene, SceneCanvasText, sceneGraph, SceneVariableSet } from '@grafana/scenes';

import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from '../../../../../../../domain/variables/FiltersVariable/filterExpressionWithLeadingComma';
import { buildLabelValuesGridQueryRunner } from './buildLabelValuesGridQueryRunner';

class TestFiltersVariable extends AdHocFiltersVariable {
  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }
}

function filtersVariable(filters: AdHocVariableFilter[]) {
  return new TestFiltersVariable({ name: 'filters', filters, applyMode: 'manual' });
}

describe('buildLabelValuesGridQueryRunner', () => {
  it('includes ad-hoc filters in the grouped label selector', () => {
    const runner = buildLabelValuesGridQueryRunner({ label: 'instance_id' });

    expect(runner.state.queries[0].labelSelector).toBe(
      '{service_name="$serviceName"${filters.filterExpressionWithLeadingComma}}'
    );
    expect(runner.state.queries[0].groupBy).toEqual(['instance_id']);
  });

  it('interpolates to the service name when filters are empty', () => {
    const runner = buildLabelValuesGridQueryRunner({ label: 'instance_id' });
    const scene = new EmbeddedScene({
      $variables: new SceneVariableSet({ variables: [filtersVariable([])] }),
      body: new SceneCanvasText({ text: '' }),
    });

    expect(sceneGraph.interpolate(scene, runner.state.queries[0].labelSelector)).toBe('{service_name="$serviceName"}');
  });

  it('interpolates ad-hoc filters into the grouped label selector', () => {
    const runner = buildLabelValuesGridQueryRunner({ label: 'instance_id' });
    const scene = new EmbeddedScene({
      $variables: new SceneVariableSet({
        variables: [filtersVariable([{ key: 'cluster', operator: '=', value: 'A' }])],
      }),
      body: new SceneCanvasText({ text: '' }),
    });

    expect(sceneGraph.interpolate(scene, runner.state.queries[0].labelSelector)).toBe(
      '{service_name="$serviceName",cluster="A"}'
    );
  });
});
