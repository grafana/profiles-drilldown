import { RawTimeRange, toURLRange, urlUtil } from '@grafana/data';
import { getGrafanaUrl } from '@shared/infrastructure/appUrl';

import { TimeSeriesQuery } from '../infrastructure/timeseries/buildTimeSeriesQueryRunner';

export function getExploreUrl(rawTimeRange: RawTimeRange, query: TimeSeriesQuery, datasource: string): string {
  const exploreState = JSON.stringify({
    ['pyroscope-explore']: {
      range: toURLRange(rawTimeRange),
      queries: [{ ...query, datasource }],
      panelsState: {},
      datasource,
    },
  });

  return urlUtil.renderUrl(getGrafanaUrl('/explore'), {
    panes: exploreState,
    schemaVersion: 1,
  });
}
