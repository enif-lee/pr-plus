# Final work plan: Host-data-first + Zustand + PrModal decomposition

> **Superseded for execution.**  
> File-level phase plans live under **[`refactor/`](../refactor/README.md)**  
> (`refactor/00-contract.md` … `08-hardening.md`, `FILE-INDEX.md`).  
> This document remains a narrative summary only; do not treat it as the work queue.

**Status:** narrative summary (execution SoT = `refactor/`)  
**Scope:** open-session PR modal domain, cache, progressive open, mutations, UI store, PrModalApp split  
**Non-goals (explicit):** schedule/sizing, Jotai migration, removing IDB, removing progressive open, host-only memory rewrite that deletes disk cache

---

## 0. Locked decisions

| Topic | Decision |
|-------|----------|
| Domain SoT | **Host DomainStore** (open-session). React does not own PR detail. |
| UI state | **Zustand only** (layout, drafts, focus, chrome). No domain fields. |
| Paint policy | **Pessimistic:** GitHub API success → Domain confirm → UI reflects projection. |
| Progressive render | **Keep.** Slice-by-slice host apply + publish. |
| IDB cache | **Keep.** Projection mirror; not a competing SoT. |
| Merge rule | **Settled set-authority:** `id ∈ cache ∧ id ∉ settledHost ⇒ drop`. |
| Guards | **Remove** durable `_dropPending`, `forceDropPendingRef`, long-lived body tombstones as SoT. |
| App shape | **Decompose** `PrModalApp.impl.tsx` / mutations bag into commands + thin shell. |
| Optimistic | **Not default.** Optional later allowlist only if product reopens it; out of this plan’s default path. |

---

## 1. Target architecture

```text
GitHub API
    │
    ▼
Host DomainStore  ──publish──►  Session projection (current.detail)
    │ write on publish                 │
    ▼                                  ▼
IDB mirror                      React DomainContext / props once
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                         Views (read)     Zustand UiStore
                              │            (layout/drafts/…)
                              ▼
                         commands/*  (API → onPatchDetail ack)
```

### 1.1 Three stores / roles

| Name | Runtime | Owns | Writers |
|------|---------|------|---------|
| **DomainStore** | Host open-session | meta, threads, comments, pending, files, commits, reviews, checks, gens, sideSettled | network apply, `onPatchDetail` / `confirmPatch` |
| **UiStore** | Zustand (modal) | layout, selection, composers, focus, palette, action toast | React / shortcuts |
| **SessionCache** | memory + IDB | last Domain projection per PR key | Domain publish only |

**Forbidden in UiStore / App state:** `localDetail`, `viewerPendingReview`, `reviewComments`, labels/assignees as source of truth, `_dropPending`.

### 1.2 Data flows

**Open / refresh (progressive — kept)**

```text
begin open (openGen++)
optional IDB hydrate → Domain (all slices unsettled)
core apply → publish (meta; pending settled when core defines VPR)
side/threads apply as each finishes → publish
when slice settles → set-authority vs any cache residue
IDB.put(projection) on publish (throttled OK)
```

**Mutation (pessimistic — default)**

```text
UiStore.actionBusy = true
await GitHub API
map response → NarrowPatch
ack = onPatchDetail(patch)  // DomainStore
retry once on failed; never roll back confirmed server result
UiStore toast; Domain projection is UI truth
```

**IDB reinject**

```text
if !slice.settled: progressive union allowed (no delete inference)
if slice.settled:
  keep only ids in host set; host fields win
  cache may fill deferred fields only for host ids (optional policy)
```

### 1.3 Generation tokens

| Token | Bump | Gates |
|-------|------|-------|
| `openGen` | open / hard reopen / PR switch | network data apply |
| `metaRefreshGen` | superseding meta patch | soft meta revalidate only |
| `progressSession` | begin load bar | progress UI terminality |

Meta patch must not kill side settle via openGen.

---

## 2. Contracts (acceptance law)

### 2.1 Settled set-authority

Per slice `S` with settled host snapshot `H_S`:

- `id ∈ H_S` → keep; host fields authoritative.
- `id ∈ I \ H_S` (IDB/prev only) → **deleted; ignore**.
- Unsettled → do not infer deletion from absence.

**Slice settled definitions (implement exactly; adjust only with test updates):**

