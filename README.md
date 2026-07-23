<p align="center">
  <img src="assets/logo.jpeg" alt="pr+ logo" width="96" height="96" />
</p>

<h1 align="center">pr+</h1>

<p align="center">
  A Chrome/Edge extension for GitHub pull requests:<br />
  <strong>stack-aware PR lists</strong> and an
  <strong>ultra-fast in-page review modal</strong><br />
  so you can review without leaving the pulls page.
</p>

<p align="center">
  <a href="https://github.com/enif-lee/pr-plus"><img alt="repo" src="https://img.shields.io/badge/github-enif--lee%2Fpr--plus-181717?logo=github" /></a>
  <img alt="manifest" src="https://img.shields.io/badge/manifest-v3-blue" />
  <img alt="version" src="https://img.shields.io/badge/version-1.3.0-informational" />
</p>

---

## Why pr+?

| Value | What you get |
|-------|----------------|
| **Review without page navigation** | Click a PR on `/pulls` → open a full **modal overlay**. Stay on the list; no full PR page hop. |
| **Ultra-fast review surface** | Concurrent detail fetch, soft-revalidate cache, **virtualized** diffs, session restore of layout/scroll after soft refresh. |
| **Stack visibility** | List reorders into a base/head **stack tree**; the modal shows a **stacked PR strip** at the top for the current chain. |
| **Review workflow in one place** | Conversation, files/diff, leave review, line comments, suggestions, metadata, merge—without bouncing through github.com tabs. |

GitHub’s default PR list is flat. Stacked PRs (base = another PR’s head) are hard to see, and opening each PR is a full navigation. **pr+** keeps you on the pulls list and layers a high-performance review UI on top.

### Screenshot

Example pull request list with stack tree, review badges, and `base ← head` branch chips.

<p align="center">
  <img src="assets/screenshot-stack-demo.jpeg" alt="pr+ stack tree demo on GitHub pull requests list" width="720" />
</p>

---

## Features

### 1. Pulls list overlay (stay native)

| Feature | Description |
|---------|-------------|
| **Stack tree view** | Links PRs when `baseRef === another PR’s headRef`; depth via left indent |
| **Tree / default toggle** | Switch stack order ↔ GitHub’s default sort |
| **Compact meta row** | Denser second line: number, author, time, review state, branches |
| **Draft / review badges** | Draft pill; review states (`Review required`, `Changes requested`, `Approved`, …) |
| **Branch badge** | `base ← head` chip |
| **Magic links (list)** | Repo autolink rules on title/branch/body → external ticket shortcuts on the list |
| **Private repos** | Optional GitHub PAT in the popup |
| **SPA support** | Re-applies tree/meta after Turbo soft-nav and DOM refresh |

Meta line example:

```text
#13927  opened 2 hours ago by alice  ·  Review required  ·  ENG-42  ·  trunk ← feat/foo
```

### 2. In-page PR modal (no full-page navigation)

Open a PR title from the list → modal on the **same** `/pulls` page.

#### Speed & UX foundation

| Feature | Description |
|---------|-------------|
| **Modal over the list** | No navigation to `/pull/N`; close returns to the list state you left |
| **Concurrent detail load** | PR, files, comments, reviews, commits, threads, checks, subscription in parallel |
| **Soft revalidate** | Cache + background refresh; write actions invalidate then reload without cold remount |
| **Virtualized diffs** | Large file diffs stay scrollable without rendering every line in the DOM |
| **Session restore** | Layout (conversation/diff), collapse, viewed files, active file restored after soft refresh |
| **Theme-aware UI** | Follows GitHub light/dark color mode |

#### Conversation

| Feature | Description |
|---------|-------------|
| **Description** | Markdown body with write/preview edit |
| **Timeline** | Reviews, issue comments, review threads with code snippets; pagination (newer/older) |
| **Entity links** | Authors, `@mentions`, labels, `#issue` refs → GitHub URLs |
| **Magic links (modal)** | Autolink keys from title/body/branch linked in description & comments |
| **Unified leave-review** | **Comment** / **Approve** / **Request changes** on one form (pending line comments attach on submit) |
| **Edit / delete own comments** | Issue and review comments (including thread replies) |
| **Stacked PR strip** | Top-of-modal chain for related stack members; open another stack PR in the modal |

#### Diff & code review

