# Phase 9 — Split remaining >2000-line SoT (shell first)

**Status:** planned  
**Depends on:** Phase 4 commands, Phase 6 UiStore, Phase 7 shell mount, Phase 8 gates  
**Baseline:** `origin/main` 1.10.1 (`02a60f4`)  
**No new behavior.**

This is the plan of record for the remaining large-file work. It includes:

1. Inventory of the largest source files (generated vs SoT vs next-tier).
2. Split maps for the three maintainable files over 2000 lines.
3. Why `PrModalShell.tsx` is the primary target, with measured impact.
4. How the existing Zustand store should (and should not) be used for prop and render cost.

Phases 0–8 made `PrModalShell.tsx` the composition root and moved mutations, hotkeys, and chrome out. The shell is still **8870** lines. This phase finishes the split that Phase 7 named but did not shrink.

---

## 1. Inventory — what is actually large

Counts are last-line / trailing-newline conventions as of 2026-08-13 on the 1.10.1 baseline.

### Not SoT (do not split as source)

These are generated assemblies, vendor, or modal build output. Edit the TypeScript sources and rebuild.

| Path | ~Lines | Why excluded |
|------|------:|--------------|
| `src/background.sw.js` | ~14132 | MV3 service-worker assembly |
| `src/modal/dist/pr-modal.css` | ~13788 | modal CSS build |
| `src/fetch-pulls.js` | ~6667 | fetch assembly (`PRTreeFetch` attach) |
| `src/pr-modal-host.js` | large | host assembly |
| `src/modal/dist/mermaid.esm.js` | ~3536 | vendor |
| `src/content-bridge.js` | ~2280 | bridge assembly |

`background.sw.js` is a build artifact. Generated assemblies stay gitignored; do not treat them as decomposition targets. Hand-written `detail-merge.js` stays tracked.

### Maintainable TypeScript / TSX SoT over 2000 lines

These three are the only inspected host / fetch / view / lib / hook / command SoT files over 2000 lines.

| # | Path | Lines | Role this phase |
|---|------|------:|-----------------|
| 1 | `src/modal/lib/line-selection.ts` | 2228 | Smallest risk. Split first as a barrel. Unlocks shell slice D. |
| 2 | `src/modal/views/conversation/ConversationView.tsx` | 3046 | After shell C–E, or in parallel only as same-directory siblings. Undivided React root — no `parts/` mid-IIFE. |
| **3** | **`src/modal/app/PrModalShell.tsx`** | **8870** | **Do this.** Almost all remaining mass and coupling. |

### Next-tier SoT (under 2000 — out of scope unless a move pushes one over)

| Path | Lines |
|------|------:|
| `src/modal/commands/domain-mutations.ts` | 1851 |
| `src/host/modules/open-modal-run.ts` | 1838 |
| `src/modal/app/hooks/usePrModalHotkeys.ts` | 1818 |

Other inspected candidates are smaller (`InlineThread.tsx` ~1443, `VirtualDiff.tsx` ~1325, `DiffWorkspace.tsx` ~575). `fetch-api.ts` / `sw-api.ts` are re-export composition entries.

Architecture-gates cap **host modules** and **modal CSS** at **1900**. Host README keeps a function-boundary budget of **≤1500** for lib splits. The shell has **no** line-count gate today; do not add one until after slice F.

---

## 2. Why #3 (the shell) is the work

Phase 7 already removed Header / GNB / SearchBar / Palette / Resizers, `usePrModalHotkeys`, `commands/*`, and `pr-modal-run-palette`. What remains in the 8870-line file is still the composition root **and** most of the remaining product logic.

| File | Why it is / is not the primary target |
|------|----------------------------------------|
| `line-selection.ts` | Pure lib. Safest first PR. Does not shrink the shell by itself. |
| `ConversationView.tsx` | Large view, but documented as an undivided React root. Sibling extracts only. Secondary. |
| **`PrModalShell.tsx`** | Owns nav, selection keyboard, session/URI, ensure*/gap, search jump, thread collapse, and the 128+146-line prop drills. This is where maintainability and render coupling still live. |

