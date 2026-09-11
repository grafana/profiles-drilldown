import { SceneQueryRunner } from '@grafana/scenes';

import { SceneTracePanel } from '../SceneTracePanel';

jest.mock('../SceneExploreServiceHeatmap', () => ({
  SceneExploreServiceHeatmap: class SceneExploreServiceHeatmap {},
}));

describe('SceneTracePanel', () => {
  it('runs the Tempo query after updating the selected trace', () => {
    const panel = new SceneTracePanel();
    const queryRunner = panel.state.$data as SceneQueryRunner;
    const runQueries = jest.spyOn(queryRunner, 'runQueries').mockImplementation();

    (
      panel as unknown as {
        updateTrace(traceId: string | undefined, spanId: string | undefined, tempoUid: string | undefined): void;
      }
    ).updateTrace('trace-1', 'span-1', 'tempo-1');

    expect(queryRunner.state).toMatchObject({
      datasource: { type: 'tempo', uid: 'tempo-1' },
      queries: [{ refId: 'A', query: 'trace-1', queryType: 'traceql' }],
    });
    expect(runQueries).toHaveBeenCalledTimes(1);
  });
});
