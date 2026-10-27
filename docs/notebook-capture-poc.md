# Notebook query-context POC

## Entry point and contract

Open a service/label timeseries menu and choose **Add query context to notebook**. This is deliberately context-only: these timeseries use custom scene transformations for refIds, statistics, and exemplars that the dashboard export adapter does not serialize. No chart is fabricated from the untransformed query, and flamegraphs/custom profile providers are not coerced to timeseries.

The entry requires the loaded core `grafana/add-to-notebook-form/v2` component and either `notebooks:create` or `notebooks:write`. The core registers the component only with notebooks enabled. Restart Grafana after changing `plugin.json`. The app owns the modal in `SceneProfilesExplorer`, independent of the dropdown's lifetime.

Local props match the inspected core `AddToNotebookForm.tsx`: `cells: [{ kind: 'markdown', text }]`, `defaultTitle`, `onClose`, and `onAdded`. There is no `type` discriminator or `buildPanel` for this capture. Core owns the notebook picker/write and shared analytics. The completion callback only closes local UI; it never autoattaches a notebook through a separate API.

The existing Add-to-dashboard adapter supplies the resolved query and datasource. At opening, the app retains only the Pyroscope UID, query refId/type, profile type, resolved label selector, group-by, limit, raw relative or ISO absolute bounds, and source timezone. A markdown cell explicitly labels this as context-only and links the allowlisted query/window to Explore using the existing URL adapter. No arbitrary URL parameters, profile payloads, frames, exemplars, or telemetry are copied. The JSON is an indented markdown code block so query text cannot escape a code fence.

## Limits

- Only one metrics query on the existing timeseries menu is supported. Missing datasource, multiple queries, unsupported query types, flamegraphs, diff views, and custom provider panels do not produce captures.
- The handoff reopens the query in Explore, not the precise Profiles scene layout. Timezone is preserved in markdown context; the existing Explore URL adapter does not encode timezone.
- Captured content is text, not a chart, screenshot, flamegraph, or frozen profile. Users must review query/filter values before the core form writes them.
- No browser, live datasource, host integration, deployment, or performance verification has been performed.

## Local verification

Use Node **22.22.0** (`mise.toml`) and package-pinned pnpm **11.11.0**. Install with `pnpm install --frozen-lockfile --ignore-scripts`; no manifests or lockfiles were changed. Local tooling/cache files live under ignored `work/` and `.pnpm-store/` in this repository.

Focused tests cover actual scene query interpolation, allowlisted markdown and source URL contents, raw relative/absolute windows with timezone, mutation after opening, extension/permission gates, unsupported sources, and dismiss/cancel/success callbacks. Run them alongside the existing query-runner and Explore URL tests with one Jest worker. `NODE_PATH=$PWD/node_modules/.pnpm/node_modules` permits existing undeclared external `lodash` imports to resolve in this pnpm checkout. Run `pnpm typecheck`, `pnpm lint --ignore-pattern 'work/**' --ignore-pattern '.pnpm-store/**'`, i18n extraction, and Prettier on changed files.

Verified locally: 4 relevant Jest suites / 24 tests passed, full TypeScript passed, full lint completed with 0 errors and 68 warnings in existing code, and the new action/menu files passed lint with zero warnings. English strings were extracted; the i18n CI check reports no updates. No dependency installation or registry blocker remains. No home/global registry configuration was modified; no authentication script was run.
