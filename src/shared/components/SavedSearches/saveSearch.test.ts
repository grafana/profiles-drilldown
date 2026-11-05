import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';

import {
  applySavedSearchToScene,
  narrowSavedSearches,
  SAVED_SEARCHES_KEY,
  SavedSearch,
  useCheckForExistingSearch,
  useHasSavedSearches,
  useSavedSearches,
} from './saveSearch';
import { asSceneObject, getUtilsMock } from './testHelpers';

// Mock utils with a factory so the real utils (and its PprofRequest chain) is never loaded
jest.mock('./utils', () => {
  const { parseRawFilters } = require('../QueryBuilder/domain/helpers/queryToFilters');
  function parseLabelSelectorToAdHocFilters(selector: string): Array<{ key: string; operator: string; value: string }> {
    if (!selector?.trim()) {
      return [];
    }
    const trimmed = selector.trim();
    const braceMatch = trimmed.match(/\{(.+)\}$/);
    const inner = braceMatch ? braceMatch[1] : trimmed.startsWith('{') ? trimmed.slice(1, -1) : trimmed;
    const raw = parseRawFilters(inner);
    return raw
      .filter(([key]: [string, string, string]) => key !== 'service_name')
      .map(([key, operator, value]: [string, string, string]) => ({ key, operator, value }));
  }
  return {
    getProfilesExplorerScene: jest.fn(),
    getDatasourceVariable: jest.fn(),
    getFiltersVariable: jest.fn(),
    parseLabelSelectorToAdHocFilters,
    buildFilterExpressionParts: jest.fn(),
    filtersToLabelSelectorExpression: jest.fn(),
  };
});

const utilsMock = getUtilsMock();

const localSearches = [
  {
    dsUid: 'ds-local-1',
    title: 'Local Search 1',
    query: '{job="local1"}',
    description: 'First local search',
    timestamp: new Date('2026-01-10T00:00:00Z').getTime(),
    uid: 'local-uid-1',
  },
  {
    dsUid: 'ds-local-1',
    title: 'Local Search 2',
    query: '{job="local2"}',
    description: 'Second local search',
    timestamp: new Date('2026-01-15T00:00:00Z').getTime(),
    uid: 'local-uid-2',
  },
  {
    dsUid: 'ds-local-2',
    title: 'Local Search 3',
    query: '{job="local3"}',
    description: 'Third local search',
    timestamp: new Date('2026-01-12T00:00:00Z').getTime(),
    uid: 'local-uid-3',
  },
];

beforeEach(() => {
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(localSearches));
});

describe('useSavedSearches', () => {
  beforeEach(() => {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(localSearches));
  });

  test('Should load searches from localStorage', () => {
    const { result } = renderHook(() => useSavedSearches('ds-local-1'));

    expect(result.current.searches).toHaveLength(2);
    expect(result.current.searches.every((s) => s.dsUid === 'ds-local-1')).toBe(true);
  });

  test('Should save search to localStorage', async () => {
    const { result } = renderHook(() => useSavedSearches('ds-local-1'));

    const newSearch = {
      dsUid: 'ds-local-1',
      title: 'New Local Search',
      query: '{job="newlocal"}',
      description: 'A new local search',
    };

    await act(async () => {
      await result.current.saveSearch(newSearch);
    });

    const stored = narrowSavedSearches(JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]'));
    expect(stored).toHaveLength(4);
    expect(stored.some((s: SavedSearch) => s.title === 'New Local Search')).toBe(true);
  });

  test('Should delete search from localStorage', async () => {
    const { result, rerender } = renderHook(() => useSavedSearches('ds-local-1'));

    expect(result.current.searches).toHaveLength(2);

    await act(async () => {
      await result.current.deleteSearch('local-uid-1');
    });
    rerender();

    await waitFor(() => {
      expect(result.current.searches).toHaveLength(1);
      expect(result.current.searches[0].uid).toBe('local-uid-2');
    });
  });

  test('should sort searches by timestamp descending', () => {
    const { result } = renderHook(() => useSavedSearches('ds-local-1'));

    expect(result.current.searches[0].title).toBe('Local Search 2'); // 2026-01-15
    expect(result.current.searches[1].title).toBe('Local Search 1'); // 2026-01-10
  });

  test('Should handle empty localStorage gracefully', () => {
    localStorage.clear();
    const { result } = renderHook(() => useSavedSearches('ds-local-1'));

    expect(result.current.searches).toHaveLength(0);
  });
});

