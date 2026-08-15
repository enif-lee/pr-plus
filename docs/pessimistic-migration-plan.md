# Pessimistic mutation + cache write-through — application plan (v4)

**Status:** **approved** (Codex gpt-5.6-sol / xhigh) — safe to implement  
**Approval review:** [`docs/pessimistic-migration-plan-codex-review-v4.md`](./pessimistic-migration-plan-codex-review-v4.md)  
**Prior reviews:**  
- v1 → **rework** — [`docs/pessimistic-migration-plan-codex-review.md`](./pessimistic-migration-plan-codex-review.md)  
- v2 → **rework** — [`docs/pessimistic-migration-plan-codex-review-v2.md`](./pessimistic-migration-plan-codex-review-v2.md)  
- v3 → **rework** — [`docs/pessimistic-migration-plan-codex-review-v3.md`](./pessimistic-migration-plan-codex-review-v3.md)  
- v4 → **approve**  

**Scope:** pr+ detail mutations, host patch contract, open/meta generation, progress terminality  
**Codebase:** 1.8.1 working tree (2026-07-31)  
**Incidents:** empty Diff files on large PR `/changes`; stuck “Loading reviews…”

v4 closes v3 gaps: post-API **host-ack recovery** (never roll back confirmed remote), allowlist ⊆ store projection, `requestedTeams`/`headBranch*` deferred, failure **preserves** prior settled authority, commits empty vs count inconsistency rule.

---

## 0. Session fixes already in tree (honest scope)

| Landed | Helps | Still broken without 0A/0B |
|--------|-------|----------------------------|
| `applyFiles` / `applyCommits` on narrow patch | Narrow `{files}` write-through | Full-detail spreads still dangerous |
| Meta-key gen bump list | Pure files patch less often bumps | Same gen still kills side settle on **real** labels write |
| `progressAlive` without gen | Progress mark survives gen drift | Data `settleSide` still gated on gen via `alive()` |
| threadsFollow tryFinish | Cold open less stuck | Refresh early-returns; no progress ownership finally |
| Non-empty keep vs empty next | Placeholder clobber | No settled authority; failure-as-settled in host soft-fail |
| Files in-flight ref | Same-PR storms | Cross-PR stale; empty `[]` not write-through; commits undeduped |

---

## 1. Goals / non-goals

### Goals

1. **Narrow `onPatchDetail` payloads** from every App helper.  
2. **Split ownership tokens:** open data apply vs meta soft-refresh supersede vs progress session.  
3. **Settled = successful authority only** for files/commits (and analogous sides).  
4. **Complete mutation matrix** with policy, order, local, host, refresh, rollback.  
5. **Semantic tests** (isolation, identity, ordering, dual rollback / no pre-paint).  
6. **Progress always terminal** without hanging panel labels.  
7. Explicit optimistic subset: subscribe / reactions / viewed only.

### Non-goals

- Remove `localDetail` / host-only SoT rewrite / generic mega-dispatcher.  
- Pessimistic-ize subscribe / reactions / viewed.  
- Dual-export renames; revive `src/host/parts/**`.  
- Hide hangs by deleting conversation keys from global progress set.  
- Network-bound “must finish in 3s” as correctness gate.

---

## 2. Target contracts

### 2.1 Narrow patch (App → host)

| Helper | Payload rule |
|--------|----------------|
| `commitMetaPatch(patch)` | **Only** keys present on `patch` (+ optional `avatarUrls`). Never `...detail`. |
| Comment / thread writes | Only comment/thread/pending keys (see allowlist groups). Never title/body/files/draft/state. |
| `ensureAllFiles` | `{ files, changedFiles? }` and optional `gitattributesText`. **`changedFiles` only with `files`.** |
| `ensureAllCommits` | `{ commits, commitsCount? }`. Empty success: `{ commits: [], commitsCount: 0 }` together. If core total is known **> 0** while fetch returns `[]`, treat as **inconsistency**: keep prior data/count, **do not** claim settled empty. |
| Lifecycle | Minimal `{ state, merged?, draft?, mergeable? }` |
| Subscribe | `{ subscribed }` only |

**Host write acknowledgement (mandatory 0A):**

`onPatchDetail` returns a distinguishable result (or throws only on true apply errors):

| Result | Meaning |
|--------|---------|
| `applied` | Store updated and publish done |
| `stale` / `closed` | Modal closed or PR identity mismatch — no apply |
| `failed` | Apply error |

**After GitHub API success** (pessimistic paths):

1. Keep **confirmed local** value (server is source of truth for the mutation).  
2. Call narrow host patch; on `failed`, **retry/re-assert** same narrow payload once (or N=1).  
3. If still not `applied`, surface **cache write failure** (toast/log)—**never** report as “mutation failed” and **never** roll local back to pre-API value.  
4. On `stale`/`closed`, drop host write (user left PR); local may be discarded with unmount.

