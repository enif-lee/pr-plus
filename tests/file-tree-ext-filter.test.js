/**
 * Extension helpers for Diff files navigator filter chips.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  fileExtensionFromPath,
  listFileExtensions,
  filterFilesByExtensions,
  toggleFileExtension,
  formatFileExtensionLabel,
  collectDirPaths,
  buildNestedFileTree,
  filesInTreeOrder,
  hasAnyReviewThreads,
  filterFilesByReviewMode,
  filterFilesWithReviewThreads,
  filterFilesUnreadOnly,
} = require('../src/modal/lib/file-tree.ts');
const {
  resolveAdjacentFileNav,
} = require('../src/modal/lib/shortcut-policy.ts');

assert.equal(fileExtensionFromPath('src/a.ts'), 'ts');
assert.equal(fileExtensionFromPath('README.md'), 'md');
assert.equal(fileExtensionFromPath('Makefile'), '');
assert.equal(fileExtensionFromPath('.gitignore'), '');
assert.equal(fileExtensionFromPath('foo.d.ts'), 'ts');
assert.equal(formatFileExtensionLabel('tsx'), '.tsx');
assert.equal(formatFileExtensionLabel(''), '∅');

const files = [
  { filename: 'src/a.ts' },
  { filename: 'src/b.ts' },
  { filename: 'src/c.tsx' },
  { filename: 'docs/README.md' },
  { filename: 'Makefile' },
];

// ts×2 first; then single-count alpha: md, tsx; no-ext last
assert.deepEqual(listFileExtensions(files), ['ts', 'md', 'tsx', '']);
assert.deepEqual(listFileExtensions(files, { max: 2 }), ['ts', 'md']);

assert.equal(filterFilesByExtensions(files, []).length, 5);
assert.equal(filterFilesByExtensions(files, new Set(['ts'])).length, 2);
assert.equal(filterFilesByExtensions(files, ['md', '']).length, 2);
assert.equal(
  filterFilesByExtensions(files, new Set(['tsx']))[0].filename,
  'src/c.tsx'
);

let sel = new Set();
sel = toggleFileExtension(sel, 'ts');
assert.ok(sel.has('ts'));
sel = toggleFileExtension(sel, 'ts');
assert.equal(sel.size, 0);

const tree = buildNestedFileTree(files);
const dirs = collectDirPaths(tree);
assert.ok(dirs.has('src'));
assert.ok(dirs.has('docs'));

// Explorer order: dirs-first + name sort DFS (not API insertion order)
{
  // API-ish order: root file first, then nested mixed
  const apiOrder = [
    { filename: 'z-root.ts' },
    { filename: 'src/b.ts' },
    { filename: 'a-dir/x.ts' },
    { filename: 'src/a.ts' },
    { filename: 'README.md' },
  ];
  const ordered = filesInTreeOrder(apiOrder);
  assert.deepEqual(
    ordered.map((f) => f.filename),
    [
      'a-dir/x.ts', // dirs first: a-dir before src, before root files
      'src/a.ts', // within src: a before b
      'src/b.ts',
      'README.md', // root files alpha after dirs
      'z-root.ts',
    ],
    'filesInTreeOrder matches left explorer sort'
  );
  // Tree next: a-dir/x → src/a
  assert.equal(
    resolveAdjacentFileNav(ordered, 'a-dir/x.ts', 1).path,
    'src/a.ts'
  );
  // API next from z-root differs from tree (tree: last → wrap to a-dir)
  assert.equal(
    resolveAdjacentFileNav(apiOrder, 'z-root.ts', 1).path,
    'src/b.ts',
    'API order next from z-root is src/b'
  );
  assert.equal(
    resolveAdjacentFileNav(ordered, 'z-root.ts', 1).path,
    'a-dir/x.ts',
    'tree order: z-root is last → next wraps to first (a-dir/x)'
  );
  assert.equal(
    resolveAdjacentFileNav(ordered, 'src/b.ts', 1).path,
    'README.md'
  );
}

// Default: all dirs expanded when PR files first load
{
  const app = fs.readFileSync(
    path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(app.includes('collectDirPaths'), 'collects all dir paths');
  assert.ok(
    /setExpandedDirs\s*\(\s*dirs\s*\)/.test(app) || app.includes('setExpandedDirs(dirs)'),
    'seeds expandedDirs with all folders'
  );
  assert.ok(app.includes('fileTreeExpandKeyRef'), 'expand once per PR');
}

// Review filter modes (Unresolved / Resolved / Pending / off; legacy 'all')
{
  const allCounts = new Map([
    ['src/a.ts', 2],
    ['src/b.ts', 0],
    ['docs/README.md', 1],
  ]);
  const unresolved = new Map([
    ['src/a.ts', 1],
    // README only resolved threads (1 total, 0 unresolved)
  ]);
  assert.equal(hasAnyReviewThreads(allCounts), true);
  assert.equal(hasAnyReviewThreads(new Map()), false);
  const allMode = filterFilesByReviewMode(files, allCounts, unresolved, 'all');
  assert.deepEqual(
    allMode.map((f) => f.filename).sort(),
    ['docs/README.md', 'src/a.ts']
  );
  const unres = filterFilesByReviewMode(files, allCounts, unresolved, 'unresolved');
  assert.deepEqual(
    unres.map((f) => f.filename),
    ['src/a.ts']
  );
  const resolved = filterFilesByReviewMode(files, allCounts, unresolved, 'resolved');
  assert.deepEqual(
    resolved.map((f) => f.filename).sort(),
    ['docs/README.md', 'src/a.ts'],
    'resolved: files with at least one resolved thread'
  );
  assert.equal(
    filterFilesByReviewMode(files, allCounts, unresolved, null).length,
    5
  );
  // back-compat boolean helper
  assert.equal(filterFilesWithReviewThreads(files, allCounts, true).length, 2);

  // Pending filter + unresolved excludes pending-only paths
  const pendingCounts = new Map([
    ['src/a.ts', 1], // all open threads on a.ts are pending drafts
    ['src/c.tsx', 1],
  ]);
  const unresolvedWithPending = new Map([
    ['src/a.ts', 1],
    ['src/c.tsx', 1],
  ]);
  const allWithPending = new Map([
    ['src/a.ts', 2],
    ['src/c.tsx', 1],
    ['docs/README.md', 1],
  ]);
  const pendingOnly = filterFilesByReviewMode(
    files,
    allWithPending,
    unresolvedWithPending,
    'pending',
    pendingCounts
  );
  assert.deepEqual(
    pendingOnly.map((f) => f.filename).sort(),
    ['src/a.ts', 'src/c.tsx'],
    'pending: paths with pending threads'
  );
  const unresExPending = filterFilesByReviewMode(
    files,
    allWithPending,
    unresolvedWithPending,
    'unresolved',
    pendingCounts
  );
  assert.deepEqual(
    unresExPending.map((f) => f.filename),
    [],
    'unresolved excludes pending-only open threads when pendingCounts provided'
  );
}

// Unread-only filter (not viewed checkbox paths)
{
  const viewed = new Set(['src/a.ts', 'docs/README.md']);
  const unread = filterFilesUnreadOnly(files, viewed, true);
  assert.deepEqual(
    unread.map((f) => f.filename).sort(),
    ['Makefile', 'src/b.ts', 'src/c.tsx']
  );
  assert.equal(filterFilesUnreadOnly(files, viewed, false).length, 5);
  assert.equal(filterFilesUnreadOnly(files, [], true).length, 5);
}

// UI wiring: no Files header; extension chips next to search
const treeUi = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/FolderFileTree.tsx'),
  'utf8'
);
assert.ok(!treeUi.includes('prp-filetree__head'), 'Files header removed');
assert.ok(!/head-label|>Files</.test(treeUi), 'no Files label');
assert.ok(treeUi.includes('prp-filetree__ext'), 'extension chips');
assert.ok(treeUi.includes('listFileExtensions'), 'uses extension list helper');
assert.ok(treeUi.includes('filterFilesByExtensions'), 'filters by extension');
assert.ok(treeUi.includes('filterFilesUnreadOnly'), 'unread-only filter helper');
assert.ok(treeUi.includes('Unread'), 'Unread chip in files navigator');
assert.ok(
  !treeUi.includes('Review only'),
  'review filter moved out of files navigator'
);
const toolbar = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/chrome/DiffToolbar.tsx'),
  'utf8'
);
assert.ok(toolbar.includes('Unresolved'), 'Unresolved toggle in Diff toolbar');
assert.ok(toolbar.includes('Resolved'), 'Resolved toggle in Diff toolbar');
assert.ok(toolbar.includes("reviewFilter === 'resolved'"), 'Resolved mode wiring');
assert.ok(toolbar.includes("reviewFilter === 'pending'"), 'Pending mode wiring');
assert.ok(toolbar.includes('prp-review-filter__count'), 'filter counts on toggles');
assert.ok(!toolbar.includes('{pending} pending'), 'pending N badge removed');
assert.ok(!toolbar.includes('>All<'), 'All toggle removed');
assert.ok(toolbar.includes('prp-review-filter'), 'distinct review filter chrome');
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(appSrc.includes('filterFilesByReviewMode'), 'App filters files for nav+diff');
assert.ok(appSrc.includes('displayFiles'), 'shared filtered list for nav+diff');
assert.ok(
  /displayFiles\s*=\s*useMemo[\s\S]*filesInTreeOrder/.test(appSrc) ||
    (appSrc.includes('filesInTreeOrder') &&
      appSrc.includes('displayFiles') &&
      /filesInTreeOrder\(list\)/.test(appSrc)),
  'displayFiles is DFS tree-ordered (Diff + explorer + prev/next share it)'
);
assert.ok(
  /resolveAdjacentFileNav\(\s*displayFiles/.test(appSrc) ||
    /resolveAdjacentFileNav\(displayFiles/.test(appSrc),
  'prev/next uses displayFiles (DFS)'
);
assert.ok(
  appSrc.includes('flattenFilesToVirtualRows(diffDisplayFiles') ||
    appSrc.includes('flattenFilesToVirtualRows(diffDisplayFiles,'),
  'Diff virtual rows come from diffDisplayFiles ← displayFiles DFS'
);
assert.ok(appSrc.includes('reviewScopedFiles'), 'resolve-status-only list for ext chips');
assert.ok(appSrc.includes('extSourceFiles'), 'passes ext source files to tree');
assert.ok(appSrc.includes('filterReviewRootsForNav'), 'nav roots respect review filter');
assert.ok(appSrc.includes('fileExtFilter'), 'file ext filter owned by App');
assert.ok(appSrc.includes('pendingThreadCounts'), 'pending path counts for filter');
assert.ok(appSrc.includes('unresolvedCount'), 'passes unresolved count to toolbar');
assert.ok(appSrc.includes('resolvedCount'), 'passes resolved count to toolbar');

// Extension multi-select: chips come from resolve-scoped source, not self-filtered display list
assert.ok(
  treeUi.includes('extSourceFiles'),
  'FolderFileTree accepts extSourceFiles for chip listing'
);
assert.ok(
  treeUi.includes('selectedExts') && treeUi.includes('toggleFileExtension'),
  'extension chips toggle multi-select set'
);
// Selecting one ext must not rebuild options only from already-filtered `files`
{
  // Pure: multi-toggle keeps prior selections
  let multi = new Set();
  multi = toggleFileExtension(multi, 'ts');
  multi = toggleFileExtension(multi, 'tsx');
  multi = toggleFileExtension(multi, 'md');
  assert.equal(multi.size, 3);
  assert.ok(multi.has('ts') && multi.has('tsx') && multi.has('md'));
  // Filtering by multi-select keeps any of the selected exts
  const mixed = [
    { filename: 'a.ts' },
    { filename: 'b.tsx' },
    { filename: 'c.md' },
    { filename: 'd.js' },
  ];
  const kept = filterFilesByExtensions(mixed, multi).map((f) => f.filename).sort();
  assert.deepEqual(kept, ['a.ts', 'b.tsx', 'c.md']);
}

const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
assert.ok(css.includes('prp-filetree__ext'));
assert.ok(
  css.includes('flex-direction: column') || css.includes('flex-direction:column'),
  'search stack is column (input full-width, tags below)'
);
assert.ok(
  /prp-filetree__search-input[\s\S]{0,120}flex:\s*1\s+1\s+auto/.test(css) ||
    /prp-filetree__search-input[\s\S]{0,200}width:\s*100%/.test(css),
  'name filter input stretches in search row (flex or width 100%)'
);

console.log('file-tree-ext-filter.test.js: all assertions passed');