| Feature | Description |
|---------|-------------|
| **Files tree** | Nested dirs, filter, collapse, mark-as-viewed (local session) |
| **Unified / split** | Diff modes |
| **Line selection** | Single click or multi-line drag; yellow continuous selection block |
| **Line comments** | Immediate post or add to **pending review** batch |
| **Inline threads** | Reply, resolve/unresolve, edit/delete own, polish thread UI |
| **Suggestions** | Render ````suggestion` blocks; **Apply suggestion** (commit to head via Contents API) |
| **Diff chrome** | Checks summary + labels on the files view |
| **Search** | Find in PR/diff (`⌘F`), including off-screen virtual rows |
| **Comment nav** | Jump prev/next inline review comments |

#### Metadata & lifecycle

| Feature | Description |
|---------|-------------|
| **Title / body / base** | Edit title, description, change base branch |
| **Draft stage** | Convert to draft / mark ready for review (GraphQL) |
| **Reviewers / assignees / labels** | Add/remove; unique reviewer logins; re-request review |
| **Milestone** | Set / clear |
| **Linked issues** | Detected from body (`#N`, closing keywords) |
| **Notifications** | Subscribe / unsubscribe |
| **Close / reopen** | PR state |
| **Merge** | Merge / squash / rebase (when allowed) |
| **Update branch** | Sync head with base |

#### Command palette & shortcuts

| Feature | Description |
|---------|-------------|
| **Linear-style palette** | `⌘K` / `Ctrl+K` inside the modal (GitHub’s site palette is suppressed while open) |
| **Shared actions** | Labels, assignees, reviewers, base, review submit, merge, open GitHub, focus comment, … |
| **Button shortcuts** | Primary actions show kbd hints (e.g. `⌘.` toggle diff, `⌘⇧M` merge) |

Deep matrix of GitHub PR-view vs modal: **[docs/github-pr-parity.md](./docs/github-pr-parity.md)**.

---

## Install

### Developer mode (local)

1. Clone this repository.
2. `npm install && npm run build` (builds the modal bundle under `src/modal/dist/`).
3. Open Chrome or Edge → `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode**.
5. **Load unpacked** → select this repository root (folder that contains `manifest.json`).

### Packaged ZIP

```bash
npm install && npm run build
mkdir -p dist/pr-plus && cp manifest.json dist/pr-plus/ && cp -R src dist/pr-plus/
cd dist && zip -r pr-plus.zip pr-plus
```

Unzip and **Load unpacked**. (`dist/` is not committed.)

---

## PAT (Personal Access Token)

**A PAT is required to activate pr+.** Until a token is saved, the extension stays **inactive** on GitHub pages (no list tree, no modal intercept) so the site works exactly like stock GitHub.

1. Click the **pr+** toolbar icon  
2. Paste a GitHub PAT → **Save**  
3. Refresh the pulls page (features enable automatically)  

| Item | Details |
|------|---------|
| Storage | `chrome.storage.local` (extension-only, not synced) |
| Access | **Service worker only** holds the raw token — never exposed to content scripts |
| UI | After save, only a mask is shown (`••••` + last 4 chars) |
| Recommended | Fine-grained: read/write on **Pull requests** (and Contents if applying suggestions) for target repos |

---

## Usage

1. Open a repository **Pull requests** list:  
   `https://github.com/{owner}/{repo}/pulls`
2. **List:** stack indent, badges, branch chips, magic links (if configured).
3. Toggle **Show default order / Show stack tree** near the header.
4. **Review:** click a PR title → **modal** opens (no navigation away from `/pulls`).
5. Use Conversation / Diff, leave review, edit metadata, or `⌘K` for the command palette.
6. Esc / close returns to the list. **Refresh while the modal is open** restores the modal (and Diff layout) after the stack list re-applies.

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Store the PAT locally |
| `https://github.com/*` | PR list DOM overlay + modal host |
| `https://api.github.com/*` | List, detail, reviews, comments, merge, autolinks, GraphQL threads |

---

## Development

```bash
npm install
npm run build    # modal bundle + CSS
npm test         # build + unit suite
```

### Layout (summary)

```text
src/
  background.js            # PAT + GitHub API (service worker only)
  content-bridge.js        # content ↔ background (no token in page)
  content-bootstrap.js     # list bootstrap / SPA watch
  content.js               # content entry
  dom.js                   # list rows, indent, meta badges
  fetch-pulls.js           # list / detail / writes / autolinks
  storage.js               # chrome.storage.local helpers
  tree.js                  # pure stack forest
  pr-modal-host.js         # intercept PR click → mount modal
  popup.html / popup.js    # PAT UI
  styles.css               # list overlay styles
  modal/
    App.jsx                # React modal UI
    styles.css             # modal theme + layout
    pure/                  # unit-tested pure helpers
    dist/                  # built pr-modal.bundle.js + pr-modal.css
```

---

## Privacy

See **[PRIVACY.md](./PRIVACY.md)** for data handling and optional GitHub PATs.

Chrome Web Store privacy policy URL (public):

```text
https://github.com/enif-lee/pr-plus/blob/main/PRIVACY.md
```

---

## License

Intended for personal and team use. Update this section if you add a license file.