Moving a few `ensure*` helpers into commands is **not** a decomposition. The mass is Diff/Conversation nav, selection keyboard, and session effects.

---

## 3. Goal

1. **Primary:** shrink `PrModalShell.tsx` by moving remaining clusters into *existing* commands, views, hooks, and lib — not new god-files. Realistic 1st-line target: **~5000 lines**. Floor if session/URI/gestures stay shell-owned: **~3500–4500**.
2. **Secondary:** split `ConversationView.tsx` (3046) via same-directory siblings; split `line-selection.ts` (2228) at function boundaries (lib budget ≤1500).
3. **Render/props:** stop the shell from *subscribing and re-passing* mid-frequency UiStore fields. Leaves already own scroll / composer typing / island draft / palette query. Do the same for search, file filter, toasts.

`PrDetail` stays on the host open-session store. React reads `detail` / `useDomainDetail()`. UiStore stays layout/drafts/focus only.

---

## 4. Constraints (do not reopen)

- No new behavior. Verify with existing unit + targeted e2e.
- Do **not** revive `usePrModalOpenEffects`. URI/session stay `lib/uri-route.ts` + `lib/session-view.ts`. A new hook, if any, is `usePrModalSessionRoute` owned by the shell.
- Do **not** create `commands/pending.ts`, `comments.ts`, or `files-commits.ts`. Receivers are the three modules that exist:

  ```text
  src/modal/commands/domain-mutations.ts
  src/modal/commands/review-actions.ts
  src/modal/commands/side-actions.ts
  ```

- ConversationView: same-folder siblings only. Do not add `views/conversation/parts`.
- `PrModalApp.impl.tsx` remains a ≤300-line re-export of `./PrModalShell`.
- Do not put `PrDetail` / reviewComments / viewerPendingReview in UiStore.
- Do not put `virtualRows` / `mappedComments` in the store just to shorten JSX. Derivation cost stays; object churn can get worse.
- `DiffChrome.tsx` is unused by the shell. Leftover Diff chrome goes to `DiffWorkspace` / `DiffToolbar`, not a new import of DiffChrome unless a later slice proves it is the owner.
- Host module / CSS gate remains 1900. Shell has **no** line-count gate today; do not add one until after slice F.
- `build:pure` MAP `PRModalLineSelection` global must keep working after the line-selection barrel.
- Preserve 1.10.1 `commitDiffThreadCursor` / `clearLineSelectionForNav(true)` behavior (`tests/diff-nav-overscan.rstest.ts`).

---

## 5. Measured mass (`PrModalShell.tsx`)

Counted as top-level constructs inside `PrModalApp` (function / `useCallback` / `useEffect` / `Object.assign` / JSX), 2026-08-13. **214 blocks.**

| Cluster | Lines | This phase |
|---------|------:|------------|
| Diff/Conversation nav + thread cursor + ⌥↑↓ + Goto | **1758** | **Move** (slice C) |
| Session / URI / deep-link effects + expand/collapse | **989** | Stay in shell (optional hook in G — same owner) |
| Selection keyboard + island + copy/submit | **949** | Keyboard flush/reveal **move** (D). Gestures/copy **stay**. |
| `ensure*` / commit filter / lazy thread comments / gap | **516** | **Move** to existing commands or shell-owned hooks (A) |
| JSX composition | **534** | Stay; shrink via leaf subscribe (F) |
| Resize / shell / file-tree chrome | **423** | Stay |
| Palette / people / milestone / meta wrappers | **418** | Only `runPaletteCommand` is worth moving (B) |
| Thread collapse | **295** | **Move** (E) |
| Context-thread | **201** | **Move** (B) |
| Search jump | **189** | **Move** (E) |
| `Object.assign` hotkeyBag + mutD | **192** | Optional; **~200 lines, no render win** |
| Imports + other state/effects | ~2300 | Mostly stay |

JSX prop drill today: ConversationView **128** lines, DiffWorkspace **146** lines. `ConversationView` is `memo`; `DiffWorkspace` is not.

