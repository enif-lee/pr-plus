/**
 * Single-file Diff mode: prefs default off; Diff list narrows to active file.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizePrefs, DEFAULT_PREFS } = require('../src/storage.js');
const {
  resolveDiffDisplayFiles,
} = require('../src/modal/lib/single-file-mode.ts');

assert.equal(DEFAULT_PREFS.singleFileMode, false);
assert.equal(normalizePrefs(null).singleFileMode, false);
assert.equal(normalizePrefs({}).singleFileMode, false);
assert.equal(normalizePrefs({ singleFileMode: true }).singleFileMode, true);
assert.equal(normalizePrefs({ singleFileMode: false }).singleFileMode, false);

const files = [
  { path: 'a.ts' },
  { filename: 'b.ts' },
  { path: 'c.ts' },
];

assert.deepEqual(
  resolveDiffDisplayFiles(files, 'b.ts', false).map((f) => f.path || f.filename),
  ['a.ts', 'b.ts', 'c.ts']
);
assert.deepEqual(
  resolveDiffDisplayFiles(files, 'b.ts', true).map((f) => f.path || f.filename),
  ['b.ts']
);
assert.deepEqual(
  resolveDiffDisplayFiles(files, null, true).map((f) => f.path || f.filename),
  ['a.ts'],
  'falls back to first file when no active path'
);
assert.deepEqual(
  resolveDiffDisplayFiles(files, 'missing.ts', true).map(
    (f) => f.path || f.filename
  ),
  ['a.ts'],
  'missing active falls back to first'
);

const root = path.join(__dirname, '..');
const popup = fs.readFileSync(path.join(root, 'src/popup.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
assert.ok(popup.includes('pref-single-file-mode'));
assert.ok(popup.includes('단일 파일 모드'));
assert.ok(app.includes('singleFileMode'));
assert.ok(app.includes('diffDisplayFiles') || app.includes('resolveDiffDisplayFiles'));

console.log('single-file-mode.test.js: all assertions passed');
console.log('single-file-mode-default-off=true');
