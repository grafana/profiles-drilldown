import { css } from '@emotion/css';
import { GrafanaTheme2, LoadingState } from '@grafana/data';
import {
  PanelBuilders,
  SceneComponentProps,
  sceneGraph,
  SceneObject,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
} from '@grafana/scenes';
import { Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';

import { SceneExploreServiceHeatmap } from './SceneExploreServiceHeatmap';

interface SceneTracePanelState extends SceneObjectState {
  panel?: SceneObject;
  isLoading: boolean;
  error?: string;
}

export class SceneTracePanel extends SceneObjectBase<SceneTracePanelState> {
  private queryRunner: SceneQueryRunner;

  constructor() {
    const queryRunner = new SceneQueryRunner({
      datasource: { type: 'tempo', uid: '' },
      queries: [],
    });

    super({
      key: 'scene-trace-panel',
      $data: queryRunner,
      isLoading: false,
    });

    this.queryRunner = queryRunner;
    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    let parent: SceneExploreServiceHeatmap | undefined;
    try {
      parent = sceneGraph.getAncestor(this, SceneExploreServiceHeatmap);
    } catch {
      return;
    }

    const dataSub = this.queryRunner.subscribeToState((dataState) => {
      if (dataState.data?.state === LoadingState.Loading) {
        this.setState({ isLoading: true, error: undefined });
      } else if (dataState.data?.state === LoadingState.Done) {
        this.setState({ isLoading: false, panel: this.buildPanel(parent!.state.selectedSpanId) });
      } else if (dataState.data?.state === LoadingState.Error) {
        const traceId = parent!.state.selectedTraceId;
        this.setState({
          isLoading: false,
          error: `Trace with ID "${traceId}" couldn't be found.`,
          panel: undefined,
        });
      }
    });

    // Initialise immediately from current parent state
    this.updateTrace(parent.state.selectedTraceId, parent.state.selectedSpanId, parent.state.tempoDataSourceUid);

    const parentSub = parent.subscribeToState((newState, prevState) => {
      if (
        newState.selectedTraceId !== prevState.selectedTraceId ||
        newState.selectedSpanId !== prevState.selectedSpanId ||
        newState.tempoDataSourceUid !== prevState.tempoDataSourceUid
      ) {
        this.updateTrace(newState.selectedTraceId, newState.selectedSpanId, newState.tempoDataSourceUid);
      }
    });

    return () => {
      dataSub.unsubscribe();
      parentSub.unsubscribe();
    };
  }

  private buildPanel(spanId?: string): SceneObject {
    const panel = PanelBuilders.traces().setHoverHeader(true);
    if (spanId) {
      // `@grafana/scenes` mistypes `PanelBuilders.traces()` as the Trend panel options, so
      // `focusedSpanId` (a Traces panel option) isn't on the builder's key type. Narrow to a
      // structural type instead of casting to `any` to keep the id/value strongly typed.
      (panel as unknown as { setOption(id: 'focusedSpanId', value: string): unknown }).setOption(
        'focusedSpanId',
        spanId
      );
    }
    return panel.build();
  }

  private updateTrace(traceId: string | undefined, spanId: string | undefined, tempoUid: string | undefined) {
    if (!traceId || !tempoUid) {
      this.setState({ panel: undefined, isLoading: false, error: undefined });
      return;
    }

    this.queryRunner.setState({
      datasource: { type: 'tempo', uid: tempoUid },
      queries: [{ refId: 'A', query: traceId, queryType: 'traceql' }],
    });
    this.queryRunner.runQueries();
  }

  static Component({ model }: SceneComponentProps<SceneTracePanel>) {
    const { panel, isLoading, error } = model.useState();
    const styles = useStyles2(getStyles);

    if (isLoading) {
      return (
        <div className={styles.centerContainer}>
          <Spinner size="xl" />
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.centerContainer}>
          <div className={styles.error}>{error}</div>
        </div>
      );
    }

    if (!panel) {
      return null;
    }

    return (
      <div className={styles.panelContainer}>
        <panel.Component model={panel} />
      </div>
    );
  }
}

function getStyles(theme: GrafanaTheme2) {
  return {
    panelContainer: css({
      display: 'flex',
      height: '100%',
      '& [data-testid="data-testid panel content"] > div': {
        overflow: 'auto',
      },
      '& .show-on-hover': {
        display: 'none',
      },
    }),
    centerContainer: css({
      display: 'flex',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    }),
    error: css({
      color: theme.colors.error.text,
      fontSize: theme.typography.body.fontSize,
    }),
  };
}
