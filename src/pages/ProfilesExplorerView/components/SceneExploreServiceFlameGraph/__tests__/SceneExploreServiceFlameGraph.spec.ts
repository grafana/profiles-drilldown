import { AdHocVariableFilter } from '@grafana/data';
import { sceneGraph } from '@grafana/scenes';

import type { SceneExploreServiceHeatmap } from '../../SceneExploreServiceHeatmap/SceneExploreServiceHeatmap';
import { SceneExploreServiceFlameGraph } from '../SceneExploreServiceFlameGraph';

jest.mock('@shared/infrastructure/featureFlags/featureFlags', () => ({
  getProfilesHeatmapFromOpenFeature: () => true,
}));

jest.mock('../../../domain/variables/FiltersVariable/FiltersVariable', () => ({
  FiltersVariable: class FiltersVariable {},
}));

jest.mock('../../../domain/variables/FiltersVariable/AllServicesFilterVariable', () => ({
  AllServicesFilterVariable: class AllServicesFilterVariable {},
}));

jest.mock('../SceneFlameGraph', () => {
  const { SceneObjectBase } = jest.requireActual('@grafana/scenes');

  return {
    SceneFlameGraph: class SceneFlameGraph extends SceneObjectBase {
      constructor() {
        super({});
      }
    },
  };
});

jest.mock('../../SceneMainServiceTimeseries', () => {
  const { SceneObjectBase } = jest.requireActual('@grafana/scenes');

  return {
    SceneMainServiceTimeseries: class SceneMainServiceTimeseries extends SceneObjectBase {
      static MIN_HEIGHT = 0;

      constructor() {
        super({});
      }
    },
  };
});

