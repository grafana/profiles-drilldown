import { dateTime, TimeRange } from '@grafana/data';
import { EmbeddedScene, SceneCanvasText } from '@grafana/scenes';
import { getSelectedDefaultDataSource } from '@shared/infrastructure/datasource/useSelectDefaultDataSourceUid';
import {
  DrilldownQuerySession,
  registerQuerySession,
} from '@shared/infrastructure/query-session/DrilldownQuerySession';

import { SeriesDataSource } from '../SeriesDataSource';

jest.mock('@shared/infrastructure/datasource/useSelectDefaultDataSourceUid', () => ({
  getSelectedDefaultDataSource: jest.fn(),
}));
jest.mock('../helpers/safeInterpolate', () => ({ safeInterpolate: () => '' }));

const range: TimeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: '1000', to: '2000' } };

function setup() {
  const scene = new EmbeddedScene({ body: new SceneCanvasText({ text: '' }) });
  const session = new DrilldownQuerySession();
  registerQuerySession(scene, session);
  const series = jest.spyOn(session, 'series').mockResolvedValue({ services: new Map(), profileMetrics: new Map() });
  return { scene, series };
}

describe('SeriesDataSource', () => {
  beforeEach(() => {
    jest.mocked(getSelectedDefaultDataSource).mockResolvedValue({ uid: 'pyroscope-xyz' } as any);
  });

  it('uses the scene-owned session', async () => {
    const { scene, series } = setup();
    await new SeriesDataSource().fetchSeries('pyroscope-abc', range, scene);
    expect(series).toHaveBeenCalledWith('pyroscope-abc', expect.any(Number), expect.any(Number), []);
  });

  it('falls back to the selected default datasource', async () => {
    const { scene, series } = setup();
    await new SeriesDataSource().metricFindQuery('$dataSource $filtersAllServices and all services', {
      range,
      scopedVars: { __sceneObject: { valueOf: () => scene } },
    } as any);
    expect(series).toHaveBeenCalledWith('pyroscope-xyz', expect.any(Number), expect.any(Number), ['{}']);
  });
});
