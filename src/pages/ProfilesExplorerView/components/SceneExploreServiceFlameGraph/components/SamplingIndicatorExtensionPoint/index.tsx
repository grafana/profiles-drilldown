import { usePluginComponent } from '@grafana/runtime';
import { SceneObject } from '@grafana/scenes';
import React from 'react';

import { safeInterpolate } from '../../../../infrastructure/series/helpers/safeInterpolate';

type SamplingIndicatorExtensionProps = {
  serviceName: string;
  datasourceUID: string;
};

const SERVICE_NAME_EXPR = '${serviceName}';
const DATASOURCE_UID_EXPR = '${dataSource}';

export function SamplingIndicatorExtensionPoint({ scene }: { scene: SceneObject }) {
  const { component: Extension } = usePluginComponent<SamplingIndicatorExtensionProps>(
    'grafana-adaptiveprofiles-app/sampling-indicator/v1'
  );

  if (!Extension) {
    return null;
  }

  // interpolation can fail during variable bootstrap or return the expression unchanged; fail closed
  const serviceName = safeInterpolate(scene, SERVICE_NAME_EXPR);
  if (!serviceName || serviceName === SERVICE_NAME_EXPR) {
    return null;
  }

  const datasourceUID = safeInterpolate(scene, DATASOURCE_UID_EXPR);
  if (!datasourceUID || datasourceUID === DATASOURCE_UID_EXPR) {
    return null;
  }

  return <Extension datasourceUID={datasourceUID} serviceName={serviceName} />;
}
