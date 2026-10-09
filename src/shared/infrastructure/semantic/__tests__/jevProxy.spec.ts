import { OrgRole } from '@grafana/data';
import { config, getBackendSrv } from '@grafana/runtime';
import { of, throwError } from 'rxjs';

import plugin from '../../../../plugin.json';
import { loadJevConfiguration, requestJev, saveJevConfiguration } from '../jevProxy';

jest.mock('@grafana/runtime', () => ({
  config: { bootData: { user: { orgRole: 'Admin', isSignedIn: true } } },
  getBackendSrv: jest.fn(),
}));

const fetch = jest.fn();

beforeEach(() => {
  jest.mocked(getBackendSrv).mockReturnValue({ fetch } as unknown as ReturnType<typeof getBackendSrv>);
  config.bootData.user.orgRole = OrgRole.Admin;
  config.bootData.user.isSignedIn = true;
  config.bootData.user.orgId = 1;
  fetch.mockReturnValue(of({ data: {} }));
});

test('loads opt-in configuration without retrieving the secret', async () => {
  fetch.mockReturnValue(
    of({ data: { jsonData: { semanticClassificationEnabled: true }, secureJsonFields: { jevApiKey: true } } })
  );
  await expect(loadJevConfiguration()).resolves.toEqual({
    enabled: true,
    keyConfigured: true,
    confidenceThreshold: 0.8,
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/api/plugins/grafana-pyroscope-app/settings', retry: 0 })
  );
});

test.each([
  [0.4, 0.4],
  [0, 0],
  [1, 1],
  [0.801, 0.801],
  [undefined, 0.8],
  [null, 0.8],
  ['', 0.8],
  ['0.4', 0.8],
  [false, 0.8],
  [-0.1, 0.8],
  [1.1, 0.8],
  [NaN, 0.8],
  [Infinity, 0.8],
])('loads saved confidence threshold %p as %p', async (stored, expected) => {
  fetch.mockReturnValue(of({ data: { jsonData: { semanticClassificationConfidenceThreshold: stored } } }));
  expect((await loadJevConfiguration()).confidenceThreshold).toBe(expected);
});

test.each([
  [OrgRole.Viewer, true],
  [OrgRole.Editor, true],
  [OrgRole.Admin, false],
] as const)('does not load configuration for role %s with signed-in status %s', async (role, signedIn) => {
  config.bootData.user.orgRole = role;
  config.bootData.user.isSignedIn = signedIn;
  await expect(loadJevConfiguration()).resolves.toEqual({
    enabled: false,
    keyConfigured: false,
    confidenceThreshold: 0.8,
  });
  expect(fetch).not.toHaveBeenCalled();
});

test('saving the opt-in preserves other settings and leaves an unchanged key untouched', async () => {
  fetch.mockReturnValueOnce(
    of({
      data: {
        enabled: true,
        pinned: true,
        jsonData: { existing: 'keep' },
        secureJsonFields: { jevApiKey: true, gcomApiToken: true },
      },
    })
  );
  await saveJevConfiguration(true, '', 0.4);
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      data: {
        enabled: true,
        pinned: true,
        jsonData: {
          existing: 'keep',
          semanticClassificationEnabled: true,
          semanticClassificationConfidenceThreshold: 0.4,
        },
      },
    })
  );
});

test.each([-0.1, 1.1, NaN, Infinity])('refuses invalid threshold %p before fetching settings', async (threshold) => {
  await expect(saveJevConfiguration(false, '', threshold)).rejects.toThrow('Invalid confidence threshold');
  expect(fetch).not.toHaveBeenCalled();
});

test('stores a new key only in secureJsonData', async () => {
  await saveJevConfiguration(true, 'synthetic-secret');
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      hideFromInspector: true,
      headers: { 'X-Grafana-Org-Id': '1' },
      data: expect.objectContaining({ secureJsonData: { jevApiKey: 'synthetic-secret' } }),
    })
  );
  expect(fetch.mock.calls[1][0].data.jsonData).toEqual({
    semanticClassificationEnabled: true,
    semanticClassificationConfidenceThreshold: 0.8,
  });
});

test.each(['', '   ', '\n\t'])('preserves the saved key for a blank replacement %j', async (key) => {
  await saveJevConfiguration(true, key);
  expect(fetch.mock.calls[1][0].data.secureJsonData).toBeUndefined();
});

test('trims a pasted key before storing it', async () => {
  await saveJevConfiguration(true, '  synthetic-secret\n');
  expect(fetch.mock.calls[1][0].data.secureJsonData).toEqual({ jevApiKey: 'synthetic-secret' });
});

test('refuses configuration changes for a non-admin', async () => {
  config.bootData.user.orgRole = OrgRole.Editor;
  await expect(saveJevConfiguration(true, 'synthetic-secret')).rejects.toThrow('organization admin');
  expect(fetch).not.toHaveBeenCalled();
});