Largest single blocks: deep-link `useEffect` @L5156 (**364**), `onToggleThreadCollapse` (**235**), `flushSelectionKeyboardMove` (**207**), `ensureAllFiles` (**147**). `applySelectionKeyboardMove` itself is **41** lines.

### Impact model (shell line count)

| After | Shell ≈ | Δ from 8870 | What you feel |
|-------|--------:|------------:|---------------|
| A. ensure* / filter / threads / gap | ~8400 | −8% | Small. Host fetch callbacks only. |
| B. context-thread + `runPaletteCommand` | ~8100 | −9% | Small. |
| **C. nav + thread cursor + ⌥↑↓ + Goto** | **~6300** | **−29%** | **This is the split.** |
| D. selection keyboard flush/reveal | ~5850 | −34% | Pair with C. 1.10.1 cursor + key-hold. |
| E. search jump + thread collapse | ~5400 | −39% | Medium. |
| **F. leaf subscribe; drop prop drill** | **~5000** | **−44%** | Maintainability + some render. **Primary target.** |
| G. session/URI as shell-owned hook | ~4000 | −55% | File split only; same responsibility. |

A+B alone is not a decomposition. C–F is. Sub-1000-line “thin root” is **out of scope**: resize, gestures, JSX, and derived row lists remain. Floor after G is still **~3500–4500**. Going below that means changing what the shell owns.

`Object.assign` deletion is a wiring cleanup, not a size or render milestone.

### Risk vs effect

- **A** is small gain, narrow regression surface. Watch `onFetchAllPrFiles` / `onLoadReviewThreadComments` / `onFetchAllPrCommits`.
- **C+D** are the line-count and review-difficulty core. They share 1.10.1 `commitDiffThreadCursor`, held ⌥J/K, and the selection island. e2e `conversation-nav`, `selection`, and Diff key-hold are required.
- Deleting `Object.assign(mutD/hotkeyBag)` moves ~200 lines of field lists. Not a milestone.
- **F** is more about dropping DiffWorkspace’s 100+ props than about line count.

---

## 6. Store and render (Zustand — already exists)

**Using a store helps. Adding another store, or putting more data into Zustand, does not.** The remaining win is changing *who* already-existing `useModalStore` / `data-groups` subscribe.

A second UI store, Jotai, or putting `PrDetail` / `virtualRows` / `mappedComments` in UiStore is out of scope and would not help render.

### Already leaf-owned (high-frequency paths already cut)

| Field | Who subscribes today |
|-------|----------------------|
| `scrollTop`, `viewportHeight` | `useScrollMetricsGroup` (Diff) — root uses `getState` + ref |
| `commentText` | ConversationView |
| `selectionDraft` | DiffWorkspace / island |
| `paletteQuery` | CommandPalette |
| `replyDrafts` | InlineThread by id |
| `lineSelection` / `selecting` | VirtualDiff — root must **not** subscribe |

Result today: Diff scroll, island typing, conversation composer typing, and thread replies do not re-render the 8870-line root.

### Still leaking (root value-subscribes, then re-passes)

The shell still value-subscribes and forwards mid-frequency fields: `searchQuery`, `searchHits`, `fileQuery`, `collapsedFiles`, `commentIndex`, `actionBusy` / `actionMsg`, `pendingReview`, `showSelectionComposer`, …

One search keystroke then:

1. The 8870-line root re-renders.
2. A new `searchQuery` prop breaks `memo(ConversationView)`.
3. Non-memo `DiffWorkspace` re-renders because the parent did.

The store is not missing. The root is subscribed and propagating.

### Do / do not

| Action | Prop drill | Render |
|--------|------------|--------|
| Leaves call `useSearchGroup` / `useFileNavGroup` / `useChromeOverlayGroup`; root uses `getState()` in callbacks | Shrinks | **Yes** for search / file filter / toast |
| Callbacks read `useModalStore.getState()` / commands | 128+146 props shrink | Slight (stable function refs) |
| Root value-subscribes then `foo={foo}` | Unchanged | **No win** |
| Put `virtualRows` / `mappedComments` in Zustand | JSX may shrink | Almost none. Derive cost stays; object churn can worsen |
| Put `PrDetail` in UiStore | Forbidden (host / `useDomainDetail`) | Worse (large-object subscribe) |

