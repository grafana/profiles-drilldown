import { css } from '@emotion/css';
import { GrafanaTheme2, MutableDataFrame } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  SceneComponentProps,
  SceneFlexItem,
  SceneFlexLayout,
  sceneGraph,
  SceneObject,
  SceneObjectBase,
  SceneObjectState,
} from '@grafana/scenes';
import { Drawer, useStyles2 } from '@grafana/ui';
import { quoteLabelName, quoteLabelValue } from '@shared/components/QueryBuilder/domain/helpers/quoteLabelName';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import React from 'react';

import { FiltersVariable } from '../../domain/variables/FiltersVariable/FiltersVariable';
import { ProfileMetricVariable } from '../../domain/variables/ProfileMetricVariable';
import { ProfilesDataSourceVariable } from '../../domain/variables/ProfilesDataSourceVariable';
import { ServiceNameVariable } from '../../domain/variables/ServiceNameVariable/ServiceNameVariable';
import { GridItemData } from '../SceneByVariableRepeaterGrid/types/GridItemData';
import {
  buildExemplarDataFrame,
  buildHeatmapDataFrame,
  ExemplarRow,
  extractExemplarRows,
} from './infrastructure/buildHeatmapDataFrames';
import {
  ExemplarType,
  HeatmapQueryType,
  selectHeatmap,
  SelectHeatmapRequest,
  SelectHeatmapResponse,
} from './infrastructure/HeatmapApiClient';
import { SceneExemplarTable } from './SceneExemplarTable';
import { SceneHeatmap } from './SceneHeatmap';
import { SceneTracePanel } from './SceneTracePanel';

interface SceneExploreServiceHeatmapState extends SceneObjectState {
  body: SceneFlexLayout;
  tracePanel: SceneTracePanel;
  isLoading: boolean;
  heatmapFrame?: MutableDataFrame;
  exemplarFrame?: MutableDataFrame;
  exemplarRows: ExemplarRow[];
  selectedSpanId?: string;
  selectedProfileId?: string;
  selectedTimestamp?: number;
  selectedTraceId?: string;
  tempoDataSourceUid?: string;
  embedded?: boolean;
}

export interface SpanHeatmapQuery {
  dataSourceUid: string;
  profileTypeId: string;
  request: SelectHeatmapRequest;
  signature: string;
}

export interface PrimedSpanHeatmapResponse {
  response: SelectHeatmapResponse;
  signature: string;
}

export class SceneExploreServiceHeatmap extends SceneObjectBase<SceneExploreServiceHeatmapState> {
  private fetchRequestId = 0;
  private primedResponse?: PrimedSpanHeatmapResponse;
  private onTempoDataSourceUidChange?: (tempoDataSourceUid?: string) => void;

  constructor({
    item,
    manageProfileMetricQuery = true,
    embedded = false,
    primedResponse,
    initialTempoDataSourceUid,
    onTempoDataSourceUidChange,
  }: {
    item?: GridItemData;
    manageProfileMetricQuery?: boolean;
    embedded?: boolean;
    primedResponse?: PrimedSpanHeatmapResponse;
    initialTempoDataSourceUid?: string;
    onTempoDataSourceUidChange?: (tempoDataSourceUid?: string) => void;
  }) {
    super({
      key: 'explore-service-heatmap',
      isLoading: false,
      heatmapFrame: undefined,
      exemplarFrame: undefined,
      exemplarRows: [],
      selectedSpanId: undefined,
      selectedProfileId: undefined,
      selectedTimestamp: undefined,
      selectedTraceId: undefined,
      tempoDataSourceUid: initialTempoDataSourceUid,
      embedded,
      tracePanel: new SceneTracePanel(),
      body: new SceneFlexLayout({
        direction: 'column',
        children: [
          new SceneFlexItem({ height: '400px', body: new SceneHeatmap() }),
          new SceneFlexItem({ minHeight: '200px', body: new SceneExemplarTable() }),
        ],
      }),
    });

    this.primedResponse = primedResponse;
    this.onTempoDataSourceUidChange = onTempoDataSourceUidChange;

    this.addActivationHandler(this.onActivate.bind(this, item, manageProfileMetricQuery));
  }

  primeWithResponse(primedResponse?: PrimedSpanHeatmapResponse) {
    this.primedResponse = primedResponse;
  }

  setTempoDataSourceUid(tempoDataSourceUid?: string) {
    this.setState({ tempoDataSourceUid, selectedTraceId: undefined });
    this.onTempoDataSourceUidChange?.(tempoDataSourceUid);
  }

  onActivate(item?: GridItemData, manageProfileMetricQuery = true) {
    if (item) {
      this.initVariables(item);
    }

    const profileMetricVariable = sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable);

    if (manageProfileMetricQuery) {
      profileMetricVariable.setState({ query: ProfileMetricVariable.QUERY_SERVICE_NAME_DEPENDENT });
      profileMetricVariable.update(true);
    }

    const timeRangeSub = sceneGraph.getTimeRange(this).subscribeToState(() => {
      this.fetchHeatmapData();
    });

