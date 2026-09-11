import { config } from '@grafana/runtime';
import { generateUUID } from '@shared/domain/generateUUID';
import { SceneObject } from '@grafana/scenes';
import { DataQuery } from '@grafana/schema';
import { getQueryLibraryFromOpenFeature } from '@shared/infrastructure/featureFlags/featureFlags';
import { logger } from '@shared/infrastructure/tracking/logger';
import { ReactNode, useCallback, useState } from 'react';
import semver from 'semver/preload';

import pluginJson from '../../../plugin.json';
import {
  getDatasourceVariable,
  getFiltersVariable,
  getProfilesExplorerScene,
  parseLabelSelectorToAdHocFilters,
} from './utils';

const MIN_VERSION = '12.4.0-21256324731';

export function isQueryLibrarySupported() {
  return !semver.ltr(config.buildInfo.version, MIN_VERSION) && getQueryLibraryFromOpenFeature();
}

export function useCheckForExistingSearch(dsUid: string, query: string) {
  const { searches } = useSavedSearches(dsUid);
  return searches.find((search) => search.query === query);
}

export function useHasSavedSearches(dsUid: string) {
  const { searches } = useSavedSearches(dsUid);
  return searches.length > 0;
}

export function applySavedSearchToScene(sceneRef: SceneObject, query: string, dsUid: string): void {
  const adHocFilters = parseLabelSelectorToAdHocFilters(query);

  const profilesExplorer = getProfilesExplorerScene(sceneRef);
  const filtersVariable = getFiltersVariable(profilesExplorer);
  filtersVariable.setState({ filters: adHocFilters });

  const dsVariable = getDatasourceVariable(sceneRef);
  if (dsUid && dsVariable.getValue()?.toString() !== dsUid) {
    dsVariable.changeValueTo(dsUid);
  }
}

export function useSavedSearches(dsUid: string) {
  const [searches, setSearches] = useState<SavedSearch[]>(getLocallySavedSearches(dsUid));

  const deleteSearch = useCallback(
    async (uid: string) => {
      removeFromLocalStorage(uid);
      setSearches(getLocallySavedSearches(dsUid));
    },
    [dsUid]
  );

  const saveSearch = useCallback(
    async (search: Omit<SavedSearch, 'timestamp' | 'uid'>) => {
      saveInLocalStorage(search);
      setSearches(getLocallySavedSearches(dsUid));
    },
    [dsUid]
  );

  return {
    isLoading: false,
    saveSearch,
    searches,
    deleteSearch,
  };
}

const isString = (s: unknown) => (typeof s === 'string' && s) || '';

function narrowSavedSearch(search: unknown): SavedSearch | null {
  if (typeof search !== 'object' || search === null) {
    return null;
  }
  return 'title' in search &&
    'description' in search &&
    'query' in search &&
    'timestamp' in search &&
    'dsUid' in search &&
    'uid' in search
    ? {
        description: isString(search.description),
        dsUid: isString(search.dsUid),
        query: isString(search.query),
        timestamp: Number(search.timestamp),
        title: isString(search.title),
        uid: isString(search.uid),
      }
    : null;
}

export function narrowSavedSearches(searches: unknown): SavedSearch[] {
  if (!Array.isArray(searches)) {
    return [];
  }
  return searches.map((search) => narrowSavedSearch(search)).filter((search) => search !== null);
}

function getLocallySavedSearches(dsUid?: string) {
  let stored: SavedSearch[] = [];
  try {
    stored = narrowSavedSearches(JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) ?? '[]'));
  } catch (error) {
    logger.error(error as Error, { info: 'Error parsing saved searches from localStorage' });
  }
  stored.sort((a, b) => b.timestamp - a.timestamp);
  return stored.filter((search) => (dsUid ? search.dsUid === dsUid : true));
}

export const SAVED_SEARCHES_KEY = `${pluginJson.id}.savedSearches`;

export interface SavedSearch {
  description: string;
  dsUid: string;
  query: string;
  timestamp: number;
  title: string;
  uid: string;
}

function saveInLocalStorage({ query, title, description, dsUid }: Omit<SavedSearch, 'timestamp' | 'uid'>) {
  const stored = getLocallySavedSearches();

  stored.push({
    dsUid,
    description,
    query,
    timestamp: new Date().getTime(),
    title,
    uid: generateUUID(),
  });

  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(stored));
}

function removeFromLocalStorage(uid: string) {
  const stored = getLocallySavedSearches();
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(stored.filter((search) => search.uid !== uid)));
}

export interface OpenQueryLibraryComponentProps {
  className?: string;
  context?: string;
  datasourceFilters?: string[];
  fallbackComponent?: ReactNode;
  icon?: string;
  onSelectQuery?(query: DataQuery): void;
  query?: DataQuery;
  tooltip?: string;
}