describe('SceneExploreServiceFlameGraph', () => {
  it('clears the selected span when switching from span heatmap to time series', () => {
    const scene = new SceneExploreServiceFlameGraph({});
    const clearSpanProfileSelection = jest.spyOn(scene, 'clearSpanProfileSelection').mockImplementation();
    jest.spyOn(scene, 'probeSpanAvailability').mockImplementation();

    scene.setState({ showSpanHeatmap: true });
    scene.closeSpanHeatmapMode();

    expect(clearSpanProfileSelection).toHaveBeenCalledTimes(1);
    expect(scene.state.showSpanHeatmap).toBe(false);
  });

  it('switches from span heatmap to time series when the service changes', () => {
    const onShowSpanHeatmapChange = jest.fn();
    const scene = new SceneExploreServiceFlameGraph({ onShowSpanHeatmapChange });
    const clearSpanProfileSelection = jest.spyOn(scene, 'clearSpanProfileSelection').mockImplementation();
    const probeSpanAvailability = jest.spyOn(scene, 'probeSpanAvailability').mockImplementation();

    scene.setState({ showSpanHeatmap: true });
    scene.onServiceNameChange();

    expect(clearSpanProfileSelection).toHaveBeenCalledTimes(1);
    expect(scene.state.showSpanHeatmap).toBe(false);
    expect(scene.state.spanToggleAction.state.showSpanHeatmap).toBe(false);
    expect(onShowSpanHeatmapChange).toHaveBeenCalledWith(false);
    expect(probeSpanAvailability).toHaveBeenCalledTimes(1);
  });

  it('refreshes the open heatmap when the Pyroscope datasource changes', () => {
    const scene = new SceneExploreServiceFlameGraph({});
    const clearSpanProfileSelection = jest.spyOn(scene, 'clearSpanProfileSelection').mockImplementation();
    const fetchHeatmapData = jest.fn();

    scene.setState({
      showSpanHeatmap: true,
      spanHeatmap: { fetchHeatmapData } as unknown as SceneExploreServiceHeatmap,
    });
    scene.onDataSourceChange();

    expect(clearSpanProfileSelection).toHaveBeenCalledTimes(1);
    expect(fetchHeatmapData).toHaveBeenCalledTimes(1);
  });

  it('refetches the heatmap for the current service when reopening an existing heatmap', () => {
    const scene = new SceneExploreServiceFlameGraph({});
    jest.spyOn(scene, 'getPrimedSpanHeatmapResponse').mockReturnValue(undefined);

    const spanHeatmap = {
      primeWithResponse: jest.fn(),
      fetchHeatmapData: jest.fn(),
      setState: jest.fn(),
      subscribeToState: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    };

    scene.setState({ spanHeatmap: spanHeatmap as unknown as SceneExploreServiceHeatmap });

    scene.openSpanHeatmapMode();

    expect(spanHeatmap.primeWithResponse).toHaveBeenCalledTimes(1);
    // Re-priming alone doesn't refetch: without an explicit fetchHeatmapData call here,
    // reopening an existing heatmap after switching services would keep showing the
    // previous service's data.
    expect(spanHeatmap.fetchHeatmapData).toHaveBeenCalledTimes(1);
  });

  it('opens span heatmap from URL state without recreating the scene', () => {
    const scene = new SceneExploreServiceFlameGraph({});
    const probeSpanAvailability = jest.spyOn(scene, 'probeSpanAvailability').mockImplementation();

    scene.syncSpanHeatmapFromUrl(true);

    expect(probeSpanAvailability).toHaveBeenCalledWith(true);
  });

  it('closes an open span heatmap from URL state', () => {
    const scene = new SceneExploreServiceFlameGraph({});
    const closeSpanHeatmapMode = jest.spyOn(scene, 'closeSpanHeatmapMode').mockImplementation();
    scene.setState({ showSpanHeatmap: true });

    scene.syncSpanHeatmapFromUrl(false);

    expect(closeSpanHeatmapMode).toHaveBeenCalledTimes(1);
  });

  describe('onActivate / deactivate filter cleanup', () => {
    function makeFilter(key: string, operator: string, value: string): AdHocVariableFilter {
      return { key, operator, value };
    }

    function createMockFiltersVariable(initialFilters: AdHocVariableFilter[] = []) {
      return {
        state: { filters: [...initialFilters] },
        setState(update: { filters: AdHocVariableFilter[] }) {
          this.state = { ...this.state, ...update };
        },
        updateFilters(filters: AdHocVariableFilter[]) {
          this.state.filters = filters;
        },
        subscribeToState: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      };
    }

    function createMockProfileMetricVariable() {
      return {
        state: { query: '' },
        setState(update: any) {
          this.state = { ...this.state, ...update };
        },
        update: jest.fn(),
        subscribeToState: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      };
    }

    let scene: SceneExploreServiceFlameGraph;
    let filtersVariable: ReturnType<typeof createMockFiltersVariable>;
    let allServicesFiltersVariable: ReturnType<typeof createMockFiltersVariable>;
    let profileMetricVariable: ReturnType<typeof createMockProfileMetricVariable>;

    beforeEach(() => {
      filtersVariable = createMockFiltersVariable();
      allServicesFiltersVariable = createMockFiltersVariable();
      profileMetricVariable = createMockProfileMetricVariable();

      const changeableVariableStub = { changeValueTo: jest.fn(), subscribeToState: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }) };

      jest.spyOn(sceneGraph, 'findByKeyAndType').mockImplementation((_obj: any, key: string) => {
        const mocks: Record<string, any> = {
          filtersAllServices: allServicesFiltersVariable,
          filters: filtersVariable,
          profileMetricId: profileMetricVariable,
          serviceName: changeableVariableStub,
          profileIdSelector: changeableVariableStub,
          spanSelector: changeableVariableStub,
          dataSource: changeableVariableStub,
        };
        return mocks[key];
      });

      jest.spyOn(sceneGraph, 'getTimeRange').mockReturnValue({
        state: { value: { from: 0, to: 0 } },
        subscribeToState: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      } as any);

      scene = new SceneExploreServiceFlameGraph({});
    });

    it('copies allServicesFilters into filtersVariable on activate', () => {
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      allServicesFiltersVariable.state.filters = [allServicesFilter];

      scene.onActivate();

      expect(filtersVariable.state.filters).toContainEqual(allServicesFilter);
    });

    it('merges allServicesFilters with existing filters on activate', () => {
      const existingFilter = makeFilter('env', '=', 'prod');
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      filtersVariable.state.filters = [existingFilter];
      allServicesFiltersVariable.state.filters = [allServicesFilter];

      scene.onActivate();

      expect(filtersVariable.state.filters).toContainEqual(existingFilter);
      expect(filtersVariable.state.filters).toContainEqual(allServicesFilter);
    });

    it('does not modify filtersVariable when allServicesFilters is empty', () => {
      const existingFilter = makeFilter('env', '=', 'prod');
      filtersVariable.state.filters = [existingFilter];
      allServicesFiltersVariable.state.filters = [];

      scene.onActivate();

      expect(filtersVariable.state.filters).toEqual([existingFilter]);
    });

    it('removes allServicesFilters from filtersVariable on deactivate', () => {
      const userFilter = makeFilter('env', '=', 'prod');
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      allServicesFiltersVariable.state.filters = [allServicesFilter];
      filtersVariable.state.filters = [userFilter];

      const deactivate = scene.onActivate()!;

      // filtersVariable now has both
      expect(filtersVariable.state.filters).toContainEqual(allServicesFilter);
      expect(filtersVariable.state.filters).toContainEqual(userFilter);

      deactivate();

      expect(filtersVariable.state.filters).toEqual([userFilter]);
    });

    it('preserves user-added filters on deactivate', () => {
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      const userFilter1 = makeFilter('env', '=', 'prod');
      const userFilter2 = makeFilter('team', '=', 'backend');
      allServicesFiltersVariable.state.filters = [allServicesFilter];

      const deactivate = scene.onActivate()!;

      // Simulate user adding filters while the scene is active
      filtersVariable.state.filters = [allServicesFilter, userFilter1, userFilter2];

      deactivate();

      expect(filtersVariable.state.filters).toContainEqual(userFilter1);
      expect(filtersVariable.state.filters).toContainEqual(userFilter2);
      expect(filtersVariable.state.filters).not.toContainEqual(allServicesFilter);
    });

    it('removes all allServicesFilters when there are multiple', () => {
      const allServicesFilter1 = makeFilter('region', '=', 'us-east');
      const allServicesFilter2 = makeFilter('cluster', '=', 'prod-1');
      const userFilter = makeFilter('env', '=', 'prod');
      allServicesFiltersVariable.state.filters = [allServicesFilter1, allServicesFilter2];
      filtersVariable.state.filters = [userFilter];

      const deactivate = scene.onActivate()!;

      expect(filtersVariable.state.filters).toHaveLength(3);

      deactivate();

      expect(filtersVariable.state.filters).toEqual([userFilter]);
    });

    it('results in empty filters when all filters came from allServicesFilters', () => {
      const allServicesFilter = makeFilter('region', '=', 'us-east');
      allServicesFiltersVariable.state.filters = [allServicesFilter];

      const deactivate = scene.onActivate()!;

      deactivate();

      expect(filtersVariable.state.filters).toEqual([]);
    });
  });
});
