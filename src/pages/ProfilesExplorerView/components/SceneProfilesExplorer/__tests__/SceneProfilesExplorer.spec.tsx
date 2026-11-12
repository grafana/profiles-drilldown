import { dateTime } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { sceneGraph, UrlSyncContextProvider } from '@grafana/scenes';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { buildProfilesExplorationFromState } from 'src/exposedComponents/EmbeddedProfilesExploration/EmbeddedProfilesExploration';

import { SceneExploreServiceFlameGraph } from '../../SceneExploreServiceFlameGraph/SceneExploreServiceFlameGraph';
import { ExplorationType, SceneProfilesExplorer } from '../SceneProfilesExplorer';

jest.mock('@grafana/runtime', () => {
  const runtime = jest.requireActual('@grafana/runtime');
  return { ...runtime, useLocationService: () => runtime.locationService };
});

jest.mock('../../SceneExploreDiffFlameGraph/SceneExploreDiffFlameGraph', () => {
  const { SceneObjectBase } = jest.requireActual('@grafana/scenes');

  return {
    SceneExploreDiffFlameGraph: class SceneExploreDiffFlameGraph extends SceneObjectBase {
      constructor() {
        super({});
      }
    },
  };
});
jest.mock('../../SceneExploreServiceFlameGraph/SceneFlameGraph', () => {
  const { SceneObjectBase } = jest.requireActual('@grafana/scenes');

  return {
    SceneFlameGraph: class SceneFlameGraph extends SceneObjectBase {
      constructor() {
        super({});
      }
    },
  };
});

jest.mock('@shared/infrastructure/featureFlags/featureFlags', () => ({
  getKgAnnotationsInPyroscopeFromOpenFeature: () => false,
}));

describe('SceneProfilesExplorer', () => {
  it.each([
    { initialExplorationType: 'flame-graph' as const, expected: ExplorationType.FLAME_GRAPH, stale: 'labels' },
    { initialExplorationType: undefined, expected: ExplorationType.LABELS, stale: 'flame-graph' },
  ])(
    'preserves embedded default $expected through provider initialization',
    ({ initialExplorationType, expected, stale }) => {
      locationService.replace(`/?pd-explorationType=${stale}&pd-showSpanHeatmap=true`);
      const explorer = buildProfilesExplorationFromState({
        initialDS: 'test-ds-uid',
        initialExplorationType,
        initialFilters: [{ key: 'service_name', operator: '=', value: 'api' }],
        initialTimeRange: {
          from: dateTime(1000),
          to: dateTime(2000),
          raw: { from: dateTime(1000), to: dateTime(2000) },
        },
      });

      const view = render(
        <MemoryRouter initialEntries={[locationService.getLocation()]}>
          <UrlSyncContextProvider namespace="pd" scene={explorer} updateUrlOnInit={false}>
            <span />
          </UrlSyncContextProvider>
        </MemoryRouter>
      );
      expect(explorer.state.explorationType).toBe(expected);
      expect(explorer.state.showSpanHeatmap).toBe(expected === ExplorationType.FLAME_GRAPH);
      view.unmount();
      locationService.replace('/');
    }
  );

  it('applies embedded defaults once while preserving heatmap state and subsequent navigation', () => {
    const explorer = new SceneProfilesExplorer({
      initialDS: 'test-ds-uid',
      initialExplorationType: 'flame-graph',
      initialFilters: [{ key: 'service_name', operator: '=', value: 'api' }],
    });
    explorer.updateFromUrl({ explorationType: 'labels', showSpanHeatmap: 'true' });
    expect(explorer.state.explorationType).toBe(ExplorationType.FLAME_GRAPH);
    expect(explorer.state.showSpanHeatmap).toBe(true);

    const body = explorer.state.body;
    explorer.updateFromUrl({ explorationType: 'flame-graph', showSpanHeatmap: 'true' });
    expect(explorer.state.body).toBe(body);

    explorer.updateFromUrl({ explorationType: 'labels' });
    expect(explorer.state.explorationType).toBe(ExplorationType.LABELS);
  });

  it('syncs span heatmap URL state without rebuilding the flame graph scene', () => {
    const explorer = new SceneProfilesExplorer({ initialDS: 'test-ds-uid' });
    const buildBodyScene = explorer.buildBodyScene(ExplorationType.FLAME_GRAPH);
    explorer.setState({ explorationType: ExplorationType.FLAME_GRAPH, body: buildBodyScene });

    const flameGraph = sceneGraph.findObject(explorer, (scene) => scene instanceof SceneExploreServiceFlameGraph);
    if (!(flameGraph instanceof SceneExploreServiceFlameGraph)) {
      throw new Error('Flame graph scene was not found');
    }

    const syncSpanHeatmapFromUrl = jest.spyOn(flameGraph, 'syncSpanHeatmapFromUrl').mockImplementation();
    const setExplorationType = jest.spyOn(explorer, 'setExplorationType');

    explorer.updateFromUrl({ showSpanHeatmap: 'true' });

    expect(syncSpanHeatmapFromUrl).toHaveBeenCalledWith(true);
    expect(setExplorationType).not.toHaveBeenCalled();
    expect(explorer.state.body).toBe(buildBodyScene);
  });
});
