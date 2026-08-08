# Phase 4 — Pessimistic command modules

## Goal

Move all domain mutations out of `pr-modal-mutations.ts` / `PrModalApp.impl.tsx` into `src/modal/commands/*` with template:

```text
UiStore busy → await API → NarrowPatch → onPatchDetail ack → toast
```

No domain paint before API. No `setLocalDetail`.

## New directory layout

```text
src/modal/commands/
  types.ts                 # CommandContext: owner, repo, number, onPatchDetail, getDetail, ui
  patch.ts                 # applyHostPatch retry helper (may re-export domain/patch-ack)
  pending.ts               # 4.1
  comments.ts              # 4.2
  threads-resolve.ts       # 4.3
  meta.ts                  # 4.4
  lifecycle.ts             # 4.5
  files-commits.ts         # 4.6
  toggles.ts               # 4.7 subscribe / reactions / viewed (pessimistic default)
  index.ts                 # barrel
```

## CommandContext (shared)

Created once from shell:

| Field | Source |
|-------|--------|
| `getDetail()` | DomainContext / host prop ref |
| `onPatchDetail` | host props |
| `ui` | `useModalStore.getState()` / UiStore actions |
| `api` | `globalThis.PRTreeFetch` |
| `onRefresh?` | host props optional |

---

## 4.1 Pending — **first vertical slice**

### New

| Path |
|------|
| `src/modal/commands/pending.ts` |

### Move logic from

| Path | Symbols / areas |
|------|-----------------|
| `src/modal/app/pr-modal-mutations.ts` | `onDiscardPendingReview` |
| `src/modal/app/PrModalApp.impl.tsx` | `postSelectionLineComment`, submit pending / finish review pending clear, forceDrop clears → **delete forceDrop usage** |
| `src/modal/lib/pending-review.ts` | keep pure helpers (`formatStartReviewError`, counts) |
| `src/modal/lib/composer-attach.ts` | `stripPendingReviewFromDetail` → prefer host patch `{ viewerPendingReview: null, reviewComments: filtered }` without durable `_dropPending` |

### Wire UI

| Path |
|------|
| `src/modal/views/diff/SelectionCommentBar.tsx` |
| `src/modal/views/diff/InlineThread.tsx` |
| `src/modal/views/chrome/DiffToolbar.tsx` |
| `src/modal/views/chrome/FinishReviewModal.tsx` |
| `src/modal/views/conversation/ComposerCard.tsx` |

### Tests

| Path |
|------|
| `tests/pessimistic-mutations.rstest.ts` (discard/start) |
| `tests/pending-ui-only-add-comment.rstest.ts` |
| `tests/pending-add-comment-422.rstest.ts` |
| `tests/e2e/features/start-review.mjs` |
| `tests/e2e/features/finish-review.mjs` |

### Exit 4.1

- [ ] Discard: DELETE then host patch; no forceDrop; settled network can show pending again if GitHub has it  
- [ ] Start/Add: post-API host write-through only  

---

## 4.2 Comments

### New

| Path |
|------|
| `src/modal/commands/comments.ts` |

### Move from

| Path | Areas |
|------|-------|
| `src/modal/app/PrModalApp.impl.tsx` | `postIssueComment` / conversation submit |
| `src/modal/app/pr-modal-mutations.ts` | delete review comment, delete issue comment, edit body commits |
| `src/modal/lib/pr-edit-api.ts` | `mapRest*`, `appendIssueCommentToDetail` (post-success append helpers) |

### Tests

| Path |
|------|
| `tests/pessimistic-mutations.rstest.ts` |
| `tests/e2e/features/comment-copy.mjs` (if mutation-related) |

---

## 4.3 Threads resolve / reply

### New

| Path |
|------|
| `src/modal/commands/threads-resolve.ts` |

### Move from

| Path | Areas |
|------|-------|
| `src/modal/app/pr-modal-mutations.ts` | `onReplyToThread`, `onResolveThread` / unresolve |
| `src/modal/lib/pr-edit-api.ts` | resolve stamp helpers |
| `src/modal/lib/review-threads-group.ts` | pure reply payload shapes if any |

### Wire

