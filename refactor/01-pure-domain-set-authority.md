# Phase 1 — Pure DomainStore + set-authority

## Goal

Implement settled set-authority in pure code and stop durable drop-latch from winning over network pending **inside the store algorithms**. No React required for exit.

## New files (create)

| Path | Purpose |
|------|---------|
| `src/modal/lib/set-authority.ts` | `mergeBySetAuthority`, `idSetFromComments`, slice helpers |
| `tests/set-authority.rstest.ts` | Matrix: unsettled/settled, pending null/VPR, files empty |

*(Optional later move: `src/domain/*` — not required in Phase 1; keep pure under `modal/lib` + `build:pure` unless pipeline is extended.)*

## Edit — primary SoT

| Path | Changes |
|------|---------|
| `src/modal/lib/detail-store.ts` | Wire set-authority into `applyThreadsFromMergedDetail`, `fromAppDetail`, `toAppDetail`; stop promoting `_dropPending` into sticky `store.dropPending` when network has VPR/pending; simplify `applyDiscardTombstones` to non-durable or no-op for drop latch |
| `src/modal/lib/stale-local-review.ts` | Align `filterCacheReviewCommentsForCore` with set-authority; keep `detailHasViewerPending`; drop body-tombstone-as-SoT if redundant |
| `src/modal/lib/composer-attach.ts` | Export set-authority if shared; prepare `mergeDetailPreserveOptimistic` for Phase 5 gut (minimal change OK in P1) |
| `src/modal/lib/detail-idb.ts` | Stop durable `keepDropPending` write; sanitize still strips orphan pending when **no VPR in projection being written**, without immortal latch |
| `src/modal/lib/detail-cache.ts` | Same dropPending policy as IDB sanitize if mirrored |

## Edit — pure build registry

| Path | Changes |
|------|---------|
| `scripts/build-pure.mjs` | Register `set-authority` → global if host needs it (e.g. `PRModalSetAuthority`) **or** fold exports into `PRModalDetailStore` / `PRModalDetailIdb` |

## Generated (do not hand-edit; rebuild)

| Path |
|------|
| `src/modal/pure/detail-store.js` |
| `src/modal/pure/detail-idb-cache.js` |
| `src/modal/pure/detail-cache.js` |
| `src/modal/pure/set-authority.js` (if registered) |

## Tests — edit / add

| Path | Role |
|------|------|
| `tests/set-authority.rstest.ts` | **New** core matrices |
| `tests/detail-store.rstest.ts` | fromAppDetail / applyThreads / dropPending no longer kills live VPR |
| `tests/stale-local-review-drop.rstest.ts` | filterCache + strip orphan; rewrite latch expectations |
| `tests/pending-ui-only-add-comment.rstest.ts` | Adjust if dropPending assumptions break |

## Build / verify

```bash
npm run build:pure
npx rstest run tests/set-authority.rstest.ts tests/detail-store.rstest.ts tests/stale-local-review-drop.rstest.ts
```

## Explicit non-goals this phase

- No `PrModalApp` / mutations rewrite  
- No host open-modal string replace beyond pure globals already used  
- No Zustand schema change  

## Exit criteria

- [ ] `mergeBySetAuthority` covered for pending + reviewComments  
- [ ] Settled host with VPR keeps pending ids even if flat had `_dropPending` (or `_dropPending` ignored when VPR present)  
- [ ] Settled host without VPR drops IDB-only pending ids  
- [ ] Unsettled host empty does **not** drop cache pending/published rows via delete inference  
- [ ] `build:pure` green  

## Next

Phase 2 — host open + IDB use pure helpers.
