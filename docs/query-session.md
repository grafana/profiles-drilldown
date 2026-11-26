# Drilldown metadata query session

Each active `SceneProfilesExplorer` owns one lazily opened WebSocket. Series discovery, group-by labels/counts, query-builder suggestions, and recording-rule label discovery all use that connection. Embedded Drilldowns own independent sessions. Switching datasources closes the previous connection before opening a replacement; scene deactivation closes it and discards pending work.

## Backend requirements

The selected datasource must point to a Pyroscope query frontend exposing:

```text
GET /querier.v1.QuerierService/Session?accept=application%2Fjson&user-agent=profiles-drilldown%2F<VERSION>
```

`VERSION` comes from the plugin's `package.json`. Browser WebSockets cannot set a custom `User-Agent` header, so the identifier is a URL parameter.

The transport uses the JSON-only protocol from Pyroscope's `api/querysession/v1/querysession.proto`, including multiplexed request IDs, pagination, and connection-wide string-table epochs. There is no legacy metadata HTTP fallback. Time-series and profile queries are unchanged.

Grafana's authenticated datasource proxy carries the upgrade and datasource credentials/tenant headers. Its proxy utility strips browser `Origin` before forwarding, which is compatible with Pyroscope's same-origin policy. Grafana and any intervening ingress must allow WebSocket upgrades. No credentials are placed in the URL.

**Required lifecycle fix:** Pyroscope must release cursor/session quota on explicit cancellation and disconnect. The accompanying changes in `~/git/github.com/grafana/pyroscope/main/pkg/frontend/querysession/websocket.go` implement this. Without that fix, completed metadata queries retain the default 16-session tenant quota until TTL expiry and browsing many labels eventually fails. Drilldown explicitly cancels each root query after collecting its final page to release its server-side cursors.

## Lifecycle and cancellation

- At most four metadata operations execute concurrently per Drilldown, below the backend's default eight active page requests.
- Query builders have separate cancellation scopes and bounded caches; cancelling a suggestion request never closes the connection or cancels another consumer.
- Series reads share a bounded scene-local promise cache. Cache identity includes query type, time range, matchers, and projection; datasource changes and scene teardown invalidate it.
- Frames for cancelled requests still update the shared dictionary. Dictionary resets take effect only on an authoritative server reset frame.
- Disconnects reject in-flight reads. A subsequent read opens a fresh connection and dictionary; cursors are never replayed onto a replacement connection.
- Connection establishment times out after ten seconds. Requests cancelled or scenes deactivated while connecting settle without waiting for the upgrade.

## Verification

```sh
pnpm exec tsc --noEmit
pnpm exec jest --runInBand
pnpm run build
cd ~/git/github.com/grafana/pyroscope/main
go test -race ./pkg/frontend/querysession
```

For an environment smoke test, open Drilldown against that backend and inspect the browser Network panel: one active `Session` WebSocket per Drilldown, the versioned `user-agent` parameter, multiplexed metadata frames, and no `Series`, `LabelNames`, or `LabelValues` HTTP requests. Change datasource, navigate away, and browse more than 16 labels to check replacement, teardown, and quota release respectively.