### Concrete store work (slice F)

- Add to `ROOT_FORBIDDEN_HIGH_FREQ_FIELDS` (and stop root value-subscribe): `searchQuery`, `fileQuery`, `actionMsg`, and any other field the root only forwards.
- Leaves call `useSearchGroup`, `useFileNavGroup`, `useChromeOverlayGroup`, `usePendingReviewGroup` (already written).
- Commands/nav read `useModalStore.getState()` inside callbacks. Do not subscribe the root to drive those callbacks.
- Keep passing **stable** host identity + `onClose` / `onRefresh` / `presentation`.
- After F, consider `memo(DiffWorkspace)`.

Render win from F: search/filter/toast no longer tear the whole tree. Scroll/typing is already fixed. Thread jump and host `detail` patches are unchanged.

**Store work does not replace slice C.** Nav functions still live in the shell until extracted. Zustand will not take the shell from 8870 to 5000 by itself.

---

## 7. Split maps

### 7.1 `line-selection.ts` (slice 0, or with D)

Pure lib. `scripts/build-pure.mjs` emits `PRModalLineSelection`. Keep `line-selection.ts` as barrel. Budget: function-boundary **≤1500**.

| New file | Contents |
|----------|----------|
| `src/modal/lib/line-selection-nav.ts` | `isSelectableDiffRow`, `isSelectionNavRow`, single-step move |
| `src/modal/lib/line-selection-range.ts` | multi-line / shift extend |
| `src/modal/lib/line-selection-payload.ts` | review-comment payload, `githubBlobLinePermalink` |

Gestures and native copy stay in the shell. Tests: `tests/line-selection-split.rstest.ts`. Then `npm run build:pure`.

### 7.2 `ConversationView` (after C–E, or sibling-only PRs)

Keep `ConversationViewImpl`. Already extracted: `VirtualConversationList`, `MergeBox`, `ComposerCard`, `DescriptionCard`, `GroupThreadControls`, `ThreadGapBanner`.

| Sibling (same folder) | Move |
|-----------------------|------|
| `comment-chrome.tsx` | `commentActions`, copy body/link, `quoteReplyToMainComposer` |
| `timeline-event-row.tsx` | timeline event render |
| `thread-collapse.ts` | collapse / group-open maps |
| `review-thread-cards.tsx` | review group / thread cards wrapping InlineThread |
| `timeline-tip-chips.tsx` | tip chips |
| `conversation-aside-meta.tsx` | labels / projects / milestone / development |

`renderPanelRow` stays a switch. Do **not** start using unused `ConversationBagContext` as a new global hook; keep `render*` prop adapters. Soft target: ~1500 (build script warning).

### 7.3 `PrModalShell` — stay vs move

**Stay in the shell**

- `expandDiff` / `collapseDiff` / `onToggleDiff`, keep-alive panels
- Session/URI restore (`loadSessionView` / `saveSessionView`, `replaceLocationRoute`, `/changes` hash) — or the same owner as `usePrModalSessionRoute` in G
- `jumpToReviewComment` **until** C extracts it with nav (then the hook owns it)
- Selection gestures: `onSelectionStart` / `Extend` / `End`, native copy arm/finish, `copySelectionCode` / `Url`
- Overlay / size / resize / fullscreen / file-nav chrome
- JSX composition of Header, GNB, SearchBar, palette, Conversation, Diff, resizers

**Move to existing modules**

