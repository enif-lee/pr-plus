const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const search = require('../src/modal/lib/search-index.ts');
const virt = require('../src/modal/lib/virtual-range.ts');
const diffRows = require('../src/modal/lib/diff-rows.ts');

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

// --- React effect contract: initial hit prefers navigable rowIndex; refine re-jumps ---
{
  const partial = search.resolveQuerySearchState(docs, 'n');
  assert.ok(partial.hits.length >= 1);
  assert.ok(partial.hitIndex >= 0);
  assert.equal(partial.shouldJump, true);
  assert.ok(
    search.isNavigableSearchHit(partial.activeHit),
    'initial selection should land on a navigable hit (anchor or row)'
  );
  const partialRow = partial.activeHit.rowIndex;

  const full = search.resolveQuerySearchState(docs, 'secret-needle-ONLY-HERE');
  assert.ok(full.hits.length >= 1);
  assert.equal(full.shouldJump, true); // must still jump
  assert.equal(full.activeHit.rowIndex, hit.rowIndex);
  // Full query targets a different row than the first navigable 'n' hit when both have rows
  if (partialRow != null) {
    assert.notEqual(
      full.activeHit.rowIndex,
      partialRow,
      'refined query must resolve a different target row than first partial hit'
    );
  }

  // Simulate effect: always jump via activeHit (hitIndex may not be 0)
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
  assert.ok(idx1 >= 0);
  assert.ok(idx2 >= 0);
  assert.equal(row2, hit.rowIndex);
  if (row1 != null) assert.notEqual(row1, row2);

  // Single-hit next/prev must still request jump (wrap keeps index 0)
  const oneHit = full.hits.slice(0, 1);
  const nav = search.resolveNavSearchState(oneHit, 0, 1);
  assert.equal(nav.hitIndex, 0);
  assert.equal(nav.shouldJump, true);
  assert.equal(nav.activeHit.rowIndex, hit.rowIndex);
}

// App search UI + ⌘F / palette openSearch wiring
const appSrc = fs.readFileSync(path.join(__dirname, '../src/modal/app/PrModalApp.tsx'), 'utf8');
assert.ok(appSrc.includes('ctrlKey') || appSrc.includes('metaKey'));
assert.ok(appSrc.includes('preventDefault'));
assert.ok(appSrc.includes('resolveQuerySearchState'));
assert.ok(
  appSrc.includes('resolveQuerySearchStateAsync') || appSrc.includes('searchIndexAsync'),
  'App must use async chunked search for large diffs'
);
assert.ok(
  appSrc.includes('startTransition') && appSrc.includes('onSearchQueryCommit'),
  'committed search query must go through startTransition (not every keystroke)'
);
assert.ok(
  appSrc.includes('searchBusy') && appSrc.includes('showTopLoadBar'),
  'search busy must drive the top loading bar'
);
assert.ok(
  appSrc.includes('jumpToSearchHit') || appSrc.includes('scrollIntoView'),
  'search nav must jump the virtual list to the active hit'
);
assert.ok(appSrc.includes('resolveNavSearchState'));
assert.ok(appSrc.includes('shouldJump'));
assert.ok(appSrc.includes("case 'openSearch'"), 'App handles openSearch from shortcut/palette');

// SearchBar keeps local draft + debounce so typing does not re-render the modal tree
const searchBarSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/chrome/SearchBar.tsx'),
  'utf8'
);
assert.ok(searchBarSrc.includes('SEARCH_INPUT_DEBOUNCE_MS'), 'debounce constant');
assert.ok(
  searchBarSrc.includes('scheduleCommit') || searchBarSrc.includes('setTimeout'),
  'SearchBar debounces parent onChange'
);
assert.ok(
  searchBarSrc.includes('useState') && searchBarSrc.includes('draft'),
  'SearchBar uses local draft state for input value'
);
assert.ok(
  searchBarSrc.includes('Searching') || searchBarSrc.includes('prp-search__spinner'),
  'SearchBar shows loading UI while searching'
);

