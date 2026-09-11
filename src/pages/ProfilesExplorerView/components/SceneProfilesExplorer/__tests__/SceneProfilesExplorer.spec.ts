import { sceneGraph } from '@grafana/scenes';

import { SceneExploreServiceFlameGraph } from '../../SceneExploreServiceFlameGraph/SceneExploreServiceFlameGraph';
import { ExplorationType, SceneProfilesExplorer } from '../SceneProfilesExplorer';

jest.mock('../../SceneByVariableRepeaterGrid/components/SceneEmptyState/ui/img/grot-404-dark.svg', () => 'grot-404-dark.svg');
jest.mock('../../SceneByVariableRepeaterGrid/components/SceneEmptyState/ui/img/grot-404-light.svg', () => 'grot-404-light.svg');
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
  getProfilesHeatmapFromOpenFeature: () => true,
}));

describe('SceneProfilesExplorer', () => {
  it('syncs span heatmap URL state without rebuilding the flame graph scene', () => {
    const explorer = new SceneProfilesExplorer({});
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
