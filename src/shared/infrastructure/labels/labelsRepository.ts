import { MemoryCacheClient } from '@shared/infrastructure/MemoryCacheClient';
import { CancelOptions, DataSourceRepository, RepositoryOptions } from '@shared/infrastructure/types';
import { LabelsApiClient } from 'src/pages/ProfilesExplorerView/infrastructure/labels/http/LabelsApiClient';
import { DataSourceProxyClientBuilder } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClientBuilder';

import { Suggestions } from '../../components/QueryBuilder/domain/types';
import { invariant } from '../../types/helpers/invariant';

type ListLabelsOptions = {
  dataSourceUid: string;
  query: string;
  from: number;
  to: number;
};

type ListLabelValuesOptions = ListLabelsOptions & {
  label: string;
};

export class LabelsRepository implements DataSourceRepository<LabelsApiClient> {
  private readonly cacheClient: MemoryCacheClient;

  static isNotMetaLabelOrServiceName = (label: string) => !/^(__.+__|service_name)$/.test(label);

  static parseLabelsResponse(json: Record<string, any>): Suggestions {
    if (!Array.isArray(json.names)) {
      return [];
    }

    const uniqueLabels: string[] = Array.from(new Set(json.names.filter(LabelsRepository.isNotMetaLabelOrServiceName)));

    return uniqueLabels.map((label) => ({ value: label, label }));
  }

  static parseLabelValuesResponse(json: Record<string, any>): Suggestions {
    if (!Array.isArray(json.names)) {
      return [];
    }

    const labelValues: string[] = json.names;

    return labelValues.map((label) => ({ value: label, label }));
  }

  constructor(options: RepositoryOptions) {
    this.cacheClient = options.cacheClient;
  }

  getCacheClient() {
    return this.cacheClient;
  }

  getApiClient(dataSourceUid: string) {
    return DataSourceProxyClientBuilder.build(dataSourceUid, LabelsApiClient);
  }

  cancel({ dataSourceUid, reason }: CancelOptions) {
    this.getApiClient(dataSourceUid).abort(reason);
  }

  static assertParams(query: string, from: number, to: number) {
    invariant(Boolean(query), 'Missing "query" parameter!');
    invariant(from > 0 && to > 0 && to > from, 'Invalid timerange!');
  }

  async listLabels({ dataSourceUid, query, from, to }: ListLabelsOptions): Promise<Suggestions> {
    LabelsRepository.assertParams(query, from, to);

    const apiClient = this.getApiClient(dataSourceUid);
    const cacheParams = [apiClient.baseUrl, query, from, to];

    const labelsFromCacheP = this.getCacheClient().get(cacheParams);
    if (labelsFromCacheP) {
      const json = await labelsFromCacheP;
      const labels = LabelsRepository.parseLabelsResponse(json);

      if (!labels.length) {
        this.getCacheClient().delete(cacheParams);
      }

      return labels;
    }

    const fetchP = apiClient.fetchLabels(query, from, to);
    this.getCacheClient().set(cacheParams, fetchP);

    try {
      const json = await fetchP;
      return LabelsRepository.parseLabelsResponse(json);
    } catch (error) {
      this.getCacheClient().delete(cacheParams);
      throw error;
    }
  }

  async listLabelValues({ dataSourceUid, label, query, from, to }: ListLabelValuesOptions): Promise<Suggestions> {
    LabelsRepository.assertParams(query, from, to);
    invariant(Boolean(label), 'Missing label value!');

    const apiClient = this.getApiClient(dataSourceUid);
    const cacheParams = [apiClient.baseUrl, label, query, from, to];

    const labelValuesFromCacheP = this.getCacheClient().get(cacheParams);
    if (labelValuesFromCacheP) {
      const json = await labelValuesFromCacheP;
      const labelValues = LabelsRepository.parseLabelsResponse(json);

      if (!labelValues.length) {
        this.getCacheClient().delete(cacheParams);
      }

      return labelValues;
    }

    const fetchP = apiClient.fetchLabelValues(label, query, from, to);
    this.getCacheClient().set(cacheParams, fetchP);

    try {
      const json = await fetchP;
      return LabelsRepository.parseLabelValuesResponse(json);
    } catch (error) {
      this.getCacheClient().delete(cacheParams);
      throw error;
    }
  }
}

export const labelsRepository = new LabelsRepository({ cacheClient: new MemoryCacheClient() });