**Before API or on API failure:** do not paint confirmed remote; keep pre-mutation local.

Phase 0A: stop silent `catch { /* host optional */ }` on meta/comment/files/commits/lifecycle helpers. No transaction framework.

### 2.2 Allowlist = what host can actually apply (0A)

**Group A — meta (applyMeta from patch keys only; must ⊆ current `META_KEYS` + keys added in same PR)**  
`assignees`, `labels`, `requestedReviewers`, `milestone`, `title`, `body`, `draft`, `state`, `merged`, `mergeable`, `mergeableState`, `mergeStateStatus`, `baseRef`, `baseSha`, `headRef`, `headSha`, `subscribed`, `avatarUrls`, `bodyReactions`, `gitattributesText`, `changedFiles`*, `commitsCount`*

\* `changedFiles` / `commitsCount` on App→host patch only with `files` / `commits` respectively (see §2.1). Core may set counts via `applyCore` outside this contract.

**Deferred to Phase 2 (not 0A allowlist until store projection exists):**  
`headBranchDeleted`, `headRefDeleted` — add to `META_KEYS` + round-trip test in the same PR as delete-head-branch write-through.  
`requestedTeams` — no App producer in 0A; if later added, include in `SUPERSEDES_META_REFRESH_KEYS` symmetrically with `requestedReviewers`.

**Group B — comments** (requires `comments` key; companions optional only with it)  
`comments`, `commentsMeta`, `timelineEvents`

**Group C — threads/pending** (at least one primary key)  
`reviewComments`, `reviewThreads`, `reviewCommentsMeta`, `reviewThreadsMeta`, `viewerPendingReview`

**Group D — lists**  
`reviews` → applyReviews  
`files` (+ optional `changedFiles`, `gitattributesText`) → applyFiles  
`commits` (+ optional `commitsCount`) → applyCommits  

**Group E — not in 0A App allowlist until apply branch exists**  
`checks`, `linkedIssues`, `developmentIssues`, `projects` — **omit from App allowlist in 0A**. Host progressive side-fetch continues to use `applySideToStore` internally; App must not claim they are patchable until a later PR adds apply + test.

Unknown keys: ignore + dev assert.

### 2.3 Generation / ownership split (**mandatory in Phase 0A**)

Replace overloaded single-purpose use of `detailFetchGen` for three jobs:

| Token | Purpose | Bumped when | Gates |
|-------|---------|-------------|-------|
| **`openGen`** | Progressive open/refresh **data apply** for this PR open | New open / hard reopen / PR switch only | `openStill` for core/threads/side **data writes** (same PR + openGen match) |
| **`metaRefreshGen`** (or monotonic meta revision) | Stale **meta soft-refresh** responses must not resurrect chips | Patch intersects `SUPERSEDES_META_REFRESH_KEYS` | Only **meta projection apply** from soft-refresh / core revalidate meta merge—not side/thread fetch completion |
| **`progressSession`** | Load bar ownership | New `beginFetchProgress` | `progressAlive`: open && activeOpenProgress === prog |

**`SUPERSEDES_META_REFRESH_KEYS`:**  
`assignees`, `labels`, `requestedReviewers`, `milestone`, `title`, `body`, `draft`, `state`, `merged`, `baseRef`, `subscribed`  
**Not** included: `viewerPendingReview`, `files`, `commits`, `comments`, `reviews`.

**Invariant tests (0A):**

- Labels patch bumps `metaRefreshGen`, does **not** bump `openGen`.  
- In-flight side.comments / side.files completion still applies when openGen unchanged.  
- Soft-refresh that started before labels patch does not re-apply old labels.  
- Active progress is not cleared by a labels patch alone.

Implementation may keep one integer variable renamed/split into two fields on `current`; the **gating split** is the requirement, not the variable count.

### 2.4 Settled authority (files/commits)

| Outcome | `_sideSettled.files` | Items | Progress unit |
|---------|----------------------|-------|---------------|
| Success, N≥0 files (including `[]`) | **true** | server list | success credit |
| Failure / abort / unavailable after a **prior success** | **keep prior settled + items** | unchanged | failure/cancel credit (terminal); **do not invent new authority** |
| Failure when never settled / explicit invalidate at request start | **false** | prior items if any | failure/cancel credit |
| Skip (deferred credit, no fetch, no authority claim) | unchanged | unchanged | skip credit |

**Merge rule:**

```
if next has non-empty files → next
else if next._sideSettled.files === true → next (authoritative empty OK)
else if prev has non-empty files → prev (placeholder)
else → next ?? prev
```

