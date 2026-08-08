# AGENTS.md — pr+ (GitHub PR review extension)

Agent-oriented guide for build, verify, architecture, and tests. Humans can use it too.

## What this repo is

**pr+** is a Chromium MV3 extension for GitHub PRs: stack tree on `/pulls`, and a fast in-page **modal / embed shell** for Conversation, Diff, and merge. UI is React (modal); network and extension plumbing live in background + content bridge + host.

Demo / e2e target repo: `enif-lee/pr-plus` (e.g. open PR `#7`).

---

## Verification workflow (build + extension reload)

After code changes, **do not rely on a full Chrome restart** for every iteration. Prefer:

1. **Rebuild** the extension artifacts from the repo root.
2. **Reload the extension** in Chrome via `chrome://extensions` (circular reload button) — keeps the browser process and tabs; picks up a new service worker + content scripts on next navigation/injection.
3. Re-open or soft-reload the GitHub tab under test.

### Build

```bash
# Full pipeline (pure → content-ts → fetch → background → sw → host → bridge → app-parts → modal)
npm run build

# Faster when you know the surface area:
npm run build:pure          # modal/lib/*.ts → pure IIFE (injected in SW / pages)
npm run build:fetch         # fetch-api.ts → fetch-pulls.js
npm run build:sw            # background.sw.js (+ bundle dual-write)
npm run build:host          # host modules → pr-modal-host.js
npm run build:content-bridge
npm run build:modal         # React modal bundle + CSS
```

Service worker entry (manifest): **`src/background.sw.js`**. Stale SW is a common source of “I fixed it but still see old GraphQL/behavior” — always reload the extension after `build:sw` / `build:fetch` / `build:pure`.

### Manual: chrome://extensions reload (no browser restart)

