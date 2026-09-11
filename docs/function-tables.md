# Backend function tables

The service flame graph and diff flame graph views request their top tables independently of the flame graph. This prevents tree truncation from changing function totals or the table's ranking.

The requests use the selected Pyroscope data source's Grafana proxy:

| View           | RPC                                                | Format                     |
| -------------- | -------------------------------------------------- | -------------------------- |
| Single profile | `querier.v1.QuerierService/SelectMergeStacktraces` | `PROFILE_FORMAT_FUNCTIONS` |
| Diff           | `querier.v1.QuerierService/Diff`                   | `PROFILE_FORMAT_FUNCTIONS` |

Both requests use `maxNodes` as the function row limit. A diff sends one limit on the outer request, after the backend has joined the two profiles. Profile types, label filters, millisecond time ranges, and single-profile span/profile selectors match the corresponding flame graph selection. Refresh also refetches the table for fixed time ranges.

The API returns full profile totals before limiting rows. The shared `@grafana/flamegraph` component accepts the converted data through its optional `functionTable` prop. Diff columns keep Grafana's existing percentage rounding, relative change, and added/removed behavior. Sorting and search operate on the returned rows.

The diff flame graph also uses the `Diff` RPC, with its default flamegraph format and `maxNodes` on each selection. Drilldown converts the response to its existing Flamebearer representation, preserving the unit conventions and both profile totals for exports. It no longer calls `/pyroscope/render-diff`.

While a new table request is pending, its table is empty; changing selections cancels the previous request. Query failures appear in the panel. An `unimplemented` response or a legacy flame graph response falls back to the existing tree-derived table. An explicitly empty function table stays empty.

## Dependencies and validation

TODO before merging: [grafana/grafana#132374](https://github.com/grafana/grafana/pull/132374) must merge, a new `@grafana/flamegraph` package must be published, and Drilldown's dependency must be updated to that version. The currently pinned package does not export `FunctionTable` or support the `functionTable` prop.

Ship the [Pyroscope function-table APIs](https://github.com/grafana/pyroscope/pull/5627) before releasing this integration. Local development can install a tarball built from the corresponding Grafana worktree with `pnpm add @grafana/flamegraph@file:./grafana-flamegraph-local.tgz --no-frozen-lockfile --ignore-scripts`. Keep the tarball and dependency overrides out of the source commit; replace them with the published package before merging.

The API client and query lifecycle regressions are in `src/pages/ProfilesExplorerView/infrastructure/functions/`. Grafana's flamegraph tests cover supplied rows absent from the tree, search, empty tables, full diff denominators, and percentage behavior.

For a browser check, provision a Pyroscope data source pointing at a server with the new API, then open both views with a small `maxNodes` (for example, 5). Verify that the proxy requests above return `functions`, the table renders their rows, and retained function values and full profile totals remain unchanged when `maxNodes` changes. In the diff view, verify that each side's profile total is the denominator, then use Refresh to verify a new table request.