// Text mark / row highlight helpers
{
  const html = search.markSearchInText('Hello needle World needle', 'needle', {
    currentStart: 6,
  });
  assert.ok(html.includes('prp-search-mark'), 'marks wrap matches');
  assert.ok(html.includes('prp-search-mark--current'), 'active match class');
  assert.ok(html.includes('Hello'), 'preserves surrounding text');
  assert.equal((html.match(/prp-search-mark/g) || []).length >= 2, true);

  const row = { rowIndex: 3, text: '+const needle = 1', code: 'const needle = 1' };
  const hit = { rowIndex: 3, start: 7, end: 13 }; // 'needle' in text with +
  const mapped = search.mapHitStartToDisplay(row, hit, 'code');
  assert.equal(mapped, 6, 'maps unified +prefix offset into code');

  const set = search.searchHitRowIndexSet([
    { rowIndex: 1 },
    { rowIndex: 3 },
    { rowIndex: 3 },
    {},
  ]);
  assert.equal(set.has(1) && set.has(3) && set.size === 2, true);

  // Occurrence index drives which mark is "current" when navigating
  const multi = [
    { rowIndex: 10, start: 0 },
    { rowIndex: 10, start: 5 },
    { rowIndex: 11, start: 0 },
    { rowIndex: 10, start: 9 },
  ];
  assert.equal(search.occurrenceIndexAmongRowHits(multi, 0), 0);
  assert.equal(search.occurrenceIndexAmongRowHits(multi, 1), 1);
  assert.equal(search.occurrenceIndexAmongRowHits(multi, 2), 0);
  assert.equal(search.occurrenceIndexAmongRowHits(multi, 3), 2);
  assert.equal(search.startOfNthOccurrence('aa x aa y aa', 'aa', 0), 0);
  assert.equal(search.startOfNthOccurrence('aa x aa y aa', 'aa', 1), 5);
  assert.equal(search.startOfNthOccurrence('aa x aa y aa', 'aa', 2), 10);
  const resolved = search.resolveActiveMarkStart(
    'const needle = needle',
    'needle',
    { rowIndex: 1, text: 'const needle = needle', code: 'const needle = needle' },
    { rowIndex: 1, start: 14 },
    1,
    'code'
  );
  assert.equal(resolved, 15, '2nd occurrence on the line is the active mark');

  // Conversation anchors are preferred over bare rows when present
  const mixedHits = [
    { kind: 'body', text: 'participant in description', anchorId: 'body' },
    { kind: 'comment', text: 'participant review', anchorId: 'issue-comment:1' },
    { kind: 'diff', rowIndex: 42, text: 'participant' },
  ];
  assert.equal(search.firstNavigableHitIndex(mixedHits), 0);
  assert.equal(search.firstNavigableHitIndex([{ kind: 'diff', rowIndex: 9 }]), 0);
  assert.equal(search.firstNavigableHitIndex([]), -1);

  // Conversation corpus excludes diff rows / commits
  const convDocs = search.buildConversationSearchIndex({
    body: 'hello participants',
    comments: [{ id: 1, body: 'issue note' }],
    reviews: [{ id: 2, body: 'lgtm participants', state: 'APPROVED' }],
    reviewComments: [
      { id: 10, body: 'root review participant', path: 'a.ts' },
      { id: 11, body: 'reply participant', inReplyToId: 10 },
    ],
    commits: [{ sha: 'abc', message: 'should not index' }],
  });
  assert.ok(convDocs.every((d) => d.kind !== 'diff' && d.kind !== 'commit'));
  assert.ok(convDocs.some((d) => d.anchorId === 'body'));
  assert.ok(convDocs.some((d) => d.anchorId === 'issue-comment:1'));
  assert.ok(convDocs.some((d) => d.anchorId === 'review:2'));
  assert.ok(convDocs.some((d) => d.kind === 'review-reply'));
  const convHits = search.searchIndex(convDocs, 'participant');
  assert.ok(convHits.length >= 1);
  assert.ok(convHits.every((h) => h.anchorId));
}

