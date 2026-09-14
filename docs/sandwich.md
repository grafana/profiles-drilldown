# Backend sandwich views

Sandwich mode shows every caller and every callee of one function. The flame graph package computes
that from the tree it has, so a truncated tree makes the answer silently incomplete: occurrences of
the function that fell below the detail limit are folded into `other`, and nothing in the response
says which truncated groups hold them.

The request uses the selected Pyroscope data source's Grafana proxy:

| RPC                                                | Format                    | Extra field         |
| -------------------------------------------------- | ------------------------- | ------------------- |
| `querier.v1.QuerierService/SelectMergeStacktraces` | `PROFILE_FORMAT_SANDWICH` | `sandwichFunction`  |

It is sent only while a function is actually sandwiched, keyed on the function plus the current
selection, and refetched on Refresh for fixed time ranges. Nothing is prefetched: the sandwich costs
about what the flame graph itself costs, measured at ~1s for a 1h range and ~3.5s for 24h on
`cortex-dev-01/ruler-querier`.

`maxNodes` is applied per half, so a wide callee side cannot starve the callers. Each half carries an
`other` stand-in for the children it dropped, and the flame graph marks the view `partial` when one
is present, so a cut sandwich does not read as the complete set.

## Why the response cannot be a name tree

Function names arrive once per response in a shared table, referenced by index, because a name
repeats across many nodes. The client resolves them before handing the halves to the package.

## Recursion

Both halves are built from every occurrence of the function, which is what keeps a recursive function
present on both sides at several depths, the way the flame graph renders it today. That sums such a
function's samples more than once, so the report also carries a `total` counted once per sample. That
value matches the function table's total for the same function, and is the one to compare against
when deciding whether a sandwich is complete.

## Dependencies and validation

Requires a Pyroscope with `PROFILE_FORMAT_SANDWICH`. A server without it returns no `sandwich` field,
the client treats that as absent, and the package falls back to computing the sandwich from the
displayed tree, which is the behaviour that shipped before this.

For a browser check, sandwich a widely spread function such as `runtime.memmove` and compare the
direct callers in the pane against the same query run through the proxy by hand; they should match to
displayed precision. A function the profile never saw returns a zero valued root rather than an
absent one, and the package ignores it.
