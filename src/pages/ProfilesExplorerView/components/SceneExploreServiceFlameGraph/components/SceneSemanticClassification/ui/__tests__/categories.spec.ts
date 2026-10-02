import { CATEGORIES, KnownCategory, TAXONOMY } from '@shared/domain/semantic/jevRubric';

import { categoryDescription, categoryLabel } from '../categories';

const KNOWN_CATEGORIES = CATEGORIES.filter((c): c is KnownCategory => c !== 'unknown');

describe('category presentation', () => {
  it('gives every category a readable label instead of its model key', () => {
    expect(Object.fromEntries(CATEGORIES.map((c) => [c, categoryLabel(c)]))).toEqual({
      runtime: 'Runtime',
      networking: 'Networking',
      database_client: 'Database client',
      serialization: 'Serialization',
      crypto_compression: 'Crypto and compression',
      io: 'I/O',
      observability: 'Observability',
      standard_library: 'Standard library',
      application_logic: 'Application code',
      unknown: 'Unknown',
    });
  });

  it.each(KNOWN_CATEGORIES)('describes %s with UI copy rather than the frozen model rubric', (category) => {
    const description = categoryDescription(category);

    expect(description).toMatch(/^[A-Z].*\.$/);
    expect(description).not.toBe(TAXONOMY[category]);
  });
});