| Cluster | Destination |
|---------|-------------|
| `ensureAllCommits`, `ensureAllFiles`, `applyDiffCommitFilter`, `ensureThreadCommentsLoaded`, `onExpandDiffGap`, `ensurePrTags` | `commands/side-actions.ts` or `review-actions.ts` (same install fn) — **not** a new file. A shell-owned hook is acceptable if it avoids growing a command module into a new god-file. |
| `runDiffContextThreadAction`, `runContextThreadAction`, register/get/ensure | `review-actions.ts` and/or Conversation sibling / `useContextThreadActions` |
| `runPaletteCommand` | `pr-modal-run-palette.ts` (assemble from store + commands) |
| Diff/Conversation nav, thread cursor, ⌥↑↓, Goto, `navComment`, `applyConversationCommentNav` | **New** `src/modal/hooks/useDiffConversationNav.ts` + `lib/comment-nav.ts` (extend, do not fork) |
| `flushSelectionKeyboardMove`, reveal/schedule/head | **New** `src/modal/hooks/useSelectionKeyboard.ts` + line-selection barrel |
| Search jump (`jumpToSearchHit`, `navSearch`, load-comments) | **New** `src/modal/hooks/useSearchJump.ts` or fold into nav hook / SearchBar + `lib/search-index.ts` |
| `onToggleThreadCollapse` + collapse maps | Diff/Conversation views + small lib helper / `useThreadCommentsAndGap` |

`mutD` / `reviewBag` / `sideBag` / `hotkeyBag` `Object.assign`: prefer install functions returning a complete bag. Do not treat as a milestone.

---

## 8. Execution order (PRs)

Each slice is one PR when landing incrementally. No-new-behavior. Build + targeted e2e before merge.

Branch from current `main` (1.10.1), not by stacking onto unrelated injection/fail-closed work.

| # | Slice | Depends | Verify |
|---|-------|---------|--------|
| 0 | line-selection barrel | — | `line-selection-split.rstest.ts`, `build:pure` |
| A | ensure* / filter / lazy comments / gap → existing commands or shell-owned hooks | — | unit for those helpers; smoke open Diff |
| B | context-thread + `runPaletteCommand` | A optional | palette + conversation-nav smoke |
| **C** | **nav + thread cursor + ⌥↑↓ + Goto → `useDiffConversationNav`** | 0 helpful | **e2e `conversation-nav`, Diff key-hold, 1.10.1 `diff-nav-overscan`** |
| D | selection keyboard flush/reveal | 0, C | e2e `selection` |
| E | search jump + thread collapse | C | search + resolve/expand thread |
| **F** | **leaf subscribe; delete root value-subscribe + prop drill** | C–E better after, can start with search/fileQuery anytime | `store-data-groups`, `ui-store-no-domain`; type in search/file filter and confirm shell does not re-render (React profiler or a debug counter) |
| G | optional `usePrModalSessionRoute` | F | hash restore / `#discussion_r-` / `#issuecomment-` |
| H | Conversation siblings | E–F | conversation-nav, resolve-thread |

Slice **C + F** are the ones that matter. A/B are cheap warm-ups. G is cosmetic unless the shell file is still painful after F.

If landing as one branch: execute 0 → A–F → H; G only if needed to hit ~5000.

---

## 9. Files

