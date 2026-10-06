import { DataFrame, DataQuery, DataQueryRequest, DataQueryResponse, dateTime, Field } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { lastValueFrom, Observable } from 'rxjs';

import { buildMetricSelector, findFakeMetricMapping, SERVICE_LABEL } from './metricsProfileTypeMap';

interface PrometheusInstantQuery extends DataQuery {
  expr: string;
  instant: boolean;
}

function addLabelValue(labelValues: Map<string, Set<string>>, labelName: string, value: unknown) {
  if (
    !value ||
    labelName === SERVICE_LABEL ||
    labelName === '__name__' ||
    labelName === 'Time' ||
    labelName === 'Value'
  ) {
    return;
  }

  const values = labelValues.get(labelName) ?? new Set<string>();
  values.add(String(value));
  labelValues.set(labelName, values);
}

function collectLongFormatLabelValues(labelValues: Map<string, Set<string>>, valueFields: Field[]) {
  for (const field of valueFields) {
    for (const [labelName, labelValue] of Object.entries(field.labels ?? {})) {
      addLabelValue(labelValues, labelName, labelValue);
    }
  }
}

function collectTableFormatLabelValues(labelValues: Map<string, Set<string>>, frame: DataFrame) {
  for (const field of frame.fields) {
    if (field.name === 'Value' || field.name === 'Time') {
      continue;
    }

    for (const value of field.values ?? []) {
      addLabelValue(labelValues, field.name, value);
    }
  }
}

// Handles both response shapes a Prometheus-compatible datasource may return for an instant query:
// one frame per series with labels on the value field ("long"), or one frame with a field per label ("table").
function collectLabelValues(frames: DataFrame[]): Map<string, string[]> {
  const labelValues = new Map<string, Set<string>>();

  for (const frame of frames) {
    const valueFields = frame.fields.filter((field: Field) => field.name !== 'Time');
    const hasLongFormatLabels = valueFields.some((field: Field) => field.labels);

    if (hasLongFormatLabels) {
      collectLongFormatLabelValues(labelValues, valueFields);
    } else {
      collectTableFormatLabelValues(labelValues, frame);
    }
  }

  const sortedLabelValues = new Map<string, string[]>();

  for (const [labelName, values] of labelValues) {
    sortedLabelValues.set(labelName, Array.from(values).sort());
  }

  return sortedLabelValues;
}

export function buildFakeLabelsSelector(
  serviceName: string | undefined,
  profileMetricId: string | undefined,
  extraLabelSelectors: string[] = []
): string | undefined {
  const mapping = findFakeMetricMapping(profileMetricId);

  if (!mapping) {
    return undefined;
  }

  const serviceSelector = serviceName ? [`${SERVICE_LABEL}="${serviceName}"`] : [];
  const extraSelector = [...serviceSelector, ...extraLabelSelectors].join(',');

  return buildMetricSelector(mapping.promMetric, extraSelector);
}

export async function queryFakeLabelValuesForSelector(
  dataSourceUid: string,
  selector: string,
  from: number,
  to: number
): Promise<Map<string, string[]>> {
  const dataSource = await getDataSourceSrv().get(dataSourceUid);

  const range = { from: dateTime(from), to: dateTime(to), raw: { from: dateTime(from), to: dateTime(to) } };

  const request: DataQueryRequest<PrometheusInstantQuery> = {
    requestId: `fake-profiles-labels-${selector}`,
    targets: [{ refId: 'A', expr: selector, instant: true, datasource: { uid: dataSourceUid } }],
    range,
    interval: '1m',
    intervalMs: 60000,
    maxDataPoints: 1000,
    scopedVars: {},
    timezone: 'browser',
    app: 'explore',
    startTime: Date.now(),
  };

  const result = dataSource.query(request) as Observable<DataQueryResponse> | Promise<DataQueryResponse>;
  const response = result instanceof Promise ? await result : await lastValueFrom(result);

  return collectLabelValues(response.data ?? []);
}
