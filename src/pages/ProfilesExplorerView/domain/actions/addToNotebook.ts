import { BusEventWithPayload, type DateTime, rangeUtil } from '@grafana/data';
import { t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { SceneDataTransformer, sceneGraph, SceneQueryRunner, type VizPanel } from '@grafana/scenes';

import { getExploreUrl } from '../../helpers/getExploreUrl';
import { type TimeSeriesQuery } from '../../infrastructure/timeseries/buildTimeSeriesQueryRunner';
import { getPanelData } from './addToDashboard';

export const ADD_TO_NOTEBOOK_COMPONENT_ID = 'grafana/add-to-notebook-form/v2';

export interface NotebookCapture {
  cells: Array<{ kind: 'markdown'; text: string }>;
  defaultTitle: string;
}

export interface AddToNotebookFormProps extends NotebookCapture {
  onClose: () => void;
  onAdded?: (notebook: { uid: string; title: string; url: string }) => void;
}

export class EventOpenAddToNotebook extends BusEventWithPayload<NotebookCapture> {
  public static readonly type = 'open-add-to-notebook';
}

export function canAddToNotebook(): boolean {
  const permissions = config.bootData.user.permissions;
  return Boolean(permissions?.['notebooks:create'] || permissions?.['notebooks:write']);
}

function captureBound(raw: DateTime | string, resolved: DateTime): string {
  if (rangeUtil.isRelativeTime(raw)) {
    return String(raw);
  }
  return (typeof raw === 'string' ? resolved : raw).toISOString();
}

export function captureNotebookContext(vizPanel: VizPanel): NotebookCapture | undefined {
  if (
    vizPanel.state.pluginId !== 'timeseries' ||
    !(vizPanel.state.$data instanceof SceneDataTransformer) ||
    !(vizPanel.state.$data.state.$data instanceof SceneQueryRunner)
  ) {
    return undefined;
  }
  const { panel, range } = getPanelData(vizPanel);
  const datasourceUid = typeof panel.datasource === 'object' ? panel.datasource?.uid : undefined;
  const target = panel.targets?.[0];
  if (
    !datasourceUid ||
    panel.targets?.length !== 1 ||
    target?.queryType !== 'metrics' ||
    typeof target.refId !== 'string' ||
    typeof target.profileTypeId !== 'string' ||
    typeof target.labelSelector !== 'string' ||
    !Array.isArray(target.groupBy) ||
    !target.groupBy.every((label) => typeof label === 'string')
  ) {
    return undefined;
  }
  const query: TimeSeriesQuery & { limit?: number } = {
    refId: target.refId,
    queryType: 'metrics',
    profileTypeId: target.profileTypeId,
    labelSelector: target.labelSelector,
    groupBy: [...target.groupBy],
    ...(typeof target.limit === 'number' && { limit: target.limit }),
  };
  const capturedTimeRange = {
    from: captureBound(range.raw.from, range.from),
    to: captureBound(range.raw.to, range.to),
    timeZone: sceneGraph.getTimeRange(vizPanel).getTimeZone(),
  };
  const context = JSON.stringify({ datasourceUid, query, capturedTimeRange }, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  const sourceUrl = getExploreUrl(capturedTimeRange, query, datasourceUid).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const title = t('notebook.context.title', 'Profiles Drilldown query context');
  const description = t(
    'notebook.context.description',
    'Context only: this is a query handoff, not a chart or captured profile. Custom transformations, exemplars, and flame graphs are not exported.'
  );
  const linkText = t('notebook.context.open-query', 'Open query in Explore');
  return {
    defaultTitle: title,
    cells: [{ kind: 'markdown', text: `${description}\n\n${context}\n\n[${linkText}](${sourceUrl})` }],
  };
}
