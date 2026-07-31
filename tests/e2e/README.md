# Local browser e2e (agent-browser)

Scenario-based end-to-end tests for the pr+ extension modal.  
**Not included in `npm test` / `npm run test:unit` / `npm run check`.**

## Prerequisites

1. Extension built (`npm run build` or at least a current workspace loadable via `agent-browser.json`).
2. [agent-browser](https://agent-browser.dev) installed and on `PATH`.
3. GitHub login in the local profile (`./.browser/profile`).  
   One-time: `npm run browser:login` then sign in.
4. Network access to `github.com/enif-lee/pr-plus`.

## Commands

```bash
npm run test:e2e              # features + perf
npm run test:e2e:features     # full feature / style / layout scenario
npm run test:e2e:perf         # shortcut + scroll loop render budgets
```

Session name defaults to `pr-plus-e2e` (override with `PRP_E2E_SESSION`).

**Headless by default** (reliable chords without OS window focus). For a visible
browser: `PRP_E2E_HEADED=1 npm run test:e2e`.

**Single-tab policy:** every `open()` closes all other tabs and keeps only the
active test tab. Extra profile-restored tabs steal focus and flake keyboard
chords — do not open parallel tabs during e2e or manual `ag` QA.

## Scenarios

### `feature-scenario.mjs`

Port of session browser QA (see `docs/qa-browser-scenario.md`):

| Phase | Checks |
|-------|--------|
| P0 | pulls → open PR #7 → conversation chrome → Diff ↔ Conversation → Esc |
| Styles | `pr-modal.css` loaded, merge/header/aside/filetree dimensions |
| P1 thread | ⌥⇧C seed/clear, ⌥J/K pin, ⌥↑↓ panel scroll, ⌥⇧↑↓ page, ⌥F fold, ⌥C reply+Esc |
| P2 thread/file | Diff ⌥J/K threads, ⌥⇧[] files, ⌥⇧↑↓ page, Find, ⌥B, Unified/Split |
| P3 selection | click line → ↑↓ move, ⇧↑↓ extend, ⌥↑↓ jump, Esc island, multi-hunk expand |
| P4 UI (read-only) | Diff file fold ⌥F · autoExpandOnFileNav off · long-line expand/collapse |
| P5 merged chrome | PR **#14** Merged badge + purple merge-box (via closed PR URL) |

P4–P5 assert **local UI only** (no merge / comment / review mutations).

Closed/merged PRs (e.g. heavy **#14**): opened via `openPr(n, { viaUrl: true })` →
`https://github.com/enif-lee/pr-plus/pull/{n}` (not the default open `/pulls` list).
List miss also falls back to the same URL path.

### `perf-shortcut-loop.mjs`

**Key-hold** (OS key-repeat via in-page `KeyboardEvent` + `repeat: true`):

1. Conversation hold **⌥J / ⌥K** (thread step)  
2. Diff hold **⌥⇧↓ / ⌥⇧↑** (page)  
3. Diff hold **⌥⇧]** (file)  
4. Diff selection hold **↓ / ⇧↓ / ⌥↓** (move / extend / multi-line jump)  

Each hold is short (`HOLD_MS`); key-repeat ticks every `REPEAT_MS`.

### Budgets / hold length (env overrides)

| Env | Default | Meaning |
|-----|---------|---------|
| `PRP_E2E_HOLD_MS` | `450` | how long each chord stays held |
| `PRP_E2E_REPEAT_MS` | `40` | synthetic key-repeat interval while held |
| `PRP_E2E_FRAME_P95_MS` | `50` | rAF frame p95 max during hold (nav) |
| `PRP_E2E_FRAME_P95_FILE_MS` | `80` | rAF frame p95 max during file-hop hold |
| `PRP_E2E_LONGTASK_MAX_MS` | `200` | single longtask max |
| `PRP_E2E_LONGTASK_SUM_MS` | `400` | sum of longtasks per hold phase |

## Layout

```
tests/e2e/
  README.md
  run.mjs
  feature-scenario.mjs
  perf-shortcut-loop.mjs
  lib/
    ab.mjs       # agent-browser CLI
    harness.mjs  # open PR, layout, probes
```
