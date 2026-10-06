import { getDataSourceSrv } from '@grafana/runtime';

export type DataSourceKind = 'pyroscope' | 'prometheus' | 'unknown';

const PYROSCOPE_DATA_SOURCE_TYPE = 'grafana-pyroscope-datasource';
const PROMETHEUS_DATA_SOURCE_TYPE = 'prometheus';

export function resolveDataSourceKind(dataSourceUid?: string): DataSourceKind {
  if (!dataSourceUid) {
    return 'unknown';
  }

  const type = getDataSourceSrv().getInstanceSettings(dataSourceUid)?.type;

  if (type === PYROSCOPE_DATA_SOURCE_TYPE) {
    return 'pyroscope';
  }

  if (type === PROMETHEUS_DATA_SOURCE_TYPE) {
    return 'prometheus';
  }

  return 'unknown';
}
