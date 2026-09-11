import { t } from '@grafana/i18n';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { Panel } from '@shared/ui/Panel/Panel';
import React from 'react';

import {
  SpanExemplarToggleAction,
  SpanProfileVisualizationPicker,
} from '../../../domain/actions/SpanExemplarToggleAction';
import { getSceneVariableValue } from '../../../helpers/getSceneVariableValue';
import { getProfileMetricLabel } from '../../../infrastructure/series/helpers/getProfileMetricLabel';
import { SceneExploreServiceHeatmap } from '../../SceneExploreServiceHeatmap/SceneExploreServiceHeatmap';
import { SceneHeatmapMenu } from '../../SceneExploreServiceHeatmap/SceneHeatmapMenu';
import type { SceneExploreServiceFlameGraph } from '../SceneExploreServiceFlameGraph';
import { ResolutionBoostExtensionPoint } from './ResolutionBoostExtensionPoint';

export function SpanHeatmapPanel({
  model,
  spanHeatmap,
  menu,
  spanToggle,
}: {
  model: SceneExploreServiceFlameGraph;
  spanHeatmap: SceneExploreServiceHeatmap;
  menu: SceneHeatmapMenu;
  spanToggle: SpanExemplarToggleAction;
}) {
  const { isLoading } = spanHeatmap.useState();
  const profileMetricId = getSceneVariableValue(model, 'profileMetricId');
  const { description } = getProfileMetric(profileMetricId as ProfileMetricId);
  const title = t('explore-service-heatmap.title', '{{title}} per trace span', {
    title: description || getProfileMetricLabel(profileMetricId),
  });

  return (
    <Panel
      dataTestId="span-heatmap-panel"
      title={title}
      description={t('explore-service-heatmap.description', 'Count of trace spans falling into a specific bucket')}
      isLoading={isLoading}
      menu={() => <menu.Component model={menu} />}
      headerActions={
        <>
          <ResolutionBoostExtensionPoint scene={model} />
          <SpanProfileVisualizationPicker model={spanToggle} />
        </>
      }
    >
      <spanHeatmap.Component model={spanHeatmap} />
    </Panel>
  );
}