1. Open `chrome://extensions` (or edge://extensions).
2. Enable **Developer mode**.
3. Find **pr+** (loaded from this workspace, typically “Load unpacked” → repo root or packaged dist).
4. Click the **reload** (circular arrow) control on the card.
5. Return to the GitHub tab → hard refresh the page (`Cmd+R` / `F5`) or re-open the PR so content scripts reinject.

Optional: `chrome.runtime.reload()` from an extension context (e2e may dispatch `prp-reload-extension` when `PRP_E2E_RELOAD_EXT=1`). That still does **not** require quitting Chrome.

### When a full browser restart *is* needed

- Extension was never loaded / path changed / “Load unpacked” broken.
- Profile locks or corrupted agent-browser session (`npm run browser:close` then re-open).
- SW refuses to activate after reload (rare); then quit Chrome-for-Testing / agent-browser session and relaunch with the extension load path.

### Agent-browser / e2e note

E2e uses a **shared browser session** and often only **soft-resets** tabs + IDB between suites. After rebuilds that change the SW, either:

- reload the extension via `chrome://extensions`, or  
- set `PRP_E2E_RELOAD_EXT=1` so global setup dispatches extension reload, or  
- `agent-browser close --all` and start a new session (heavier).

Prefer **build + extensions reload** over restarting the whole browser for day-to-day verification.

---

## Architecture (overview)

### Domain / UI SoT (host-data-first)

- **Domain SoT:** host open-session detail store → React reads `detail` prop / `useDomainDetail()` (no `localDetail` mirror).
- **Mutations:** `src/modal/commands/*` — API success → narrow `onPatchDetail` ack (`applied|stale|failed`; void ≠ applied).
- **Settled set-authority:** `mergeCommentsHostFirst` / `src/modal/lib/set-authority.ts`; no durable `_dropPending` latch.
- **UiStore:** Zustand `modal-store` / `ui-store` — layout/drafts/focus only (no PrDetail domain blob).
- **Verify:** `npm run build:pure && build:host && build:modal`, then chrome://extensions reload after SW/host/pure changes.

### UI labels (i18n)

- **User-visible UI labels** (buttons, badges, section titles, empty states, toast copy, aria-labels shown as text, timeline narratives) **must** go through `useT()` / `t('key')` and the catalogs in `src/modal/lib/i18n*.ts`.
- Do **not** hard-code English (or any locale) strings in JSX/TS for UI chrome when adding or changing labels.
- Add new keys to the appropriate catalog (`i18n.ts` core, `i18n-chrome.ts`, `i18n-residual.ts`, …) for **en + ko + ja + zh_CN**.
- Non-UI exceptions: log messages, GraphQL operation names, test fixtures, pure algorithm comments.



```
┌─────────────────────────────────────────────────────────────┐
│  github.com (page)                                           │
│  content scripts → list tree / open toggle / embed host      │
│  content-bridge  → messages to SW (fetch, resolve, …)      │
│  pr-modal-host   → open/close, progress, detail store, props │
│  modal React app → Conversation / Diff / composers           │
└───────────────────────────┬─────────────────────────────────┘
                            │ chrome.runtime messages
┌───────────────────────────▼─────────────────────────────────┐
│  Service worker: src/background.sw.js                         │
│  · GitHub REST + GraphQL (fetch-api / fetch-pulls)           │
│  · Auth token, rate-limit bookkeeping, GraphQL cost log      │
│  · Pure helpers (review-threads, rate-limit, …) loaded in SW │
└─────────────────────────────────────────────────────────────┘
```

### Layers

| Layer | Source of truth | Built / shipped as | Role |
|--------|-----------------|--------------------|------|
| **Pure** | `src/modal/lib/*.ts` | `src/modal/pure/*.js` (IIFE) | Domain helpers: review threads, rate limit, cost labels, timeline, … — unit-tested without Chrome |
| **Fetch** | `src/fetch/fetch-api.ts` | `src/fetch-pulls.js` | REST/GraphQL client, thread shell+byIds, resolve mutation, detail merge helpers |
| **Background** | `src/background/sw-api.ts` (+ fetch mix) | `src/background.sw.js` | MV3 SW message router, token, network |
| **Bridge** | `src/content-bridge/bridge-api.ts` | `src/content-bridge.js` | Page ↔ SW API surface (`PRTreeFetch.*`) |
| **Host** | `src/host/modules/*.ts` | `src/pr-modal-host.js` | Open modal, progress bar, adaptive threads fetch, props for React |
| **Modal UI** | `src/modal/**` (React) | `src/modal/dist/pr-modal.bundle.js` + CSS | Conversation, Diff, InlineThread, composers |

### Important product paths

- **Open PR:** host `openModal` → core detail + side panels; **review threads** are **GraphQL-first** (shell window, page size 100) so **PRRT_…** ids always exist; selective by-ids comments for unresolved; resolved comments deferred until expand. REST thread window is opt-in only (`preferRest: true`), not the default.
- **GraphQL cost:** shell queries (`ReviewThreadsLastShell` / `FirstShell`) include **`comments(first:1)` root preview** (thread description) at cost≈1; avoid nested `comments(first:100)` + reactionGroups on the window. Eager full comments for **unresolved** via `ReviewThreadsByIdsFull`; multi-reply **resolved** stay deferred until expand. **Mutations must not inject Query-only `rateLimit`** (breaks `resolveReviewThread`).
- **Resolve conversation:** uses GraphQL `PRRT_…` (always available after shell fetch); empty reply must still click (composer actions stay open + mousedown preventDefault).
- **Detail store:** host + Zustand; patch contracts avoid wiping optimistic UI.

### TypeScript projects

Multiple `tsconfig.*.json` (domain, host, fetch, bridge, entries). Prefer `npm run typecheck` / `npm run check` before large merges.

---

## Tests

### Unit (default CI-ish path)

```bash
npm run test:unit          # rstest, excludes tests/e2e/**
npm run check              # typecheck + lint + unit
npm test                   # build + unit
```

Config: `rstest.config.ts`. Files: `tests/*.rstest.ts` (+ some `.tsx`).

**High-signal unit areas (not exhaustive):**

| Area | Examples |
|------|----------|
| Review threads / REST-first / page size | `rest-first-threads.rstest.ts` |
| GraphQL cost + mutation no-rateLimit inject | `graphql-cost-log.rstest.ts` |
| Shell map / eager comments / lazy merge | `thread-comments-lazy.rstest.ts` |
| Rate limit pure | `rate-limit.rstest.ts` |
| Conversation timeline / virtual | `conversation-timeline.rstest.ts` |
| Detail store / patch | `detail-store.rstest.ts`, `detail-patch-contract.rstest.ts` |
| Wiring / architecture gates | `*-wiring.rstest.ts`, `architecture-gates.rstest.ts` |
| Composer / shortcuts | `composer-*.rstest.*`, `command-palette-*.rstest.ts` |

Prefer tests that **import shipped pure modules** (or real helpers), not re-implementations of production logic.

### E2E (agent-browser + rstest, separate config)

```bash
npm run test:e2e                 # all e2e
npm run test:e2e:features        # tests/e2e/features
npm run test:e2e:smoke
npm run test:e2e:selection
npm run test:e2e:session-defects
npm run test:e2e:meta-bidirectional
rstest run -c rstest.e2e.config.ts resolve-thread
```

Config: `rstest.e2e.config.ts`. Docs: `tests/e2e/README.md`.

**Feature modules** (`tests/e2e/features/`): smoke, conversation-nav, diff-nav, selection, diff-ui, merged-chrome, session-defects, meta-bidirectional, **resolve-thread**, plus ad-hoc probes (e.g. thread-comments-lazy).

**Prerequisites:** built extension, agent-browser on PATH, logged-in profile (`.browser/profile`), network to GitHub.

**Policy:** shared session, soft reset between suites; single-tab focus for keyboard chords. After SW-affecting builds, reload extension (see above).

### What to run when

| Change | Minimum verify |
|--------|----------------|
| Pure helper only | `npm run build:pure` + targeted `rstest tests/<name>.rstest.ts` |
| GraphQL / fetch / resolve | `build:pure` + `build:fetch` + `build:sw` + unit + **extensions reload** + manual or e2e |
| Host open / progress | `build:host` (+ bridge if API shape) + extensions reload |
| InlineThread / Diff UI | `build:modal` + unit/e2e as needed + extensions reload + GH tab refresh |
| Full confidence | `npm run build` → chrome://extensions **reload** → `npm run check` and/or targeted e2e |

---

## Repo map (quick)

```
manifest.json          # MV3; SW = src/background.sw.js
src/modal/lib/         # Pure TS SoT
src/modal/pure/        # Generated IIFE (do not hand-edit)
src/fetch/fetch-api.ts # Network SoT
src/host/modules/      # Host SoT
src/content-bridge/    # Bridge SoT
src/background/        # SW API SoT
src/modal/views/       # React UI
scripts/build-*.mjs    # Build pipeline
tests/*.rstest.ts      # Unit
tests/e2e/             # Browser e2e
docs/                  # Design / migration notes (not runtime)
```

---

## Conventions for agents

1. **Edit SoT TS/TSX**, then run the matching `build:*` (or full `build`). Do not treat generated `pure/*.js` or assembled host/SW as primary edit targets unless the pipeline requires dual-write.
2. After SW/fetch/pure changes: **reload extension** on `chrome://extensions` before claiming browser verification.
3. Prefer **minimal diffs**; do not add unsolicited docs beyond what was asked.
4. E2e is optional for pure logic; required when click/focus/network path is the bug (e.g. Resolve conversation).
5. GraphQL: cost from connection `first`/`last` bounds; avoid nested `comments(first:100)` on every thread window; never inject `rateLimit` into mutations.
