# Phase 5 — Remove drop guards & domain race-keep

## Goal

Delete mechanisms that made local discard memory outrank GitHub. Rely on Phase 1–2 set-authority + Phase 4 confirmPatch.

**Prerequisite:** Phase 4.1 pending commands landed (no forceDrop in discard path).

## Delete or gut — modal app

| Path | Action |
|------|--------|
| `src/modal/app/PrModalApp.impl.tsx` | Remove `forceDropPendingRef`, `forceDropCleanCountRef`, merge-effect strip branches that force-drop pending |
| `src/modal/app/pr-modal-mutations.ts` | Remove remaining `forceDropPendingRef` / `_dropPending` patch fields if facade still exists |

## Edit — pure / lib

| Path | Action |
|------|--------|
| `src/modal/lib/composer-attach.ts` | `stripPendingReviewFromDetail`: clear VPR + filter pending rows; **do not** set durable `_dropPending` / body tombstones (or session-only if demote lag proven—default off) |
| `src/modal/lib/composer-attach.ts` | `mergeDetailPreserveOptimistic`: remove domain race-keep for pending/comments; PR identity switch only + optional UI-only keys; prefer delete function if unused |
| `src/modal/lib/detail-store.ts` | Remove `store.dropPending` sticky logic; remove `applyDiscardTombstones` drop latch or reduce to id-delete for **same-turn** patch only |
| `src/modal/lib/detail-idb.ts` | Remove `keepDropPending` persistence |
| `src/modal/lib/detail-cache.ts` | Same |
| `src/modal/lib/stale-local-review.ts` | Remove `isDiscardedPendingBody` durable path if unused; keep ghost filters |

## Edit — host

| Path | Action |
|------|--------|
| `src/host/modules/detail-on-patch.ts` | Stop special-casing `_dropPending` merge of tombstone unions as long-lived SoT |
| `src/host/modules/open-modal-run.ts` | Grep-clean `_dropPending` reinject |
| `src/host/modules/props-build.ts` | Grep-clean |

## Rebuild pure + host

| Generated |
|-----------|
| `src/modal/pure/detail-store.js` |
| `src/modal/pure/detail-idb-cache.js` |
| `src/modal/pure/detail-cache.js` |
| `src/pr-modal-host.js` |

## Tests — rewrite expectations

| Path | Change |
|------|--------|
| `tests/stale-local-review-drop.rstest.ts` | Assert set-authority not latch |
| `tests/pessimistic-mutations.rstest.ts` | Discard: no `forceDropPendingRef.current === true` requirement; host patch without `_dropPending` |
| `tests/pending-ui-only-add-comment.rstest.ts` | Update |
| `tests/detail-store.rstest.ts` | dropPending removed or inert |
| **New** `tests/no-drop-pending-gate.rstest.ts` | Source grep: production paths must not write `_dropPending: true` / `forceDropPending` |

## Grep clean (must be zero in src production paths)

```text
forceDropPending
forceDropPendingRef
_dropPending
keepDropPending
```

Allow mentions only in tests that assert **absence**, or changelogs.

## Build / verify

```bash
npm run build:pure && npm run build:host && npm run build:modal
npx rstest run tests/stale-local-review-drop.rstest.ts tests/pessimistic-mutations.rstest.ts tests/detail-store.rstest.ts
# browser: native pending vs pr+ parity on PR with live PENDING
```

## Exit criteria

- [ ] No production writes of `_dropPending` / forceDrop  
- [ ] Discard + reopen uses set-authority only  
- [ ] Live GitHub PENDING always paintable after settled core/threads  
- [ ] `mergeDetailPreserveOptimistic` not used for domain SoT (deleted or UI-only)  

## Next

Phase 6 — Zustand UI global adoption.
