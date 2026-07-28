# pr+ full E2E browser QA scenario

**Target:** `https://github.com/enif-lee/pr-plus/pulls`  
**Extension:** local workspace via `agent-browser.json` (`extensions: ["."]`, profile `./.browser/profile`).  
**Preferred PR for deep keyboard tests:** open demo with many threads (e.g. **#7** `[demo] g — stack root DEMO-300`).

**Automated local e2e (not in `npm test`):** see `tests/e2e/README.md`  
- `npm run test:e2e:features` — feature / style / layout scenario  
- `npm run test:e2e:perf` — shortcut + scroll loop render budgets  
- `npm run test:e2e` — both

**Pass criteria (release gate):**

- All **P0** green  
- Conversation ⌥J/K: focus top-band ≈ **24px**; no scroll thrash  
- Diff ⌥J/K: focused thread offset/viewport ≈ **0.27–0.37** (~⅓)  
- Esc on reply textarea: **blur only** (modal stays open)  
- Context shortcuts work on both Conversation and Diff (active-panel routing)  
- No product regressions on Find / palette / layout toggle  

Live write APIs (real resolve/submit/merge) are **manual-only** unless explicitly authorized.

---

## Feature map (inventory summary)

| Area | Key chords / actions | Primary signals |
|------|----------------------|-----------------|
| Open from pulls | Click PR title | `.prp-overlay`, `data-layout=conversation` |
| Layout | ⌥. | `data-layout` flips; keep-alive panels; one `--active` |
| Conv step nav | ⌥⇧C seed/clear · ⌥J/K | `.prp-card--kb-focus` / group row; top **24px** |
| Conv context | ⌥F fold · ⌥D Diff · ⌥C reply/submit · ⌥⌃R resolve | Active panel only; tips on focused host |
| Diff step nav | ⌥J/K threads | Third-align scroll; `activeDiffCommentId` tips |
| Diff files | ⌥⇧[ ] · ⌥B · ⌥U/R/P · ⌥⇧R viewed | DFS order; filter chips; nav collapse |
| Diff selection | Drag / arrows · island · ⌥C | `.prp-selection-*`; Esc cascade |
| Find | ⌘F / Ctrl+F · Enter · Esc | `.prp-search`; J/K steps hits when open |
| Palette | ⌥⇧K | `.prp-pp-layer`; Esc closes palette only |
| Side panel | ⌥B | Conv aside / Diff filetree collapse |
| Stack / adjacent | ⌥1–9 · ⌥[ ] · stack chips | PR number changes when stack ≥2 |
| Esc hierarchy | Nested → blur → close | See P6 table |
| Opt-hold | Hold Option | `.prp-opt-btn-hint`; hides after chord until release |

Sources: `shortcut-policy.ts`, `PrModalApp.tsx`, `VirtualConversationList.tsx`, `VirtualDiff.tsx`, `context-thread-dom.ts`, `InlineThread.tsx`, `command-palette.ts`, chrome views, `modal-store.ts`.

---

## P0 — Smoke (must pass)

| # | Step | Expect |
|---|------|--------|
| P0.1 | Open `/enif-lee/pr-plus/pulls` | PR rows; extension not broken |
| P0.2 | Click a PR title (e.g. #7) | `.prp-overlay` mounts; URL may include `prp_page` / `prp_number` |
| P0.3 | Conversation chrome | Virtual scroller `.prp-conversation-virtual`; desc / merge / timeline / aside |
| P0.4 | ⌥. → Diff | `data-layout=diff`; file tree + virtual list; panel `--active` |
| P0.5 | ⌥. → Conversation | `data-layout=conversation` (or centered) |
| P0.6 | Esc with no nested UI / no editable focus | Overlay closes |

---

## P1 — Conversation keyboard / context thread

| # | Step | Expect |
|---|------|--------|
| P1.1 | ⌥⇧C (or ⌥J) seed focus | Focus ring on timeline unit (`data-thread-focus-anchor` / `data-search-anchor`) |
| P1.2 | ⌥J / ⌥K several times | Focus moves; **scroll pins ~24px** from scroller top; **no thrash** (single settle) |
| P1.3 | Nav across review-group path rows | ScrollTop changes between group rows; still top band when not near list end |
| P1.4 | ⌥F on focused thread | Fold/expand; `collapsed` class / `aria-expanded` toggles |
| P1.5 | ⌥D on thread with path | Switches to Diff; thread revealed (~⅓ viewport) |
| P1.6 | ⌥C (1st) | Reply `textarea.prp-mdc__ta` focused; ghost opens if needed |
| P1.7 | Type in reply | Smooth typing (draft leaf store; no full-tree lag) |
| P1.8 | ⌥C (2nd) non-empty draft | Submit path enabled (avoid live post in automated runs unless intended) |
| P1.9 | Esc in reply | **Blur only**; `.prp-overlay` remains |
| P1.10 | ⌥⌃R when resolve available | Resolve/unresolve (needs `threadNodeId`; skip if pending-only) |
| P1.11 | ⌥↑ / ⌥↓ | Timeline panel scrolls without changing focus |
| P1.12 | ⌥⇧↑ / ⌥⇧↓ | ~page scroll on conversation scroller |
| P1.13 | Enter on collapsed focused `review-comment:` | Expands thread |
| P1.14 | ⌥⇧C again | Clears conversation comment focus |

**Scroll contract:** focused node top − scroller top ≈ **24** (median 16–36; spread ≤12 away from list end).

---

## P2 — Diff keyboard / context / files

| # | Step | Expect |
|---|------|--------|
| P2.1 | On Diff, ⌥J/K ×N | Thread nav; **offset/vh ≈ 0.27–0.37**; no multi-pass thrash |
| P2.2 | ⌥F | Collapse/expand active InlineThread |
| P2.3 | ⌥C | Focus reply in Diff thread (active panel only) |
| P2.4 | ⌥D | Re-reveal active thread (stay on Diff) |
| P2.5 | ⌥⇧[ / ⌥⇧] | Prev/next file in **DFS displayFiles** order |
| P2.6 | ⌥U / ⌥R / ⌥P | Review filters toggle; same again clears |
| P2.7 | ⌥B | Files panel collapse/expand (`.prp-filetree--nav-collapsed`) |
| P2.8 | ⌥⇧R | Active file viewed/unread (Diff owns this chord) |
| P2.9 | ⌥⇧↑ / ⌥⇧↓ | Diff page scroll ~0.9 viewport |
| P2.10 | ⌥↑ / ⌥↓ | Multi-line selection jump (~8 rows) + reveal |
| P2.11 | ↑ / ↓ / ⇧↑ / ⇧↓ | One-row selection move/extend; minimal reveal pad |
| P2.12 | Context Opt tips | ⌥F / ⌥C tips only on **active** thread (`activeDiffCommentId`) |
| P2.13 | Ext chips / unread filter | Tree filters reshape list; multi-select ext |
| P2.14 | Unified / Split | Toolbar radios change `diffMode` |
| P2.15 | Commits picker | Multi-select commits reshapes diff (if multi-commit PR) |

**Scroll contract:** programmatic third-align; avoid `scrollIntoView` for thread J/K (search may use nearest/center).

---

## P3 — Selection island (Diff)

| # | Step | Expect |
|---|------|--------|
| P3.1 | Click or drag code lines | Selection classes; island after idle (~300ms) |
| P3.2 | Island actions | Comment (⌥C), Copy code, Copy URL, Dismiss |
| P3.3 | ⌥C from island | Comment phase (`data-phase`) |
| P3.4 | Esc | comment → actions → dismiss island; modal stays |
| P3.5 | File-level Comment on header | Island opens in comment phase |

---

## P4 — Chrome / Find / palette / stack

| # | Step | Expect |
|---|------|--------|
| P4.1 | ⌘F / Ctrl+F | Find bar; focus input |
| P4.2 | Type query · Enter / ⇧Enter | Hits; next/prev; Diff: search in toolbar, filters hide |
| P4.3 | Esc in Find | Closes Find only |
| P4.4 | ⌥⇧K | Command palette (`.prp-pp-layer`); not GH ⌘K |
| P4.5 | Filter + Enter command | Runs; palette closes |
| P4.6 | Esc in palette | Palette closes; modal stays |
| P4.7 | Opt hold | Shortcut badges on mapped controls; hide after chord until release |
| P4.8 | Stack chips / ⌥1–9 | If stack ≥2, switch PR; path fork hover if applicable |
| P4.9 | ⌥[ / ⌥] | Adjacent PR (stack path or pulls list order) |
| P4.10 | Header: layout / refresh / GitHub link | Layout flips; refresh stages; external link |
| P4.11 | Fullscreen ⌥⇧F (Conversation, non-embed) | `data-fullscreen` toggles |
| P4.12 | Title edit ⌥⇧T | Input; Esc cancels without closing modal |

---

## P5 — Meta / merge / composer

| # | Step | Expect |
|---|------|--------|
| P5.1 | Aside reviewers/assignees/labels | Render; bots no remove; collapse with ⌥B |
| P5.2 | Merge box | `data-merge-kind` + CTAs match status (clean/draft/conflicts/…) |
| P5.3 | Composer Comment / Review tabs | Review hosts pending threads when present |
| P5.4 | Dual-window gap (large PR) | “Load more / Load all” chrome if applicable |

---

## P6 — Esc hierarchy (order)

First match wins:

| Order | Condition | Effect |
|------:|-----------|--------|
| 0 | GH ⌘K open / 500ms grace | Ignore (do not close pr+) |
| 1 | Confirm dialog | Confirm owns Esc |
| 2 | Mermaid / image viewer | Viewer owns |
| 3 | Title input focused | Cancel title edit |
| 4 | Meta picker open | Close picker |
| 5 | Command palette | Close palette |
| 6 | Find open | Close Find |
| 7 | Selection island | Back phase / dismiss |
| 8 | Body/comment edit | Cancel edit |
| 9 | Any editable (reply, etc.) | **Blur only**; modal stays |
| 10 | Else | Close overlay |

---

## P7 — Perf / regression smoke (automated unit + spot browser)

| # | Check | Expect |
|---|--------|--------|
| P7.1 | App does not subscribe to pixel scroll store for full re-render | Static: leaf scroll / no App pixel sub |
| P7.2 | Reply drafts leaf-only | Typing does not re-render whole modal |
| P7.3 | `scroll-nav-offset-contract` unit | start pad 24 + third align |
| P7.4 | `line-selection` + move-perf units | PASS |
| P7.5 | Diff scroll rAF / range gate | `diff-scroll-perf` PASS |

---

## Automated browser probe

Script (in-page): `run-browser-probe.js` (scratch or workspace)  
Dispatches synthetic `KeyboardEvent`s with `altKey` / `metaKey` and measures DOM.

**Covered by probe (typical):** P0.2–P0.5, P1.1–P1.2/1.6/1.9, P2.1/2.3, P3.1 (best-effort), P4.1/4.4/4. side panel.

**Not fully automated (manual / optional):**

- Live network resolve / reply submit / merge  
- Real multi-line drag fidelity  
- Stack path fork picker hover  
- GH ⌘K grace interaction  
- Fullscreen / shell sheet on all viewports  

---

## Unit gating (local)

```bash
npm run test:unit   # rstest — architecture gates, store, nav thrift, …
npm run check       # typecheck + lint + unit
```

---

## Run log

### 2026-07-27 — agent-browser + local extension (prior)

**Target:** https://github.com/enif-lee/pr-plus/pulls → **#7** `[demo] g — stack root DEMO-300`  
**URL:** `.../pulls?prp_page=conversation&prp_number=7`

| ID | Result | Notes |
|----|--------|-------|
| P0 overlay / conversation / Diff | **PASS** | layout flips |
| P1 seed · top band 24 · no thrash | **PASS** | median **24**, spread **0** |
| P1 group-internal scroll | **PASS** | samples include group rows |
| P1 ⌥C · Esc blur | **PASS** | textarea → BODY; overlay stays |
| P2 Diff nav · ⌥C | **PASS** | ratios ~0.27–0.37 band mostly |
| P3 selection island | **PASS** | synthetic island flagged |
| P4 Find · palette · side panel | **PASS** | |
| P5 header / merge surface | **PASS** | title + merge box |

**Score:** automated probe **15/15** (`browser-qa.json`).  
Screenshot: workspace `.tmp-qa-pr.png` / scratch `browser-qa.png`.

### 2026-07-27 — honest full scenario (skeptic-fixed probe)

**Inventory:** three explore subagents mapped Conversation, Diff, chrome/palette/store (P0–P7).

**Target:** https://github.com/enif-lee/pr-plus/pulls → **#7** DEMO-300  
**Probe:** `.tmp-run-browser-probe.js` / scratch `run-browser-probe.js`  
**Evidence:** scratch `browser-qa.json`, `qa-summary.md`, `browser-qa.png` (`tmp-qa-full-scenario.png`)

#### Assertion honesty (fixed vs prior false 29/29)

| Issue | Fix |
|-------|-----|
| Hard-coded `pass:true` / `\|\| true` | Removed; every case requires real outcome |
| Diff third band nearest-to-ideal | Measure **active** `[data-context-active=1]` host offset/vh; exclude near-end + off-screen |
| Group scroll soft always-pass | Require `eligiblePairs` starting away from list end with `scrollTop` change |
| File nav `pathBefore===pathAfter` pass | **SKIP** on single-file PR (`pass:false`, `skipped:true`) |
| ⌥F before===after pass | Require aria/open/collapsed map change |
| Opt-hints count 0 pass | **SKIP** if synthetic Alt cannot set `optHintsActive` |

#### Results

| Metric | Value |
|--------|-------|
| **pass / fail / skip / total** | **27 / 0 / 2 / 29** |
| **gating pass / fail / skip** | **16 / 0 / 0** (all plan-critical cases exercised) |

| Area | Result | Notes |
|------|--------|-------|
| P0 smoke | **PASS** | overlay, conversation, Diff |
| P1 top band 24 | **PASS** | median **24** |
| P1 no thrash | **PASS** | |
| P1 group scroll | **PASS** | `groupMoves=2`, `eligiblePairs=2` |
| P1 ⌥F fold | **PASS** | open→closed (`aria` true→false) |
| P1 ⌥C + Esc | **PASS** | TEXTAREA → blur; overlay stays |
| P2 Diff nav + third | **PASS** | `thirdMedian=0.263`, bandHitRate 0.5; active-thread measure |
| P2 ⌥F / ⌥C | **PASS** | collapsed 0→1; TEXTAREA |
| P2 file nav | **SKIP** | single-file PR honest N/A |
| P2 filter / files panel | **PASS** | state toggles observed |
| P3 selection island | **PASS** | |
| P4 find/palette/side | **PASS** | real open + Esc + aside toggle |
| P4 opt-hints | **SKIP** | synthetic Alt limitation |
| P1 ⌥D jump | **PASS** | conversation→diff |

**Unit:** shortcut/scroll/selection suite → scratch `final-gating.log`.

**Not exercised (by design):** live resolve/reply/merge writes; multi-file ⌥⇧] (N/A on #7); physical Opt-hold badges.
