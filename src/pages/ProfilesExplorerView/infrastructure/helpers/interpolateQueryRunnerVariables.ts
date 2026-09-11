import { AdHocVariableFilter } from '@grafana/data';
import { sceneGraph, SceneObject } from '@grafana/scenes';
import { clone, defaults, uniqBy } from 'lodash';

import { GridItemData } from '../../components/SceneByVariableRepeaterGrid/types/GridItemData';
import { AllServicesFilterVariable } from '../../domain/variables/FiltersVariable/AllServicesFilterVariable';
import { FiltersVariable } from '../../domain/variables/FiltersVariable/FiltersVariable';
import { getSceneVariableValue } from '../../helpers/getSceneVariableValue';

type InterpolatedQueryRunnerParams = GridItemData['queryRunnerParams'] & {
  serviceName: string;
  profileMetricId: string;
  filters: AdHocVariableFilter[];
};

export function interpolateQueryRunnerVariables(
  sceneObject: SceneObject,
  item: GridItemData
): InterpolatedQueryRunnerParams {
  const { queryRunnerParams } = item;

  const interpolatedParams = defaults(clone(queryRunnerParams), {
    serviceName: getSceneVariableValue(sceneObject, 'serviceName'),
    profileMetricId: getSceneVariableValue(sceneObject, 'profileMetricId'),
  });

  // state.filters has the AdHocFilterWithLabels[] type so we get rid of keyLabel and valueLabel
  const parsedFilters = (sceneGraph.lookupVariable('filters', sceneObject) as FiltersVariable).state.filters.map(
    ({ key, operator, value }) => ({ key, operator, value })
  );

  const allServicesFilterVariable = sceneGraph.lookupVariable('filtersAllServices', sceneObject) as
    | AllServicesFilterVariable
    | undefined;
  const allServicesFilters =
    allServicesFilterVariable?.state.filters.map(({ key, operator, value }) => ({ key, operator, value })) ?? [];

  interpolatedParams.filters = uniqBy(
    [...(interpolatedParams.filters || []), ...parsedFilters, ...allServicesFilters],
    ({ key, operator, value }) => `${key}${operator}${value}`
  );

  return interpolatedParams as InterpolatedQueryRunnerParams;
}
