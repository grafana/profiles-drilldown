import { parseQuery } from '@shared/domain/url-params/parseQuery';

import {
  buildFakeLabelsSelector,
  queryFakeLabelValuesForSelector,
} from '../../fake-profiles-from-metrics/fetchFakeLabelsFromMetrics';
import { resolveDataSourceKind } from '../../fake-profiles-from-metrics/resolveDataSourceKind';
import { DataSourceProxyClient } from '../../series/http/DataSourceProxyClient';

export class LabelsApiClient extends DataSourceProxyClient {
  static queryToMatchers(query: string) {
    const labelsIndex = query.indexOf('{');

    if (labelsIndex > 0) {
      const profileTypeID = query.substring(0, labelsIndex);
      return [`{__profile_type__=\"${profileTypeID}\", ${query.substring(labelsIndex + 1, query.length)}`];
    }

    if (labelsIndex === 0) {
      return [query];
    }

    return [`{__profile_type__=\"${query}\"}`];
  }

  private fakeLabelValuesCache = new Map<string, Promise<Map<string, string[]>>>();

  constructor(options: { dataSourceUid: string }) {
    super(options);
  }

  fetchFakeLabelValues(query: string, from: number, to: number): Promise<Map<string, string[]>> {
    const { serviceId, profileMetricId, labels } = parseQuery(query);
    const selector = buildFakeLabelsSelector(serviceId, profileMetricId, labels);

    if (!selector) {
      return Promise.resolve(new Map());
    }

    const cacheKey = `${selector}-${from}-${to}`;
    let cached = this.fakeLabelValuesCache.get(cacheKey);

    if (!cached) {
      cached = queryFakeLabelValuesForSelector(this.dataSourceUid, selector, from, to);
      this.fakeLabelValuesCache.set(cacheKey, cached);
    }

    return cached;
  }

  async fetchLabels(query: string, from: number, to: number) {
    if (resolveDataSourceKind(this.dataSourceUid) === 'prometheus') {
      const labelValues = await this.fetchFakeLabelValues(query, from, to);
      return { names: Array.from(labelValues.keys()) };
    }

    return this._post('/querier.v1.QuerierService/LabelNames', {
      matchers: LabelsApiClient.queryToMatchers(query),
      start: from,
      end: to,
    }).then((response) => response.json());
  }

  async fetchLabelValues(labelId: string, query: string, from: number, to: number) {
    if (resolveDataSourceKind(this.dataSourceUid) === 'prometheus') {
      const labelValues = await this.fetchFakeLabelValues(query, from, to);
      return { names: labelValues.get(labelId) ?? [] };
    }

    return this._post('/querier.v1.QuerierService/LabelValues', {
      name: labelId,
      matchers: LabelsApiClient.queryToMatchers(query),
      start: from,
      end: to,
    }).then((response) => response.json());
  }

  _post(pathname: string, body: Record<string, any>) {
    return super.fetch(pathname, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { accept: 'application/json; allow-utf8-labelnames=true' },
    });
  }
}
