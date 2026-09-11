import { usePluginComponent } from '@grafana/runtime';
import { sceneGraph } from '@grafana/scenes';
import React from 'react';

import { SceneExploreServiceFlameGraph } from '../../SceneExploreServiceFlameGraph';

type ResolutionBoostExtensionProps = {
  serviceName: string;
  datasourceUID: string;
};

const SERVICE_NAME_EXPR = '${serviceName}';
const DATASOURCE_UID_EXPR = '${dataSource}';

export function ResolutionBoostExtensionPoint({ scene }: { scene: SceneExploreServiceFlameGraph }) {
  const { component: ResolutionBoostExtension } = usePluginComponent<ResolutionBoostExtensionProps>(
    'grafana-adaptiveprofiles-app/resolution-boost/v1'
  );

  if (!ResolutionBoostExtension) {
    return;
  }

  const serviceName = sceneGraph.interpolate(scene, SERVICE_NAME_EXPR);
  const serviceNameUnavailable = serviceName === SERVICE_NAME_EXPR;

  if (serviceNameUnavailable) {
    return;
  }

  const datasourceUID = sceneGraph.interpolate(scene, DATASOURCE_UID_EXPR);
  const datasourceUIDUnavailable = datasourceUID === DATASOURCE_UID_EXPR;

  if (datasourceUIDUnavailable) {
    return;
  }

  return <ResolutionBoostExtension serviceName={serviceName} datasourceUID={datasourceUID} />;
}