| Path | Action |
|------|--------|
| `src/modal/lib/line-selection.ts` | Barrel only |
| `src/modal/lib/line-selection-nav.ts` | **Create** |
| `src/modal/lib/line-selection-range.ts` | **Create** |
| `src/modal/lib/line-selection-payload.ts` | **Create** |
| `src/modal/lib/comment-nav.ts` | Extend if C needs it |
| `src/modal/hooks/useDiffConversationNav.ts` | **Create** (C) |
| `src/modal/hooks/useSelectionKeyboard.ts` | **Create** (D) |
| `src/modal/hooks/useSearchJump.ts` | **Create** (E) or fold into nav hook / SearchBar |
| `src/modal/hooks/useEnsureDiffLoads.ts` | **Create** (A) if ensure* stays a hook instead of growing commands |
| `src/modal/hooks/useContextThreadActions.ts` | **Create** (B) if not absorbed into `review-actions.ts` |
| `src/modal/hooks/useThreadCommentsAndGap.ts` | **Create** (A/E) if lazy comments + collapse travel together |
| `src/modal/hooks/usePrModalSessionRoute.ts` | **Create only in G** |
| `src/modal/app/pr-modal-run-palette.ts` | Absorb `runPaletteCommand` |
| `src/modal/commands/side-actions.ts` | Absorb ensure*/filter/gap as fits |
| `src/modal/commands/review-actions.ts` | Absorb thread comments / context-thread as fits |
| `src/modal/app/PrModalShell.tsx` | Delete moved clusters; stop forbidden subscriptions |
| `src/modal/store/data-groups.ts` | Widen `ROOT_FORBIDDEN_HIGH_FREQ_FIELDS`; add groups only if missing |
| `src/modal/views/pr-modal/DiffWorkspace.tsx` | Leaf groups; drop forwarded props; consider `memo` after F |
| `src/modal/views/conversation/ConversationView.tsx` | Leaf groups; later siblings |
| `src/modal/views/conversation/*.tsx` | New siblings in H |
| `src/modal/components/common/ActionToast.tsx` | Leaf-subscribe `actionMsg` |
| `src/modal/hooks/usePrModalOpenEffects.ts` | **Must stay deleted** |

---

## 10. Tests / verify

Per slice:

```bash
npm run build:pure && npm run build:host && npm run build:modal
npm run check          # or targeted rstest
```

Then chrome://extensions reload + GitHub tab refresh when claiming UI. After SW/host/pure: reload the extension. Do not rely on a full Chrome restart.

| Slice | Minimum extra |
|-------|----------------|
| 0 | `tests/line-selection-split.rstest.ts` |
| A | existing command/mutation wiring; `ensure-all-files-progress`, `empty-diff-gate`, `threads-window-contract` if paths move |
| C | `tests/diff-nav-overscan.rstest.ts`; e2e conversation-nav + Diff key-hold |
| D | e2e `selection`; `diff-keyhold-architecture`, `conversation-keyhold-architecture` if SoT path moves |
| F | `tests/store-data-groups.rstest.ts`, `tests/ui-store-no-domain.rstest.ts` |
| H | e2e conversation-nav, resolve-thread; `comment-copy-link` if chrome moves |
| After F | smoke conversation + Diff |

Do **not** add a git-tracking gate or a shell line-count gate in this phase. Do **not** add extra tests beyond retargeting existing ones to the new SoT paths.

After the full split, `npm run test:e2e` then a second `npm run test:e2e:smoke`. GitHub turbo + a long-lived agent-browser tab can keep a stale content-script IIFE; use `PRP_E2E_RELOAD_EXT=1` and/or a fresh session after `build:modal`.

---

## 11. Exit criteria

- [ ] `line-selection.ts` is a barrel; parts ≤1500; `PRModalLineSelection` still built
- [ ] Shell **~5000** lines after C–F (measure with the same top-level construct method; ≤5200 slack is acceptable)
- [ ] Root does not value-subscribe to `ROOT_FORBIDDEN_HIGH_FREQ_FIELDS` (including search/file/toast extras)
- [ ] DiffWorkspace / ConversationView no longer take copies of those store fields as props
- [ ] `usePrModalOpenEffects` still absent
- [ ] No new `commands/files-commits.ts` (or other Phase-4-planned files that were never created)
- [ ] 1.10.1 `commitDiffThreadCursor` behavior intact (`diff-nav-overscan`)
- [ ] Smoke: Conversation + Diff open; selection + held nav e2e green

---

## 12. Next (not this phase)

If the shell is still >1500 after G and that is a product goal, a later phase must **change what the shell owns** (gestures, resize, derived rows). That is not this phase.

Next-tier files (`domain-mutations.ts`, `open-modal-run.ts`, `usePrModalHotkeys.ts`) stay untouched unless a move pushes one over 2000. Then split them with the same rules: existing modules, function boundaries, no new god-file.

Out of scope: schedule / headcount, Jotai, removing progressive open or IDB, pre-API optimistic domain paint as default, a second UI store, merging or CWS publish.
