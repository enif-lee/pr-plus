# Local browser e2e (agent-browser + rstest)

Scenario-based end-to-end tests for the pr+ extension modal.

**Not included in `npm test` / `npm run test:unit` / `npm run check`.**  
Unit suite uses `rstest.config.ts` (excludes `tests/e2e/**`).  
E2E uses a **separate** config: `rstest.e2e.config.ts`.

## Prerequisites

1. Extension built (`npm run build` or at least a current workspace loadable via `agent-browser.json`).
2. [agent-browser](https://agent-browser.dev) installed and on `PATH`.
3. **Google Chrome (stable)** installed — e2e and `npm run browser` launch that binary, not Chrome for Testing. Override with `PRP_CHROME_PATH`.
4. GitHub login in the local profile (`./.browser/profile`).  
   One-time: `npm run browser:login` then sign in.
5. Network access to `github.com/enif-lee/pr-plus`.

## Demo PR fixture

Default multi-thread / conversation target is **`DEMO_PR` in `lib/harness.mjs`**
(currently **#19**, stack root DEMO-300 on `demo/g`). Former **#7** was closed
(subject-level reaction lock). Comment cleanup defaults to the same number via
`COMMENT_CLEANUP_PR` in `lib/comment-cleanup.mjs`.

## Commands

```bash
# All e2e groups (serial, maxWorkers=1)
npm run test:e2e

# Feature groups only
npm run test:e2e:features

# Named groups
npm run test:e2e:smoke
npm run test:e2e:selection
npm run test:e2e:perf
npm run test:e2e:list-row

# Filter by file / name (rstest filters)
rstest run -c rstest.e2e.config.ts smoke
rstest run -c rstest.e2e.config.ts selection
rstest run -c rstest.e2e.config.ts tests/e2e/features
rstest run -c rstest.e2e.config.ts -t "P3 selection"

# List discovered e2e tests
rstest list -c rstest.e2e.config.ts
```

Session name defaults to `pr-plus-e2e` (override with `PRP_E2E_SESSION`).

**Headless by default** (reliable chords without OS window focus). For a visible
browser: `PRP_E2E_HEADED=1 npm run test:e2e`.

**Single-tab policy:** every `open()` closes all other tabs and keeps only the
active test tab. Extra profile-restored tabs steal focus and flake keyboard
chords — do not open parallel tabs during e2e or manual `ag` QA.

**Shared browser session:** `globalSetup` launches agent-browser once; each suite
`beforeAll` only **soft-resets** (single tab + clear IDB/`prp:` sessionStorage) —
Chrome is not relaunched between files. Teardown closes the session at the end.

**Data-load gating:** host publishes readiness on the **page DOM** (content-script
world is isolated from agent-browser `eval`):

| Attribute | Meaning |
|-----------|---------|
| `data-prp-meta-ready=1` | open + core painted + load bar idle |
| `data-prp-files-ready=1` | Diff file list has usable patch bodies |
| `data-prp-load-busy=1` | open/refresh progress still running |
| `data-prp-e2e-load` | compact JSON snapshot |

E2E helpers: `probeLoad()`, `waitDetailReady({ number, meta, files })`,
`waitDiffFilesReady()`. `openPr` / `setLayout` wait on these instead of fixed
`waitMs` before actions.

**Timeouts:** `testTimeout` / `hookTimeout` are 2–3 minutes in
`rstest.e2e.config.ts` (browser open + Diff load).

**Perf budgets:** conversation / light Diff use tight rAF budgets (~50ms p95).
Heavy PR **#14** page/file holds use separate `PRP_E2E_*_HEAVY_MS` ceilings —
large virtual remounts are not comparable to #19/#13.

## Groups

| Group | File | What it covers |
|-------|------|----------------|
| `smoke` | `features/smoke.rstest.ts` | open PR #19, layout chrome, Diff toggle |
| `conversation-nav` | `features/conversation-nav.rstest.ts` | ⌥J/K, fold, reply, composer |
| `diff-nav` | `features/diff-nav.rstest.ts` | Diff thread/file/page nav, Find, mode |
| `selection` | `features/selection.rstest.ts` | PR #13 selection island, fold, multi-hunk |
| `diff-ui` | `features/diff-ui.rstest.ts` | file fold, auto-expand-off, long-line |
| `merged-chrome` | `features/merged-chrome.rstest.ts` | PR #14 Merged badge + Esc close |
| `perf` | `perf-shortcut-loop.rstest.ts` | key-hold frame / longtask budgets |
| `list-row` | `list-row-resync.rstest.ts` | label write-through → list row |
| `session-defects` | `features/session-defects.rstest.ts` | files loading settle, key-hold, label→timeline, lazy aside idle |

Each group owns its browser session (`beforeAll` ensureBrowser / `afterAll` closeAll)
so groups can run alone or in any filter subset.

Step bodies live in companion `*.mjs` modules as `getSteps()` (ordered
`{ name, fn }[]`). The `.rstest.ts` file only registers them with rstest.

## Layout

```
rstest.config.ts          # unit only — excludes tests/e2e/**
rstest.e2e.config.ts      # e2e only — serial pool, long timeouts

tests/e2e/
  README.md
  lib/
    ab.mjs              # agent-browser CLI
    harness.mjs         # open PR, layout, probes
    runner.mjs          # legacy step bag (optional)
    e2e-register.ts     # registerE2eFeature() for rstest
  features/
    smoke.mjs + smoke.rstest.ts
    conversation-nav.mjs + .rstest.ts
    diff-nav.mjs + .rstest.ts
    selection.mjs + .rstest.ts
    diff-ui.mjs + .rstest.ts
    merged-chrome.mjs + .rstest.ts
    session-defects.mjs + .rstest.ts
  perf-shortcut-loop.mjs + .rstest.ts
  list-row-resync.mjs + .rstest.ts
```

## Budgets / hold length (perf env overrides)

| Env | Default | Meaning |
|-----|---------|---------|
| `PRP_E2E_HOLD_MS` | `450` | how long each chord stays held |
| `PRP_E2E_REPEAT_MS` | `40` | synthetic key-repeat interval while held |
| `PRP_E2E_FRAME_P95_MS` | `50` | rAF frame p95 max during hold (nav) |
| `PRP_E2E_FRAME_P95_FILE_MS` | `80` | rAF frame p95 max during file-hop hold |
| `PRP_E2E_LONGTASK_MAX_MS` | `200` | single longtask max (light) |
| `PRP_E2E_LONGTASK_SUM_MS` | `400` | sum of longtasks per hold (light) |
| `PRP_E2E_FRAME_P95_HEAVY_MS` | `400` | heavy PR #14 page/file hold p95 |
| `PRP_E2E_LONGTASK_MAX_HEAVY_MS` | `400` | heavy PR single longtask max |
| `PRP_E2E_LONGTASK_SUM_HEAVY_MS` | `2000` | heavy PR longtask sum per hold |

Closed/merged PRs (e.g. heavy **#14**): opened via `openPr(n, { viaUrl: true })` →
`https://github.com/enif-lee/pr-plus/pull/{n}`.
