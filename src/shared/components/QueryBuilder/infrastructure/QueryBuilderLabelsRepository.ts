import { LabelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { LabelsApiClient } from 'src/pages/ProfilesExplorerView/infrastructure/labels/http/LabelsApiClient';

// Keep cancellation isolated to the query builder that owns this repository.
export class QueryBuilderLabelsRepository extends LabelsRepository {
  private readonly apiClients = new Map<string, LabelsApiClient>();

  override getApiClient(dataSourceUid: string) {
    const cachedClient = this.apiClients.get(dataSourceUid);
    if (cachedClient) {
      return cachedClient;
    }

    const apiClient = new LabelsApiClient({ dataSourceUid });
    this.apiClients.set(dataSourceUid, apiClient);
    return apiClient;
  }
}
