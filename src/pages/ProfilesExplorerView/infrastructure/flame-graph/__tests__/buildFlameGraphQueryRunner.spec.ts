import { AdHocVariableFilter } from '@grafana/data';
import {
  AdHocFiltersVariable,
  ConstantVariable,
  EmbeddedScene,
  SceneCanvasText,
  SceneVariableSet,
  sceneGraph,
} from '@grafana/scenes';

import {
  FILTER_EXPRESSION_WITH_LEADING_COMMA,
  filterExpressionWithLeadingComma,
} from '../../../domain/variables/FiltersVariable/filterExpressionWithLeadingComma';
import { buildFlameGraphQueryRunner } from '../buildFlameGraphQueryRunner';

jest.mock('../../withPreventInvalidQuery', () => ({
  withPreventInvalidQuery: (runner: any) => runner,
}));

class TestFiltersVariable extends AdHocFiltersVariable {
  getValue(fieldPath?: string) {
    if (fieldPath === FILTER_EXPRESSION_WITH_LEADING_COMMA) {
      return filterExpressionWithLeadingComma(this.state.filterExpression);
    }

    return super.getValue(fieldPath);
  }
}

function getLabelSelector(runner: any): string {
  return runner.state.queries[0].labelSelector;
}

describe('buildFlameGraphQueryRunner', () => {
  describe('extraFilterVariables', () => {
    it('appends extraFilterVariables to the label selector', () => {
      const runner = buildFlameGraphQueryRunner({
        extraFilterVariables: ['filtersAllServices'],
      });

      expect(getLabelSelector(runner)).toBe(
        '{service_name="$serviceName"${filters.filterExpressionWithLeadingComma}${filtersAllServices.filterExpressionWithLeadingComma}}'
      );
    });

    it('appends multiple extraFilterVariables', () => {
      const runner = buildFlameGraphQueryRunner({
        extraFilterVariables: ['filtersAllServices', 'filtersOther'],
      });

      expect(getLabelSelector(runner)).toBe(
        '{service_name="$serviceName"${filters.filterExpressionWithLeadingComma}${filtersAllServices.filterExpressionWithLeadingComma}${filtersOther.filterExpressionWithLeadingComma}}'
      );
    });

    it('does not append anything when extraFilterVariables is undefined', () => {
      const runner = buildFlameGraphQueryRunner({});

      expect(getLabelSelector(runner)).toBe('{service_name="$serviceName"${filters.filterExpressionWithLeadingComma}}');
    });

    it('does not append anything when extraFilterVariables is empty', () => {
      const runner = buildFlameGraphQueryRunner({
        extraFilterVariables: [],
      });

      expect(getLabelSelector(runner)).toBe('{service_name="$serviceName"${filters.filterExpressionWithLeadingComma}}');
    });
  });

  describe('interpolated label selector', () => {
    function f(key: string, operator: string, value: string): AdHocVariableFilter {
      return { key, operator, value };
    }

    function makeFiltersVar(name: string, filters: AdHocVariableFilter[]): AdHocFiltersVariable {
      return new TestFiltersVariable({ name, filters, applyMode: 'manual' });
    }

    function interpolateSelector({
      filters = [] as AdHocVariableFilter[],
      allServicesFilters = [] as AdHocVariableFilter[],
      extraFilterVariables,
    }: {
      filters?: AdHocVariableFilter[];
      allServicesFilters?: AdHocVariableFilter[];
      extraFilterVariables?: string[];
    }): string {
      const filtersVar = makeFiltersVar('filters', filters);
      const allServicesFiltersVar = makeFiltersVar('filtersAllServices', allServicesFilters);
      const serviceNameVar = new ConstantVariable({ name: 'serviceName', value: 'my-service' });

      const runner = buildFlameGraphQueryRunner({
        extraFilterVariables,
      });

      const scene = new EmbeddedScene({
        $variables: new SceneVariableSet({ variables: [filtersVar, allServicesFiltersVar, serviceNameVar] }),
        body: new SceneCanvasText({ text: '' }),
      });

      return sceneGraph.interpolate(scene, runner.state.queries[0].labelSelector);
    }

    describe('without extraFilterVariables', () => {
      it('renders just the service name when filters is empty', () => {
        expect(interpolateSelector({ filters: [] })).toBe('{service_name="my-service"}');
      });

      it('renders service name + filters when filters is set', () => {
        expect(interpolateSelector({ filters: [f('env', '=', 'prod')] })).toBe(
          '{service_name="my-service",env="prod"}'
        );
      });

      it('renders multiple filters comma-separated', () => {
        expect(
          interpolateSelector({
            filters: [f('env', '=', 'prod'), f('team', '!=', 'frontend')],
          })
        ).toBe('{service_name="my-service",env="prod",team!="frontend"}');
      });
    });

    describe('with extraFilterVariables = ["filtersAllServices"]', () => {
      const extras = ['filtersAllServices'];

      it('renders just the service name when both filters are empty', () => {
        expect(
          interpolateSelector({
            filters: [],
            allServicesFilters: [],
            extraFilterVariables: extras,
          })
        ).toBe('{service_name="my-service"}');
      });

      it('renders service name + filtersAllServices when only filtersAllServices is set', () => {
        expect(
          interpolateSelector({
            filters: [],
            allServicesFilters: [f('region', '=', 'us-east')],
            extraFilterVariables: extras,
          })
        ).toBe('{service_name="my-service",region="us-east"}');
      });

      it('renders service name + filters when only filters is set', () => {
        expect(
          interpolateSelector({
            filters: [f('env', '=', 'prod')],
            allServicesFilters: [],
            extraFilterVariables: extras,
          })
        ).toBe('{service_name="my-service",env="prod"}');
      });

      it('renders both filters and filtersAllServices comma-separated when both are set', () => {
        expect(
          interpolateSelector({
            filters: [f('env', '=', 'prod')],
            allServicesFilters: [f('region', '=', 'us-east')],
            extraFilterVariables: extras,
          })
        ).toBe('{service_name="my-service",env="prod",region="us-east"}');
      });

      it('renders multiple filters in each variable comma-separated', () => {
        expect(
          interpolateSelector({
            filters: [f('env', '=', 'prod'), f('team', '=', 'backend')],
            allServicesFilters: [f('region', '=', 'us-east'), f('cluster', '!=', 'edge')],
            extraFilterVariables: extras,
          })
        ).toBe('{service_name="my-service",env="prod",team="backend",region="us-east",cluster!="edge"}');
      });
    });
  });
});