| Path |
|------|
| `src/modal/views/diff/InlineThread.tsx` |
| `src/modal/app/pr-modal-run-palette.ts` (palette resolve actions) |

### Tests

| Path |
|------|
| `tests/e2e/features/resolve-thread.mjs` |
| `tests/pessimistic-mutations.rstest.ts` |

---

## 4.4 Meta chips & description

### New

| Path |
|------|
| `src/modal/commands/meta.ts` |

### Move from

| Path | Areas |
|------|-------|
| `src/modal/app/pr-modal-mutations.ts` | assignees, labels, reviewers, milestone, title, body, draft — **convert pre-API optimistic to post-API** |
| `src/modal/lib/conversation-timeline-events.ts` | optimistic system events → only after API if still desired |

### Tests

| Path |
|------|
| `tests/e2e/features/meta-bidirectional.mjs` |
| `tests/detail-patch-contract.rstest.ts` |

---

## 4.5 Lifecycle / branch

### New

| Path |
|------|
| `src/modal/commands/lifecycle.ts` |

### Move from

| Path | Areas |
|------|-------|
| `src/modal/app/pr-modal-mutations.ts` | close, open, merge, convert draft |
| `src/modal/app/PrModalApp.impl.tsx` | `onDeleteHeadBranch`, base change |
| `src/modal/lib/delete-head-branch.ts` | pure helpers |
| `src/modal/lib/detail-store.ts` | ensure `headBranchDeleted` in `META_KEYS` + project |

### Host

| Path |
|------|
| `src/host/modules/detail-on-patch.ts` | apply headBranch* keys |

### Tests

| Path |
|------|
| `tests/e2e/features/merged-chrome.mjs` |
| unit lifecycle if present |

---

## 4.6 Files / commits ensure

### New

| Path |
|------|
| `src/modal/commands/files-commits.ts` |

### Move from

| Path |
|------|
| `src/modal/app/pr-modal-mutations.ts` | `ensureAllFiles` / `ensureAllCommits` patterns |
| `src/host/modules/side-fetch-*.ts` | keep fetch ownership on host if already; App only triggers |

### Tests

| Path |
|------|
| settled authority cases in detail-store / patch contract |

---

## 4.7 Toggles (subscribe / reactions / viewed)

### New

| Path |
|------|
| `src/modal/commands/toggles.ts` |

### Move from

| Path |
|------|
| `src/modal/app/pr-modal-mutations.ts` | subscribe, reactions dual-write → **pessimistic** |
| `src/modal/app/PrModalApp.impl.tsx` | viewed toggles if domain |
| `src/modal/lib/comment-reactions.ts` | pure toggle math after server response |
| `src/modal/lib/file-viewed.ts` | pure set ops |

### Policy

Default this plan: **post-API**. If product later wants optimistic, document allowlist in `refactor/README.md` exception table—not silent.

---

## Edit / shrink after moves

| Path | End of Phase 4 |
|------|----------------|
| `src/modal/app/pr-modal-mutations.ts` | Thin facade re-exporting commands **or** deleted |
| `src/modal/app/PrModalApp.impl.tsx` | Wire command ctx; remove inlined mutation bodies |
| `src/modal/app/pr-modal-run-palette.ts` | Import commands |
| `scripts/build-pr-modal-app.mjs` | Include `commands/**` if bundle entry lists files |

## Shared pure (keep)

| Path |
|------|
| `src/modal/lib/pr-edit-api.ts` |
| `src/modal/lib/pending-review.ts` |
| `src/modal/lib/composer-attach.ts` (strip helpers without durable latch) |

## Build / verify

```bash
npm run build:modal
npm run build:app-parts
npx rstest run tests/pessimistic-mutations.rstest.ts tests/pending-ui-only-add-comment.rstest.ts
# e2e pending / resolve / meta as each substep lands
```

## Exit criteria (full Phase 4)

- [ ] All domain mutations live under `src/modal/commands/`  
- [ ] No pre-API domain patch for migrated commands  
- [ ] `pr-modal-mutations.ts` ≤ thin re-exports or gone  
- [ ] Unit + critical e2e green for pending + resolve + meta  

## Next

Phase 5 — delete guards and dead merge (can start after 4.1).
