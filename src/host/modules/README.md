# Host modules (semantic domains)

Assembled into `src/pr-modal-host.js` by `scripts/build-host.mjs`.

## Rules

1. **Start only at a top-level function or stable constant** (`HOST_ID`, `function openModal`, …). Never mid-`.catch` / mid-expression.
2. **≤1500 lines** per module. If a domain grows, split by **sub-domain**, not line-cap mid-function.
3. Shared state is the IIFE lexical closure documented in `../host-context.d.ts` (`current`, `detailFetchGen`, React root, …).
4. Prefer writing detail via `PRModalDetailStore` slice APIs; project with `toAppDetail` for React props.
5. Do not edit assembled `pr-modal-host.js` — edit modules here, then `npm run build:host`.
6. **Assembly order** is `HOST_MODULE_ORDER` in `scripts/build-host.mjs` (semantic basenames, not `01-` prefixes).

## Module map

| File | Responsibility |
|------|----------------|
| `host-core-authority.ts` | Host ids, prefs, `current` bag, authority helpers |
| `host-core-store.ts` | Detail-store apply / publish |
| `host-core-timeline-a.ts` / `host-core-timeline-b.ts` | Timeline helpers |
| `side-fetch-kick.ts` | Kick independent side fetches |
| `side-fetch-progress.ts` | Load progress |
| `side-fetch-cache-assets.ts` | CSS/assets, list/detail cache peeks |
| `detail-on-patch.ts` | `onPatchDetail` ack path |
| `props-build.ts` | React props builder |
| `props-render-close.ts` | Render, close / session abort |
| `open-modal-run.ts` | Open PR modal run (first paint + progressive detail) |
| `open-modal.ts` | `openModal` entry |
| `restore-embed-list-focus.ts` | Persist restore, embed watch, list-row focus |
| `list-row-lifecycle.ts` | Pulls list open, filter bar, list hotkeys |
| `pulls-palette-state.ts` / `pulls-palette-render.ts` / `pulls-palette-keys.ts` | Pulls-page command palette |
| `auto-refresh-watch.ts` | head.sha poll (modal + embed) |
| `click-intercept.ts` | List click intercept + host install |
