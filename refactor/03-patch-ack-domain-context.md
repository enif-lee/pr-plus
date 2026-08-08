# Phase 3 — Patch ack + DomainContext (stop localDetail domain writes)

## Goal

1. `onPatchDetail` always returns distinguishable ack.  
2. App mutation helpers stop treating host write as optional void.  
3. Introduce **read path** for domain: `DomainContext` from host `detail` prop (no merge overlay).  
4. Deprecate `setLocalDetail` for domain (shim allowed briefly; no new call sites).

## New files

| Path | Purpose |
|------|---------|
| `src/modal/domain/DomainContext.tsx` | `DomainDetailProvider`, `useDomainDetail()`, optional `useDomainSelector` |
| `src/modal/domain/patch-ack.ts` | `assertPatchAck`, `applyHostPatch` helper (retry once) |
| `tests/domain-context.rstest.tsx` | provider returns host detail; no local merge |

## Edit — host

| Path | Changes |
|------|---------|
| `src/host/modules/detail-on-patch.ts` | Always `ack('applied'|'stale'|'failed')`; never silent catch → applied; narrow key dispatch unchanged |
| `src/host/modules/props-build.ts` | Pass `onPatchDetail` that returns ack; ensure `detail` is store projection only |
| `src/host/modules/host-core-store.ts` | publish after patch applies |

## Edit — app / mutations

| Path | Changes |
|------|---------|
| `src/modal/app/pr-modal-mutations.ts` | `commitMetaPatch` / `commitCommentListPatch`: remove `setLocalDetail` domain writes; use `applyHostPatch` + rely on props/context; handle failed ack toast |
| `src/modal/app/PrModalApp.impl.tsx` | Remove `mergeDetailPreserveOptimistic` effect as domain SoT (or short-circuit: `setLocalDetail(detailProp)` only as temporary bridge); introduce `DomainDetailProvider value={detailProp}` |
| `src/modal/app/PrModalApp.tsx` | Re-export / wire provider if entry splits |
| `src/modal/app/mountPrModal.tsx` | Ensure root still receives host props |

## Edit — store (prepare, not full UI rewrite)

| Path | Changes |
|------|---------|
| `src/modal/store/modal-store.ts` | Mark `localDetail` / `setLocalDetail` `@deprecated`; stop new uses |
| `src/modal/store/data-groups.ts` | Stop exporting `setLocalDetail` in domain groups if present |

## Tests

| Path | Role |
|------|------|
| `tests/detail-patch-contract.rstest.ts` | ack statuses; void not applied |
| `tests/pessimistic-mutations.rstest.ts` | commit paths await ack; no setLocalDetail after API |
| `tests/domain-context.rstest.tsx` | **New** |
| `tests/architecture-gates.rstest.ts` | optional: `onPatchDetail` return shape in host source |

## Consumers to migrate **read** of detail (start here, finish Phase 6–7)

Prefer `useDomainDetail()` over props drilling when touching a file:

| Path | Notes |
|------|-------|
| `src/modal/views/conversation/ConversationView.tsx` | detail from context where easy |
| `src/modal/views/pr-modal/DiffWorkspace.tsx` | same |
| `src/modal/views/chrome/*` | pending count from domain projection |

(Full prop-bag cleanup is Phase 6–7; Phase 3 only needs root provider + mutations not writing local domain.)

## Build / verify

```bash
npm run build:host
npm run build:app-parts
npm run build:modal
npx rstest run tests/detail-patch-contract.rstest.ts tests/pessimistic-mutations.rstest.ts
```

## Exit criteria

- [ ] Host `runOnPatchDetail` always returns status  
- [ ] `commitMetaPatch` / `commitCommentListPatch` do not call `setLocalDetail` for success path  
- [ ] `DomainDetailProvider` mounted at modal root  
- [ ] Temporary: UI may still use `detail = detailProp` without optimistic merge winning over host  

## Next

Phase 4 — extract commands (pending first).
