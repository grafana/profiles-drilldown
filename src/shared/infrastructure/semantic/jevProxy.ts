import { config, getBackendSrv } from '@grafana/runtime';
import { isConfidenceThreshold } from '@shared/domain/semantic/confidenceThreshold';
import { CONFIDENCE_THRESHOLD } from '@shared/domain/semantic/jevRubric';
import { lastValueFrom } from 'rxjs';

const SETTINGS_URL = '/api/plugins/grafana-pyroscope-app/settings';

interface AppSettings {
  enabled: boolean;
  pinned: boolean;
  jsonData?: Record<string, unknown>;
  secureJsonFields?: Record<string, boolean>;
}

export interface JevConfiguration {
  enabled: boolean;
  keyConfigured: boolean;
  confidenceThreshold: number;
}

export function isJevAdmin(): boolean {
  return config.bootData.user.isSignedIn && config.bootData.user.orgRole === 'Admin';
}

function requireOrganization(orgId: number) {
  if (!isJevAdmin() || !Number.isSafeInteger(orgId) || orgId <= 0 || orgId !== config.bootData.user.orgId) {
    throw new Error('Classification requires an admin in the original organization.');
  }
}

async function loadSettings(orgId: number): Promise<AppSettings> {
  requireOrganization(orgId);
  const response = await lastValueFrom(
    getBackendSrv().fetch<AppSettings>({
      url: SETTINGS_URL,
      method: 'GET',
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      retry: 0,
      showErrorAlert: false,
    })
  );
  requireOrganization(orgId);
  return response.data;
}

export async function saveJevConfiguration(
  enabled: boolean,
  apiKey: string,
  confidenceThreshold = CONFIDENCE_THRESHOLD
): Promise<void> {
  if (!isJevAdmin()) {
    throw new Error('Classification configuration requires a Grafana organization admin.');
  }
  if (!isConfidenceThreshold(confidenceThreshold)) {
    throw new Error('Invalid confidence threshold');
  }
  const orgId = config.bootData.user.orgId;
  const settings = await loadSettings(orgId);
  requireOrganization(orgId);
  const key = apiKey.trim();
  await lastValueFrom(
    getBackendSrv().fetch({
      url: SETTINGS_URL,
      method: 'POST',
      retry: 0,
      showErrorAlert: false,
      showSuccessAlert: false,
      hideFromInspector: true,
      headers: { 'X-Grafana-Org-Id': String(orgId) },
      data: {
        enabled: settings.enabled,
        pinned: settings.pinned,
        jsonData: {
          ...settings.jsonData,
          semanticClassificationEnabled: enabled,
          semanticClassificationConfidenceThreshold: confidenceThreshold,
        },
        ...(key ? { secureJsonData: { jevApiKey: key } } : {}),
      },
    })
  );
}

export async function requestJev(
  body: string,
  signal: AbortSignal,
  orgId = config.bootData.user.orgId
): Promise<unknown> {
  if (!isJevAdmin()) {
    throw new Error('Classification requires a Grafana organization admin.');
  }
  requireOrganization(orgId);
  signal.throwIfAborted();
  if (!body || new TextEncoder().encode(body).byteLength > 32768) {
    throw new Error('Classification request exceeds its size limit.');
  }
  try {
    const response = await lastValueFrom(
      getBackendSrv().fetch<string>({
        url: '/api/plugin-proxy/grafana-pyroscope-app/jev',
        method: 'POST',
        data: body,
        headers: { 'Content-Type': 'application/json', 'X-Grafana-Org-Id': String(orgId) },
        responseType: 'text',
        abortSignal: signal,
        // Grafana treats 0 as the first attempt and resends local 401s after a login ping.
        retry: 1,
        showErrorAlert: false,
        showSuccessAlert: false,
        hideFromInspector: true,
      })
    );
    signal.throwIfAborted();
    requireOrganization(orgId);
    if (typeof response.data !== 'string' || new TextEncoder().encode(response.data).byteLength > 262144) {
      throw new Error('Invalid response');
    }
    return JSON.parse(response.data);
  } catch {
    signal.throwIfAborted();
    throw new Error('Classification request failed.');
  }
}

export async function loadJevConfiguration(): Promise<JevConfiguration> {
  if (!isJevAdmin()) {
    return { enabled: false, keyConfigured: false, confidenceThreshold: CONFIDENCE_THRESHOLD };
  }
  const settings = await loadSettings(config.bootData.user.orgId);
  const threshold = settings.jsonData?.semanticClassificationConfidenceThreshold;
  return {
    enabled: settings.jsonData?.semanticClassificationEnabled === true,
    keyConfigured: settings.secureJsonFields?.jevApiKey === true,
    confidenceThreshold: isConfidenceThreshold(threshold) ? threshold : CONFIDENCE_THRESHOLD,
  };
}
