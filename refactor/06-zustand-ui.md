# Phase 6 — Zustand UI global adoption

## Goal

Shared interactive UI state lives only in Zustand. Prop drilling for chrome/drafts/focus/busy ends. **No PrDetail / domain fields in UiStore.**

## Store files

| Path | Action |
|------|--------|
| `src/modal/store/ui-store.ts` | **New** (or rewrite `modal-store.ts` in place) — UI-only schema |
| `src/modal/store/modal-store.ts` | Replace with re-export of `ui-store` **or** delete after rename |
| `src/modal/store/data-groups.ts` | UI selector groups only; remove `setLocalDetail` / domain |
| `src/modal/store/detail-ui-store.ts` | Delete **or** one-way mirror from DomainContext `sideSettled` / host props; prefer read Domain flags via context |

## UiStore allowed fields (canonical)

```text
layoutMode, diffMode, scrollTop, viewportHeight
searchOpen, searchQuery, searchHits, searchHitIndex, activeFilePath, animClass
commentText, actionBusy, actionMsg, actionMsgSeq
collapsedFiles, expandedDirs, fileQuery
lineSelection, selecting, selectionDraft, showSelectionComposer, selectionIslandLeaving
replyDrafts, timelinePage
editingBody, editingComment
paletteOpen, paletteQuery, picker
focusedConversationAnchor, pendingConversationNavAnchor
optHintsActive, activeDiffCommentId, focusedThreadUnitId
commentIndex, viewedPaths  # viewedPaths: UI cache OK if server revalidate on open; document
```

## UiStore forbidden

```text
localDetail, setLocalDetail
viewerPendingReview, reviewComments, labels, assignees, …
_dropPending, detail blobs
```

## View / chrome — convert props → selectors

Migrate when editing; target zero chrome prop chains:

| Path | Subscribe examples |
|------|-------------------|
| `src/modal/views/conversation/ConversationView.tsx` | commentText, layoutMode, replyDrafts, actionMsg |
| `src/modal/views/conversation/ComposerCard.tsx` | busy, commentText, discard via commands |
| `src/modal/views/conversation/VirtualConversationList.tsx` | pendingNavAnchor, focus |
| `src/modal/views/pr-modal/DiffWorkspace.tsx` | layout, selection, fileQuery |
| `src/modal/views/diff/SelectionCommentBar.tsx` | selectionDraft, busy |
| `src/modal/views/diff/InlineThread.tsx` | replyDrafts, activeDiffCommentId |
| `src/modal/views/chrome/DiffToolbar.tsx` | search, filters UI, busy |
| `src/modal/views/chrome/DiffChrome.tsx` | layout bits |
| `src/modal/views/chrome/CommentNavBar.tsx` | commentIndex |
| `src/modal/views/chrome/PendingReviewBar.tsx` | counts from **DomainContext**, actions from commands |
| `src/modal/views/chrome/FinishReviewModal.tsx` | ui busy + domain pending |
| `src/modal/views/composers/RichComposer.tsx` | drafts via store |
| `src/modal/components/common/CommentReactions.tsx` | command only; no domain props bag |

## Domain read path (not Zustand)

| Path | Role |
|------|------|
| `src/modal/domain/DomainContext.tsx` | `useDomainDetail()`, selectors for pendingCount, threads, meta chips |
| `src/modal/app/PrModalShell.tsx` or impl | Provider value = host detail prop |

## App wiring

| Path | Action |
|------|--------|
| `src/modal/app/PrModalApp.impl.tsx` | Remove local useState duplicates of store fields; use store |
| `src/modal/app/pr-modal-run-palette.ts` | palette state from UiStore |
| `src/modal/store/data-groups.ts` | `useChromeUi()`, `useComposerUi()`, etc. |

## Tests

| Path | Action |
|------|--------|
| `tests/store-data-groups.rstest.ts` | Update imports/selectors |
| `tests/architecture-gates.rstest.ts` | Require `zustand`; forbid `localDetail` on store type source |
| **New** `tests/ui-store-no-domain.rstest.ts` | Parse/ts assert UiStore interface has no detail fields |
| `tests/composer-*.rstest.tsx` | Use store in render harness |

## Build / verify

```bash
npm run build:modal
npx rstest run tests/store-data-groups.rstest.ts tests/ui-store-no-domain.rstest.ts
```

## Exit criteria

- [ ] `localDetail` removed from store API  
- [ ] Deep leaves use `useUiStore` / domain context instead of 15+ chrome props  
- [ ] Architecture gate fails if domain fields return to UiStore  
- [ ] No dual write: store UI field + same useState in App  

## Next

Phase 7 — physical PrModal decomposition.
