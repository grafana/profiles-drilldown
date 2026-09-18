# Project context (local)

## Identity

- **Product name (short):** Profiles Drilldown
- **Product name (first mention in prose):** Grafana Profiles Drilldown
- **GitHub org/repo:** grafana/profiles-drilldown (formerly `grafana/explore-profiles`; some links still point to the old repo)
- **What it is:** A Grafana app plugin (frontend-only, `backend: false`) for queryless exploration of profiling data stored in Pyroscope. Plugin id: `grafana-pyroscope-app`.

## Branches and releases

- **Default development branch:** `main`
- **Release branch pattern:** none — the plugin releases from `main` via tags/CHANGELOG (no long-lived `release-X.Y` branches).
- **Docs version mapping:** Docs publish under Grafana's simplified exploration path (`.../explore/simplified-exploration/profiles/`), not per plugin version. Screenshots are versioned by plugin release (for example, `v1.17.0`, `v2.2.0`). Plugin version lives in `package.json` (`version`); `src/plugin.json` uses `%VERSION%` placeholder at build time.

## Documentation paths

- **Documentation root (filesystem):** `docs/sources/`
- **Section landing page:** `docs/sources/_index.md` (sets `FULL_PRODUCT_NAME` / `PRODUCT_NAME` cascade and card grid)
- **Generated pages (do not hand-edit):** none in this repo — docs are hand-written Markdown built with Hugo (`make -C docs docs` / `pnpm run docs:dev`). There is no generated config/values reference.
- **Configuration reference index:** none (frontend plugin; no server config reference)
- **Changelog:** `CHANGELOG.md` at repo root
- **Architecture / "start here" page:** `AGENTS.md` (entry point), then `docs/application-structure.md` (product organization, views, URL state) and `docs/CODE-ARCHITECTURE.md`

## Helm chart

Not applicable — Profiles Drilldown is a Grafana app plugin with no Helm chart.

## Code ↔ documentation mapping

| Code area | Documentation area |
| --------- | ------------------- |
| `src/pages/ProfilesExplorerView/` (exploration shell, all views) | `docs/sources/choose-a-view/`, `docs/sources/investigate/` |
| `SceneExploreAllServices`, `SceneExploreServiceProfileTypes`, `SceneExploreServiceLabels` | `docs/sources/choose-a-view/`, `docs/sources/concepts/` |
| `SceneExploreServiceFlameGraph/SceneFlameGraph.tsx`, `SceneFunctionDetailsPanel` | `docs/sources/investigate/flame-graph-ai.md`, `docs/sources/concepts/flame-graphs.md` |
| `SceneExploreDiffFlameGraph` (diff view) | `docs/sources/investigate/` |
| `src/pages/SettingsView/` | `docs/sources/access/profile-settings.md`, `docs/sources/access/_index.md` |
| `SceneCreateMetricModal` / recording rules | `docs/sources/create-metrics-from-profiles/` |

## Code validation paths

Paths the agent should check when validating documentation claims against code.

| What to validate | Where to look |
|-----------------|---------------|
| Exploration types / view names / tabs | `src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/components/ui/ExplorationTypeSelector.tsx`, `SceneExplore*` components |
| URL state / variables / filters | `src/pages/ProfilesExplorerView/domain/`, `.../domain/variables/FiltersVariable/` |
| Plugin metadata (id, nav, extensions, Grafana dependency, languages) | `src/plugin.json` |
| UI strings / labels (must match docs bold UI text) | `src/locales/en-US/grafana-pyroscope-app.json` |
| Flame graph / function details behavior | `src/pages/ProfilesExplorerView/components/SceneExploreServiceFlameGraph/` |
| Shared helpers / domain logic | `src/shared/`, `src/pages/ProfilesExplorerView/helpers/` |

## Frontmatter and site conventions

- **Cascade:** `docs/sources/_index.md` sets `FULL_PRODUCT_NAME: Grafana Profiles Drilldown` and `PRODUCT_NAME: Profiles Drilldown`; reference in prose with `{{< param "PRODUCT_NAME" >}}`.
- **Weight / ordering:** Pages ordered by `weight` in frontmatter (for example, `_index.md` = 200, `choose-a-view` = 500). Lower weight sorts first.
- **Internal link style:** Relative links ending in a trailing slash (for example, `../concepts/`, `../investigate/`) — not `.md`.
- **Canonical:** Most pages set `canonical:` to the published grafana.com simplified-exploration URL.
- **Shortcodes:** Hugo shortcodes are used (`{{< docs/shared >}}`, `{{< card-grid >}}`, `{{< youtube >}}`, admonitions). GitHub preview won't render them.

## Conventions for agents

- **Query language / API naming:** No query language of its own. Uses Pyroscope profiling concepts — services, **profile types** (for example, CPU, memory/alloc), **labels**, and **flame graphs**. Data comes from a Pyroscope data source.
- **Exploration type names (exact UI terms):** **All services**, **Profile types**, **Labels**, **Flame graph**, **Diff flame graph**, **Favorites** (selected via **Exploration** tabs).
- **Framework:** Built on `@grafana/scenes` (scene objects extend `SceneObjectBase`; state synced to URL). See the Scenes section in `AGENTS.md`.
- **Package manager / checks:** pnpm. After code changes run `pnpm run lint` and `pnpm run typecheck`. Install with `pnpm install --frozen-lockfile --ignore-scripts` (this is also what `pnpm start` runs before `pnpm dev`).
- **Vale or linter config location:** No Vale config in this repo. Follow the Grafana Writers' Toolkit style guide (https://grafana.com/docs/writers-toolkit/). Code linting is ESLint + Prettier (`pnpm run lint`, `pnpm run format:fix`).
- **i18n:** UI strings are localized; extract with `pnpm run i18n-extract`. English source of truth is `src/locales/en-US/grafana-pyroscope-app.json`.

## Subsystem knowledge

- **`AGENTS.md`** (repo root) — primary entry point: doc map, code anchors, Scenes patterns, expected-vs-bug guidance, security rules.
- **`.config/AGENTS/instructions.md`** — plugin tooling only (webpack, `plugin.json`, E2E); do not modify `.config`.
- **`docs/project-intent.md`** — philosophy and scope, for tradeoff/scope decisions.
- **`docs/application-structure.md`** — user journeys, views, exploration types, URL behavior; read when changing UI or URL state.
- **`docs/CODE-ARCHITECTURE.md`** and **`docs/GRAFANA-CROSS-DEVELOPMENT.md`** — code layout and cross-repo development.
- **`docs/genai.md`** — AI-assisted contribution policy.

## Related products / cross-repo coordination

- **Pyroscope** (`grafana/pyroscope`, sibling checkout at `../pyroscope`) is the profiling backend that stores and serves the data this plugin visualizes. Profiling concepts (profile types, labels, flame graphs) must stay consistent with Pyroscope docs.
- The plugin consumes several Grafana exposed components (for example, Adaptive Profiles resolution boost / sampling indicator, add-to-dashboard form, query library) declared in `src/plugin.json` — behavior changes there can affect docs.