describe('useCheckForExistingSearch', () => {
  test('Checks for existing searches', () => {
    const { result } = renderHook(() => useCheckForExistingSearch('ds-local-1', localSearches[0].query));
    expect(result.current).toBeDefined();
  });

  test('Checks for non-existing searches', () => {
    const { result } = renderHook(() => useCheckForExistingSearch('ds-local-1', '{nope="nope"}'));
    expect(result.current).toBeUndefined();
  });
});

describe('useHasSavedSearches', () => {
  test('Checks for existing searches', () => {
    const { result } = renderHook(() => useHasSavedSearches('ds-local-1'));
    expect(result.current).toBe(true);
  });

  test('Checks for empty searches', () => {
    const { result } = renderHook(() => useHasSavedSearches('ds-local-nope'));
    expect(result.current).toBe(false);
  });
});

describe('narrowSavedSearches', () => {
  test('returns empty array for non-array input', () => {
    expect(narrowSavedSearches(null)).toEqual([]);
    expect(narrowSavedSearches(undefined)).toEqual([]);
    expect(narrowSavedSearches('not an array')).toEqual([]);
    expect(narrowSavedSearches({})).toEqual([]);
  });

  test('returns valid SavedSearch objects and filters invalid items', () => {
    const input = [
      {
        title: 'Valid',
        description: 'Desc',
        query: '{job="x"}',
        timestamp: 1000,
        dsUid: 'ds-1',
        uid: 'uid-1',
      },
      { title: 'Missing fields' },
      null,
      { title: 'Also', description: '', query: '', timestamp: 0, dsUid: '', uid: '' },
    ];
    const result = narrowSavedSearches(input as unknown[]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: 'Valid',
      description: 'Desc',
      query: '{job="x"}',
      timestamp: 1000,
      dsUid: 'ds-1',
      uid: 'uid-1',
    });
    expect(result[1]).toEqual({
      title: 'Also',
      description: '',
      query: '',
      timestamp: 0,
      dsUid: '',
      uid: '',
    });
  });

  test('coerces non-string fields to strings or numbers', () => {
    const input = [
      {
        title: 123,
        description: null,
        query: '{x="y"}',
        timestamp: '999',
        dsUid: 'ds-1',
        uid: 'uid-1',
      },
    ];
    const result = narrowSavedSearches(input as unknown[]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('');
    expect(result[0]?.description).toBe('');
    expect(result[0]?.timestamp).toBe(999);
  });
});

describe('applySavedSearchToScene', () => {
  const mockSetState = jest.fn();
  const mockChangeValueTo = jest.fn();
  const mockGetValue = jest.fn();

  beforeEach(() => {
    mockSetState.mockClear();
    mockChangeValueTo.mockClear();
    mockGetValue.mockClear();
    // Re-apply implementations after resetMocks; use same reference saveSearch uses
    utilsMock.getProfilesExplorerScene.mockImplementation(() => ({}));
    utilsMock.getFiltersVariable.mockImplementation(() => ({ setState: mockSetState }));
    utilsMock.getDatasourceVariable.mockImplementation(() => ({
      getValue: mockGetValue,
      changeValueTo: mockChangeValueTo,
    }));
  });

  test('applies parsed filters to scene and updates datasource when different', () => {
    mockGetValue.mockReturnValue('other-ds');

    const sceneRef = asSceneObject({});
    applySavedSearchToScene(sceneRef, '{resource.service.name="api"}', 'ds-123');

    expect(mockSetState).toHaveBeenCalledTimes(1);
    const [[state]] = mockSetState.mock.calls;
    expect(state.filters).toHaveLength(1);
    expect(state.filters[0]).toMatchObject({ operator: '=', value: 'api' });
    expect(mockChangeValueTo).toHaveBeenCalledWith('ds-123');
  });

  test('does not call changeValueTo when datasource already matches', () => {
    mockGetValue.mockReturnValue('ds-123');

    const sceneRef = asSceneObject({});
    applySavedSearchToScene(sceneRef, '{ span:status=error }', 'ds-123');

    expect(mockSetState).toHaveBeenCalled();
    expect(mockChangeValueTo).not.toHaveBeenCalled();
  });

  test('applies empty filters when query parses to no filters', () => {
    const sceneRef = asSceneObject({});
    applySavedSearchToScene(sceneRef, '{}', 'ds-1');

    expect(mockSetState).toHaveBeenCalledWith({ filters: [] });
  });
});
