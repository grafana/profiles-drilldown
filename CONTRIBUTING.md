# Contributing to Grafana Profiles Drilldown

Welcome! We're excited that you're interested in contributing. Below are some basic guidelines.

We love accepting contributions! To help us create a safe and positive community experience, we require all participants to adhere to the [Grafana Code of Conduct](https://github.com/grafana/grafana/blob/main/CODE_OF_CONDUCT.md).

## Filing issues

Use [GitHub Issues](https://github.com/grafana/profiles-drilldown/issues/new) to report bugs, ask questions, or propose larger changes.

| Situation | What to do |
|-----------|------------|
| **Bug** — something is broken or regressed | [Open a bug report](https://github.com/grafana/profiles-drilldown/issues/new?template=bug_report.md) with reproduction steps, expected vs actual behavior, Grafana/Pyroscope versions, and screenshots or recordings if helpful. |
| **Small fix** — typo, clear one-file change, docs tweak | Open a pull request directly; link a related issue if one exists. |
| **Feature or larger change** — new UI, behavior change, refactor | [Open a feature request](https://github.com/grafana/profiles-drilldown/issues/new?template=feature_request.md) to discuss scope, or open a draft PR with context in the description. |
| **Documentation only** | Open a PR and add the `type/doc` label. |

For bugs, check [Pyroscope](https://grafana.com/docs/grafana/latest/datasources/pyroscope/) and [Grafana profiling](https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/) behavior first — missing profile data outside the selected time window or filters may be expected, not a plugin bug.

## Workflow

Grafana Profiles Drilldown follows a standard GitHub pull request workflow. If you're unfamiliar with this workflow, read the very helpful [Understanding the GitHub flow](https://guides.github.com/introduction/flow/) guide from GitHub.

You are welcome to create draft PRs at any stage of readiness - this
can be helpful to ask for assistance or to develop an idea.  
Before a piece of work is finished, it should:

- Be organised into one or more commits, each of which has a commit message that describes all changes made in that commit ('why' more than 'what' - we can read the diffs to see the code that changed).
- Each commit should build towards the whole - don't leave in back-tracks and mistakes that you later corrected.
- Have unit for new functionality or tests that would have caught the bug being fixed.

## Requirements

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en) v20
- pnpm
- [Docker](https://www.docker.com/get-started/) or [OrbStack](https://orbstack.dev/download) (lighter alternative)

### Dependency install (supply-chain)

Always install with a frozen lockfile and lifecycle scripts disabled:

```shell
pnpm install --frozen-lockfile --ignore-scripts
```

Or run `pnpm run deps` (same command). `pnpm-workspace.yaml` sets `frozenLockfile: true` and `ignoreScripts: true`, so plain `pnpm install` enforces both even without flags.

When you change dependencies and need to update `pnpm-lock.yaml`, run:

```shell
pnpm install --no-frozen-lockfile --ignore-scripts
```

Review `overrides` in `pnpm-workspace.yaml` when security advisories land, and run `pnpm audit` after dependency changes.

CI runs via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`grafana/plugin-ci-workflows`), which runs the package manager’s frozen install command (`pnpm install --frozen-lockfile` for this repo). When bumping that reusable workflow, confirm installs still use a frozen lockfile and skip lifecycle scripts (`pnpm-workspace.yaml` is copied into the job).

## Get started

1. Clone the repository `git clone git@github.com:grafana/profiles-drilldown.git`
2. Install the dependencies: `pnpm install --frozen-lockfile --ignore-scripts`
3. Build the plugin in dev mode: `pnpm run dev`
4. Start the Grafana server (with static data): `pnpm run server:static`
5. Optionally, to enable the **GitHub integration feature**, read the "Enable GitHub integration" section below.

Then visit http://localhost:3000/a/grafana-pyroscope-app

**Alternatively:**

- To use **live remote data**, read the "Enable with live remote profile data" section below.
- To use **a local version of Pyroscope**, read the "Enable with a local version of Pyroscope" section below.
- To use **a local version of Grafana**, read [this section](docs/GRAFANA-CROSS-DEVELOPMENT.md).

### Enable with live remote profile data

1. If not already done, copy the content of the `.env.local` file to a new `.env` file in the root directory.
2. Fill in the missing `REMOTE_` values in the `.env` file.
3. Start the Grafana server: `pnpm run server:remote`

### Enable with a local version of Pyroscope

1. Start the local version of Pyroscope (see [Pyroscope's contributing guide](https://github.com/grafana/pyroscope/tree/main/docs/internal/contributing))
2. Execute `pnpm run server:local`

### Enable GitHub integration ("Function details")

When clicking on a node of the flame graph, the plugin can offer to display information about the function being profiled in the form of a "Function details" contextual menu item.

To enable this feature:

1. If not already done, copy the content of the `.env.local` file to a new `.env` file in the root directory.
2. Fill in the missing `GITHUB_` values in the `.env` file.
3. Start the Grafana server.

For more information, refer to the [Pyroscope GitHub integration](https://grafana.com/docs/grafana-cloud/monitor-applications/profiles/pyroscope-github-integration/) documentation.

### Enable AI integration ("Explain Flame Graph")

The plugin can help understand flame graphs by using a large-language model (LLM) to assist with profiling data interpretation.

To enable this feature:

1. If not already done, copy the content of the `.env.local` file to a new `.env` file in the root directory.
2. Fill in the missing `OPENAI_` values in the `.env` file.
3. Start the Grafana server.

For more information, refer to the [Flame graph AI](https://grafana.com/docs/grafana-cloud/monitor-applications/profiles/flamegraph-ai/) documentation.

## Contribution guidelines

For developing in this repo, requirements are generally managed by lint rules and pre-commit hooks. However, for other things, like code organization, please follow the pattern established by the rest of the repo.

In case of doubt, have a look at ["Profiles Drilldown frontend architecture"](docs/CODE-ARCHITECTURE.md)

### Lint and format your code

We use [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) to lint and format our code. These will be run in a pre-commit hook, but you can also setup your IDE to run them on save.

### Commit messages and PR titles

We use [conventional commits](https://www.conventionalcommits.org/) to format our commit messages. This allows us to automatically generate changelogs and version bumps.

When opening a Pull Request (PR), please make sure that the title is properly prefixed with one of the following type: `feat`, `fix`, `docs`, `test`, `ci`, `refactor`, `perf`, `chore` or `revert`.

### Test your code

We encourage you to write tests, whether they are unit tests or end-to-end tests. They will give us the confidence that the plugin behaves as intended and help us capture any regression early.

For end-to-end testing (E2E), please have a look at our [E2E testing documentation](e2e/README.md).

### Before you open a pull request

- Fill out the [pull request template](.github/pull_request_template.md) with a clear summary and test steps.
- Use a [conventional commit](https://www.conventionalcommits.org/) style PR title (enforced by CI).
- Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test:ci` locally.
- Add or update tests when behavior changes. Prefer focused unit tests (Jest) or Playwright E2E when UI flows are affected.
- Do not modify files under `.config/` unless you are following the plugin-tools guidance in `.config/AGENTS/instructions.md`.

### Internationalization (i18n)

User-facing strings must use Grafana i18n APIs — `t` or `Trans` from `@grafana/i18n` with a stable `i18nKey`, not hard-coded text in components.

After adding or changing copy:

1. Run `pnpm run i18n-extract` to update `src/locales/en-US/grafana-pyroscope-app.json`.
2. Commit the extracted English locale file with your PR.

CI runs an i18n verification workflow on pull requests. Translations for other locales are managed via Crowdin and synced after changes merge to `main`; you do not need to hand-edit non-English locale files in most PRs.

## Using AI and coding assistants

Generative AI tools can help you explore the codebase, draft code, and write documentation. **You are always responsible for what you submit.**

Read the full [Generative AI Contribution Policy](docs/genai.md) for acceptable use, disclosure, Profiles Drilldown-specific guidance (Pyroscope, Scenes, tests), and rules for agentic tools. Point coding assistants at [AGENTS.md](AGENTS.md) for technical conventions.

When AI generated the bulk of a pull request, check the disclosure box in the pull request template.

## Common problems & solutions

...
