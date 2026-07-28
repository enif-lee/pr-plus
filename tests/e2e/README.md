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
