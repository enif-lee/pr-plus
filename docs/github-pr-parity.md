# GitHub PR view ↔ pr+ modal parity

Inventory of **major actions** on GitHub’s official Pull Request surface vs this extension modal.  
Statuses: **present** | **partial** | **missing** | **deferred** (non-goal).

Sources: [About pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests), [Reviewing proposed changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request), REST/GraphQL write surfaces in `src/fetch-pulls.js`.

## Conversation tab

| GitHub action | Modal | Notes |
|---|---|---|
| View PR title / number / state | present | Header |
| Edit PR title | present | Header + palette `⌘⇧T` → `updatePullRequest` |
| Edit PR body (write/preview) | present | BodyEditor Write/Preview |
| Close PR | present | Header + palette |
| Reopen PR | present | Header + palette |
| Convert to draft | present | Header/sidebar + palette (GraphQL) |
| Mark ready for review | present | Header/sidebar + palette (GraphQL) |
| Issue comments (post) | present | Unified composer Comment |
| Edit own issue comments | present | Timeline Edit |
| Delete own issue comments | present | Timeline Delete |
| Timeline pagination | present | Newer/Older |
| Reactions on comments | present | Issue + review comments; official 8 + picker |
| Lock conversation | deferred | Admin-ish |

## Review lifecycle

| GitHub action | Modal | Notes |
|---|---|---|
| Leave review: Comment | present | Composer + palette |
| Leave review: Approve | present | Composer + palette `⌘⇧↵` |
| Leave review: Request changes | present | Composer + palette `⌘⇧X` |
| Pending multi-line review batch | present | Selection → pending → submit with leave-review |
| Discard pending review | present | Pending bar Discard |
| Line comments (single / multi) | present | Drag/click selection |
| Reply to review thread | present | Inline thread card |
| Resolve / unresolve thread | present | GraphQL thread id |
| Edit own review comments | present | Timeline + inline |
| Delete own review comments | present | Timeline + inline |
| ````suggestion` render | present | SuggestionBlock |
| Apply suggestion | present | Contents API commit on head |
| File-level review comment | present | File header → `onFileHeaderComment`; `postReviewComment` with `subject_type: file` |
| Mark file Viewed | present | Optimistic local + GraphQL `markFileAsViewed` / `unmarkFileAsViewed` when token allows; sessionStorage cache |
| Viewed progress bar (server) | present | Hydrated from `viewerViewedState` on PR files (GraphQL); falls back to session cache offline |

## Files / Diff

| GitHub action | Modal | Notes |
|---|---|---|
| Files changed list / tree | present | Nested tree + filter |
| Unified / split diff | present | Radio |
| Virtualized large diffs | present | `calculateVisibleRange` |
| Collapse large/generated files | present | gitattributes + defaults |
| Hide whitespace | present | Diff toolbar toggle; client-side patch filter (`filterPatchHideWhitespace`); remembered per PR session |
| Jump to file | present | Tree click |
| Search in PR/diff | present | `⌘F` index |
| Dependency rich diff | deferred | Non-goal |

## Sidebar metadata

| GitHub action | Modal | Notes |
|---|---|---|
| Reviewers request / remove | present | Chips + palette |
| Re-request review | present | Merge box + palette |
| Assignees add / remove | present | Chips + palette |
| Labels set | present | Edit + palette |
| Milestone set / clear | present | Sidebar + palette |
| Projects (v2) | deferred | Non-goal |
| Linked issues (from body) | partial | Parsed `#N` / closing keywords; edit via body |
| Notifications subscribe | present | Sidebar + palette |
| Participants list | partial | Derived from reviews/comments |

## Checks / Commits

| GitHub action | Modal | Notes |
|---|---|---|
| Status / check runs summary | present | Checks card |
| Open check details URL | present | ChecksPanel / merge-box checks: DetailsLink from `html_url` / `details_url` |
| Commits list | present | Aside timeline (truncated) |
| Commits tab full history | partial | First 100 commits |

## Merge / branch lifecycle

| GitHub action | Modal | Notes |
|---|---|---|
| Merge (create merge commit) | present | Header/sidebar/palette `⌘⇧M` |
| Squash and merge | present | Palette |
| Rebase and merge | present | Palette |
| Update branch from base | present | Header/sidebar/palette `⌘⇧U` |
| Merge queue enqueue | deferred | Enterprise non-goal |
| Conflict resolution editor | deferred | Non-goal |
| Delete branch after merge | present | Merge box after merge: optional delete head ref (`DELETE …/git/refs/heads/…`); fork uses head owner/repo |

## Navigation / chrome

| GitHub action | Modal | Notes |
|---|---|---|
| Conversation ↔ Files tabs | present | Diff toggle `⌘.` |
| Command palette (Linear-style) | present | `⌘K`; suppresses GH palette in modal |
| Open on GitHub | present | Header link |
| Codeowners auto-request | n/a | Server-side when ready-for-review |

## Intentionally deferred (Non-goals)

- Projects v2 board UI, merge queue enterprise UX, in-browser conflict editor, admin force-merge, full reaction/notification preference matrices, pixel-perfect github.com clone.

## Performance constraints preserved

- Concurrent `fetchPrDetail` (incl. subscription) + detail cache soft revalidate in host  
- Diff virtualization (`VirtualDiff` + `calculateVisibleRange`)  
- Session view restore (layout/collapse/viewed) without remount on soft refresh  
- Write → `invalidate` + refresh keeps React root  
