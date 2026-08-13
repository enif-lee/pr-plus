# Host-data-first + Zustand + PrModal rewrite

**Status:** phases 0–8 executed · **phase 9 planned**  
**Decisions:** Host DomainStore SoT · Zustand UI-only · pessimistic mutations · progressive render kept · IDB cache kept · durable drop-latch removed · PrModal mount decomposed · remaining >2000-line SoT split (shell first)  

This directory is the **execution plan of record**. Phase docs list concrete files to create, edit, delete, and test.

| Phase | Doc | Goal |
|-------|-----|------|
| 0 | [00-contract.md](./00-contract.md) | Freeze contracts & forbidden symbols |
| 1 | [01-pure-domain-set-authority.md](./01-pure-domain-set-authority.md) | Pure DomainStore + set-authority |
| 2 | [02-host-open-idb.md](./02-host-open-idb.md) | Host open/refresh + IDB merge |
| 3 | [03-patch-ack-domain-context.md](./03-patch-ack-domain-context.md) | Patch ack + DomainContext; stop localDetail writes |
| 4 | [04-commands-pessimistic.md](./04-commands-pessimistic.md) | Command modules (API → host) |
| 5 | [05-remove-guards.md](./05-remove-guards.md) | Remove forceDrop / `_dropPending` / domain race-keep |
| 6 | [06-zustand-ui.md](./06-zustand-ui.md) | Zustand UI global; kill prop bags |
| 7 | [07-prmodal-decomposition.md](./07-prmodal-decomposition.md) | Split PrModalApp god file |
| 8 | [08-hardening.md](./08-hardening.md) | Gates, e2e matrix, docs |
| 9 | [09-large-sot-split.md](./09-large-sot-split.md) | Shrink shell (~5000); leaf-subscribe; split Conversation/line-selection |

## Locked product rules

```text
API success → Domain confirmPatch → UI reads projection
settled host set: id ∈ cache ∧ id ∉ host ⇒ drop
unsettled: no delete inference (progressive safe)
IDB = projection mirror only
UiStore = layout/drafts/focus only — no PrDetail
```

## Build reminders

| Area | SoT | Build |
|------|-----|-------|
| Pure domain | `src/modal/lib/*.ts` (or `src/domain/` after move) | `npm run build:pure` |
| Host | `src/host/modules/*.ts` | `npm run build:host` |
| Modal React | `src/modal/**` | `npm run build:modal` / `build:app-parts` |
| SW/fetch | as needed | `build:fetch` `build:sw` |

After SW/host/pure: reload extension on `chrome://extensions`.

## Dependency graph

```text
0 contract
  └─► 1 pure set-authority
        └─► 2 host open + IDB
              └─► 3 patch ack + DomainContext
                    ├─► 4 commands (4.1 pending first)
                    │     └─► 5 remove guards (can start after 4.1)
                    └─► 6 zustand UI
                          └─► 7 PrModal split
                                └─► 8 hardening
```

## Out of scope

- Schedule / headcount sizing  
- Jotai  
- Removing progressive open or IDB  
- Pre-API optimistic domain paint as default  
- Full host-only memory without disk cache  

## Legacy pointer

Earlier draft: [`docs/host-first-zustand-rewrite-plan.md`](../docs/host-first-zustand-rewrite-plan.md) — superseded by this `refactor/` tree for file-level work.


## Phase completion (execution)

| Phase | Status |
|-------|--------|
| 0 Contract | done |
| 1 set-authority pure | done (`set-authority.ts` + `mergeCommentsHostFirst`) |
| 2 host open + IDB | done |
| 3 patch ack + DomainContext | done |
| 4 commands pessimistic | done (`domain-mutations`, `review-actions`, `side-actions`) |
| 5 remove drop guards | done (no production `_dropPending: true`) |
| 6 Zustand UI | done (`ui-store` re-export; no localDetail) |
| 7 PrModal decomposition | done — mount SoT `PrModalShell.tsx`; `PrModalApp.impl.tsx` re-export-only; `pr-modal-mutations.ts` deleted; hotkeys in hook; commands/* |
| 8 hardening | done (gates + e2e matrix) |
| 9 large SoT split | **in progress** — see [09-large-sot-split.md](./09-large-sot-split.md) |

**Deviation:** command modules are cohesive (`domain-mutations` / `review-actions` / `side-actions`) rather than many tiny per-slice files. Runtime `PrModalApp.impl.tsx` remains the view orchestration host; domain write paths are not inlined there.