| Slice | Settled when |
|-------|----------------|
| `meta` | core apply succeeded for this openGen (people fields via core or meta patch) |
| `pending` | core returned `viewerPendingReview` key (object or null) as authoritative |
| `threads` | threads side success for this open (window meta present; out-of-window not “deleted”) |
| `comments` | comments side settled |
| `files` / `commits` | successful fetch authority (empty success allowed; failure keeps prior settled) |
| `reviews` / `checks` / `development` | respective side success |

Pending: if settled and `viewerPendingReview == null`, pending comment set is empty; IDB pending rows drop.

### 2.2 Narrow patch + ack

`onPatchDetail` returns `{ status: 'applied' | 'stale' | 'failed' }`.

- Never treat void / silent catch as `applied`.
- App→host: only allowlisted keys (inherit v4 Groups A–D; add `headBranchDeleted` / `headRefDeleted` with META_KEYS in structural phase).
- No full `...detail` spreads.

### 2.3 Pessimistic mutation template

Every domain command:

1. Validate intent (UiStore only for drafts).
2. `actionBusy`.
3. `await` API.
4. `confirmPatch` / `onPatchDetail`.
5. Ack handling (retry once; cache-fail toast; no domain rollback after API success).
6. Prefer patch over full refresh; refresh only when patch incomplete.

### 2.4 Removed concepts

| Remove | Replacement |
|--------|-------------|
| `localDetail` / `setLocalDetail` | Domain projection only |
| `forceDropPendingRef` | set-authority + post-API confirmPatch |
| durable `_dropPending` in IDB | settled pending null ⇒ empty set |
| long-lived `_deletedReviewBodies` as SoT | optional session TTL only if demote lag proven; default off |
| `mergeDetailPreserveOptimistic` domain race-keep | delete or UI-only field allowlist |
| Pre-API domain paint (default) | post-API only |

### 2.5 Progressive + cache (kept)

- Progressive: host `applyCore` / `applySide` / `applyThreads` + publish cadence unchanged in spirit.
- Cache: `sanitizeDetailForCache` / headSha reuse rules may stay; **merge predicate becomes set-authority**.
- Write path: only Domain publish → IDB.
- Read path: open hydrate → Domain, not App local merge.

### 2.6 Zustand global adoption (UI)

- All shared interactive UI that today is drilled via props → `UiStore`.
- Leaf props: row/thread instance data only.
- Domain read: `DomainContext` (or single `detail` from host props at root) + selectors; not prop chains through Conversation/Diff trees.
- Architecture gate: UiStore type must not include `PrDetail` domain blobs.

---

## 3. Target module layout

```text
src/domain/                          # pure (from detail-store + set-authority)
  store.ts
  set-authority.ts
  patch-allowlist.ts
  project.ts                         # toAppDetail / fromAppDetail slim

src/host/modules/
  domain-session.ts                  # openGen, current store
  apply-network.ts
  detail-on-patch.ts                 # ack-only confirm
  open-modal-run.ts                  # progressive + IDB hydrate (set-authority)
  publish.ts / props-build.ts        # projection → React

src/modal/
  store/ui-store.ts                  # Zustand UI only (replace modal-store domain bits)
  domain-context.tsx                 # read Domain projection
  commands/
    pending.ts
    comments.ts
    threads-resolve.ts
    meta.ts
    lifecycle.ts
    files-commits.ts
    toggles.ts                       # viewed/subscribe if still special-cased
  app/
    PrModalShell.tsx                 # thin: context providers, route, layout chrome
    usePrModalHotkeys.ts
    usePrModalOpenEffects.ts
  views/                             # consume context + ui-store; minimal props

tests/
  domain/set-authority.*.rstest.ts
  domain/patch-contract.*.rstest.ts
  commands/*.rstest.ts
  e2e: pending parity, progressive open, reopen cache
```

Build: pure domain → host → modal (existing pipeline extended, not abandoned).

---

## 4. Execution phases (dependency order only)

### Phase 0 — Contract freeze

**Deliverables**

- This document approved as execution law (or edited once then frozen).
- Slice settled table + allowlist + forbidden symbols list copied into architecture-gates intent.

**Exit**

- Team/agent agrees no `localDetail` in end state; progressive + IDB kept; pessimistic default.

---

