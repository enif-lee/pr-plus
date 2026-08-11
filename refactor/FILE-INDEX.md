# File index by phase

Quick map of paths mentioned across phases. **Authoritative instructions live in each phase doc.**

## Pure / domain algorithms

| Path | Phases |
|------|--------|
| `src/modal/lib/set-authority.ts` | **1** create |
| `src/modal/lib/detail-store.ts` | 1, 4.5, 5 |
| `src/modal/lib/stale-local-review.ts` | 1, 5 |
| `src/modal/lib/composer-attach.ts` | 1, 4.1, 5 |
| `src/modal/lib/detail-idb.ts` | 1, 5 |
| `src/modal/lib/detail-cache.ts` | 1, 5 |
| `src/modal/lib/pending-review.ts` | 4.1 |
| `src/modal/lib/pr-edit-api.ts` | 4.2–4.3 |
| `src/modal/lib/delete-head-branch.ts` | 4.5 |
| `src/modal/lib/comment-reactions.ts` | 4.7 |
| `src/modal/lib/file-viewed.ts` | 4.7 |
| `src/modal/lib/conversation-timeline-events.ts` | 4.4 |
| `src/modal/lib/uri-route.ts` | 7 |
| `scripts/build-pure.mjs` | 1, 8 |
| `src/modal/pure/*.js` | generated 1, 5 |

## Host

| Path | Phases |
|------|--------|
| `src/host/modules/open-modal-run.ts` | 2, 5 |
| `src/host/modules/props-build.ts` | 2, 3, 5 |
| `src/host/modules/host-core-store.ts` | 2, 3 |
| `src/host/modules/host-core-authority.ts` | 2 |
| `src/host/modules/side-fetch-kick.ts` | 2, 4.6 |
| `src/host/modules/side-fetch-progress.ts` | 2 |
| `src/host/modules/side-fetch-cache-assets.ts` | 2 |
| `src/host/modules/detail-on-patch.ts` | 2, 3, 4.5, 5 |
| `src/host/modules/open-modal.ts` | 2 |
| `src/host/modules/props-render-close.ts` | 2 |
| `src/pr-modal-host.js` | generated 2+ |

## Modal domain / commands / store

| Path | Phases |
|------|--------|
| `src/modal/domain/DomainContext.tsx` | **3** create, 6, 7 |
| `src/modal/domain/patch-ack.ts` | **3** create, 4 |
| `src/modal/commands/types.ts` | **4** |
| `src/modal/commands/patch.ts` | **4** |
| `src/modal/commands/pending.ts` | **4.1** |
| `src/modal/commands/comments.ts` | **4.2** |
| `src/modal/commands/threads-resolve.ts` | **4.3** |
| `src/modal/commands/meta.ts` | **4.4** |
| `src/modal/commands/lifecycle.ts` | **4.5** |
| `src/modal/commands/files-commits.ts` | **4.6** |
| `src/modal/commands/toggles.ts` | **4.7** |
| `src/modal/commands/index.ts` | **4** |
| `src/modal/store/ui-store.ts` | **6** |
| `src/modal/store/modal-store.ts` | 3 deprecate, 6 rewrite/delete |
| `src/modal/store/data-groups.ts` | 3, 6 |
| `src/modal/store/detail-ui-store.ts` | 6 delete/mirror |

## Modal app

| Path | Phases |
|------|--------|
| `src/modal/app/PrModalApp.impl.tsx` | 3, 4, 5, 6, **7 delete** |
| `src/modal/app/pr-modal-mutations.ts` | 3, 4, 5, **7 delete** |
| `src/modal/app/PrModalApp.tsx` | 3, 7 |
| `src/modal/app/PrModalShell.tsx` | **7** create |
| `src/modal/app/mountPrModal.tsx` | 3, 7 |
| `src/modal/app/pr-modal-run-palette.ts` | 4, 6, 7 |
| `src/modal/app/pr-modal-mappers.ts` | 7 |
| `src/modal/app/hooks/usePrModalHotkeys.ts` | **7** |
| `src/modal/app/hooks/usePrModalOpenEffects.ts` | **7** |
| `src/modal/app/hooks/useCommandContext.ts` | **7** |
| `scripts/build-pr-modal-app.mjs` | 4, 7, 8 |
| `scripts/build-modal.mjs` | 4, 7, 8 |

## Views (consume context + store + commands)

| Path | Phases |
|------|--------|
| `src/modal/views/conversation/ConversationView.tsx` | 3, 6, 7 |
| `src/modal/views/conversation/ComposerCard.tsx` | 4.1, 6 |
| `src/modal/views/conversation/VirtualConversationList.tsx` | 6 |
| `src/modal/views/pr-modal/DiffWorkspace.tsx` | 3, 6, 7 |
| `src/modal/views/diff/SelectionCommentBar.tsx` | 4.1, 6 |
| `src/modal/views/diff/InlineThread.tsx` | 4.1, 4.3, 6, 7 |
| `src/modal/views/chrome/DiffToolbar.tsx` | 4.1, 6, 7 |
| `src/modal/views/chrome/DiffChrome.tsx` | 6, 7 |
| `src/modal/views/chrome/CommentNavBar.tsx` | 6 |
| `src/modal/views/chrome/PendingReviewBar.tsx` | 6 |
| `src/modal/views/chrome/FinishReviewModal.tsx` | 4.1, 6 |
| `src/modal/views/composers/RichComposer.tsx` | 6 |
| `src/modal/components/common/CommentReactions.tsx` | 4.7, 6 |

## Tests

| Path | Phases |
|------|--------|
| `tests/set-authority.rstest.ts` | **1**, 8 |
| `tests/detail-store.rstest.ts` | 1, 5 |
| `tests/stale-local-review-drop.rstest.ts` | 1, 2, 5, 8 |
| `tests/detail-patch-contract.rstest.ts` | 2, 3, 4.4, 8 |
| `tests/pessimistic-mutations.rstest.ts` | 3, 4, 5, 8 |
| `tests/domain-context.rstest.tsx` | **3** |
| `tests/pending-ui-only-add-comment.rstest.ts` | 1, 4.1, 5 |
| `tests/pending-add-comment-422.rstest.ts` | 4.1 |
| `tests/store-data-groups.rstest.ts` | 6 |
| `tests/ui-store-no-domain.rstest.ts` | **6**, 8 |
| `tests/no-drop-pending-gate.rstest.ts` | **5**, 8 |
| `tests/architecture-gates.rstest.ts` | 2, 6, 7, 8 |
| `tests/composer-*.rstest.tsx` | 6, 7 |
| `tests/e2e/features/start-review.mjs` | 2, 4.1, 8 |
| `tests/e2e/features/finish-review.mjs` | 4.1, 8 |
| `tests/e2e/features/resolve-thread.mjs` | 4.3, 8 |
| `tests/e2e/features/meta-bidirectional.mjs` | 4.4, 8 |
| `tests/e2e/features/detail-cache.mjs` | 2, 8 |
| `tests/e2e/features/refresh-action.mjs` | 2, 8 |
| `tests/e2e/features/merged-chrome.mjs` | 4.5, 8 |

## Plan docs

| Path | Role |
|------|------|
| `refactor/README.md` | Index |
| `refactor/00-contract.md` … `08-hardening.md` | Phases |
| `refactor/FILE-INDEX.md` | This file |
| `docs/host-first-zustand-rewrite-plan.md` | Superseded summary pointer |
