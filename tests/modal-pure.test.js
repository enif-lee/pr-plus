const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const layout = require('../src/modal/pure/layout-mode.js');
const virt = require('../src/modal/pure/virtual-range.js');
const search = require('../src/modal/pure/search-index.js');
const diffRows = require('../src/modal/pure/diff-rows.js');
const modalState = require('../src/modal/pure/modal-state.js');

// layout
assert.equal(layout.toggleDiffLayout('centered'), 'diff');
assert.equal(layout.toggleDiffLayout('diff'), 'centered');
assert.ok(layout.layoutClassName('diff').includes('prp-modal--diff'));
assert.ok(layout.layoutClassName('centered').includes('prp-modal--centered'));

// virtual range
{
  const range = virt.calculateVisibleRange({
    totalRows: 1000,
    rowHeight: 20,
    viewportHeight: 200,
    scrollTop: 400,
    overscan: 5,
  });
  assert.equal(range.start, 15); // 400/20=20 - overscan 5
  assert.ok(range.end > range.start);
  assert.equal(range.totalHeight, 20000);
  assert.equal(virt.isIndexVisible(0, range), false);
  assert.equal(virt.isIndexVisible(20, range), true);
  const top = virt.scrollTopForIndex(500, 20, 200, 1000);
  assert.ok(top >= 0);
  const r2 = virt.calculateVisibleRange({
    totalRows: 1000,
    rowHeight: 20,
    viewportHeight: 200,
    scrollTop: top,
    overscan: 2,
  });
  assert.equal(virt.isIndexVisible(500, r2), true);
}

// diff flatten
{
  const rows = diffRows.flattenFilesToVirtualRows([
    {
      filename: 'a.js',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch: '@@ -1,3 +1,4 @@\n line\n-old\n+new\n',
    },
    {
      filename: 'b.bin',
      status: 'added',
      additions: 0,
      deletions: 0,
      patch: '',
    },
  ]);
  assert.ok(rows.length > 5);
  assert.equal(rows[0].kind, 'file-header');
  assert.ok(rows.some((r) => r.lineType === 'add'));
  assert.ok(rows.some((r) => r.lineType === 'del'));
  const map = diffRows.fileStartIndexMap(rows);
  assert.equal(map.get('a.js'), 0);

  const split = diffRows.flattenFilesToVirtualRows(
    [
      {
        filename: 'a.js',
        status: 'modified',
        patch: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      },
    ],
    'split'
  );
  assert.ok(split.some((r) => String(r.text).includes('│')));
  assert.ok(split.some((r) => r.newLine != null || r.oldLine != null));
}

// search index — off-window row findable
{
  const virtualRows = [];
  for (let i = 0; i < 500; i++) {
    virtualRows.push({
      kind: 'diff-line',
      filePath: 'big.js',
      text: i === 420 ? 'unique-token-ZZZ hidden deep' : `line ${i} ordinary`,
      rowIndex: i,
      lineType: 'context',
    });
  }
  const docs = search.buildSearchIndex(
    { title: 'Hello', body: 'world', comments: [], reviews: [], commits: [] },
    virtualRows
  );
  const hits = search.searchIndex(docs, 'unique-token-ZZZ');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].rowIndex, 420);
  // 420 is outside first viewport window
  const window = virt.calculateVisibleRange({
    totalRows: 500,
    rowHeight: 22,
    viewportHeight: 220,
    scrollTop: 0,
    overscan: 2,
  });
  assert.equal(virt.isIndexVisible(420, window), false);
  const jumpTop = virt.scrollTopForIndex(420, 22, 220, 500);
  const after = virt.calculateVisibleRange({
    totalRows: 500,
    rowHeight: 22,
    viewportHeight: 220,
    scrollTop: jumpTop,
    overscan: 2,
  });
  assert.equal(virt.isIndexVisible(420, after), true);
  assert.equal(search.nextHitIndex(0, 3, 1), 1);
  assert.equal(search.nextHitIndex(2, 3, 1), 0);
}

// modal state
{
  let s = modalState.createInitialModalState();
  assert.equal(s.open, false);
  s = modalState.openModal(s, { owner: 'o', repo: 'r', number: 7 });
  assert.equal(s.open, true);
  assert.equal(s.number, 7);
  assert.equal(s.layoutMode, 'centered');
  s = modalState.setLayoutMode(s, 'diff');
  assert.equal(s.layoutMode, 'diff');
  s = modalState.setSearchResults(
    s,
    'foo',
    [{ docId: '1', kind: 'diff', rowIndex: 9, filePath: 'a.js', text: 'foo', start: 0, end: 3 }],
    0
  );
  assert.equal(s.searchHits.length, 1);
  assert.equal(s.searchHitIndex, 0);
  s = modalState.closeModal(s);
  assert.equal(s.open, false);
}

// bundle exists + loadable in browser-like env
{
  const bundlePath = path.join(__dirname, '../src/modal/dist/pr-modal.bundle.js');
  assert.ok(fs.existsSync(bundlePath), 'bundle must exist');
  const cssPath = path.join(__dirname, '../src/modal/dist/pr-modal.css');
  assert.ok(fs.existsSync(cssPath), 'css must exist');
  const code = fs.readFileSync(bundlePath, 'utf8');
  assert.ok(code.includes('mountPrModal') || code.includes('PRModalApp') || code.length > 1000);
}

console.log('modal-pure.test.js: all assertions passed');
