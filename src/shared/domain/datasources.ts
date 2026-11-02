import { DataSourceInstanceListItem } from '@grafana/data';
import { KG_DATASOURCE_TYPE, KG_DATASOURCE_UID } from 'src/constants';

/**
 * Helper function to determine if a datasource is a KnowledgeGraph datasource
 */
export function isKnowledgeGraphDataSource(ds: DataSourceInstanceListItem): boolean {
  return ds.uid === KG_DATASOURCE_UID && ds.type === KG_DATASOURCE_TYPE;
}