### Phase 1 — Pure DomainStore + set-authority

**Work**

1. Extract/clarify DomainStore slices and `sideSettled`.
2. Implement `mergeBySetAuthority(host, cache, slice, settled)`.
3. Strip durable drop-latch behavior from `fromAppDetail` / `applyThreads` / `applyDiscardTombstones` (or no-op with tests).
4. Unit tests: pending null vs VPR; IDB-only ids dropped after settle; unsettled does not drop; files empty success; failure keeps prior settled.

**Exit**

- Pure tests green; no UI wiring required yet.

---

### Phase 2 — Host open/refresh + IDB merge swap

**Work**

1. `open-modal-run` / `props-build` / `host-core-store`: cache reinject uses set-authority.
2. Publish path single: Domain → `current.detail` → render.
3. IDB put only from publish; hydrate only into Domain.
4. Split `openGen` vs `metaRefreshGen` vs `progressSession` if not already complete.
5. Manual/e2e: cold open progressive; reopen with dirty IDB; PR with live GitHub PENDING shows in pr+ (no drop latch).

**Exit**

- Progressive still paints mid-open.
- Cache cannot resurrect deleted ids after settle.
- Native pending vs pr+ parity for PENDING (known #13 class bugs).

---

### Phase 3 — Patch ack + remove App domain mirror (host write path)

**Work**

1. `onPatchDetail` always returns ack; no void-as-applied.
2. `commitMetaPatch` / `commitCommentListPatch` rewritten: **no `setLocalDetail`**; only `onPatchDetail` then rely on next props/context.
3. Bridge: root subscribes to host detail prop → `DomainContext` value.
4. Temporary: App may still mount fat tree but reads detail from context.

**Exit**

- Wiring tests: no `setLocalDetail` in mutation helpers (or deprecated shim throws in dev).
- Patch contract tests: allowlist + ack.

---

### Phase 4 — Commands: pessimistic mutations (vertical slices)

Migrate in this order (highest pain first):

| Step | Module | Includes |
|------|--------|----------|
| 4.1 | `commands/pending.ts` | Start/Add/reply-pending, Discard, Submit |
| 4.2 | `commands/comments.ts` | issue comment, delete review/issue comment |
| 4.3 | `commands/threads-resolve.ts` | resolve/unresolve, non-pending reply |
| 4.4 | `commands/meta.ts` | title, body, labels, assignees, reviewers, milestone, draft |
| 4.5 | `commands/lifecycle.ts` | close/open/merge, base change, head delete (+ META_KEYS) |
| 4.6 | `commands/files-commits.ts` | ensureAll*, viewed if domain |
| 4.7 | residual | subscribe/reactions — pessimistic unless explicitly deferred |

Each command: template §2.3 only. Unit: API before domain write.

**Exit**

- Pending discard does not durable-latch; recreate/native pending visible.
- No pre-API domain writes on migrated commands.

---

### Phase 5 — Remove guards & dead merge

**Work**

1. Delete `forceDropPendingRef` and effect branches.
2. Delete durable `_dropPending` IDB keep paths.
3. Delete or gut `mergeDetailPreserveOptimistic` domain paths; replace with identity switch + optional UI-only keys.
4. Rewrite tests that asserted latch behavior to set-authority behavior.
5. Grep-clean: `_dropPending`, `forceDropPending`, `setLocalDetail`, `localDetail` (domain).

**Exit**

- Symbol gates red on reintroduction.
- E2E Start→Add→Discard→reopen; native pending parity.

---

### Phase 6 — Zustand global UI adoption

**Work**

1. Rewrite `modal-store` → `ui-store`: UI fields only; remove `localDetail`, domain pending batch as SoT.
2. Expand selectors (`data-groups` → UI groups only).
3. Move drilled UI from Conversation/Diff/Chrome into store subscriptions.
4. `detail-ui-store`: either delete (use Domain `sideSettled` in context) or one-way mirror from host props.
5. Architecture gate: UiStore has no `PrDetail`.

**Exit**

- Deep leaves do not take 20+ chrome props for busy/draft/layout.
- Shared UI definitions live in one store type.

---

### Phase 7 — PrModal decomposition

**Work**

1. Split `PrModalApp.impl.tsx` into:
   - `PrModalShell.tsx` — providers, layout chrome, page switch
   - `usePrModalHotkeys.ts` / open effects
   - `commands/*` (already Phase 4)
   - view-specific containers under `views/`
2. Split `pr-modal-mutations.ts` away; file becomes re-export or deleted.
3. No “mutations bag” object with 50 closured setters; commands import Domain ack + UiStore.
4. Line-budget / readability: shell should orchestrate, not implement API.

**Exit**

- Shell file order-of-magnitude smaller; no god-object required to add a command.
- Call graph: View → command → API → host patch → context update.

---

### Phase 8 — Hardening gates & docs

**Work**

1. Architecture / wiring tests for forbidden APIs.
2. E2E matrix: progressive open, cache reopen, pending parity, meta reverse edit, discard, submit.
3. Update `Agents.md` + this plan status to **executed** sections.
4. Optional Phase 9: Domain store shared subscription (same instance) to drop root prop; only after 0–8 stable.

**Exit**

- CI: unit + targeted e2e green.
- Done criteria §5 all checked.

---

## 5. Done criteria (single checklist)

- [ ] GitHub native PENDING visible in pr+ after reopen / dirty IDB (no drop latch).
- [ ] Discarded pending does not reappear after settled refresh; no durable `_dropPending`.
- [ ] `localDetail` / `setLocalDetail` / `forceDropPending` absent from production paths.
- [ ] All domain mutations: API → Domain confirm → UI (pessimistic).
- [ ] Progressive open still paints core then sides without full-wait blank forever.
- [ ] IDB still hydrates first paint; settled set-authority prevents cache-only ghosts.
- [ ] UiStore is UI-only; no PrDetail domain blob.
- [ ] Prop drilling for chrome/drafts/focus largely replaced by Zustand selectors.
- [ ] PrModal shell decomposed; commands modular.
- [ ] `onPatchDetail` ack contract enforced; void ≠ applied.
- [ ] openGen / metaRefreshGen / progressSession separated.
- [ ] Tests: set-authority pure, patch contract, command order, e2e pending + progressive.

---

## 6. Test strategy

| Layer | Focus |
|-------|--------|
| Pure | set-authority matrices; settled flags; pending null |
| Host unit/wiring | open merge, IDB hydrate, gen split, patch ack |
| Command unit | await API before patch; no local domain write |
| E2E | progressive paint markers; pending parity; discard; reopen |
| Architecture | forbidden symbols; UiStore shape; no full detail patch |

---

## 7. Risk register (mitigations baked into phases)

| Risk | Mitigation |
|------|------------|
| Set-authority on unsettled empties UI | Phase 1–2 tests; settled-only delete inference |
| Progressive flash / empty | Keep cache hydrate + progressive publish; mutation confirmPatch fills post-API gap |
| Dual-world mid-migration bugs | Phase order: pure → host merge → stop localDetail writes → kill guards → UI store → split files |
| Pessimistic latency UX | Accepted; toast/busy only—no domain fake rows |
| Thread window ≠ full set | Settled definition is window-aware; no global delete outside window |
| Fat PR regression | E2E progressive + files/commits settled authority from v4 |

---

## 8. Relationship to v4 pessimistic plan

| v4 | This plan |
|----|-----------|
| Narrow patch, ack, gen split, files/commits settled | **Absorbed** (Phases 2–3) |
| Keep `localDetail` (non-goal to remove) | **Reversed** — remove (Phases 3–5) |
| Drop latch not central | **Explicitly remove** (Phase 5) |
| Host-only rewrite non-goal | **Host DomainStore as only domain SoT**; IDB/progressive kept |
| Optimistic subset | **Default off**; residual only if re-opened later |

---

## 9. Working rules for implementers

1. Do not reintroduce domain writes in React state “just for one flash.”
2. Do not put PrDetail into Zustand “for convenience.”
3. Do not skip set-authority tests when touching IDB or merge.
4. Prefer vertical command slice green over horizontal half-migrated mutations.
5. Progressive and cache bugs: fix settled flags / merge—not new latches.
6. Edit SoT TS; run matching `build:*`; reload extension for SW/host verification.

---

## 10. Immediate next action

Start **Phase 0 sign-off** (this file), then **Phase 1** pure `set-authority` + DomainStore latch removal tests—without UI redesign—so pending parity can land before PrModal file split.