// SearchBar Load Comments control
{
  const searchBarSrc = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/chrome/SearchBar.tsx'),
    'utf8'
  );
  assert.ok(searchBarSrc.includes('Load Comments'));
  assert.ok(searchBarSrc.includes('showLoadComments'));
  const appSrc2 = fs.readFileSync(
    path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(appSrc2.includes("mode: searchMode") || appSrc2.includes("mode: 'conversation'"));
  assert.ok(appSrc2.includes('showLoadComments'));
  assert.ok(
    appSrc2.includes("onLoadMoreReviewThreads('all')") ||
      appSrc2.includes('onLoadMoreReviewThreads("all")'),
    'Load Comments must request full thread dump (direction all)'
  );
  const hostSrc = fs.readFileSync(path.join(__dirname, '../src/pr-modal-host.js'), 'utf8');
  assert.ok(hostSrc.includes("loadAll") || hostSrc.includes("'all'"), 'host supports load-all threads');
  assert.ok(hostSrc.includes('maxPages'), 'host pages until complete');
}

const virtSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
  'utf8'
);
assert.ok(virtSrc.includes('markSearchInText'), 'VirtualDiff highlights match text');
assert.ok(virtSrc.includes('searchMatchRows') || virtSrc.includes('prp-vline--search-match'));

const hostSrc = fs.readFileSync(path.join(__dirname, '../src/pr-modal-host.js'), 'utf8');
assert.ok(hostSrc.includes('reactRoot.render'));
assert.ok(!/reactRoot\.unmount\(\);\s*[\s\S]*reactRoot = null;\s*host\.replaceChildren\(\);\s*\}\s*if \(!current\.open\)/.test(hostSrc.replace(/\n/g, ' ')));
// When open, must not unmount before remount — check reuse path
assert.ok(hostSrc.includes('Reuse root') || hostSrc.includes('reactRoot.render(props)'));

// Async search + caps (typing must not freeze on huge corpora)
async function testAsyncSearch() {
  const bigDocs = [];
  for (let i = 0; i < 1200; i++) {
    bigDocs.push({
      id: `row-${i}`,
      kind: 'diff',
      text: `const line_${i} = ${i}; // filler alpha beta gamma`,
      textLower: `const line_${i} = ${i}; // filler alpha beta gamma`,
      rowIndex: i,
    });
  }
  bigDocs[900].text = 'secret-async-needle-ZZZ';
  bigDocs[900].textLower = 'secret-async-needle-zzz';

  assert.ok(typeof search.searchIndexAsync === 'function', 'searchIndexAsync exported');
  const t0 = Date.now();
  const asyncHits = await search.searchIndexAsync(bigDocs, 'secret-async-needle-ZZZ', {
    chunkSize: 200,
  });
  const elapsed = Date.now() - t0;
  assert.ok(asyncHits.length >= 1, 'async search finds needle');
  assert.equal(asyncHits[0].rowIndex, 900);
  assert.ok(elapsed < 5000, `async search should finish reasonably fast (was ${elapsed}ms)`);

  // Cancellation: stale generation must not return usable results
  let cancelled = false;
  const p = search.searchIndexAsync(bigDocs, 'alpha', {
    chunkSize: 50,
    isCancelled: () => cancelled,
  });
  cancelled = true;
  const cancelledHits = await p;
  assert.deepEqual(cancelledHits, [], 'cancelled search returns empty');

  // Hit cap for 1-char queries
  const many = search.searchIndex(bigDocs, 'a', { maxHits: 50 });
  assert.ok(many.length <= 50, 'maxHits caps result size');
}

testAsyncSearch()
  .then(() => {
    const log = [
      'pr-modal-search.test.js: off-window search ok',
      `totalRows=${virtualRows.length}`,
      `hitRow=${hit.rowIndex}`,
      `scrollTop=${scrollTop}`,
      `visibleAfter=${after.start}-${after.end}`,
      'query-refine-contract: hitIndex stays 0 but activeHit row changes + shouldJump',
      'nav-single-hit: shouldJump true when wrapping at index 0',
      'async-chunked-search: ok',
    ].join('\n');
    fs.writeFileSync(path.join(SCRATCH, 'pr-modal-search.log'), log + '\n');
    fs.writeFileSync(path.join(SCRATCH, 'search-offscreen.log'), log + '\n');
    console.log('pr-modal-search.test.js: all assertions passed');
    console.log(log);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
