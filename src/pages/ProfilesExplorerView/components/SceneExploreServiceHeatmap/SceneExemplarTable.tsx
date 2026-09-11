import { css } from '@emotion/css';
import { DataSourceJsonData, getValueFormat, GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { getDataSourceSrv } from '@grafana/runtime';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Column, Field as FormField, IconButton, InteractiveTable, Pagination, Select, Spinner, useStyles2 } from '@grafana/ui';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { reportInteraction } from '@shared/domain/reportInteraction';
import React, { useMemo } from 'react';

import { EventViewServiceFlameGraph } from '../../domain/events/EventViewServiceFlameGraph';
import { FiltersVariable } from '../../domain/variables/FiltersVariable/FiltersVariable';
import { ProfileIdSelectorVariable } from '../../domain/variables/ProfileIdSelectorVariable';
import { ProfilesDataSourceVariable } from '../../domain/variables/ProfilesDataSourceVariable';
import { SpanSelectorVariable } from '../../domain/variables/SpanSelectorVariable';
import { PanelType } from '../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { buildUnitFormatter } from '../SceneExploreServiceFlameGraph/components/SceneFunctionDetailsPanel/domain/buildUnitFormatter';
import { CopyableId } from './components/CopyableId';
import { getDisplayedExemplarRows } from './domain/getDisplayedExemplarRows';
import { getVisiblePageRows, uniqueSpanTimestamps } from './domain/getVisiblePageSpans';
import { SpanTimestamp } from './domain/mergeSpanTraceWindows';
import { selectTempoDataSourceUid, TempoDataSourceOption } from './domain/selectTempoDataSourceUid';
import { ExemplarRow } from './infrastructure/buildHeatmapDataFrames';
import { lookupTempoTraceInfo, TraceInfo } from './infrastructure/lookupTempoTraceInfo';
import { SceneExploreServiceHeatmap } from './SceneExploreServiceHeatmap';

const PAGE_SIZE = 5;

interface SceneExemplarTableState extends SceneObjectState {
  rows: ExemplarRow[];
  traceInfoBySpanId: Record<string, TraceInfo | null>;
  loadingSpanIds: string[];
  tempoDatasources: TempoDataSourceOption[];
  traceLookupFailed: boolean;
  page: number;
}

interface TempoDataSourceJsonData extends DataSourceJsonData {
  tracesToProfiles?: {
    datasourceUid?: string;
  };
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

export class SceneExemplarTable extends SceneObjectBase<SceneExemplarTableState> {
  private traceLookupRequestId = 0;