Same for commits. **Never** set settled true on soft-fail empty inventing authority.

### 2.5 Read-path identity (files + commits, symmetric)

1. In-flight map/token per `owner/repo#n`.  
2. Capture identity + flight id at start.  
3. Before local/host write: identity current **and** flight id still owner of in-flight slot.  
4. Success empty: write-through settled empty for that slice.  
5. Failure: clear flight; **preserve prior settled+items if any**; allow retry. Only leave/force settled false if never settled or explicitly invalidated at request start.  
6. PR switch: prior flight must not write; prior `finally` must not clear the **new** flight’s flag.

### 2.6 Structural fields — no bare refresh

Title / body / baseRef / draft (after API-first):

```
await API → local + narrow host patch with confirmed value
→ default: no onRefresh
```

If refresh required later: revision tag, re-assert patch, or field version hold until host matches.

### 2.7 Progress terminal invariant

Every open/refresh unit ends in **success | failure | skip | cancel**.

- Cancel: openGen replaced → old prog must not clear the new session’s load stage.  
- Failure: credit progress terminal; **do not** invent settled empty data.  
- Diff Ready mask (Phase 5 only): route-critical subset for **visible** Ready; background units still run and terminalize.

### 2.8 Pending submit/discard stale guard

App `forceDropPendingRef` / `_dropPending` protect App merge only.

**Host** must also refuse resurrection of cleared pending for that open:

- e.g. host pending epoch / tombstone on discard/submit success narrow patch, consulted when applying soft-refresh threads/pending, **or**  
- threads/pending apply from refresh ignored when epoch lagging.

Phase 1 documents which mechanism; 0A only ensures `viewerPendingReview` is not a gen-bump key.

---

## 3. Mutation inventory

### 3.1 Content

| Path | Policy | Local | Host | Refresh | Rollback | Phase |
|------|--------|-------|------|---------|----------|-------|
| Issue comment post | Pess.* | After API | Narrow comments | No | N/A | 0A narrow + done paint |
| Review comment / reply | Pess.* | After API | Narrow threads/pending | No | N/A | 0A narrow + done paint |
| Comment **edit** | Pess. | After API row | Narrow | No default | msg | **1** |
| Comment **delete** | **Pess.** | After API remove on **latest** snapshot | Narrow + tombstone after success only | No | N/A | **1 P0** |
| Body edit | Pess. | After API body | `{ body }` | No default | msg | **1** |
| Pending submit/discard | Pess. strip after API | strip + forceDrop | Narrow pending/threads + **host epoch** | optional revalidate with epoch | forceDrop + host epoch | **1** |
| Resolve thread | Pess. | refresh or slice later | refresh today | full OK with care | msg | **1** |

\*Paint is already API-first; 0A makes host isolation true.

**Delete policy (decided):** pessimistic. On success, apply removal to **latest** `localDetail` (not a stale closure snapshot), then narrow host patch. Do not pre-tombstone before API.

### 3.2 Structural

| Path | Policy | Phase |
|------|--------|-------|
| Close / reopen / merge | Pess. + narrow lifecycle + list lifecycle | **2** audit |
| Title | **Pess.**, no pre-paint, no bare refresh | **2** |
| Draft/ready | **Pess.** Class B (not reversible toggle) | **2** |
| Base | Pess. + host `{baseRef}` + invalidate files/commits/compare | **1–2** |
| Update branch | Success → invalidate head/files/checks policy | **1–2** |
| Delete head branch | Add `headBranchDeleted`/`headRefDeleted` to `META_KEYS` + host write-through + test | **2** |

### 3.3 Meta chips

API-first today → **0A** narrow-only payload + metaRefreshGen supersede.

### 3.4 Reversible toggles (stay optimistic)

| Path | Phase 3 glue |
|------|----------------|
| Subscribe | Confirm local+host from API; fail both |
| Reactions | Dual rollback; out-of-order guard |
| Viewed | Document local-OK on server fail |

---

## 4. Phases & PR stack

### Phase 0A — Patch contract + ownership split (blocking)

**PR0A**

1. Enumerate all `onPatchDetail` callers.  
2. Narrow `commitMetaPatch` / comment helpers.  
3. Host: applyMeta from **patch keys**; group B/C/D dispatch as specified; drop App allowlist keys without apply.  
4. **Introduce `openGen` + `metaRefreshGen` (or equivalent gating split)** — required, not optional.  
5. Host returns `applied | stale | failed`; after API success: keep confirmed local → retry/re-assert → surface **cache write failure** (never local rollback / never “mutation failed”).  
6. Tests: isolation (comment ↛ files/openGen); labels ↛ openGen but supersede meta refresh; post-API host `failed` keeps confirmed local and surfaces cache error; no silent swallow on correctness helpers.