test('sends one cancellable request through Grafana without a browser credential', async () => {
  const body = JSON.stringify({
    model: 'typesafe/jev-1.13',
    state: { evidence: { target: 'synthetic', callers: [] } },
  });
  const signal = new AbortController().signal;
  fetch.mockReturnValue(of({ data: '{"reply":"synthetic"}' }));
  await expect(requestJev(body, signal)).resolves.toEqual({ reply: 'synthetic' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith({
    url: '/api/plugin-proxy/grafana-pyroscope-app/jev',
    method: 'POST',
    data: body,
    headers: { 'Content-Type': 'application/json', 'X-Grafana-Org-Id': '1' },
    responseType: 'text',
    abortSignal: signal,
    retry: 1,
    showErrorAlert: false,
    showSuccessAlert: false,
    hideFromInspector: true,
  });
});

test.each(['unauthorized', 'aborted', 'oversized'])(
  'refuses a %s request before contacting the proxy',
  async (reason) => {
    const controller = new AbortController();
    if (reason === 'unauthorized') {
      config.bootData.user.orgRole = OrgRole.Viewer;
    }
    if (reason === 'aborted') {
      controller.abort();
    }
    fetch.mockReturnValue(of({ data: '{}' }));
    await expect(requestJev(reason === 'oversized' ? 'x'.repeat(32769) : '{}', controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  }
);

test.each(['http', 'malformed', 'oversized'])('sanitizes a %s response without retrying', async (reason) => {
  fetch.mockReturnValue(
    reason === 'http'
      ? throwError(() => ({ status: 503, message: 'provider-private' }))
      : of({ data: reason === 'malformed' ? 'provider-private' : JSON.stringify('x'.repeat(262145)) })
  );
  await expect(requestJev('{}', new AbortController().signal)).rejects.toThrow('Classification request failed.');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('bounds the serialized request bytes without encoding the body twice', async () => {
  const body = JSON.stringify({ state: '"'.repeat(15000) });
  fetch.mockReturnValue(of({ data: '{}' }));
  await expect(requestJev(body, new AbortController().signal)).resolves.toEqual({});
  expect(fetch.mock.calls[0][0].data).toBe(body);
});

test.each(['load', 'save'])('rejects a stale organization during configuration %s', async (operation) => {
  const pending = operation === 'load' ? loadJevConfiguration() : saveJevConfiguration(true, 'synthetic-secret');
  config.bootData.user.orgId = 2;
  await expect(pending).rejects.toThrow('organization');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0].headers).toEqual({ 'X-Grafana-Org-Id': '1' });
});

test('refuses a classification scheduled for another organization', async () => {
  config.bootData.user.orgId = 2;
  await expect(requestJev('{}', new AbortController().signal, 1)).rejects.toThrow('organization');
  expect(fetch).not.toHaveBeenCalled();
});

test('drops a reply when the organization changes during the request', async () => {
  fetch.mockReturnValue(of({ data: '{"reply":"synthetic"}' }));
  const pending = requestJev('{}', new AbortController().signal, 1);
  config.bootData.user.orgId = 2;
  await expect(pending).rejects.toThrow('Classification request failed.');
});

test('suppresses Grafana identity and navigation headers before forwarding', () => {
  const headers = new Map(
    plugin.routes.find((route) => route.path === 'jev')!.headers.map((header) => [header.name, header.content])
  );
  for (const name of [
    'X-Grafana-Context',
    'X-Grafana-Id',
    'X-Grafana-User',
    'X-Grafana-Org-Id',
    'X-Grafana-NoCache',
    'X-Grafana-Device-Id',
    'X-Grafana-Referer',
    'Referer',
    'Traceparent',
    'Tracestate',
    'Baggage',
    'X-Request-Id',
    'User-Agent',
    'Accept-Language',
    'Sec-CH-UA',
    'Sec-CH-UA-Mobile',
    'Sec-CH-UA-Platform',
    'Sec-Fetch-Dest',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Site',
    'Priority',
    'Forwarded',
    'X-Real-Ip',
    'X-Forwarded-For',
    'Uber-Trace-Id',
  ]) {
    expect(headers.get(name)).toBe('');
  }
});

test('declares a fixed signed-in admin proxy route with a server-held secret', () => {
  expect(plugin.routes.find((route) => route.path === 'jev')).toEqual(
    expect.objectContaining({
      path: 'jev',
      method: 'POST',
      url: '{{ if .JsonData.semanticClassificationEnabled }}{{ if .SecureJsonData.jevApiKey }}https://openrouter.ai/api/v1/systemone{{ end }}{{ end }}',
      reqSignedIn: true,
      reqRole: 'Admin',
      headers: expect.arrayContaining([{ name: 'Authorization', content: 'Bearer {{ .SecureJsonData.jevApiKey }}' }]),
    })
  );
});
