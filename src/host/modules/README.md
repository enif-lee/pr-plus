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

| File | Starts with | Responsibility |
|------|-------------|----------------|
| `host-core-detail-store.ts` | `HOST_ID` | Host ids, `current`, detail-store apply/publish, route/embed helpers used early |
| `side-fetch-progress-assets.ts` | `kickIndependentSideFetches` | Side fetches, load progress, CSS/assets, list/detail cache peeks |
| `props-render-session.ts` | `buildProps` | React props builder, render, close/session abort |
| `open-modal.ts` | `openModal` | Open PR modal path (first paint + progressive detail) |
| `restore-embed-list-focus.ts` | `tryRestoreOpenModal` | Persist restore, embed watch, list-row focus helpers |
| `list-row-lifecycle.ts` | `openPullsListRowAt` | Pulls list open, filter bar, list hotkeys, GH palette grace |
| `pulls-palette.ts` | `PULLS_PALETTE_ROOT_ID` | Pulls-page command palette UI + actions |
| `click-intercept.ts` | `onClickCapture` | List click intercept + host install |
