import { ApiClient } from '@shared/infrastructure/http/ApiClient';
import { useState } from 'react';
import { useAsync } from 'react-use';

import { SceneProfilesExplorer } from '../components/SceneProfilesExplorer/SceneProfilesExplorer';

interface Props {
  initialDS?: string;
  createScene: (initialDS: string) => SceneProfilesExplorer;
}

interface Result {
  scene?: SceneProfilesExplorer;
  error?: Error;
}

export function useProfilesExploration({ initialDS, createScene }: Props): Result {
  const [initial] = useState(() => {
    const result: Result = {};

    if (initialDS) {
      try {
        result.scene = createScene(initialDS);
      } catch (error) {
        result.error = error instanceof Error ? error : new Error(String(error));
      }
    }

    return { ...result, createScene };
  });

  const { value: scene, error } = useAsync(async () => {
    if (initial.scene || initial.error) {
      return initial.scene;
    }

    const { uid } = await ApiClient.selectDefaultDataSource();
    return initial.createScene(uid);
  }, []);

  return {
    scene: initial.scene ?? scene,
    error: initial.error ?? error,
  };
}
