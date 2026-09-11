import { DEFAULT_SETTINGS } from '@shared/infrastructure/settings/PluginSettings';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { logger } from '@shared/infrastructure/tracking/logger';

import { useUrlSearchParams } from './useUrlSearchParams';

function useSetDefaultMaxNodes(hasMaxNodes: boolean, setMaxNodes: (newMaxNodes: number) => void) {
  const { isFetching, error, settings } = useFetchPluginSettings({ enabled: !hasMaxNodes });

  if (hasMaxNodes || isFetching) {
    return;
  }

  if (error) {
    logger.error(error);

    setMaxNodes(DEFAULT_SETTINGS.maxNodes);

    return;
  }

  setMaxNodes(settings!.maxNodes);
}

export function useMaxNodesFromUrl(): [number, (newMaxNodes: number) => void] {
  const { searchParams, pushNewUrl } = useUrlSearchParams();
  const fromUrl = Number(searchParams.get('maxNodes') ?? '');

  const setMaxNodes = (newMaxNodes: number) => {
    pushNewUrl({ maxNodes: String(newMaxNodes) });
  };

  useSetDefaultMaxNodes(fromUrl > 0, setMaxNodes);

  // URL missing or 0 before settings load would skip building runners; always give a positive value.
  const maxNodes = fromUrl > 0 ? fromUrl : DEFAULT_SETTINGS.maxNodes;
  return [maxNodes, setMaxNodes];
}
