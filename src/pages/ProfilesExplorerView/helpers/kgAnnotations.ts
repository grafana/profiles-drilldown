import { t } from '@grafana/i18n';
import { getDataSourceInstanceList } from '@grafana/plugin-compat/datasources';
import {
  dataLayers,
  SceneDataLayerSet,
  sceneGraph,
  SceneObjectBase,
  SceneObjectRef,
  SceneObjectState,
} from '@grafana/scenes';
import { DataQuery } from '@grafana/schema';
import { isKnowledgeGraphDataSource } from '@shared/domain/datasources';
import { logger } from '@shared/infrastructure/tracking/logger';
import { KG_DATASOURCE_TYPE, KG_DATASOURCE_UID } from 'src/constants';

import { KgAnnotationToggle } from './KgAnnotationToggle';

interface KgSceneProps {
  $data: SceneDataLayerSet;
  behaviors: KgAnnotationBehavior[];
  controls: KgAnnotationToggle;
}

export async function isKgAnnotationsAvailable(): Promise<boolean> {
  const instances = await getDataSourceInstanceList({ all: true, filter: isKnowledgeGraphDataSource }).catch(
    (error) => {
      logger.debug('Failed to get Knowledge Graph data sources', { error });
      return [];
    }
  );
  return Boolean(instances.length);
}

function getSeverities() {
  return [
    { value: 'critical', color: 'red', label: t('profiles.kg-annotations.severity-critical', 'Critical') },
    { value: 'warning', color: 'yellow', label: t('profiles.kg-annotations.severity-warning', 'Warning') },
    { value: 'info', color: 'blue', label: t('profiles.kg-annotations.severity-info', 'Info') },
  ];
}

function createAdvancedAnnotationLayers(entityType: string, entityName: string) {
  return getSeverities().map(
    (s) =>
      new dataLayers.AnnotationsDataLayer({
        name: `Insights - ${s.label}`,
        isEnabled: true,
        isHidden: true,
        query: {
          datasource: { type: KG_DATASOURCE_TYPE, uid: KG_DATASOURCE_UID },
          enable: true,
          iconColor: s.color,
          name: `KG Assertions - ${s.label}`,
          target: {
            refId: `kgAnnotations-${s.value}`,
            queryType: 'annotations',
            queryMode: 'advanced',
            severityFilter: [s.value],
            advancedQuery: {
              filterCriteria: [
                {
                  entityType,
                  propertyMatchers: [{ name: 'name', value: entityName, op: '=' }],
                  havingAssertion: true,
                },
              ],
            },
          } as unknown as DataQuery,
        },
      })
  );
}

function createFromLabelsAnnotationLayers(labels: Record<string, string>, datasourceUid: string) {
  return getSeverities().map(
    (s) =>
      new dataLayers.AnnotationsDataLayer({
        name: `Insights - ${s.label}`,
        isEnabled: true,
        isHidden: true,
        query: {
          datasource: { type: KG_DATASOURCE_TYPE, uid: KG_DATASOURCE_UID },
          enable: true,
          iconColor: s.color,
          name: `KG Assertions - ${s.label}`,
          target: {
            refId: `kgAnnotations-${s.value}`,
            queryType: 'annotations',
            queryMode: 'fromLabels',
            severityFilter: [s.value],
            fromLabelsQuery: {
              telemetryType: 'profile',
              datasourceUid,
              labels,
            },
          } as unknown as DataQuery,
        },
      })
  );
}

/** Exploration types where a single service is selected and annotations are relevant. */
const SERVICE_EXPLORATION_TYPES = new Set(['profiles', 'labels', 'flame-graph', 'diff-flame-graph']);

interface KgAnnotationBehaviorState extends SceneObjectState {
  layerSet: SceneObjectRef<SceneDataLayerSet>;
  toggle: SceneObjectRef<KgAnnotationToggle>;
  entityType: string;
  serviceNameVarKey: string;
}

class KgAnnotationBehavior extends SceneObjectBase<KgAnnotationBehaviorState> {
  constructor(state: KgAnnotationBehaviorState) {
    super(state);
    this.addActivationHandler(this._onActivate);
  }

  private _onActivate = () => {
    const serviceNameVar = sceneGraph.lookupVariable(this.state.serviceNameVarKey, this);
    if (!serviceNameVar) {
      return;
    }

    const dsVar = sceneGraph.lookupVariable('dataSource', this);

    this.updateLayers(serviceNameVar, dsVar);

    const subs = [
      serviceNameVar.subscribeToState(() => {
        this.updateLayers(serviceNameVar, dsVar);
      }),
    ];

    if (dsVar) {
      subs.push(
        dsVar.subscribeToState(() => {
          this.updateLayers(serviceNameVar, dsVar);
        })
      );
    }

    // Subscribe to the parent scene's explorationType to clear layers on views without a single service
    const parent = this.parent;
    if (parent) {
      subs.push(
        parent.subscribeToState(() => {
          this.updateLayers(serviceNameVar, dsVar);
        })
      );
    }

    return () => {
      subs.forEach((s) => s.unsubscribe());
    };
  };

  private updateLayers(
    serviceNameVar: ReturnType<typeof sceneGraph.lookupVariable>,
    dsVar: ReturnType<typeof sceneGraph.lookupVariable> | undefined
  ) {
    const serviceName = serviceNameVar?.getValue() as string;
    const explorationType = (this.parent?.state as { explorationType?: string })?.explorationType;
    const isServiceView = explorationType != null && SERVICE_EXPLORATION_TYPES.has(explorationType);

    const layerSet = this.state.layerSet.resolve();
    const toggle = this.state.toggle.resolve();

    if (!isServiceView) {
      layerSet.setState({ layers: [] });
      return;
    }

    const datasourceUid = (dsVar?.getValue() as string) || '';
    let layers: ReturnType<typeof createAdvancedAnnotationLayers>;

    if (serviceName) {
      // When we have a known service name, use the deterministic advanced query
      layers = createAdvancedAnnotationLayers(this.state.entityType, serviceName);
    } else if (datasourceUid) {
      // Fall back to fromLabels and let KG resolve entities
      layers = createFromLabelsAnnotationLayers({ service_name: serviceName }, datasourceUid);
    } else {
      layerSet.setState({ layers: [] });
      return;
    }

    layerSet.setState({ layers });
    toggle.syncLayerEnabledState();
  }
}

export async function getKgSceneProps(
  entityType: string,
  serviceNameVarKey: string
): Promise<KgSceneProps | undefined> {
  if (!(await isKgAnnotationsAvailable())) {
    return undefined;
  }

  const layerSet = new SceneDataLayerSet({ name: 'Insights', layers: [] });

  const toggle = new KgAnnotationToggle({
    key: 'kg-annotations-toggle',
    isEnabled: true,
    layerSetRef: new SceneObjectRef(layerSet),
  });

  const behavior = new KgAnnotationBehavior({
    layerSet: new SceneObjectRef(layerSet),
    toggle: new SceneObjectRef(toggle),
    entityType,
    serviceNameVarKey,
  });

  return {
    $data: layerSet,
    behaviors: [behavior],
    controls: toggle,
  };
}
