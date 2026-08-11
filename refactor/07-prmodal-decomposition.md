# Phase 7 — PrModal component / module decomposition

## Goal

Break `PrModalApp.impl.tsx` (~10k lines) and residual app glue into a thin shell + hooks + views + commands. No new behavior.

## Target structure

```text
src/modal/app/
  PrModalApp.tsx                 # public export
  PrModalShell.tsx               # providers, layout switch, page region
  mountPrModal.tsx               # mount API (keep)
  pr-modal-mappers.ts            # keep pure mappers or move to lib
  pr-modal-run-palette.ts        # thin; uses commands + ui-store
  hooks/
    usePrModalHotkeys.ts
    usePrModalOpenEffects.ts     # detail prop → context; open gen side effects
    usePrModalProgressMirror.ts  # optional sidePending → ui
    useCommandContext.ts         # build CommandContext once
  # pr-modal-mutations.ts        # DELETE after Phase 4
  # PrModalApp.impl.tsx          # DELETE or ≤300-line re-export shell

src/modal/commands/              # from Phase 4
src/modal/domain/                # from Phase 3
src/modal/store/ui-store.ts      # from Phase 6
src/modal/views/                 # existing; stop receiving god props
```

## Split map from `PrModalApp.impl.tsx`

Move by concern (approximate regions — re-grep when executing):

| Concern | Destination |
|---------|-------------|
| Root state that is UI | `store/ui-store.ts` (already Phase 6) |
| Domain merge effect | **Delete** (DomainContext only) |
| forceDrop / pending latch | **Delete** (Phase 5) |
| `postSelectionLineComment` / submit review | `commands/pending.ts` |
| Issue comment post | `commands/comments.ts` |
| Meta / lifecycle handlers still inline | `commands/meta.ts`, `lifecycle.ts` |
| Hotkeys / shortcut monitor wiring | `hooks/usePrModalHotkeys.ts` |
| URI restore / hash navigation | `hooks/usePrModalOpenEffects.ts` + existing `lib/uri-route.ts` |
| Palette runner | `pr-modal-run-palette.ts` (slim) |
| Layout chrome composition | `PrModalShell.tsx` + `views/chrome/*` |
| Diff page tree | `views/pr-modal/DiffWorkspace.tsx` |
| Conversation page tree | `views/conversation/ConversationView.tsx` |
| Mappers | `pr-modal-mappers.ts` / `lib/pr-edit-api.ts` |

## Edit / create files

| Path | Action |
|------|--------|
| `src/modal/app/PrModalShell.tsx` | **Create** — DomainDetailProvider, UiStore already global, page switch Conversation/Diff |
| `src/modal/app/hooks/usePrModalHotkeys.ts` | **Create** |
| `src/modal/app/hooks/usePrModalOpenEffects.ts` | **Create** |
| `src/modal/app/hooks/useCommandContext.ts` | **Create** |
| `src/modal/app/PrModalApp.tsx` | Export shell only |
| `src/modal/app/PrModalApp.impl.tsx` | Delete after move or shrink to re-export |
| `src/modal/app/pr-modal-mutations.ts` | Delete |
| `src/modal/app/mountPrModal.tsx` | Import shell |
| `scripts/build-pr-modal-app.mjs` | Entry points updated for new files |
| `scripts/build-modal.mjs` | Ensure commands/hooks bundled |

## View prop APIs (end state)

Views receive **minimal** props:

```text
// identity / host actions only if not in context
onClose, onRefresh, presentation?
// everything else: useDomainDetail(), useUiStore(), commands
```

Files to tighten prop interfaces:

| Path |
|------|
| `src/modal/views/conversation/ConversationView.tsx` |
| `src/modal/views/pr-modal/DiffWorkspace.tsx` |
| `src/modal/views/chrome/DiffChrome.tsx` |
| `src/modal/views/chrome/DiffToolbar.tsx` |
| `src/modal/views/diff/InlineThread.tsx` |

## Tests / wiring

| Path | Action |
|------|--------|
| `tests/architecture-gates.rstest.ts` | Enforce max line budget optional; enforce no `PrModalApp.impl` if deleted |
| `tests/*-wiring.rstest.ts` | Update import paths |
| `tests/e2e/features/smoke*.mjs` | Shell still opens |
| `tests/composer-*.rstest.tsx` | Update harness imports |

## Build / verify

```bash
npm run build:app-parts
npm run build:modal
npm run check   # or typecheck + unit
```

## Exit criteria

- [x] No god-file mount SoT at PrModalApp.impl (impl re-export-only; shell is composition root)  
- [x] `pr-modal-mutations.ts` deleted  
- [x] `PrModalApp.impl.tsx` re-export-only → PrModalShell  
- [x] Shell + hooks + commands + views graph clear  
- [x] Smoke e2e: open modal conversation + diff  

## Next

Phase 8 — hardening gates and docs.
