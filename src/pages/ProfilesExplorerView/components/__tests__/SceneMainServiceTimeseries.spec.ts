import { PanelType } from '../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { GridItemData } from '../SceneByVariableRepeaterGrid/types/GridItemData';
import { SceneMainServiceTimeseries } from '../SceneMainServiceTimeseries';

jest.mock('../../domain/variables/FiltersVariable/FiltersVariable', () => ({
  FiltersVariable: class FiltersVariable {},
}));

jest.mock('../SceneLabelValuesTimeseries/SceneLabelValuesTimeseries', () => {
  const { SceneObjectBase } = jest.requireActual('@grafana/scenes');

  return {
    SceneLabelValuesTimeseries: class SceneLabelValuesTimeseries extends SceneObjectBase {
      constructor() {
        super({});
      }
    },
  };
});

// NOTE: plain (non-jest.fn) functions are used below because the jest config sets
// `resetMocks: true`, which would otherwise wipe implementations defined in this
// module factory before each test runs.
jest.mock('@grafana/scenes', () => {
  const actual = jest.requireActual('@grafana/scenes');

  return {
    ...actual,
    sceneGraph: {
      ...actual.sceneGraph,
      findByKeyAndType: () => ({
        subscribeToState: () => ({ unsubscribe: () => {} }),
        state: { value: '' },
        changeValueTo: () => {},
        reset: () => {},
      }),
    },
  };
});

const item: GridItemData = {
  index: 0,
  value: 'my-service',
  label: 'my-service',
  panelType: PanelType.TIMESERIES,
  queryRunnerParams: { serviceName: 'my-service' },
};

describe('SceneMainServiceTimeseries', () => {
  it('only seeds variables from the construction-time item on first activation', () => {
    const scene = new SceneMainServiceTimeseries({ item, headerActions: () => [] });
    const initVariables = jest.spyOn(scene, 'initVariables').mockImplementation();

    // Simulate the remount that happens when the span heatmap panel is toggled.
    scene.onActivate(item);
    scene.onActivate(item);

    // Re-running initVariables on remount would revert user-driven changes
    // (e.g. the selected service) back to the original item's values.
    expect(initVariables).toHaveBeenCalledTimes(1);
  });
});