  constructor() {
    super({
      key: 'exemplar-table',
      rows: [],
      traceInfoBySpanId: {},
      loadingSpanIds: [],
      tempoDatasources: [],
      traceLookupFailed: false,
      page: 0,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    const allDatasources = getDataSourceSrv().getList({ pluginId: 'tempo' });
    const tempoDatasources = allDatasources.map((ds) => {
      const jsonData = ds.jsonData as TempoDataSourceJsonData;

      return {
        uid: ds.uid,
        name: ds.name,
        isDefault: ds.isDefault,
        tracesToProfilesDataSourceUid: jsonData.tracesToProfiles?.datasourceUid,
      };
    });
    this.setState({ tempoDatasources });

    let parent: SceneExploreServiceHeatmap | undefined;
    try {
      parent = sceneGraph.getAncestor(this, SceneExploreServiceHeatmap);
    } catch {
      return;
    }

    this.syncTempoDataSource(parent, tempoDatasources);

    const dataSourceSub = sceneGraph
      .findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable)
      .subscribeToState((newState, prevState) => {
        if (newState.value !== prevState.value) {
          this.syncTempoDataSource(parent!, tempoDatasources, true);
        }
      });

    const parentSub = parent.subscribeToState((newState, prevState) => {
      if (newState.exemplarRows !== prevState.exemplarRows) {
        this.handleNewExemplarRows(newState.exemplarRows);
        return;
      }

      if (newState.selectedSpanId !== prevState.selectedSpanId || newState.selectedTimestamp !== prevState.selectedTimestamp) {
        this.setPage(0, true);
      }
    });

    this.handleNewExemplarRows(parent.state.exemplarRows);

    return () => {
      parentSub.unsubscribe();
      dataSourceSub.unsubscribe();
    };
  }

  private syncTempoDataSource(
    parent: SceneExploreServiceHeatmap,
    tempoDatasources: TempoDataSourceOption[],
    preferLinkedDataSource = false
  ) {
    const profilesDataSourceUid = sceneGraph.interpolate(this, '$dataSource');
    const tempoDataSourceUid = selectTempoDataSourceUid(
      tempoDatasources,
      preferLinkedDataSource ? undefined : parent.state.tempoDataSourceUid,
      profilesDataSourceUid
    );
    if (tempoDataSourceUid !== parent.state.tempoDataSourceUid) {
      parent.setTempoDataSourceUid(tempoDataSourceUid);
    }
  }

  private handleNewExemplarRows(rows: ExemplarRow[]) {
    this.invalidateTraceInfo();
    this.setState({ rows, traceInfoBySpanId: {}, loadingSpanIds: [], traceLookupFailed: false, page: 0 });
    this.lookupVisibleSpans(rows, 0);
  }

  private invalidateTraceInfo() {
    this.traceLookupRequestId++;
  }

  /**
   * Sets the current table page and looks up trace info only for the span IDs
   * visible on that page, so Tempo lookups stay scoped to a handful of spans
   * instead of every exemplar.
   */
  setPage(page: number, lookupVisibleSpans = false) {
    if (page === this.state.page) {
      if (lookupVisibleSpans) {
        this.lookupVisibleSpans(this.state.rows, page);
      }
      return;
    }

    this.setState({ page });
    this.lookupVisibleSpans(this.state.rows, page);
  }

  private lookupVisibleSpans(rows: ExemplarRow[], page: number) {
    const parent = this.getParent();
    const { selectedSpanId, selectedTimestamp } = parent.state;
    const pageRows = getVisiblePageRows(rows, selectedSpanId, selectedTimestamp, page, PAGE_SIZE);
    const visibleSpans = uniqueSpanTimestamps(pageRows);

    const pendingSpans = visibleSpans.filter(
      (span) => !(span.spanId in this.state.traceInfoBySpanId) && !this.state.loadingSpanIds.includes(span.spanId)
    );

    if (this.getParent().state.tempoDataSourceUid && pendingSpans.length > 0) {
      this.lookupTraceInfo(pendingSpans);
    }
  }

  setTempoDataSourceUid(tempoDataSourceUid?: string) {
    const parent = this.getParent();
    if (tempoDataSourceUid === parent.state.tempoDataSourceUid) {
      return;
    }

    this.invalidateTraceInfo();

    this.setState({ traceInfoBySpanId: {}, loadingSpanIds: [], traceLookupFailed: false });
    parent.setTempoDataSourceUid(tempoDataSourceUid);

    if (tempoDataSourceUid) {
      this.lookupVisibleSpans(this.state.rows, this.state.page);
    }
  }

  lookupTraceInfo(spans: SpanTimestamp[]) {
    const tempoDataSourceUid = this.getParent().state.tempoDataSourceUid;
    if (!tempoDataSourceUid || spans.length === 0) {
      return;
    }

    const requestId = this.traceLookupRequestId;
    const requestTempoDataSourceUid = tempoDataSourceUid;
    const spanIds = spans.map((span) => span.spanId);

    this.setState({ loadingSpanIds: [...this.state.loadingSpanIds, ...spanIds] });

    (async () => {
      try {
        const { traceInfoBySpanId, failed } = await lookupTempoTraceInfo(tempoDataSourceUid, spans);

        if (
          requestId !== this.traceLookupRequestId ||
          requestTempoDataSourceUid !== this.getParent().state.tempoDataSourceUid
        ) {
          return;
        }

        this.setState({
          traceInfoBySpanId: { ...this.state.traceInfoBySpanId, ...traceInfoBySpanId },
          loadingSpanIds: this.state.loadingSpanIds.filter((id) => !spanIds.includes(id)),
          traceLookupFailed: failed,
        });
      } catch {
        if (
          requestId !== this.traceLookupRequestId ||
          requestTempoDataSourceUid !== this.getParent().state.tempoDataSourceUid
        ) {
          return;
        }

        this.setState({
          loadingSpanIds: this.state.loadingSpanIds.filter((id) => !spanIds.includes(id)),
          traceLookupFailed: true,
        });
      }
    })();
  }

  private getParent(): SceneExploreServiceHeatmap {
    return sceneGraph.getAncestor(this, SceneExploreServiceHeatmap);
  }

  openFlameGraph(profileId: string, spanId?: string, timestamp?: number) {
    let parent: SceneExploreServiceHeatmap | undefined;
    try {
      parent = sceneGraph.getAncestor(this, SceneExploreServiceHeatmap);
    } catch {}

    if (parent?.state.embedded) {
      if (spanId) {
        parent.setState({ selectedSpanId: spanId, selectedProfileId: profileId, selectedTimestamp: timestamp });
        return;
      }

      sceneGraph.findByKeyAndType(this, 'profileIdSelector', ProfileIdSelectorVariable).changeValueTo(profileId);
      sceneGraph.findByKeyAndType(this, 'spanSelector', SpanSelectorVariable).reset();
      return;
    }

    const serviceName = sceneGraph.interpolate(this, '$serviceName');
    const profileMetricId = sceneGraph.interpolate(this, '$profileMetricId');
    const filters = sceneGraph.findByKeyAndType(this, 'filters', FiltersVariable).state.filters ?? [];

    this.publishEvent(
      new EventViewServiceFlameGraph({
        item: {
          index: 0,
          value: serviceName,
          label: serviceName,
          panelType: PanelType.TIMESERIES,
          queryRunnerParams: {
            serviceName,
            profileMetricId,
            filters,
            profileIdSelector: profileId,
            spanSelector: spanId,
          },
        },
      }),
      true
    );
  }

  static Component({ model }: SceneComponentProps<SceneExemplarTable>) {
    const styles = useStyles2(getStyles);
    const { rows, traceInfoBySpanId, loadingSpanIds, tempoDatasources, traceLookupFailed, page } = model.useState();

    let selectedSpanId: string | undefined;
    let selectedTimestamp: number | undefined;
    let parent: SceneExploreServiceHeatmap | undefined;
    try {
      parent = sceneGraph.getAncestor(model, SceneExploreServiceHeatmap);
      const parentState = parent.useState();
      selectedSpanId = parentState.selectedSpanId;
      selectedTimestamp = parentState.selectedTimestamp;
    } catch {
      // outside expected parent hierarchy
    }
    const tempoDataSourceUid = parent?.state.tempoDataSourceUid;

    const dsOptions = tempoDatasources.map((ds: TempoDataSourceOption) => ({ label: ds.name, value: ds.uid }));

    const profileMetricId = sceneGraph.interpolate(model, '$profileMetricId');
    const { unit, description } = getProfileMetric(profileMetricId as ProfileMetricId);
    const displayedRows = useMemo(
      () => getDisplayedExemplarRows(rows, selectedSpanId, selectedTimestamp),
      [rows, selectedSpanId, selectedTimestamp]
    );
    const numberOfPages = Math.max(1, Math.ceil(displayedRows.length / PAGE_SIZE));
    const safePage = Math.min(page, numberOfPages - 1);
    const pageRows = useMemo(
      () => getVisiblePageRows(rows, selectedSpanId, selectedTimestamp, safePage, PAGE_SIZE),
      [rows, selectedSpanId, selectedTimestamp, safePage]
    );
    const columns = useMemo<Array<Column<ExemplarRow>>>(() => {
      const getRow = (props: { row: { original: ExemplarRow } }) => props.row.original;
      const formatter = buildUnitFormatter(unit);
      const formatValue = (value: number) => {
        const { text, suffix } = formatter(value, 2);
        return `${text}${suffix ?? ''}`;
      };
      const openTrace = (row: ExemplarRow, source: 'trace-id' | 'action') => {
        if (!parent || !row.spanId) {
          return;
        }
        reportInteraction('g_pyroscope_app_span_trace_opened', { source });
        parent.setState({
          selectedSpanId: row.spanId,
          selectedTimestamp: row.timestamp,
          selectedProfileId: row.profileId,
          selectedTraceId: traceInfoBySpanId[row.spanId]?.traceId,
        });
      };

      return [
        {
          id: 'timestamp',
          header: t('heatmap.exemplar-table.col-timestamp', 'Timestamp'),
          cell: (props) => formatTimestamp(getRow(props).timestamp),
        },
        {
          id: 'spanId',
          header: t('heatmap.exemplar-table.col-span-id', 'Span ID'),
          cell: (props) => {
            const row = getRow(props);
            return row.spanId ? (
              <CopyableId
                value={row.spanId}
                display={row.spanId.slice(0, 16) + (row.spanId.length > 16 ? '…' : '')}
              />
            ) : (
              t('common.not-available', '–')
            );
          },
        },
        {
          id: 'spanName',
          header: t('heatmap.exemplar-table.col-span-name', 'Span name'),
          cell: (props) => {
            const row = getRow(props);
            const traceInfo = row.spanId ? traceInfoBySpanId[row.spanId] : undefined;
            const isLoading = row.spanId ? loadingSpanIds.includes(row.spanId) : false;
            return row.spanName ?? traceInfo?.spanName ?? (isLoading ? <Spinner size="sm" /> : '–');
          },
        },
        {
          id: 'value',
          header: description || 'Value',
          cell: (props) => formatValue(getRow(props).value),
        },
        {
          id: 'duration',
          header: t('heatmap.exemplar-table.col-duration', 'Duration'),
          cell: (props) => {
            const row = getRow(props);
            const traceInfo = row.spanId ? traceInfoBySpanId[row.spanId] : undefined;
            const isLoading = row.spanId ? loadingSpanIds.includes(row.spanId) : false;
            if (traceInfo?.duration !== undefined) {
              const formatted = getValueFormat('ns')(traceInfo.duration, 2);
              return `${formatted.text}${formatted.suffix ?? ''}`;
            }
            return isLoading ? <Spinner size="sm" /> : '–';
          },
        },
        {
          id: 'traceId',
          header: t('heatmap.exemplar-table.col-trace-id', 'Trace ID'),
          cell: (props) => {
            const row = getRow(props);
            if (!row.spanId) {
              return '–';
            }
            const traceInfo = traceInfoBySpanId[row.spanId];
            if (loadingSpanIds.includes(row.spanId)) {
              return <Spinner size="sm" />;
            }
            if (traceInfo) {
              return (
                <CopyableId
                  value={traceInfo.traceId}
                  display={`${traceInfo.traceId.slice(0, 7)}…`}
                  onOpen={() => openTrace(row, 'trace-id')}
                />
              );
            }
            return tempoDataSourceUid ? '–' : t('heatmap.exemplar-table.select-tempo', 'Select Tempo data source');
          },
        },
        {
          id: 'actions',
          header: t('heatmap.exemplar-table.col-actions', 'Actions'),
          disableGrow: true,
          cell: (props) => {
            const row = getRow(props);
            const traceInfo = row.spanId ? traceInfoBySpanId[row.spanId] : undefined;
            const isSelected = row.spanId === selectedSpanId && row.timestamp === selectedTimestamp;
            return (
              <div className={styles.actionsCell}>
                {row.spanId && (
                  <IconButton
                    name={isSelected ? 'times' : 'crosshair'}
                    tooltip={
                      isSelected
                        ? t('heatmap.exemplar-table.clear-selection', 'Clear exemplar selection')
                        : t('heatmap.exemplar-table.select-exemplar', 'Select exemplar')
                    }
                    size="sm"
                    onClick={() => {
                      reportInteraction('g_pyroscope_app_span_exemplar_selected', {
                        source: 'table',
                        selected: !isSelected,
                      });
                      parent?.setState({
                        selectedSpanId: isSelected ? undefined : row.spanId,
                        selectedProfileId: isSelected ? undefined : row.profileId,
                        selectedTimestamp: isSelected ? undefined : row.timestamp,
                      });
                    }}
                  />
                )}
                <IconButton
                  name="fire"
                  tooltip={t('heatmap.exemplar-table.open-flamegraph', 'Open flame graph')}
                  size="sm"
                  onClick={() => model.openFlameGraph(row.profileId, row.spanId, row.timestamp)}
                />
                {row.spanId && traceInfo && (
                  <IconButton
                    name="compass"
                    tooltip={t('heatmap.exemplar-table.open-trace', 'Open trace')}
                    size="sm"
                    onClick={() => openTrace(row, 'action')}
                  />
                )}
              </div>
            );
          },
        },
      ];
    }, [
      description,
      loadingSpanIds,
      model,
      parent,
      selectedSpanId,
      selectedTimestamp,
      styles.actionsCell,
      tempoDataSourceUid,
      traceInfoBySpanId,
      unit,
    ]);

    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>{t('heatmap.exemplar-table.title', 'Top span exemplars')}</span>
          <div className={styles.picker}>
            <FormField
              label={t('heatmap.exemplar-table.tempo-datasource', 'Tempo data source')}
              className={styles.pickerField}
            >
              <Select
                className={styles.pickerSelect}
                options={dsOptions}
                value={tempoDataSourceUid ?? null}
                onChange={(option) => {
                  model.setTempoDataSourceUid(option?.value ?? undefined);
                }}
                placeholder={t('heatmap.exemplar-table.tempo-placeholder', 'Select Tempo data source…')}
                isClearable
              />
            </FormField>
          </div>
        </div>

        {traceLookupFailed && (
          <div className={styles.lookupError}>
            {t('heatmap.exemplar-table.trace-lookup-failed', 'Unable to load trace details from Tempo.')}
          </div>
        )}

        {displayedRows.length === 0 ? (
          <div className={styles.empty}>
            {t('heatmap.exemplar-table.empty', 'No span exemplars in the selected time range.')}
          </div>
        ) : (
          <>
            <InteractiveTable
              className={selectedSpanId ? styles.selectedTable : styles.table}
              columns={columns}
              data={pageRows}
              getRowId={(row) => `${row.profileId}-${row.spanId ?? 'no-span'}-${row.timestamp}`}
            />
            <div className={styles.pagination}>
              <Pagination
                currentPage={safePage + 1}
                numberOfPages={numberOfPages}
                onNavigate={(toPage) => model.setPage(toPage - 1)}
                hideWhenSinglePage
              />
            </div>
          </>
        )}
      </div>
    );
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: ${theme.colors.background.primary};
  `,
  header: css`
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: ${theme.spacing(2)};
    padding: ${theme.spacing(1, 2)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  title: css`
    font-size: ${theme.typography.h6.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    white-space: nowrap;
  `,
  picker: css`
    flex: 0 0 ${theme.spacing(40)};
    min-width: ${theme.spacing(32)};
  `,
  pickerField: css`
    margin-bottom: 0;

    label {
      white-space: nowrap;
    }
  `,
  pickerSelect: css`
    min-width: ${theme.spacing(32)};

    & * {
      white-space: nowrap;
    }
  `,
  table: css`
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  selectedTable: css`
    font-size: ${theme.typography.bodySmall.fontSize};

    tbody tr {
      background: ${theme.colors.action.selected};
      outline: 1px solid ${theme.colors.primary.border};
      outline-offset: -1px;
    }
  `,
  lookupError: css`
    color: ${theme.colors.error.text};
    padding: ${theme.spacing(1, 2)};
  `,
  actionsCell: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  empty: css`
    padding: ${theme.spacing(4)};
    text-align: center;
    color: ${theme.colors.text.secondary};
    font-style: italic;
  `,
  pagination: css`
    display: flex;
    justify-content: center;
    padding: ${theme.spacing(1)};
    flex-shrink: 0;
  `,
});
