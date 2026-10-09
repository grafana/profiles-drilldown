# Function Classification experiment

This hackathon prototype groups CPU flame graph functions by their predicted role. It uses `typesafe/jev-1.13` through OpenRouter. Predictions and confidence scores are not validated measurements of accuracy. Keep deployment limited to the intended test stack until a separate rollout and security review.

## Configure

1. Open **Administration → Plugins and data → Plugins → Profiles Drilldown → Function Classification**, or `/plugins/grafana-pyroscope-app?page=semantic`.
2. Enter an OpenRouter API key with access to `typesafe/jev-1.13` and available spending allowance.
3. Set **Confidence threshold** between 0 and 1. The default is 0.8. Lower values accept more suggestions, not more accurate predictions.
4. Enable function classification and save.

Only signed-in organization admins can configure or request classification. Grafana encrypts the key in `secureJsonData`; frontend assets and public settings do not contain it. Saving preserves unrelated settings and existing secure fields. The server proxy blocks upstream requests when classification is disabled or the key is missing.

Restart Grafana after installing a new plugin build. Grafana must reload the plugin manifest and asset list. Existing profile tabs keep their loaded threshold until reloaded or reactivated.

## Classify a profile

Open a single CPU flame graph with a selected service. Open the **Function Classification** panel and choose **Classify**. Nothing is classified automatically.

The run considers all eligible occurrences, including zero-self parents with positive total CPU. It groups identical evidence, reuses cached predictions, and sends up to eight concurrent requests with at most 32 cases each. Each batch also has a byte limit and a 20-second deadline. There are no automatic retries or model fallbacks. A failed batch stops further scheduling and aborts outstanding requests. Cancellation cannot guarantee that an already-started request is unbilled.

Category totals use self CPU, not sums of nested inclusive values. The denominator is the full profile, including unclassified work. Focusing a frame does not change it. Choose a category to highlight its original rows, or **All functions** to restore normal rendering. **Clear** removes results. Text search takes precedence. Top-table and call-tree category filtering are follow-up work.

Hover a frame or open **Classification details** from its context menu to inspect its prediction. Model confidence is not a calibrated probability of correctness. Suggestions below the threshold remain visible but count as unclassified. Unknown answers remain unclassified at any threshold. Derived or merged frames do not inherit a single occurrence's prediction.

Highlighting temporarily disables collapsing without changing the saved preference. Focus stays on the same occurrence, but manually expanded groups can reset when highlighting changes. The renderer patch and its tests are documented in [patches/README.md](../patches/README.md).

Changing the profile, query, datasource, service, or time range clears results and stops pending work. The in-memory cache holds at most 20,000 predictions across scopes. Keys include the organization, datasource, model/rubric, service identity, and evidence. There is no browser persistence or cross-organization reuse. Reloading clears the cache. A later explicit run can apply a different threshold to cached predictions without fetching them again.

## Data sent and limits

- Requests contain the category rubric, selected service name, and bounded target and caller symbols. They do not include a full profile, source code, profile identifier, selector, or annotation.
- The proxy destination is fixed to `https://openrouter.ai/api/v1/systemone`. This is not Grafana's LLM chat API.
- The route clears known user-context, identity, referrer, browser, tracing, and forwarded-IP headers. Grafana then adds `X-Forwarded-For` with its client-peer IP. This is not an anonymous connection or a general header allowlist.
- Keep data-proxy body logging disabled. Do not send evidence, credentials, or raw provider errors to analytics. This feature adds no classification telemetry.
- Client limits are not server-enforced quotas. Keep OpenRouter budgets and guardrails in place.
- Old tabs can still show cached results after an admin disables classification. The server blocks new upstream requests.
- Memory, diff, and ad-hoc profiles are not supported.
- Every build includes the opt-in route and configuration page. A disabled setting is not a deployment gate.

## Verify

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run i18n-extract-check
pnpm run typecheck
pnpm run lint
pnpm run test:ci
pnpm run build
```

Unit tests cover request bounds, batching, cancellation, cache isolation, settings, scene lifecycle, and the patched renderer.

To check proxy headers with a synthetic key and a local recording endpoint:

```sh
pnpm exec playwright install chromium
node scripts/test-semantic-proxy-headers.mjs
```

This requires Docker Desktop and a built plugin. It starts a separate Grafana container using the pinned 13.1.3 image, checks received headers from Node and Chromium, and verifies that opt-out and a missing key block upstream requests. It never contacts OpenRouter. It preserves its temporary directory and container, stopping the container only after success. Results do not establish header behavior on other Grafana versions or behind other proxies.

## Build for a test stack

Open a draft PR to use the existing PR CI signing and packaging workflow. Do not run **Plugins Platform Publish - CD**. PR CI does not publish to the catalog or deploy through Argo.

After CI succeeds, use its universal ZIP URL and plugin version for an explicit per-stack provisioned-plugin override. Restart that stack and configure the key there. Removing the override restores the stack's normal plugin installation. The local demo setup is separate from this PR and is not required for a signed build.
