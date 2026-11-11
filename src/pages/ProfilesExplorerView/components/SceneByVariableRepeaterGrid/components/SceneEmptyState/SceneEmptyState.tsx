import { SceneComponentProps, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { EmptyState } from '@grafana/ui';
import React from 'react';

interface SceneEmptyStateState extends SceneObjectState {
  message: string;
}

export class SceneEmptyState extends SceneObjectBase<SceneEmptyStateState> {
  public static Component = ({ model }: SceneComponentProps<SceneEmptyState>) => {
    const { message } = model.useState();
    return <EmptyState message={message} variant="not-found" />;
  };
}
