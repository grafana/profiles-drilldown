import {
  EmbeddedSceneState,
  SceneComponentProps,
  sceneGraph,
  SceneObjectBase,
  SceneVariableSet,
} from '@grafana/scenes';
import React from 'react';

import { SceneByVariableRepeaterGrid } from '../../components/SceneByVariableRepeaterGrid/SceneByVariableRepeaterGrid';
import { FavAction } from '../../domain/actions/FavAction';
import { SelectAction } from '../../domain/actions/SelectAction';
import { AllServicesFilterVariable } from '../../domain/variables/FiltersVariable/AllServicesFilterVariable';
import { ProfileMetricVariable } from '../../domain/variables/ProfileMetricVariable';
import { ServiceNameVariable } from '../../domain/variables/ServiceNameVariable/ServiceNameVariable';
import { SceneLayoutSwitcher } from '../SceneByVariableRepeaterGrid/components/SceneLayoutSwitcher';
import { PanelType } from '../SceneByVariableRepeaterGrid/components/ScenePanelTypeSwitcher';
import { SceneQuickFilter } from '../SceneByVariableRepeaterGrid/components/SceneQuickFilter';

interface SceneExploreAllServicesState extends EmbeddedSceneState {}

export class SceneExploreAllServices extends SceneObjectBase<SceneExploreAllServicesState> {
  constructor() {
    super({
      key: 'explore-all-services',
      $variables: new SceneVariableSet({
        variables: [
          // we use a custom instance of ServiceNameVariable to display only the services associated to the selected profile metric
          new ServiceNameVariable({
            query: ServiceNameVariable.QUERY_PROFILE_METRIC_AND_FILTERS,
            skipUrlSync: true,
          }),
        ],
      }),
      body: new SceneByVariableRepeaterGrid({
        key: 'all-services-grid',
        variableName: 'serviceName',
        mapOptionToItem: (option, index, { profileMetricId }) => ({
          index,
          value: option.value as string,
          label: option.label,
          queryRunnerParams: {
            serviceName: option.value as string,
            profileMetricId,
            extraFilterVariables: ['filtersAllServices'],
          },
          panelType: PanelType.TIMESERIES,
        }),
        headerActions: (item) => [
          new SelectAction({ type: 'view-profiles', item }),
          new SelectAction({ type: 'view-labels', item }),
          new SelectAction({ type: 'view-flame-graph', item }),
          new FavAction({ item }),
        ],
      }),
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    sceneGraph
      .findByKeyAndType(this, 'quick-filter', SceneQuickFilter)
      .setPlaceholder('Search services (comma-separated regexes are supported)');

    const localServiceNameVar = sceneGraph.lookupVariable('serviceName', this) as ServiceNameVariable;
    const mainServiceNameVar = sceneGraph.lookupVariable('serviceName', this.parent!) as ServiceNameVariable;

    const sub = localServiceNameVar.subscribeToState((newState, prevState) => {
      if (!newState.loading && prevState.loading && newState.options.length > 0) {
        const currentValue = String(mainServiceNameVar.state.value ?? '');
        const isCurrentValid = currentValue && newState.options.some((o) => String(o.value) === currentValue);
        if (!isCurrentValid) {
          mainServiceNameVar.changeValueTo(newState.options[0].value as string);
        }
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }

  // see SceneProfilesExplorer
  getVariablesAndGridControls() {
    return {
      variables: [
        sceneGraph.findByKeyAndType(this, 'profileMetricId', ProfileMetricVariable),
        sceneGraph.findByKeyAndType(this, 'filtersAllServices', AllServicesFilterVariable),
      ],
      gridControls: [
        sceneGraph.findByKeyAndType(this, 'quick-filter', SceneQuickFilter),
        sceneGraph.findByKeyAndType(this, 'layout-switcher', SceneLayoutSwitcher),
      ],
    };
  }

  static Component({ model }: SceneComponentProps<SceneExploreAllServices>) {
    const { body } = model.useState();

    return <body.Component model={body} />;
  }
}
