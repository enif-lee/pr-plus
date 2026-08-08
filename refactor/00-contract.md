# Phase 0 — Contract freeze

## Goal

Freeze acceptance law so later phases never reintroduce localDetail SoT, durable drop latches, or full-detail patches.

## Deliverables

| Artifact | Path | Action |
|----------|------|--------|
| Plan index | `refactor/README.md` | Keep as SoT index |
| This phase | `refactor/00-contract.md` | Freeze |
| Phases 1–8 | `refactor/0[1-8]-*.md` | Freeze file maps |
| Optional summary | `docs/host-first-zustand-rewrite-plan.md` | Point to `refactor/` only (no second law) |

## Contracts to freeze (copy into gates in Phase 8)

### Domain

1. Host **DomainStore** is open-session PR SoT.  
2. React never owns durable PR detail (`localDetail` forbidden end-state).  
3. Mutations: **API → NarrowPatch → onPatchDetail ack → UI projection**.  
4. Ack: `{ status: 'applied' | 'stale' | 'failed' }`; void ≠ applied.

### Set-authority

| Condition | Rule |
|-----------|------|
| Slice **settled** | `id ∈ IDB/prev ∧ id ∉ host` → drop |
| Slice **unsettled** | no delete inference; progressive union OK |
| Host id present | host fields win; cache may fill deferred fields only for those ids |

### Slice settled (initial)

| Slice | Settled when |
|-------|----------------|
| `meta` | core apply ok for `openGen` |
| `pending` | core included authoritative `viewerPendingReview` (object **or** null) |
| `threads` | threads side success + window meta (out-of-window ≠ deleted) |
| `comments` | comments side settled |
| `files` / `commits` | successful authority (empty OK; fail keeps prior settled) |
| `reviews` / `checks` / `development` | side success |

### Keep

- Progressive open (`open-modal-run`, side-fetch, progress bar)  
- IDB projection cache (`detail-idb`, detail cache memory)

### Remove (end-state)

- `localDetail` / `setLocalDetail` as domain mirror  
- `forceDropPendingRef`  
- durable `_dropPending` in IDB/host  
- long-lived body tombstones as SoT  
- domain race-keep in `mergeDetailPreserveOptimistic`  
- pre-API domain paint (default)

### Generation

| Token | Role |
|-------|------|
| `openGen` | open / hard reopen / PR switch — data apply |
| `metaRefreshGen` | superseding meta soft refresh |
| `progressSession` | load bar ownership |

## Files touched this phase

| Path | Action |
|------|--------|
| `refactor/**` | Author / finalize |
| `docs/host-first-zustand-rewrite-plan.md` | Add banner: superseded by `refactor/` |

## Exit criteria

- [ ] All `refactor/0*.md` present and consistent with README  
- [ ] No competing “keep localDetail” plan remains as active law  
- [ ] Forbidden symbol list agreed (see Phase 5/8 gates)

## Next

Phase 1 — pure set-authority.
