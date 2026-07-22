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
} = require('../src/modal/lib/file-tree.ts');

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
  /prp-filetree__search-input[\s\S]{0,200}width:\s*100%/.test(css),
  'name filter input stretches full width'
);

console.log('file-tree-ext-filter.test.js: all assertions passed');
