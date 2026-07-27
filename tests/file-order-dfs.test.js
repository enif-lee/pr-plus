/**
 * Diff list / file explorer / prev-next file order must share one DFS order
 * (dirs-first + name sort), not GitHub files[] API insertion order.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildNestedFileTree,
  filesInTreeOrder,
  flattenVisibleTree,
  collectDirPaths,
} = require('../src/modal/lib/file-tree.ts');
const { flattenFilesToVirtualRows } = require('../src/modal/lib/diff-rows.ts');
const {
  resolveAdjacentFileNav,
  activeFileNavIndex,
} = require('../src/modal/lib/shortcut-policy.ts');
const { resolveDiffDisplayFiles } = require('../src/modal/lib/single-file-mode.ts');

// API-ish insertion order (intentionally scrambled)
const apiFiles = [
  { filename: 'z-root.ts', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b\n' },
  { filename: 'src/b.ts', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b\n' },
  { filename: 'a-dir/x.ts', status: 'added', patch: '@@ -0,0 +1 @@\n+x\n' },
  { filename: 'src/a.ts', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b\n' },
  { filename: 'README.md', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b\n' },
];

const EXPECTED_DFS = [
  'a-dir/x.ts',
  'src/a.ts',
  'src/b.ts',
  'README.md',
  'z-root.ts',
];

// 1) Pure DFS order
const ordered = filesInTreeOrder(apiFiles);
assert.deepEqual(
  ordered.map((f) => f.filename),
  EXPECTED_DFS,
  'filesInTreeOrder is dirs-first DFS'
);

// 2) Explorer visible walk (all dirs expanded) yields same file sequence
const tree = buildNestedFileTree(apiFiles);
const allDirs = collectDirPaths(tree);
const visible = flattenVisibleTree(tree, allDirs);
const explorerFiles = visible
  .filter((n) => n.type === 'file')
  .map((n) => n.path);
assert.deepEqual(explorerFiles, EXPECTED_DFS, 'explorer DFS matches filesInTreeOrder');

// 3) Diff virtual list file-header order matches DFS
const rows = flattenFilesToVirtualRows(ordered, 'unified');
const diffHeaderPaths = rows
  .filter((r) => r.kind === 'file-header')
  .map((r) => r.filePath || r.path);
assert.deepEqual(diffHeaderPaths, EXPECTED_DFS, 'Diff file headers follow DFS list order');

// Unordered input to flatten must NOT be assumed DFS — App must order first
const rowsApiOrder = flattenFilesToVirtualRows(apiFiles, 'unified');
const apiHeaders = rowsApiOrder
  .filter((r) => r.kind === 'file-header')
  .map((r) => r.filePath || r.path);
assert.notDeepEqual(
  apiHeaders,
  EXPECTED_DFS,
  'raw API order differs — proves Diff must receive filesInTreeOrder input'
);

// 4) Prev/next steps along DFS
assert.equal(
  resolveAdjacentFileNav(ordered, 'a-dir/x.ts', 1).path,
  'src/a.ts'
);
assert.equal(
  resolveAdjacentFileNav(ordered, 'src/b.ts', 1).path,
  'README.md'
);
assert.equal(
  resolveAdjacentFileNav(ordered, 'z-root.ts', 1).path,
  'a-dir/x.ts',
  'wrap'
);
assert.equal(activeFileNavIndex(ordered, 'src/a.ts'), 1);
assert.equal(activeFileNavIndex(ordered, 'README.md'), 3);

// 5) single-file mode still picks by path; list order preserved for first fallback
const single = resolveDiffDisplayFiles(ordered, 'src/b.ts', true);
assert.equal(single.length, 1);
assert.equal(single[0].filename, 'src/b.ts');
const singleFallback = resolveDiffDisplayFiles(ordered, null, true);
assert.equal(singleFallback[0].filename, EXPECTED_DFS[0], 'fallback first = DFS first');

// 6) App contracts — one ordered displayFiles for all three surfaces
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /filesInTreeOrder\(list\)/.test(appSrc),
  'displayFiles ends with filesInTreeOrder'
);
assert.ok(
  !appSrc.includes('treeOrderedNavFiles'),
  'no separate nav order — displayFiles is the single source'
);
assert.ok(
  /resolveAdjacentFileNav\(\s*displayFiles/.test(appSrc) ||
    appSrc.includes('resolveAdjacentFileNav(displayFiles'),
  'navFile uses displayFiles'
);
assert.ok(
  appSrc.includes('flattenFilesToVirtualRows(diffDisplayFiles'),
  'Diff uses diffDisplayFiles derived from displayFiles'
);
assert.ok(
  /buildNestedFileTree\(navFiles\)|buildNestedFileTree\(list\)/.test(appSrc) ||
    appSrc.includes('buildNestedFileTree(navFiles)'),
  'explorer tree built from nav/display files'
);

console.log('file-order-dfs.test.js: ok');
