import { KG_DATASOURCE_TYPE, KG_DATASOURCE_UID } from 'src/constants';

import { isKnowledgeGraphDataSource } from '../datasources';

describe('isKnowledgeGraphDataSource', () => {
  it('should return true for a KnowledgeGraph datasource', () => {
    const ds: any = { type: KG_DATASOURCE_TYPE, uid: KG_DATASOURCE_UID };
    expect(isKnowledgeGraphDataSource(ds)).toBe(true);
  });

  it('should return false for non-KnowledgeGraph datasource', () => {
    const ds: any = { type: 'grafana-test-datasource', uid: 'grafana-test-datasource' };
    expect(isKnowledgeGraphDataSource(ds)).toBe(false);
  });
});
