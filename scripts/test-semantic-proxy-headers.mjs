import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

process.umask(0o077);
const root = mkdtempSync(path.join(tmpdir(), 'jev-proxy-headers-'));
const image = 'grafana/grafana:13.1.3@sha256:ab5cb380e3ff3172d6c8bd2e7cfd31cce977d2881b260e1f5bc089bf0b759b43';
const name = `jev-headers-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const requests = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const captured = { headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString()) };
  requests.push(captured);
  writeFileSync(path.join(root, `request-${requests.length}.json`), JSON.stringify(captured, null, 2), { flag: 'wx' });
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(captured));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const target = `http://host.docker.internal:${server.address().port}/capture`;
const pluginDir = path.join(root, 'plugin');
cpSync('dist', pluginDir, { recursive: true, errorOnExist: true, force: false });
const manifest = JSON.parse(readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
const route = JSON.parse(readFileSync('src/plugin.json', 'utf8')).routes.find((route) => route.path === 'jev');
const suppressed = route.headers.filter((header) => header.content === '').map((header) => header.name.toLowerCase());
assert(suppressed.includes('x-grafana-context'));
assert(suppressed.includes('referer'));
const localURL = route.url.replace('https://openrouter.ai/api/v1/systemone', target);
assert.equal(
  localURL,
  `{{ if .JsonData.semanticClassificationEnabled }}{{ if .SecureJsonData.jevApiKey }}${target}{{ end }}{{ end }}`,
  'Refuse an unrecognized proxy URL before starting Grafana'
);
manifest.routes = [
  { ...route, path: 'before', url: target, headers: route.headers.filter((header) => header.name === 'Authorization') },
  { ...route, path: 'after', url: localURL },
];
writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
const envFile = path.join(root, 'grafana.env');
writeFileSync(
  envFile,
  [
    `GF_SECURITY_ADMIN_PASSWORD=${password}`,
    'GF_SECURITY_ADMIN_USER=headercheck',
    'GF_PATHS_PLUGINS=/plugins',
    'GF_AUTH_ANONYMOUS_ENABLED=false',
    'GF_USERS_ALLOW_SIGN_UP=false',
    'GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=grafana-pyroscope-app',
    'GF_PLUGINS_PREINSTALL_DISABLED=true',
    'GF_ANALYTICS_REPORTING_ENABLED=false',
    'GF_ANALYTICS_CHECK_FOR_UPDATES=false',
    'GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false',
    'GF_NEWS_NEWS_FEED_ENABLED=false',
    'GF_DATAPROXY_LOGGING=false',
  ].join('\n'),
  { flag: 'wx' }
);
const dockerPath = ['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker'].find(existsSync);
assert(dockerPath, 'Docker CLI was not found in a standard installation directory');
const docker = (...args) => execFileSync(dockerPath, args, { encoding: 'utf8', timeout: 30_000 });
let started = false;
let passed = false;
let browser;
try {
  docker(
    'run',
    '-d',
    '--pull=never',
    '--name',
    name,
    '--env-file',
    envFile,
    '--publish',
    '127.0.0.1::3000',
    '--volume',
    `${pluginDir}:/plugins/grafana-pyroscope-app:ro`,
    image
  );
  started = true;
  const address = docker('port', name, '3000/tcp').trim();
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const base = `http://${address}`;
  const credentials = Buffer.from(`headercheck:${password}`).toString('base64');
  const authorization = `Basic ${credentials}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok;
    } catch {
      ready = false;
    }
    if (ready) {
      break;
    }
    await delay(500);
  }
  assert(ready, 'Test Grafana did not become ready');
  const configure = async (enabled, key) => {
    const settings = await fetch(`${base}/api/plugins/grafana-pyroscope-app/settings`, {
      method: 'POST',
      headers: { authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        pinned: false,
        jsonData: { semanticClassificationEnabled: enabled },
        ...(key ? { secureJsonData: { jevApiKey: key } } : {}),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(settings.status, 200, 'Could not configure the synthetic settings');
  };
  const body = { model: 'synthetic', state: { evidence: { target: 'synthetic', callers: [] } } };
  const send = async (route) => {
    const response = await fetch(`${base}/api/plugin-proxy/grafana-pyroscope-app/${route}`, {
      method: 'POST',
      headers: {
        authorization,
        'Content-Type': 'application/json',
        'X-Grafana-Id': 'synthetic-id-token',
        'X-Grafana-Device-Id': 'synthetic-device',
        'X-Grafana-Org-Id': '1',
        'X-Grafana-NoCache': 'true',
        'X-Request-Id': 'synthetic-request',
        'X-Forwarded-For': '203.0.113.9',
        'X-Real-Ip': '203.0.113.9',
        Forwarded: 'for=203.0.113.9',
        'Uber-Trace-Id': 'synthetic-trace',
        Cookie: 'synthetic-cookie=synthetic-value',
        Referer: `${base}/a/grafana-pyroscope-app/explore?var-serviceName=synthetic-private-service`,
        Traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
        Tracestate: 'synthetic=private',
        Baggage: 'synthetic=private',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, data: response.ok ? await response.json() : null };
  };
  await configure(false);
  assert((await send('after')).status >= 400);
  await configure(true);
  assert((await send('after')).status >= 400);
  assert.equal(requests.length, 0, 'An unconfigured route contacted the upstream');
  await configure(true, 'synthetic-provider-key');
  const before = await send('before');
  assert.equal(before.status, 200);
  assert(before.data.headers['x-grafana-context']);
  assert.match(before.data.headers['x-grafana-referer'], /synthetic-private-service/);
  const allowedHeaders = new Set([
    'host',
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'content-length',
    'connection',
    'cache-control',
    'pragma',
    'x-forwarded-for',
  ]);
  const check = ({ status, data }) => {
    assert.equal(status, 200);
    for (const header of suppressed.filter((name) => name !== 'x-forwarded-for')) {
      assert(!data.headers[header], `Proxy retained ${header}`);
    }
    for (const [header, value] of Object.entries(data.headers)) {
      assert(!value || allowedHeaders.has(header), `Unexpected outbound header: ${header}`);
    }
    for (const header of ['cache-control', 'pragma']) {
      if (data.headers[header]) {
        assert.equal(data.headers[header], 'no-cache');
      }
    }
    assert(data.headers['x-forwarded-for'], 'Expected Grafana to add its peer IP');
    assert(!data.headers['x-forwarded-for'].includes('203.0.113.9'), 'Retained an incoming forwarded-IP chain');
    assert.equal(data.headers.authorization, 'Bearer synthetic-provider-key');
    assert.deepEqual(data.body, body);
  };
  check(await send('after'));
  const { chromium } = await import('@playwright/test');
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort()
  );
  const login = await context.request.post(`${base}/login`, { data: { user: 'headercheck', password } });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(
    async () => {
      try {
        return Boolean((await window.System?.import('@grafana/runtime'))?.getBackendSrv?.());
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 15_000 }
  );
  await page.evaluate(() => history.replaceState(null, '', '/?synthetic-private-service'));
  const sendBrowser = (name) =>
    page.evaluate(
      async ({ name, body }) => {
        const { getBackendSrv } = await window.System.import('@grafana/runtime');
        return new Promise((resolve) => {
          getBackendSrv()
            .fetch({
              url: `/api/plugin-proxy/grafana-pyroscope-app/${name}`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Grafana-Org-Id': '1' },
              data: JSON.stringify(body),
              responseType: 'text',
              abortSignal: AbortSignal.timeout(10_000),
              retry: 1,
              showErrorAlert: false,
              showSuccessAlert: false,
              hideFromInspector: true,
            })
            .subscribe({
              next: (response) => resolve({ status: response.status, data: JSON.parse(response.data) }),
              error: (error) => resolve({ status: error.status, data: null }),
            });
        });
      },
      { name, body }
    );
  const browserBefore = await sendBrowser('before');
  assert.equal(browserBefore.status, 200);
  assert(browserBefore.data.headers['user-agent'].includes('Chrome'));
  assert(browserBefore.data.headers['accept-language']);
  assert.match(browserBefore.data.headers['x-grafana-referer'], /synthetic-private-service/);
  const browserAfter = await sendBrowser('after');
  check(browserAfter);
  assert.equal(requests.length, 4);
  await configure(false);
  assert((await sendBrowser('after')).status >= 400);
  assert.equal(requests.length, 4, 'An opted-out route contacted the upstream');
  writeFileSync(
    path.join(root, 'receipt.json'),
    JSON.stringify(
      {
        image,
        container: name,
        controlForwardedIdentity: true,
        controlForwardedReferrer: true,
        emptyRouteHeaders: suppressed,
        browserHeaderNames: Object.keys(browserAfter.data.headers)
          .filter((name) => browserAfter.data.headers[name])
          .sort(),
        clientPeerIpStillForwarded: true,
        incomingForwardedChainRemoved: true,
        missingKeyBlocked: true,
        optOutBlocked: true,
        cookieRemoved: true,
        serverKeyApplied: true,
        bodyUnchanged: true,
        providerRequests: 0,
      },
      null,
      2
    ),
    { flag: 'wx' }
  );
  passed = true;
  process.stdout.write(`Proxy header checks passed. Artifacts: ${root}\n`);
} finally {
  await browser?.close();
  server.close();
  if (started) {
    writeFileSync(path.join(root, 'grafana.log'), docker('logs', name), { flag: 'wx' });
    if (passed) {
      docker('stop', name);
    } else {
      process.stderr.write(`Test container retained for diagnosis: ${name}. Artifacts: ${root}\n`);
    }
  }
}
