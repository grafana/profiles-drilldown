# Dependency patches

Applied by pnpm through `patchedDependencies` in `pnpm-workspace.yaml`.

## `@grafana__flamegraph@13.1.0.patch`

Adds optional renderer hooks to `@grafana/flamegraph` 13.1.0 (classic and `enableNewUI` flame graph). Without these
props, rendering and tooltips stay the same, except for the [`keepFocusOnDataChange` fix](#keepfocusondatachange-fix).

All row numbers are indices into the `data` DataFrame passed to `FlameGraph`.

| Addition                                        | Contract                                                                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `highlightedRows?: ReadonlySet<number>`         | When set and no text search is active, frames that are exactly one of these rows keep their color. All other frames are muted. Ignored in sandwich view. Collapsed groups stay muted. Memoize the set: a new set repaints. |
| `getFrameTooltipContent?: (frame) => ReactNode` | Appended to the hover tooltip and rendered as React children (strings are escaped). A falsy result appends nothing.                                                                                                        |
| `getExtraContextMenuButtons` `state.frame`      | The clicked frame, from the flame graph context menu and from call tree row actions.                                                                                                                                       |
| `FlameGraphFrame` (exported type)               | `{ kind: 'source'; row }` is exactly one unmodified row. `{ kind: 'derived'; rows }` is a sandwich or callers-tree merge, or a collapsed group. `rows` are unique and ascending.                                           |

The top table and the call tree do not highlight rows. The call tree has no hover tooltip.
Keep the tooltip callback pure. Return a React element if its content needs hooks; do not call hooks in the callback.
Do not pass highlighting to diff profiles. The hook does not distinguish CPU categories from diff colors.

### `keepFocusOnDataChange` fix

The flame graph rebuilds its data when `data`, `disableCollapsing` or the theme changes. Drilldown turns collapsing off
while `highlightedRows` is set, so each category toggle rebuilds from the same DataFrame. Upstream then refocuses the
first frame with the focused label, which can move the focus to another frame with the same name. With
`keepFocusOnDataChange`, the patch changes this for all consumers:

- A rebuild from the same `data` object keeps the focused frame and zoom unchanged.
- A new `data` object is refocused by label as upstream does, even if its rows are identical. In the new UI, the pane
  whose focus has the same rows as the shared focus then sets the shared rows to the refocused frame, or clears them
  if no frame has the label. Upstream keeps the old rows, which then refocus whatever frame has those row numbers in
  the new DataFrame. Other panes can keep an older focus, for example after Remove focus, sandwich view or a call tree
  focus on merged callers rows. They refocus only locally, as upstream does.

Without `keepFocusOnDataChange`, the upstream reset on every rebuild is unchanged.

The patch edits the ESM, CJS and type files under `dist/`. It follows the original sources shipped in the package
source maps. The source maps themselves are not updated.

To change the patch:

```sh
editDir=$(mktemp -d)
pnpm patch @grafana/flamegraph@13.1.0 --edit-dir "$editDir/flamegraph"
# edit dist/esm, dist/cjs and dist/types
pnpm patch-commit "$editDir/flamegraph"
```

Keep the edit directory outside the checkout so Jest and ESLint do not scan its generated files.
Verification: `src/shared/components/FlameGraph/domain/__tests__/rendererExtensions.spec.tsx`.

Drop the patch when upstream `@grafana/flamegraph` has equivalent props, or rebase it when the package version changes.
