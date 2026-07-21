const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-bb0c8cb3d71a/implementer';
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
  if (f === 0) {
    lines[0] = '+n early partial match';
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

// --- React effect contract: typing refinements keep hitIndex=0 but must re-jump ---
{
  const partial = search.resolveQuerySearchState(docs, 'n');
  assert.ok(partial.hits.length >= 1);
  assert.equal(partial.hitIndex, 0);
  assert.equal(partial.shouldJump, true);
  const partialRow = partial.activeHit.rowIndex;

  const full = search.resolveQuerySearchState(docs, 'secret-needle-ONLY-HERE');
  assert.ok(full.hits.length >= 1);
  assert.equal(full.hitIndex, 0); // stagnant index
  assert.equal(full.shouldJump, true); // must still jump
  assert.equal(full.activeHit.rowIndex, hit.rowIndex);
  // Full query targets a different row than the first 'n' hit in normal corpora
  assert.notEqual(
    full.activeHit.rowIndex,
    partialRow,
    'refined query must resolve a different target row than first partial hit'
  );

  // Simulate effect: always jump via activeHit even when hitIndex stays 0
  let jumpedTo = null;
  function simulateQueryEffect(query) {
    const state = search.resolveQuerySearchState(docs, query);
    if (state.shouldJump) jumpedTo = state.activeHit.rowIndex;
    return state.hitIndex;
  }
  const idx1 = simulateQueryEffect('n');
  const row1 = jumpedTo;
  const idx2 = simulateQueryEffect('secret-needle-ONLY-HERE');
  const row2 = jumpedTo;
  assert.equal(idx1, 0);
  assert.equal(idx2, 0);
  assert.equal(row2, hit.rowIndex);
  assert.notEqual(row1, row2);

  // Single-hit next/prev must still request jump (wrap keeps index 0)
  const oneHit = full.hits.slice(0, 1);
  const nav = search.resolveNavSearchState(oneHit, 0, 1);
  assert.equal(nav.hitIndex, 0);
  assert.equal(nav.shouldJump, true);
  assert.equal(nav.activeHit.rowIndex, hit.rowIndex);
}

// App wires Ctrl/Cmd+F and uses resolveQuerySearchState / resolveNavSearchState
const appSrc = fs.readFileSync(path.join(__dirname, '../src/modal/App.jsx'), 'utf8');
assert.ok(appSrc.includes("key === 'f'") || appSrc.includes('ctrlKey'));
assert.ok(appSrc.includes('preventDefault'));
assert.ok(appSrc.includes('resolveQuerySearchState'));
assert.ok(appSrc.includes('resolveNavSearchState'));
assert.ok(appSrc.includes('shouldJump'));

const hostSrc = fs.readFileSync(path.join(__dirname, '../src/pr-modal-host.js'), 'utf8');
assert.ok(hostSrc.includes('reactRoot.render'));
assert.ok(!/reactRoot\.unmount\(\);\s*[\s\S]*reactRoot = null;\s*host\.replaceChildren\(\);\s*\}\s*if \(!current\.open\)/.test(hostSrc.replace(/\n/g, ' ')));
// When open, must not unmount before remount — check reuse path
assert.ok(hostSrc.includes('Reuse root') || hostSrc.includes('reactRoot.render(props)'));

const log = [
  'pr-modal-search.test.js: off-window search ok',
  `totalRows=${virtualRows.length}`,
  `hitRow=${hit.rowIndex}`,
  `scrollTop=${scrollTop}`,
  `visibleAfter=${after.start}-${after.end}`,
  'query-refine-contract: hitIndex stays 0 but activeHit row changes + shouldJump',
  'nav-single-hit: shouldJump true when wrapping at index 0',
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-search.log'), log + '\n');
fs.writeFileSync(path.join(SCRATCH, 'search-offscreen.log'), log + '\n');
console.log('pr-modal-search.test.js: all assertions passed');
console.log(log);
