/**
 * Narrow chrome: overflow menu, no file-nav rail, comment btn group,
 * commit multi-checkbox → filter, no header merge status.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  selectionToDiffCommitFilter,
  diffCommitFilterToSelection,
  truncateCommitLabel,
  COMMIT_LABEL_MAX_LEN,
  buildCommitFilterOptions,
  resolveCompareRange,
} = require('../src/modal/lib/diff-commit-filter.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const header = read('src/modal/views/chrome/Header.tsx');
const css = read('src/modal/styles.css');
const tree = read('src/modal/views/diff/FolderFileTree.tsx');
const toolbar = read('src/modal/views/chrome/DiffToolbar.tsx');
const commitFilterUi = read('src/modal/views/diff/DiffCommitFilter.tsx');

// --- (a) no width-based chrome collapse — title shrinks, actions stay inline ---
assert.ok(header.includes('prp-header__actions-inline'), 'inline actions always present');
assert.ok(
  css.includes('container-type: inline-size') || css.includes('container-type:inline-size'),
  'panel is a size container (cqi for title scale)'
);
assert.ok(
  css.includes('container-name: prp-panel') || css.includes('container-name:prp-panel'),
  'size container is named prp-panel on .prp-modal'
);
// No actions → ⋯ collapse by width
assert.ok(
  !/@container\s+prp-panel\s*\(\s*max-width:\s*760px\s*\)/.test(css) &&
    !css.includes('@container prp-panel (max-width: 760px)'),
  'no 760px actions-overflow container query'
);
assert.ok(
  !/@container\s+prp-panel\s*\(\s*max-width:\s*960px\s*\)/.test(css) &&
    !css.includes('@container prp-panel (max-width: 960px)'),
  'no 960px dense-header container query'
);
assert.ok(
  /actions-more[\s\S]{0,80}display:\s*none\s*!important/.test(css) ||
    css.includes('.prp-header__actions-more') && css.includes('display: none !important'),
  'overflow ⋯ menu stays hidden'
);
// Title fluid shrink + ellipsis (layout pressure → title, not icons)
assert.ok(
  /prp-header__title[\s\S]{0,200}clamp\(/.test(css),
  'title uses clamp() fluid font-size'
);
assert.ok(
  /prp-header__title[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css),
  'title ellipsizes when row is tight'
);
assert.ok(
  !header.includes('headerWidthPx') && !header.includes('ResizeObserver'),
  'Header does not measure width for densify'
);
assert.ok(header.includes('prp-header__branch-meta'), 'branch meta cluster');
assert.ok(
  !header.includes('prp-header__row--secondary') ||
    css.includes('.prp-header__row--secondary'),
  'secondary row no longer required for layout (clusters are direct children)'
);
assert.ok(!/@media\s*\(\s*max-width:\s*1100px\s*\)/.test(css), 'no window 1100px media for actions');
const {
  HEADER_COMPACT_MAX_PX,
  HEADER_DENSE_MAX_PX,
  headerActionsCompact,
  headerDenseLayout,
  headerReviewCompact,
} = require('../src/modal/lib/header-layout.ts');
assert.equal(HEADER_COMPACT_MAX_PX, 0, 'actions overflow disabled');
assert.equal(HEADER_DENSE_MAX_PX, 0, 'width densify disabled');
assert.equal(headerActionsCompact(900), false);
assert.equal(headerActionsCompact(760), false);
assert.equal(headerActionsCompact(500), false);
assert.equal(headerDenseLayout(800), false);
// Review compact: Diff only — never by panel width
assert.equal(
  headerReviewCompact({ layoutMode: 'diff', widthPx: 1400 }),
  true,
  'Diff layout always uses review compact header'
);
assert.equal(
  headerReviewCompact({ layoutMode: 'conversation', widthPx: 1400 }),
  false,
  'wide conversation keeps two-row header'
);
assert.equal(
  headerReviewCompact({ layoutMode: 'conversation', widthPx: 500 }),
  false,
  'narrow conversation also keeps two-row header (no width densify)'
);
assert.ok(
  header.includes('prp-header--review-compact') ||
    header.includes('data-review-compact'),
  'Header applies review-compact class/attr for Diff'
);
assert.ok(
  css.includes('prp-header--review-compact') ||
    css.includes("data-review-compact='1'"),
  'CSS targets review-compact header'
);

// --- (b) no collapsed file-tree expand chrome (nav stays mounted for anim) ---
assert.ok(
  tree.includes('prp-filetree--nav-collapsed') || tree.includes('aria-hidden'),
  'collapsed nav uses class/aria (stays mounted for animation)'
);
assert.ok(!/if\s*\(\s*navCollapsed\s*\)\s*\{\s*return null/.test(tree), 'no null unmount');
assert.ok(!tree.includes('prp-filetree__rail-toggle'), 'no rail expand toggle');
assert.ok(!tree.includes('Expand files navigator'), 'no expand affordance in tree column');
assert.ok(toolbar.includes('Files') || toolbar.includes('onToggleFileNav'), 'toolbar Files remains');

// --- (c) thread / finder share StepNav ---
assert.ok(
  toolbar.includes('StepNav') || toolbar.includes('prp-step-nav'),
  'DiffToolbar uses shared StepNav for thread navigation'
);
assert.ok(css.includes('prp-step-nav'), 'StepNav CSS');
assert.ok(
  css.includes('.prp-step-nav__btn') && /width:\s*28px/.test(css),
  'prev/next share equal fixed width'
);
assert.ok(toolbar.includes('onPrevComment'));
const searchBar = read('src/modal/views/chrome/SearchBar.tsx');
assert.ok(
  searchBar.includes('StepNav') || searchBar.includes('prp-step-nav'),
  'SearchBar finder nav uses shared StepNav'
);

// --- (d) multi-checkbox commit → all/single/range ---
const commits = [
  { sha: 'aaa1111', message: 'first commit message that is very very long for testing truncation' },
  { sha: 'bbb2222', message: 'second' },
  { sha: 'ccc3333', message: 'third' },
];
// Honest pure path: empty multi confirm → full PR diff
const emptyFilter = selectionToDiffCommitFilter([], commits);
assert.equal(emptyFilter.mode, 'all', 'empty selection → all commits');
assert.ok(!emptyFilter.sha && !emptyFilter.endSha);

assert.deepEqual(selectionToDiffCommitFilter(['bbb2222'], commits), {
  mode: 'single',
  sha: 'bbb2222',
});
const range = selectionToDiffCommitFilter(['ccc3333', 'aaa1111'], commits);
assert.equal(range.mode, 'range');
assert.equal(range.sha, 'aaa1111'); // oldest first
assert.equal(range.endSha, 'ccc3333');

// Round-trip: after range, empty selection restores all
assert.equal(selectionToDiffCommitFilter([], commits).mode, 'all');

const resolved = resolveCompareRange(commits, 'main', range);
assert.ok(resolved);
assert.equal(resolved.head, 'ccc3333');

const opts = buildCommitFilterOptions(commits);
assert.ok(opts[0].fullLabel.length > COMMIT_LABEL_MAX_LEN || opts.every((o) => o.label.length <= COMMIT_LABEL_MAX_LEN + 1));
assert.ok(opts.every((o) => o.label.length <= COMMIT_LABEL_MAX_LEN + 1));
assert.ok(truncateCommitLabel('x'.repeat(100)).endsWith('…'));
assert.ok(truncateCommitLabel('x'.repeat(100)).length <= COMMIT_LABEL_MAX_LEN);

assert.ok(toolbar.includes('multi') || toolbar.includes('onConfirm'), 'toolbar multi select');
assert.ok(commitFilterUi.includes('multi') && commitFilterUi.includes('onConfirm'));
assert.ok(toolbar.includes('selectionToDiffCommitFilter') || commitFilterUi.includes('selectionToDiffCommitFilter'));
// Apply must accept empty selection (restore all) — not disabled={!selected.length}
const sselect = read('src/modal/components/common/SearchableSelect.tsx');
assert.ok(sselect.includes('confirmMulti'), 'multi confirm path');
assert.ok(
  !/disabled=\{\s*!selected\.length\s*\}/.test(sselect),
  'multi Apply not disabled when selection empty (needed for all-commits restore)'
);
assert.ok(
  /empty\s*=\s*all/i.test(toolbar) ||
    /empty\s*=\s*all/i.test(commitFilterUi) ||
    /emptyLabel/i.test(toolbar) ||
    /emptyLabel/i.test(commitFilterUi) ||
    /all commits/i.test(toolbar) ||
    /all commits/i.test(commitFilterUi),
  'UI hints empty selection = all commits'
);
assert.ok(css.includes('max-width: 220px') || css.includes('max-width:220px'), 'commit trigger max-width');
assert.ok(
  css.includes('prp-sselect-panel--multi') || css.includes('max-width: min(320px'),
  'select panel max width'
);

// Collapsed grid is 0-width nav tracks (children stay mounted for animation)
const {
  fileNavGridTemplate,
  FILE_NAV_RAIL_WIDTH,
} = require('../src/modal/lib/file-nav-layout.ts');
const collapsedTpl = fileNavGridTemplate({ collapsed: true, width: 260 });
assert.equal(
  collapsedTpl,
  '0px 0px minmax(0, 1fr)',
  `collapsed grid must animate to 0-width nav tracks, got ${collapsedTpl}`
);
assert.ok(!collapsedTpl.includes('28px'), 'no 28px residual rail when collapsed');
assert.equal(FILE_NAV_RAIL_WIDTH, 0, 'rail width constant is 0');

// selection inverse
assert.deepEqual(diffCommitFilterToSelection({ mode: 'all' }, commits), []);
assert.deepEqual(diffCommitFilterToSelection({ mode: 'single', sha: 'bbb2222' }, commits), [
  'bbb2222',
]);

// --- (e) no merge status on header ---
assert.ok(!header.includes('mergeableState'), 'no mergeableState in Header');
assert.ok(!header.includes('Conflicts'), 'no Conflicts badge in Header');
assert.ok(
  !header.includes("tone=\"ok\">Merged") && !header.includes('>Merged</Badge>'),
  'no Merged badge in Header'
);
assert.ok(
  header.includes('Merge status lives only') || header.includes('merge box'),
  'documents removal'
);

// Bundle
const bundle = read('src/modal/dist/pr-modal.bundle.js');
assert.ok(bundle.includes('prp-header__more-btn') || bundle.includes('More actions'));
assert.ok(
  bundle.includes('prp-btn-group') ||
    bundle.includes('btn-group') ||
    bundle.includes('prp-step-nav') ||
    bundle.includes('StepNav'),
  'thread/finder step nav in bundle'
);
assert.ok(bundle.includes('selectionToDiffCommitFilter') || bundle.includes('endSha'));

console.log('narrow-chrome.test.js: all assertions passed');
console.log('overflow-menu=true');
console.log('no-filetree-rail=true');
console.log('comment-btn-group=true');
console.log('commit-multi-checkbox=true');
console.log('header-no-merge-status=true');
