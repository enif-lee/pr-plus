# Phase 8 — Hardening, gates, e2e matrix, docs

## Goal

Lock the architecture so regressions reintroduce localDetail, drop latches, full-detail patches, or pre-API domain paint fail CI.

## New / edit — architecture tests

| Path | Action |
|------|--------|
| `tests/architecture-gates.rstest.ts` | Forbidden symbols in `src/modal` + `src/host/modules`; UiStore shape; zustand present |
| `tests/detail-patch-contract.rstest.ts` | ack + allowlist + no full spread |
| **New** `tests/no-drop-pending-gate.rstest.ts` | `_dropPending` / `forceDropPending` absent in production src |
| **New** `tests/ui-store-no-domain.rstest.ts` | if not already in Phase 6 |
| **New** `tests/set-authority.rstest.ts` | maintained from Phase 1 |
| `tests/pessimistic-mutations.rstest.ts` | source-order: await API before onPatchDetail |
| `tests/stale-local-review-drop.rstest.ts` | set-authority final behavior |

### Forbidden production patterns (grep gates)

```text
setLocalDetail
localDetail
forceDropPending
_dropPending
keepDropPending
mergeDetailPreserveOptimistic   # or only allow if renamed UI-only and tested
```

### Required patterns

```text
onPatchDetail → status applied|stale|failed
useDomainDetail or DomainDetailProvider
useUiStore / ui-store
mergeBySetAuthority or equivalent pure export
```

## E2E matrix (features)

| Path | Assert |
|------|--------|
| `tests/e2e/features/start-review.mjs` | Start/Add/Discard; no residual pending after discard when GH empty; show when GH has pending |
| `tests/e2e/features/finish-review.mjs` | Submit clears pending |
| `tests/e2e/features/resolve-thread.mjs` | Resolve post-API |
| `tests/e2e/features/meta-bidirectional.mjs` | Meta host write-through |
| `tests/e2e/features/detail-cache.mjs` | Reopen / IDB; no ghost pending after settle empty |
| `tests/e2e/features/refresh-action.mjs` | Soft refresh |
| `tests/e2e/features/smoke` / conversation-nav / diff-nav | Shell still works |
| `tests/e2e/features/merged-chrome.mjs` | Lifecycle chrome |

## Docs

| Path | Action |
|------|--------|
| `refactor/README.md` | Mark phases done as completed |
| `docs/host-first-zustand-rewrite-plan.md` | Banner: superseded by `refactor/` |
| `Agents.md` | Short “domain SoT host; UI zustand; no localDetail; set-authority” verification notes |
| `docs/pessimistic-migration-plan.md` | Note: localDetail non-goal reversed by refactor plan |

## Build scripts (only if path moves)

| Path | When |
|------|------|
| `scripts/build-pure.mjs` | domain module names |
| `scripts/build-host.mjs` | unchanged unless new modules |
| `scripts/build-modal.mjs` | commands/hooks |
| `scripts/build-pr-modal-app.mjs` | entry split |

## Full verify command set

```bash
npm run build
npm run check
# extension reload
npm run test:e2e:features   # or targeted feature list above
```

## Done checklist (program complete)

- [ ] Native PENDING ↔ pr+ parity with dirty IDB  
- [ ] Discard without durable latch; settled empty stays empty  
- [ ] Progressive open multi-stage still works  
- [ ] IDB hydrate still speeds first paint  
- [ ] All domain mutations pessimistic via `commands/*`  
- [ ] UiStore UI-only; DomainContext for detail  
- [ ] PrModal shell decomposed; no mutations god-file  
- [ ] Architecture gates green  
- [ ] Agents.md updated  

## Optional Phase 9 (out of this plan’s required exit)

| Idea | Notes |
|------|-------|
| Shared Domain Zustand store instance across host/page | Only if props/context publish latency remains painful |
| Optimistic allowlist (viewed/reactions) | Product exception table only |

## Exit criteria

- [ ] All gates + critical e2e green  
- [ ] `refactor/README.md` status → **executed** (or per-phase checkboxes filled)  
- [ ] No dual plan docs disagreeing on localDetail  
