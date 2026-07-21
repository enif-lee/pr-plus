const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-090750d025fa/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const search = require('../src/modal/pure/search-index.js');
const virt = require('../src/modal/pure/virtual-range.js');
const diffRows = require('../src/modal/pure/diff-rows.js');

// Build large multi-file corpus
const files = [];
for (let f = 0; f < 20; f++) {
  const lines = [];
  for (let i = 0; i < 80; i++) {
    lines.push(` line ${f}-${i}`);
  }
  if (f === 17) {
    lines[50] = '+secret-needle-ONLY-HERE';
  }
  files.push({
    filename: `file-${f}.ts`,
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: `@@ -1,3 +1,4 @@\n${lines.join('\n')}\n`,
  });
}

const virtualRows = diffRows.flattenFilesToVirtualRows(files);
assert.ok(virtualRows.length > 200, 'corpus larger than viewport');

const docs = search.buildSearchIndex(
  {
    title: 'Big PR',
    body: 'description',
    comments: [],
    reviews: [],
    commits: [],
  },
  virtualRows
);

const hits = search.searchIndex(docs, 'secret-needle-ONLY-HERE');
assert.ok(hits.length >= 1, 'must find token in full index');
const hit = hits[0];
assert.equal(typeof hit.rowIndex, 'number');

const viewportHeight = 240;
const rowHeight = 22;
const initial = virt.calculateVisibleRange({
  totalRows: virtualRows.length,
  rowHeight,
  viewportHeight,
  scrollTop: 0,
  overscan: 3,
});
assert.equal(
  virt.isIndexVisible(hit.rowIndex, initial),
  false,
  'needle starts off-window'
);

const scrollTop = virt.scrollTopForIndex(
  hit.rowIndex,
  rowHeight,
  viewportHeight,
  virtualRows.length
);
const after = virt.calculateVisibleRange({
  totalRows: virtualRows.length,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan: 3,
});
assert.equal(
  virt.isIndexVisible(hit.rowIndex, after),
  true,
  'jump-to-hit brings row into virtual window'
);

// App wires Ctrl/Cmd+F
const appSrc = fs.readFileSync(path.join(__dirname, '../src/modal/App.jsx'), 'utf8');
assert.ok(appSrc.includes("key === 'f'") || appSrc.includes('ctrlKey'));
assert.ok(appSrc.includes('preventDefault'));

const log = [
  'pr-modal-search.test.js: off-window search ok',
  `totalRows=${virtualRows.length}`,
  `hitRow=${hit.rowIndex}`,
  `scrollTop=${scrollTop}`,
  `visibleAfter=${after.start}-${after.end}`,
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-search.log'), log + '\n');
console.log('pr-modal-search.test.js: all assertions passed');
console.log(log);
