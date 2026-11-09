import { AppEvents } from '@grafana/data';
import { t } from '@grafana/i18n';
import { getAppEvents, reportInteraction, usePluginComponent } from '@grafana/runtime';
import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { DataQuery } from '@grafana/schema';
import { ToolbarButton } from '@grafana/ui';
import { useFlagQueryLibrary } from '@shared/infrastructure/featureFlags/featureFlags';
import React, { useCallback, useMemo } from 'react';

import { LoadSearchModal } from './LoadSearchModal';
import { applySavedSearchToScene, OpenQueryLibraryComponentProps, useHasSavedSearches } from './saveSearch';
import { getDatasourceVariable } from './utils';

export interface LoadSearchSceneState extends SceneObjectState {
  dsName: string;
  dsUid: string;
  isOpen: boolean;
}
export class LoadSearchScene extends SceneObjectBase<LoadSearchSceneState> {
  constructor(state: Partial<LoadSearchSceneState> = {}) {
    super({
      dsUid: '',
      dsName: '',
      isOpen: false,
      ...state,
    });

    this.addActivationHandler(this.onActivate);
  }

  onActivate = () => {
    this.setState({
      dsUid: getDatasourceVariable(this).getValue().toString(),
      dsName: getDatasourceVariable(this).state.text.toString(),
    });

    this._subs.add(
      getDatasourceVariable(this).subscribeToState((newState: { value: unknown }) => {
        this.setState({
          dsUid: String(newState.value),
          dsName: getDatasourceVariable(this).state.text.toString(),
        });
      })
    );
  };

  toggleOpen = () => {
    this.setState({
      isOpen: true,
    });
  };

  toggleClosed = () => {
    this.setState({
      isOpen: false,
    });
  };

  static Component = ({ model }: SceneComponentProps<LoadSearchScene>) => {
    const { dsName, dsUid, isOpen } = model.useState();
    const queryLibraryEnabled = useFlagQueryLibrary();
    const hasSavedSearches = useHasSavedSearches(dsUid);

    const { component: OpenQueryLibraryComponent, isLoading: isLoadingExposedComponent } =
      usePluginComponent<OpenQueryLibraryComponentProps>('grafana/query-library-context/v1');

    const fallbackComponent = useMemo(
      () => (
        <>
          <ToolbarButton
            icon="folder-open"
            variant="canvas"
            disabled={!hasSavedSearches}
            onClick={model.toggleOpen}
            tooltip={
              hasSavedSearches
                ? t('saved-searches.load.tooltip', 'Load saved search')
                : t('saved-searches.load.no-searches-tooltip', 'No saved searches to load')
            }
          />
          {isOpen && <LoadSearchModal sceneRef={model} onClose={model.toggleClosed} />}
        </>
      ),
      [hasSavedSearches, isOpen, model]
    );

    const onSelectQuery = useCallback(
      (query: DataQuery) => {
        const appEvents = getAppEvents();

        if (query.datasource?.type !== 'grafana-pyroscope-datasource') {
          appEvents.publish({
            payload: [t('saved-searches.load.select-pyroscope-query', 'Please select a Pyroscope query.')],
            type: AppEvents.alertError.name,
          });
          return;
        }

        const pyroscopeQuery = query as DataQuery & { query?: string };
        const queryStr = pyroscopeQuery.query ?? '';
        const dsUid = query.datasource?.uid ?? '';
        applySavedSearchToScene(model, queryStr, dsUid);
        reportInteraction('grafana_profiles_app_load_search_saved_query_loaded');
      },
      [model]
    );

    if (!queryLibraryEnabled) {
      return fallbackComponent;
    }

    if (isLoadingExposedComponent || !OpenQueryLibraryComponent) {
      return null;
    }

    return (
      <OpenQueryLibraryComponent
        context="drilldown"
        datasourceFilters={[dsName]}
        icon="folder-open"
        onSelectQuery={onSelectQuery}
        tooltip={t('saved-searches.load.saved-query-tooltip', 'Load Saved query')}
      />
    );
  };
}
