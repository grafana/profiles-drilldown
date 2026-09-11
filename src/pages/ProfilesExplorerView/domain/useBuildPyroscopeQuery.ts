import { sceneGraph, SceneObject } from '@grafana/scenes';
import { useMemo } from 'react';

import { FiltersVariable } from './variables/FiltersVariable/FiltersVariable';
import { ProfileMetricVariable } from './variables/ProfileMetricVariable';
import { ServiceNameVariable } from './variables/ServiceNameVariable/ServiceNameVariable';

export function useBuildPyroscopeQuery(sceneObject: SceneObject, filterKey: string) {
  const { value: serviceName } = sceneGraph
    .findByKeyAndType(sceneObject, 'serviceName', ServiceNameVariable)
    .useState();

  const { value: profileMetricId } = sceneGraph
    .findByKeyAndType(sceneObject, 'profileMetricId', ProfileMetricVariable)
    .useState();

  const { filterExpression } = sceneGraph.findByKeyAndType(sceneObject, filterKey, FiltersVariable).useState();

  return useMemo(() => {
    const filterExpressionPart = filterExpression ? `,${filterExpression}` : '';
    const labels = `{service_name="${serviceName}"${filterExpressionPart}}`;
    return profileMetricId != null && profileMetricId !== '' ? `${profileMetricId}${labels}` : labels;
  }, [filterExpression, profileMetricId, serviceName]);
}
