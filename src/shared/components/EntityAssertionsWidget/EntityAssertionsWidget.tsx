import { TimeRange } from '@grafana/data';
import type { EntityAssertionsWidgetProps } from '@grafana/plugin-types/grafana-asserts-app';
import { usePluginComponent } from '@grafana/runtime';
import { sceneGraph, SceneObject } from '@grafana/scenes';
import React, { ReactElement, useCallback, useSyncExternalStore } from 'react';

export const ENTITY_ASSERTIONS_WIDGET_ID = 'grafana-asserts-app/entity-assertions-widget/v1';

export type EntityAssertionsWidgetExternal = (props: EntityAssertionsWidgetProps) => ReactElement | null;

interface Props {
  serviceName: string;
  model: SceneObject;
}

export function useServiceName(model: SceneObject) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const variable = sceneGraph.lookupVariable('serviceName', model);
      if (!variable) {
        return () => {};
      }

      const sub = variable.subscribeToState(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    [model]
  );
  const getSnapshot = useCallback(() => {
    const variable = sceneGraph.lookupVariable('serviceName', model);
    // The Service dropdown renders state.value. getValue() can be empty while options reload.
    return variable ? readServiceName(variableValue(variable.state)) : undefined;
  }, [model]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function EntityAssertionsWidget({ serviceName, model }: Props) {
  const { isLoading, component: EntityAssertionsWidgetExternal } =
    usePluginComponent<EntityAssertionsWidgetProps>(ENTITY_ASSERTIONS_WIDGET_ID);
  const timeRange = useSceneTimeRange(model);

  if (isLoading || !EntityAssertionsWidgetExternal || !timeRange || !serviceName) {
    return null;
  }

  // Profile label filters are not trace attributes. Asserts applies additionalMatchers as entity
  // properties, so forwarding them makes the service lookup return nothing and the button unmounts.
  const { entityName, scope } = entityQueryFromService(serviceName);

  return (
    <EntityAssertionsWidgetExternal
      size="md"
      source="Profiles Drilldown"
      query={{
        start: timeRange.from.valueOf(),
        end: timeRange.to.valueOf(),
        entityName,
        entityType: 'Service',
        scope,
        enabled: true,
      }}
      returnToPrevious={true}
    />
  );
}

function useSceneTimeRange(model: SceneObject): TimeRange {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const timeRange = sceneGraph.getTimeRange(model);
      const sub = timeRange.subscribeToState(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    [model]
  );
  const getSnapshot = useCallback(() => sceneGraph.getTimeRange(model).state.value, [model]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Pyroscope service ids are often `namespace/service`. Asserts matches the service segment
 * and stores the namespace on the entity scope, so `ns-a/checkout` and `ns-b/checkout` stay
 * distinct. A name with no slash, or with more than one, is sent whole: the slash may be
 * part of the entity name itself.
 */
export function entityQueryFromService(serviceName: string): {
  entityName: string;
  scope?: { namespace: string };
} {
  const parts = serviceName.split('/').filter(Boolean);

  if (parts.length === 2) {
    return { entityName: parts[1], scope: { namespace: parts[0] } };
  }

  if (parts.length === 1) {
    return { entityName: parts[0] };
  }

  return { entityName: serviceName };
}

function variableValue(state: object): unknown {
  return 'value' in state ? state.value : undefined;
}

function readServiceName(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }

  return undefined;
}
