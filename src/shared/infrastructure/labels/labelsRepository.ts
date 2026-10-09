import { MemoryCacheClient } from '@shared/infrastructure/MemoryCacheClient';

import { Suggestions } from '../../components/QueryBuilder/domain/types';
import { invariant } from '../../types/helpers/invariant';
import { AbstractRepository } from '../AbstractRepository';
import { LabelsApiClient } from './LabelsApiClient';

type ListLabelsOptions = {
  query: string;
  from: number;
  to: number;
};

type ListLabelValuesOptions = ListLabelsOptions & {
  label: string;
};

class LabelsRepository extends AbstractRepository<LabelsApiClient, MemoryCacheClient> {
  cacheClient: MemoryCacheClient;

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

  constructor(options: { apiClient: LabelsApiClient; cacheClient: MemoryCacheClient }) {
    super({ apiClient: options.apiClient });

    this.cacheClient = options.cacheClient;
  }

  static assertParams(query: string, from: number, to: number) {
    invariant(Boolean(query), 'Missing "query" parameter!');
    invariant(from > 0 && to > 0 && to > from, 'Invalid timerange!');
  }

  async listLabels({ query, from, to }: ListLabelsOptions): Promise<Suggestions> {
    LabelsRepository.assertParams(query, from, to);

    const apiClient = this.apiClient!;
    const baseUrl = await apiClient.getBaseUrl();
    const cacheParams = [baseUrl, query, from, to];

    const labelsFromCacheP = this.cacheClient.get(cacheParams);
    if (labelsFromCacheP) {
      const json = await labelsFromCacheP;
      const labels = LabelsRepository.parseLabelsResponse(json);

      if (!labels.length) {
        this.cacheClient.delete(cacheParams);
      }

      return labels;
    }

    const fetchP = apiClient.fetchLabels(query, from, to);
    this.cacheClient.set(cacheParams, fetchP);

    try {
      const json = await fetchP;
      return LabelsRepository.parseLabelsResponse(json);
    } catch (error) {
      this.cacheClient.delete(cacheParams);
      throw error;
    }
  }

  async listLabelValues({ label, query, from, to }: ListLabelValuesOptions): Promise<Suggestions> {
    LabelsRepository.assertParams(query, from, to);
    invariant(Boolean(label), 'Missing label value!');

    const apiClient = this.apiClient!;
    const baseUrl = await apiClient.getBaseUrl();
    const cacheParams = [baseUrl, label, query, from, to];

    const labelValuesFromCacheP = this.cacheClient.get(cacheParams);
    if (labelValuesFromCacheP) {
      const json = await labelValuesFromCacheP;
      const labelValues = LabelsRepository.parseLabelsResponse(json);

      if (!labelValues.length) {
        this.cacheClient.delete(cacheParams);
      }

      return labelValues;
    }

    const fetchP = apiClient.fetchLabelValues(label, query, from, to);
    this.cacheClient.set(cacheParams, fetchP);

    try {
      const json = await fetchP;
      return LabelsRepository.parseLabelValuesResponse(json);
    } catch (error) {
      this.cacheClient.delete(cacheParams);
      throw error;
    }
  }
}

export const labelsRepository = new LabelsRepository({
  apiClient: new LabelsApiClient(),
  cacheClient: new MemoryCacheClient(),
});
