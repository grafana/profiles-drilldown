import { AdHocVariableFilter } from '@grafana/data';
import { sceneGraph } from '@grafana/scenes';

import { GridItemData } from '../../../components/SceneByVariableRepeaterGrid/types/GridItemData';
import { interpolateQueryRunnerVariables } from '../interpolateQueryRunnerVariables';

jest.mock('@grafana/scenes', () => ({
  sceneGraph: {
    lookupVariable: jest.fn(),
  },
}));

jest.mock('../../../helpers/getSceneVariableValue', () => ({
  getSceneVariableValue: (_obj: unknown, name: string) => {
    const defaults: Record<string, string> = {
      serviceName: 'default-service',
      profileMetricId: 'cpu',
    };
    return defaults[name] ?? '';
  },
}));

const mockLookupVariable = jest.mocked(sceneGraph.lookupVariable);

function makeFilter(key: string, operator: string, value: string): AdHocVariableFilter {
  return { key, operator, value };
}

function makeItem(overrides: Partial<GridItemData['queryRunnerParams']> = {}): GridItemData {
  return {
    index: 0,
    value: 'test',
    label: 'test',
    queryRunnerParams: overrides,
    panelType: 'time-series' as GridItemData['panelType'],
  };
}

function setupVariableMocks({
  filters = [] as AdHocVariableFilter[],
  allServicesFilters = undefined as AdHocVariableFilter[] | undefined,
} = {}) {
  mockLookupVariable.mockImplementation((name: string) => {
    if (name === 'filters') {
      return { state: { filters } } as any;
    }
    if (name === 'filtersAllServices') {
      return allServicesFilters ? ({ state: { filters: allServicesFilters } } as any) : undefined;
    }
    return undefined;
  });
}

describe('interpolateQueryRunnerVariables', () => {
  describe('allServicesFilters', () => {
    it('includes allServicesFilters in the output', () => {
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      setupVariableMocks({ allServicesFilters: [allServicesFilter] });

      const result = interpolateQueryRunnerVariables({} as any, makeItem());

      expect(result.filters).toContainEqual(allServicesFilter);
    });

    it('returns only item and parsed filters when filtersAllServices variable is undefined', () => {
      const parsedFilter = makeFilter('env', '=', 'prod');
      setupVariableMocks({ filters: [parsedFilter], allServicesFilters: undefined });

      const result = interpolateQueryRunnerVariables({} as any, makeItem());

      expect(result.filters).toEqual([parsedFilter]);
    });

    it('returns only item and parsed filters when filtersAllServices is empty', () => {
      const parsedFilter = makeFilter('env', '=', 'prod');
      setupVariableMocks({ filters: [parsedFilter], allServicesFilters: [] });

      const result = interpolateQueryRunnerVariables({} as any, makeItem());

      expect(result.filters).toEqual([parsedFilter]);
    });

    it('deduplicates filters that exist in both filters and allServicesFilters', () => {
      const sharedFilter = makeFilter('region', '=', 'us-east');
      setupVariableMocks({
        filters: [sharedFilter],
        allServicesFilters: [sharedFilter],
      });

      const result = interpolateQueryRunnerVariables({} as any, makeItem());

      const regionFilters = result.filters.filter((f) => f.key === 'region');
      expect(regionFilters).toHaveLength(1);
    });

    it('deduplicates filters that exist in both item and allServicesFilters', () => {
      const sharedFilter = makeFilter('region', '=', 'us-east');
      setupVariableMocks({ allServicesFilters: [sharedFilter] });

      const result = interpolateQueryRunnerVariables({} as any, makeItem({ filters: [sharedFilter] }));

      const regionFilters = result.filters.filter((f) => f.key === 'region');
      expect(regionFilters).toHaveLength(1);
    });

    it('preserves item filters first when deduplicating', () => {
      const itemFilter = makeFilter('region', '=', 'us-east');
      const allServicesFilter = makeFilter('region', '=', 'eu-west');
      setupVariableMocks({ allServicesFilters: [allServicesFilter] });

      const result = interpolateQueryRunnerVariables({} as any, makeItem({ filters: [itemFilter] }));

      expect(result.filters).toContainEqual(itemFilter);
      expect(result.filters).toContainEqual(allServicesFilter);
    });

    it('merges filters from all three sources', () => {
      const itemFilter = makeFilter('team', '=', 'backend');
      const parsedFilter = makeFilter('env', '=', 'prod');
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      setupVariableMocks({ filters: [parsedFilter], allServicesFilters: [allServicesFilter] });

      const result = interpolateQueryRunnerVariables({} as any, makeItem({ filters: [itemFilter] }));

      expect(result.filters).toContainEqual(itemFilter);
      expect(result.filters).toContainEqual(parsedFilter);
      expect(result.filters).toContainEqual(allServicesFilter);
    });
  });
});