**Exit:** zero full-detail spreads; open data apply survives meta chip writes; host ack contract enforced.

### Phase 0B — Authority, identity, progress terminal

**PR0B**

1. Merge settled/placeholder unit tests; fix host soft-fail to **not** set settled true.  
2. Files+commits identity/flight/empty-success write-through.  
3. Progress ownership finally for open **and** refresh; cancel does not clear new session.  
4. Verification: `npm test` (build+unit). Ag smoke: files when API returns N>0; busy eventually false (functional timeout e.g. 30s).

### Phase 1 — Content gaps (before title)

**PR1:** pessimistic delete; edit/body write-through; pending host epoch; base/update invalidation.

### Phase 2 — Structural API-first

**PR2:** title, draft; lifecycle audit; add `headBranchDeleted`/`headRefDeleted` to `META_KEYS` + host write-through + round-trip test.

### Phase 3 — Toggle glue

**PR3:** subscribe/reactions/viewed as above.

### Phase 4 — Rename/docs

**PR4:** mechanical renames after stable behavior; no dual-export default.

### Phase 5 — Route-aware Ready (optional)

**PR5:** only after 0B terminal invariant.

```
PR0A → PR0B → PR1 → PR2 → PR3 → PR4 → PR5?
```

---

## 5. Test strategy

| Layer | Must prove |
|-------|------------|
| Host pure/unit | narrow isolation; openGen vs metaRefreshGen; settled only on success |
| App unit | files/commits flight identity; title no pre-paint; delete after await on latest state |
| Structural | issue comment: await API **before** commit helper (ordered, not mere presence) |
| Ag | large PR Diff files present; load stage terminates |

---

## 6. Success metrics

1. Grep/test: no full-detail `onPatchDetail` payloads from helpers.  
2. Labels write does not prevent side.files/comments store apply for same openGen.  
3. Diff files non-empty when REST returns N>0; load stage terminates.  
4. Delete failure leaves comment visible (because never removed pre-API).  
5. Title/draft: no pre-API paint; host matches without stale refresh clobber.  
6. Subscribe: host `subscribed` equals API success value.  
7. Post-API host `failed` after retries surfaces cache write failure while confirmed local remains.

---

## 7. Decided answers (v2 §12 + v2 review)

| Q | Decision |
|---|----------|
| Single gen enough? | **No.** 0A must split open vs meta supersede gating. |
| Delete policy? | **Pessimistic** + latest-state apply. |
| `changedFiles` alone? | **No** on App patch; only with `files`. |
| Failure settled? | **No.** Progress terminal ≠ data settled. |
| checks on allowlist? | **Not in 0A** until apply branch exists. |
| Host fail after API success? | Keep confirmed local; retry; surface **cache write failure**—never roll back local. |
| headBranchDeleted in 0A? | **No** until META_KEYS + Phase 2. |
| requestedTeams in 0A? | **No** until producer + supersede key. |

---

## 8. What we will not do

- Pretend single `detailFetchGen` is “meta supersede only” by renaming  
- Record failure as authoritative empty  
- Credit progress when data write was refused without explicit cancel/skip  
- Lock key-presence tests with full-detail callers remaining  
- Allowlist keys host cannot apply  
- Delete rollback via tombstone+refresh  
- Bare full refresh after title/base/body  
- Silent host failure after local write on correctness paths  
- After API success: roll back confirmed local because host cache write failed  
- Treat `onPatchDetail` void early-return as `applied` without ack  
- Allowlist keys that `pickMeta`/store cannot project  

- Regex-only proof of ordering/isolation  
- Host SoT rewrite / mega dispatcher first  
- Bulk-pessimistic toggles; global progress key deletion; parts/** SoT; baseless dual-export aliases  

---

## 9. Changelog

| Version | Result |
|---------|--------|
| v1 | rework — order, inventory, full-detail blindness |
| v2 | rework — single gen insufficient; failure/settled conflation |
| v3 | rework — post-API host-fail rollback risk; allowlist/store mismatch |
| v4 | host-ack after API success; allowlist ⊆ META_KEYS; requestedTeams/headBranch* deferred; preserve prior settled on revalidate fail; commits count consistency |

---

## 10. Closed defaults (from v3 review)

| Topic | Decision |
|-------|----------|
| `metaRefreshGen` storage | **Module-level** monotonic counter |
| Pending host stale guard | **Per-open integer epoch**; capture at threads/pending fetch start; bump on submit/discard success; lagging responses must not resurrect `viewerPendingReview` / stripped pending rows |
| Empty commits + count | Settled empty ⇒ `commitsCount: 0`. Never pair settled empty with `commitsCount > 0`; inconsistency ⇒ keep prior, no new settled claim |
