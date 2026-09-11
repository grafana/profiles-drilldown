import { getBackendSrv, isAppPluginInstalled } from '@grafana/runtime';
import { logger } from '@shared/infrastructure/tracking/logger';
import { useQuery } from '@tanstack/react-query';
import { GRAFANA_LLM_APP_ID } from 'src/constants';

const LLM_PLUGIN_ROUTE = `/api/plugins/${GRAFANA_LLM_APP_ID}`;

// Request options shared across the calls below to prevent `getBackendSrv()` from surfacing a
// non-actionable toast notification, e.g. "Access Denied" when the user lacks permission to read
// the plugin settings (a 403 from `/settings`), similar in spirit to issue #757.
const SILENT_REQUEST_OPTIONS = { showSuccessAlert: false, showErrorAlert: false };

type LlmProviderHealth = { configured: boolean; ok: boolean };

/**
 * Mirrors `openai.enabled()` from `@grafana/llm`, but suppresses error toasts so that a 403
 * ("Access Denied") response from `/settings` (e.g. missing RBAC permission) is treated the same
 * as the LLM plugin being disabled, instead of flashing a non-actionable pop-up.
 */
async function isLlmPluginEnabled(): Promise<boolean> {
  const isLlmAppInstalled = await isAppPluginInstalled(GRAFANA_LLM_APP_ID);

  if (!isLlmAppInstalled) {
    return false;
  }

  try {
    const settings = await getBackendSrv().get(`${LLM_PLUGIN_ROUTE}/settings`, undefined, undefined, {
      ...SILENT_REQUEST_OPTIONS,
    });

    if (!settings?.enabled) {
      return false;
    }

    const health = await getBackendSrv().get(`${LLM_PLUGIN_ROUTE}/health`, undefined, undefined, {
      ...SILENT_REQUEST_OPTIONS,
    });

    const details = health?.details;
    const provider: LlmProviderHealth | undefined = details?.llmProvider ?? details?.openAI;

    return Boolean(provider?.configured && provider?.ok);
  } catch {
    // Expected if the plugin is not installed, the settings/health checks fail, or the user is
    // not allowed to read the plugin settings (403 "Access Denied").
    return false;
  }
}

export function useFetchLlmPluginStatus() {
  const { data, isFetching, error } = useQuery({
    queryKey: ['llm'],
    queryFn: isLlmPluginEnabled,
  });

  if (error) {
    logger.error(error, { info: 'Error while checking the status of the Grafana LLM plugin!' });
  }

  return { isEnabled: Boolean(data), isFetching, error };
}
