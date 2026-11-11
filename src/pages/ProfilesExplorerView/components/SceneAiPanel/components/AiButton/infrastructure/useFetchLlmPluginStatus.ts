import { getAppPluginHealth } from '@grafana/plugin-compat/apps';
import { isAppPluginEnabled, isAppPluginInstalled } from '@grafana/runtime';
import { logger } from '@shared/infrastructure/tracking/logger';
import { useQuery } from '@tanstack/react-query';
import { GRAFANA_LLM_APP_ID } from 'src/constants';

type LlmProviderHealth = { configured: boolean; ok: boolean };
type HealthDetails = { llmProvider?: LlmProviderHealth; openAI?: LlmProviderHealth };

/**
 * Mirrors `openai.enabled()` from `@grafana/llm`, but suppresses error toasts so that a 403
 * ("Access Denied") response from `/settings` (e.g. missing RBAC permission) is treated the same
 * as the LLM plugin being disabled, instead of flashing a non-actionable pop-up.
 */
async function isLlmPluginEnabled(): Promise<boolean> {
  try {
    const installed = await isAppPluginInstalled(GRAFANA_LLM_APP_ID);
    if (!installed) {
      return false;
    }

    const enabled = await isAppPluginEnabled(GRAFANA_LLM_APP_ID);
    if (!enabled) {
      return false;
    }

    const health = await getAppPluginHealth(GRAFANA_LLM_APP_ID);
    if (!health?.details) {
      return false;
    }

    const details: HealthDetails = health.details;
    const provider = details.llmProvider ?? details.openAI;

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
