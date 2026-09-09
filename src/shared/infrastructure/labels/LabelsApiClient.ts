import { ApiClient } from '@shared/infrastructure/http/ApiClient';

export class LabelsApiClient extends ApiClient {
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

  async fetchLabels(query: string, from: number, to: number) {
    // all /querier requests: timerange in Unix time ms (unix * 1000)
    return this._post('/querier.v1.QuerierService/LabelNames', {
      matchers: LabelsApiClient.queryToMatchers(query),
      start: from,
      end: to,
    }).then((response) => response.json());
  }

  async fetchLabelValues(labelId: string, query: string, from: number, to: number) {
    // all /querier requests: timerange in Unix time ms (unix * 1000)
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
