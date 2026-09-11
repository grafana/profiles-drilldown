import { t } from '@grafana/i18n';
import { usePluginComponent } from '@grafana/runtime';
import { sceneGraph, SceneObject } from '@grafana/scenes';
import { GrafanaPyroscopeDataQuery } from '@grafana/schema/dist/esm/raw/composable/grafanapyroscope/dataquery/x/GrafanaPyroscopeDataQuery_types.gen';
import { ToolbarButton } from '@grafana/ui';
import React, { useMemo, useState } from 'react';

import { ProfileMetricVariable } from '../../../pages/ProfilesExplorerView/domain/variables/ProfileMetricVariable';
import { isQueryLibrarySupported, OpenQueryLibraryComponentProps } from './saveSearch';
import { SaveSearchModal } from './SaveSearchModal';
import {
  filtersToLabelSelectorExpression,
  getDatasourceVariable,
  getFiltersVariable,
  getProfilesExplorerScene,
} from './utils';

interface Props {
  sceneRef: SceneObject;
}

export function SaveSearchButton({ sceneRef }: Props) {
  const [saving, setSaving] = useState(false);
  const { component: OpenQueryLibraryComponent, isLoading: isLoadingExposedComponent } =
    usePluginComponent<OpenQueryLibraryComponentProps>('grafana/query-library-context/v1');

  const dsUid = useMemo(() => {
    const ds = getDatasourceVariable(sceneRef);
    return ds.getValue().toString();
  }, [sceneRef]);

  const dsName = useMemo(() => {
    const ds = getDatasourceVariable(sceneRef);
    return ds.state.text.toString();
  }, [sceneRef]);

  const profilesExplorer = useMemo(() => getProfilesExplorerScene(sceneRef), [sceneRef]);

  const { filters } = getFiltersVariable(profilesExplorer).useState();
  const { value: profileMetricId } = sceneGraph
    .findByKeyAndType(profilesExplorer, 'profileMetricId', ProfileMetricVariable)
    .useState();
  const hasFilters = filters.length > 0;

  const fallbackComponent = useMemo(
    () => (
      <>
        <ToolbarButton
          variant="canvas"
          icon="save"
          onClick={() => setSaving(true)}
          tooltip={t('saved-searches.save.tooltip', 'Save search')}
        />
        {saving && <SaveSearchModal dsUid={dsUid} sceneRef={sceneRef} onClose={() => setSaving(false)} />}
      </>
    ),
    [dsUid, saving, sceneRef]
  );

  const query: GrafanaPyroscopeDataQuery = useMemo(() => {
    const labelSelector = filtersToLabelSelectorExpression(filters);
    return {
      refId: 'profiles-drilldown',
      datasource: {
        type: 'grafana-pyroscope-datasource',
        uid: dsUid,
      },
      query: labelSelector,
      queryType: 'metrics',
      profileTypeId: profileMetricId != null ? String(profileMetricId) : '',
      labelSelector,
      groupBy: [],
      includeExemplars: false,
      includeHeatmap: false,
      heatmapType: 'individual',
    };
  }, [filters, dsUid, profileMetricId]);

  if (!hasFilters) {
    return null;
  }

  if (!isQueryLibrarySupported()) {
    return fallbackComponent;
  } else if (isLoadingExposedComponent || !OpenQueryLibraryComponent) {
    return null;
  }

  return (
    <OpenQueryLibraryComponent
      datasourceFilters={[dsName]}
      query={query}
      tooltip={t('saved-searches.save.saved-queries-tooltip', 'Save in Saved queries')}
    />
  );
}
