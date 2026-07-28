# Host modules (function-boundary)

Assembled into `src/pr-modal-host.js` by `scripts/build-host.mjs`.

## Rules

1. **Start only at a top-level function or stable constant** (`HOST_ID`, `function openModal`, …). Never mid-`.catch` / mid-expression.
2. **≤1500 lines** per module.
3. Shared state is the IIFE lexical closure documented in `../host-context.d.ts` (`current`, `detailFetchGen`, React root, …).
4. Prefer writing detail via `PRModalDetailStore` slice APIs; project with `toAppDetail` for React props.
5. Do not edit assembled `pr-modal-host.js` — edit modules here, then `npm run build:host`.

## Module map

| File | Starts with | Responsibility |
|------|-------------|----------------|
| `01-state-detail-store.js` | `HOST_ID` | host ids, `current`, detail-store apply/publish |
| `02-embed-route-progress.js` | `kickIndependentSideFetches` | embed + progress kick |
| `03-side-fetches-props.js` | `buildProps` | props builder + side settle |
| `04-open-render.js` | `openModal` | open + render path |
| `05-lifecycle.js` | `openPullsListRowAt` | list open + lifecycle |
| `06-part.js` | `onClickCapture` | click intercept entry |
