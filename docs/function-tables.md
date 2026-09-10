# Backend function tables

The service flame graph and diff flame graph views request their top tables independently of the flame graph. This prevents tree truncation and progressive refinement from changing function totals or the table's ranking.

The requests use the selected Pyroscope data source's Grafana proxy:

| View | RPC | Format |
| --- | --- | --- |
| Single profile | `querier.v1.QuerierService/SelectMergeStacktraces` | `PROFILE_FORMAT_FUNCTIONS` |
| Diff | `querier.v1.QuerierService/Diff` | `PROFILE_FORMAT_FUNCTIONS` |

Both requests use `maxNodes` as the function row limit. A diff sends one limit on the outer request, after the backend has joined the two profiles. Profile types, label filters, millisecond time ranges, and single-profile span/profile selectors match the corresponding flame graph selection. Refresh also refetches the table for fixed time ranges.

The API returns full profile totals before limiting rows. The shared `@grafana/flamegraph` component accepts the converted data through its optional `functionTable` prop. Diff columns keep Grafana's existing percentage rounding, relative change, and added/removed behavior. Sorting and search operate on the returned rows. The existing `/pyroscope/render-diff` request continues to supply the flame graph.

While a new table request is pending, its table is empty; changing selections cancels the previous request. Query failures appear in the panel. An `unimplemented` response or a legacy flame graph response falls back to the existing tree-derived table. An explicitly empty function table stays empty.

## Dependencies and validation

Ship the Pyroscope function-table APIs and a version of `@grafana/flamegraph` that exports `FunctionTable` and supports the `functionTable` prop before releasing this integration. Local development can install a tarball built from the corresponding Grafana worktree with `pnpm add @grafana/flamegraph@file:./grafana-flamegraph-local.tgz`. This tarball is a local dependency override until the shared package is released.

The API client and query lifecycle regressions are in `src/pages/ProfilesExplorerView/infrastructure/functions/`. Grafana's flamegraph tests cover supplied rows absent from the tree, search, empty tables, full diff denominators, and percentage behavior.

For a browser check, provision a Pyroscope data source pointing at a server with the new API, then open both views with a small `maxNodes` (for example, 5). Verify that the proxy requests above return `functions`, the table renders their rows, and function totals remain unchanged when the flame graph refines. In the diff view, verify that each side's profile total is the denominator, then use Refresh to verify a new table request.