    const dataSourceSub = sceneGraph
      .findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value !== prevState.value) {
          this.fetchHeatmapData();
        }
      });

    const serviceNameSub = sceneGraph
      .findByKeyAndType(this, 'serviceName', ServiceNameVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value !== prevState.value) {
          this.fetchHeatmapData();
        }
      });

    const profileMetricSub = profileMetricVariable.subscribeToState((newState, prevState) => {
      if (newState.value !== prevState.value) {
        this.fetchHeatmapData();
      }
    });

    const filtersSub = sceneGraph
      .findByKeyAndType(this, 'filters', FiltersVariable)
      .subscribeToState((newState, prevState) => {
        if (JSON.stringify(newState.filters) !== JSON.stringify(prevState.filters)) {
          this.fetchHeatmapData();
        }
      });

    this.fetchHeatmapData();

    return () => {
      timeRangeSub.unsubscribe();
      dataSourceSub.unsubscribe();
      serviceNameSub.unsubscribe();
      profileMetricSub.unsubscribe();
      filtersSub.unsubscribe();
      if (manageProfileMetricQuery) {
        profileMetricVariable.setState({ query: ProfileMetricVariable.QUERY_DEFAULT });
        profileMetricVariable.update(true);
      }
    };
  }

  initVariables(item: GridItemData) {
    const { serviceName, profileMetricId, filters } = item.queryRunnerParams;

    if (serviceName) {
      sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable).changeValueTo(serviceName);
    }

    if (profileMetricId) {
      sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable).changeValueTo(profileMetricId);
    }

    if (filters) {
      sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable).setState({ filters });
    }
  }

  async fetchHeatmapData() {
    const requestId = ++this.fetchRequestId;
    const spanHeatmapQuery = buildSpanHeatmapQuery(this);

    if (!spanHeatmapQuery) {
      this.setState({ isLoading: false, heatmapFrame: undefined, exemplarFrame: undefined, exemplarRows: [] });
      return;
    }

    if (this.primedResponse?.signature === spanHeatmapQuery.signature) {
      const heatmapState = buildSpanHeatmapState(
        this.primedResponse.response,
        spanHeatmapQuery.profileTypeId,
        spanHeatmapQuery.request.step
      );
      this.primedResponse = undefined;
      this.setState({ isLoading: false, ...heatmapState });
      return;
    }

    this.setState({ isLoading: true });

    try {
      const response = await selectHeatmap(spanHeatmapQuery.dataSourceUid, spanHeatmapQuery.request);
      const heatmapState = buildSpanHeatmapState(response, spanHeatmapQuery.profileTypeId, spanHeatmapQuery.request.step);

      if (requestId !== this.fetchRequestId) {
        return;
      }

      this.setState({ isLoading: false, ...heatmapState });
    } catch {
      if (requestId !== this.fetchRequestId) {
        return;
      }

      this.setState({ isLoading: false, heatmapFrame: undefined, exemplarFrame: undefined, exemplarRows: [] });
    }
  }

  getVariablesAndGridControls() {
    return {
      variables: [
        sceneGraph.findByKeyAndType(this, 'serviceName', ServiceNameVariable),
        sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable),
        sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable),
      ],
      gridControls: [],
    };
  }

  static Component({ model }: SceneComponentProps<SceneExploreServiceHeatmap>) {
    const styles = useStyles2(getStyles);
    const { body, tracePanel, selectedTraceId, embedded } = model.useState();

    const traceDrawer = selectedTraceId && tracePanel && (
      <Drawer
        title={t('heatmap.trace-drawer.title', 'Trace {{traceId}}', { traceId: selectedTraceId })}
        size="lg"
        scrollableContent={false}
        onClose={() => model.setState({ selectedTraceId: undefined })}
      >
        <tracePanel.Component model={tracePanel} />
      </Drawer>
    );

    return (
      <div className={embedded ? styles.flexEmbedded : styles.flex}>
        <body.Component model={body} />
        {traceDrawer}
      </div>
    );
  }
}

export function buildSpanHeatmapQuery(scene: SceneObject): SpanHeatmapQuery | undefined {
  const dataSourceUid = sceneGraph.interpolate(scene, '$dataSource');
  const serviceName = sceneGraph.interpolate(scene, '$serviceName');
  const profileTypeId = sceneGraph.interpolate(scene, '$profileMetricId');

  if (!dataSourceUid || !serviceName || !profileTypeId) {
    return undefined;
  }

  const filtersVar = sceneGraph.findByKeyAndType(scene, 'filters', FiltersVariable);
  const filters = filtersVar.state.filters ?? [];
  const completeFilters = [{ key: 'service_name', operator: '=', value: serviceName }, ...filters];
  const labelSelector = `{${completeFilters
    .map(({ key, operator, value }) => `${quoteLabelName(key)}${operator}${quoteLabelValue(value)}`)
    .join(',')}}`;
  const timeRange = sceneGraph.getTimeRange(scene).state.value;
  const start = timeRange.from.valueOf();
  const end = timeRange.to.valueOf();
  const durationSec = (end - start) / 1000;
  const request: SelectHeatmapRequest = {
    profileTypeID: profileTypeId,
    labelSelector,
    start,
    end,
    step: Math.max(1, Math.ceil(durationSec / 64)),
    groupBy: [],
    queryType: HeatmapQueryType.SPAN,
    exemplarType: ExemplarType.SPAN,
  };

  return {
    dataSourceUid,
    profileTypeId,
    request,
    signature: JSON.stringify({ dataSourceUid, request }),
  };
}

function buildSpanHeatmapState(response: SelectHeatmapResponse, profileTypeId: string, stepSeconds: number) {
  const { unit } = getProfileMetric(profileTypeId as ProfileMetricId);
  const series = response.series?.[0];

  return {
    heatmapFrame: series ? buildHeatmapDataFrame(series, unit, undefined, stepSeconds * 1000) ?? undefined : undefined,
    exemplarFrame: buildExemplarDataFrame(response, unit) ?? undefined,
    exemplarRows: extractExemplarRows(response),
  };
}

export function hasSpanProfiles(response: SelectHeatmapResponse): boolean {
  return extractExemplarRows(response).length > 0;
}

const getStyles = (theme: GrafanaTheme2) => ({
  flexEmbedded: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: ${theme.spacing(1)};
  `,
  flex: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: ${theme.spacing(1)};
  `,
});
