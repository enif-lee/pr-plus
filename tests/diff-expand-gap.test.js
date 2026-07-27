/**
 * Diff middle-expand: controls live on @@ hunk rows (right side).
 * Dual-edge expand kept; each edge mounts only local partial + Expand all.
 * Unified rows expose oldLine/newLine for dual gutter.
 */
const assert = require('node:assert/strict');
const {
  flattenFilesToVirtualRows,
  mergeLineRanges,
  resolveExpandRange,
  DIFF_EXPAND_CHUNK,
  expandControlKinds,
  makeExpandBusyKey,
  expandBusyPrefix,
  expandBusyMatches,
} = require('../src/modal/lib/diff-rows.ts');

// Two hunks with a gap of new-file lines 4..19
const files = [
  {
    filename: 'a.js',
    status: 'modified',
    additions: 2,
    deletions: 0,
    patch: [
      '@@ -1,3 +1,3 @@',
      ' one',
      ' two',
      ' three',
      '@@ -20,3 +20,4 @@',
      ' twenty',
      '+added',
      ' twenty-one',
      ' twenty-two',
    ].join('\n'),
  },
];

{
  const rows = flattenFilesToVirtualRows(files, 'unified', { expandAll: true });
  assert.ok(
    !rows.some((r) => r.kind === 'expand-gap'),
    'no separate expand-gap rows'
  );
  // Middle gap: single chrome on next @@ expandAbove (▼ | Expand all | ▲)
  const withAbove = rows.filter((r) => r.expandAbove);
  assert.ok(withAbove.length >= 1, 'next hunk has expandAbove');
  assert.ok(
    !rows.some((r) => r.expandBelow),
    'middle gap not also on expandBelow'
  );
  const gapAbove = withAbove[0].expandAbove;
  assert.equal(gapAbove.gapStartNew, 4);
  assert.equal(gapAbove.gapEndNew, 19);
  assert.equal(gapAbove.hiddenCount, 16);
}

// Expanding a range materializes context; expandAbove shrinks/goes away
{
  const lines = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`);
  const ranges = mergeLineRanges([], 4, 19);
  const rows = flattenFilesToVirtualRows(files, 'unified', {
    expandAll: true,
    expandedRanges: new Map([['a.js', ranges]]),
    fileLineTexts: new Map([['a.js', lines]]),
  });
  const hunks = rows.filter((r) => r.lineType === 'hunk');
  assert.ok(
    !hunks.some((h) => h.expandAbove),
    'fully expanded gap clears expandAbove'
  );
  const ctx = rows.filter(
    (r) =>
      r.kind === 'diff-line' &&
      r.lineType === 'context' &&
      r.newLine >= 4 &&
      r.newLine <= 19
  );
  assert.equal(ctx.length, 16);
  assert.equal(ctx[0].code, 'line-4');
}

// resolveExpandRange directions — front vs back of gap must differ
{
  const gap = { gapStartNew: 10, gapEndNew: 40, expandChunk: 20 };
  assert.deepEqual(resolveExpandRange('all', gap), { start: 10, end: 40 });
  assert.deepEqual(resolveExpandRange('down', gap), { start: 10, end: 29 });
  assert.deepEqual(resolveExpandRange('up', gap), { start: 21, end: 40 });
  assert.deepEqual(resolveExpandRange('fromStart', gap), { start: 10, end: 29 });
  assert.deepEqual(resolveExpandRange('fromEnd', gap), { start: 21, end: 40 });
  assert.notDeepEqual(
    resolveExpandRange('fromStart', gap),
    resolveExpandRange('fromEnd', gap),
    'front and back of gap must load different line ranges'
  );
  assert.equal(DIFF_EXPAND_CHUNK, 20);
}

// Sequential expand from opposite ends leaves the middle remaining
{
  const gap = { gapStartNew: 3, gapEndNew: 49, expandChunk: 10 };
  const front = resolveExpandRange('fromStart', gap);
  const back = resolveExpandRange('fromEnd', gap);
  assert.deepEqual(front, { start: 3, end: 12 });
  assert.deepEqual(back, { start: 40, end: 49 });
  // After expanding front, remaining gap's back edge still targets the file end
  const rem = { gapStartNew: 13, gapEndNew: 49, expandChunk: 10 };
  assert.deepEqual(resolveExpandRange('fromEnd', rem), { start: 40, end: 49 });
  assert.deepEqual(resolveExpandRange('fromStart', rem), { start: 13, end: 22 });
}

// mergeLineRanges coalesces
{
  assert.deepEqual(mergeLineRanges([{ start: 1, end: 5 }], 6, 8), [
    { start: 1, end: 8 },
  ]);
}

// Symmetric @@ -N,M +N,M @@ headers are omitted from the row list
{
  const same = flattenFilesToVirtualRows(
    [
      {
        filename: 's.js',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: [
          '@@ -7,11 +7,11 @@',
          ' keep',
          '-old',
          '+new',
          ' keep2',
        ].join('\n'),
      },
    ],
    'unified',
    { expandAll: true }
  );
  assert.ok(
    !same.some((r) => r.lineType === 'hunk' && !r.hidden),
    'symmetric hunk header not shown as visible hunk'
  );
  assert.ok(
    !same.some((r) => r.lineType === 'hunk' && !r.expandAbove && !r.expandBelow),
    'symmetric hunk without expand controls not in rows'
  );
  assert.ok(
    same.some((r) => r.lineType === 'add' || r.lineType === 'del'),
    'hunk body lines still present'
  );
}

// Asymmetric @@ -7,11 +8,12 @@ stays visible
{
  const asym = flattenFilesToVirtualRows(
    [
      {
        filename: 'a.js',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: ['@@ -7,11 +8,12 @@', ' x', '+y'].join('\n'),
      },
    ],
    'unified',
    { expandAll: true }
  );
  const hunk = asym.find((r) => r.lineType === 'hunk');
  assert.ok(hunk && !hunk.hidden, 'asymmetric hunk header remains visible');
}

// GitHub-style control composition: ▼ | Expand all | ▲ (both sides + full gap)
{
  const big = { hiddenCount: 61, expandChunk: 20 };
  assert.deepEqual(expandControlKinds('below', big), [
    'fromStart',
    'all',
    'fromEnd',
  ]);
  assert.deepEqual(expandControlKinds('above', big), [
    'fromStart',
    'all',
    'fromEnd',
  ]);
  // Small gap: Expand N only (no partial sides)
  assert.deepEqual(expandControlKinds('below', { hiddenCount: 12, expandChunk: 20 }), [
    'all',
  ]);
  assert.deepEqual(expandControlKinds('above', { hiddenCount: 12, expandChunk: 20 }), [
    'all',
  ]);
  assert.deepEqual(expandControlKinds('above', { hiddenCount: 0 }), []);
  // Expand all is the middle kind when partials present
  const kinds = expandControlKinds('above', big);
  assert.equal(kinds[0], 'fromStart');
  assert.equal(kinds[1], 'all');
  assert.equal(kinds[2], 'fromEnd');
}

// Busy key matches gap identity for partial directions (not sub-range only)
{
  const gap = { gapStartNew: 10, gapEndNew: 40, expandChunk: 20 };
  const path = 'a.js';
  const fromStartRange = resolveExpandRange('fromStart', gap);
  assert.deepEqual(fromStartRange, { start: 10, end: 29 });
  // Old broken key used expanded sub-range — must NOT be required for match
  const badKey = `${path}:${fromStartRange.start}-${fromStartRange.end}:fromStart`;
  const goodKey = makeExpandBusyKey(path, gap, 'fromStart');
  assert.equal(goodKey, 'a.js:10-40:fromStart');
  assert.ok(expandBusyMatches(goodKey, path, gap));
  assert.ok(
    expandBusyMatches(makeExpandBusyKey(path, gap, 'fromEnd'), path, gap),
    'fromEnd busy disables same gap controls'
  );
  assert.ok(expandBusyMatches(makeExpandBusyKey(path, gap, 'all'), path, gap));
  // Different gap on same file must not match
  assert.equal(
    expandBusyMatches(goodKey, path, { gapStartNew: 50, gapEndNew: 80 }),
    false
  );
  assert.ok(expandBusyPrefix(path, gap) === 'a.js:10-40:');
  assert.ok(goodKey.startsWith(expandBusyPrefix(path, gap)));
  // Sub-range key does not share gap prefix when start differs mid-gap expand
  const midKey = `${path}:21-40:fromEnd`;
  // midKey does start with a.js:21-40: not a.js:10-40: — correctly non-match for gap 10-40
  assert.equal(expandBusyMatches(midKey, path, gap), false);
  assert.equal(expandBusyMatches(badKey, path, gap), false);
  // App must use makeExpandBusyKey(path, gap, dir) not range-based key
  const app = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(app.includes('makeExpandBusyKey'), 'app uses gap-identity busy key');
}

// Dual-edge sequential expand: fromStart then fromEnd leaves middle; all clears
{
  // File ends at last hunk body so only the middle gap exists (no trailing expand)
  const lines = Array.from({ length: 53 }, (_, i) => `L${i + 1}`);
  const multi = [
    {
      filename: 'm.py',
      status: 'modified',
      additions: 2,
      deletions: 0,
      patch: [
        '@@ -1,3 +1,3 @@',
        ' L1',
        ' L2',
        ' L3',
        '@@ -50,3 +50,4 @@',
        ' L50',
        '+added',
        ' L51',
        ' L52',
      ].join('\n'),
    },
  ];
  // Gap new lines 4..49 between hunks
  let ranges = [];
  let rows = flattenFilesToVirtualRows(multi, 'unified', {
    expandAll: true,
    expandedRanges: new Map([['m.py', ranges]]),
    fileLineTexts: new Map([['m.py', lines]]),
  });
  // Middle gap mounts once on next hunk expandAbove (▼|all|▲ chrome)
  const withAbove = rows.find((r) => r.expandAbove);
  assert.ok(withAbove, 'middle gap on expandAbove');
  assert.ok(
    !rows.some((r) => r.expandBelow),
    'middle gap not dual-mounted on expandBelow'
  );
  const gap0 = withAbove.expandAbove;
  assert.ok(gap0.hiddenCount > 20, 'multi-chunk gap');
  // Both directions still available via control kinds / resolveExpandRange
  assert.notDeepEqual(
    resolveExpandRange('fromStart', gap0),
    resolveExpandRange('fromEnd', gap0)
  );
  assert.deepEqual(expandControlKinds('above', gap0), [
    'fromStart',
    'all',
    'fromEnd',
  ]);

  // Front edge expand (▼)
  const front = resolveExpandRange('fromStart', gap0);
  ranges = mergeLineRanges(ranges, front.start, front.end);
  rows = flattenFilesToVirtualRows(multi, 'unified', {
    expandAll: true,
    expandedRanges: new Map([['m.py', ranges]]),
    fileLineTexts: new Map([['m.py', lines]]),
  });
  let rem = rows.find((r) => r.expandAbove)?.expandAbove;
  assert.ok(rem, 'gap remains after fromStart');
  assert.ok(rem.gapStartNew > gap0.gapStartNew, 'front advanced');

  // Back edge expand (▲) on remaining
  const back = resolveExpandRange('fromEnd', rem);
  ranges = mergeLineRanges(ranges, back.start, back.end);
  rows = flattenFilesToVirtualRows(multi, 'unified', {
    expandAll: true,
    expandedRanges: new Map([['m.py', ranges]]),
    fileLineTexts: new Map([['m.py', lines]]),
  });
  rem = rows.find((r) => r.expandAbove)?.expandAbove;
  assert.ok(rem, 'middle remains after both edge expands');
  assert.ok(rem.gapEndNew < gap0.gapEndNew, 'back shrunk');

  // Expand all remaining (middle button semantics)
  const allRem = resolveExpandRange('all', rem);
  ranges = mergeLineRanges(ranges, allRem.start, allRem.end);
  rows = flattenFilesToVirtualRows(multi, 'unified', {
    expandAll: true,
    expandedRanges: new Map([['m.py', ranges]]),
    fileLineTexts: new Map([['m.py', lines]]),
  });
  assert.ok(
    !rows.some((r) => r.expandAbove || r.expandBelow),
    'Expand all remaining clears middle gap'
  );
  // Context materialized; add line still present (unrelated hunk body intact)
  assert.ok(rows.some((r) => r.lineType === 'add'));
  assert.ok(
    rows.some(
      (r) =>
        r.lineType === 'context' && r.newLine >= 4 && r.newLine <= 49 && r.code
    ),
    'expanded context present in virtual rows'
  );
}

// Unified rows expose old/new line numbers for dual gutter (add/del/context)
{
  const rows = flattenFilesToVirtualRows(
    [
      {
        filename: 'u.js',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: [
          '@@ -10,4 +10,4 @@',
          ' keep',
          '-old',
          '+new',
          ' keep2',
        ].join('\n'),
      },
    ],
    'unified',
    { expandAll: true }
  );
  const ctx = rows.find((r) => r.lineType === 'context' && r.code === 'keep');
  const del = rows.find((r) => r.lineType === 'del');
  const add = rows.find((r) => r.lineType === 'add');
  assert.ok(ctx && ctx.oldLine != null && ctx.newLine != null, 'context dual LNs');
  assert.equal(ctx.oldLine, 10);
  assert.equal(ctx.newLine, 10);
  assert.ok(del && del.oldLine != null, 'del has old line');
  assert.equal(del.newLine, null, 'del has no new line (blank gutter side)');
  assert.ok(add && add.newLine != null, 'add has new line');
  assert.equal(add.oldLine, null, 'add has no old line (blank gutter side)');
}

// UI wiring: controls on hunk row; placement-local; unified gutter classes
{
  const fs = require('node:fs');
  const path = require('node:path');
  const virt = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
    'utf8'
  );
  assert.ok(virt.includes('HunkExpandControls') || virt.includes('prp-hunk-expand'));
  assert.ok(virt.includes('expandAbove'));
  assert.ok(virt.includes('expandBelow'));
  assert.ok(virt.includes('fromStart') && virt.includes('fromEnd'));
  assert.ok(virt.includes('expandControlKinds'));
  assert.ok(virt.includes('prp-unified-lns'));
  assert.ok(virt.includes('prp-unified-ln--old'));
  assert.ok(virt.includes('prp-unified-ln--new'));
  assert.ok(virt.includes('data-old-line'));
  assert.ok(!virt.includes("kind === 'expand-gap'"));
  // GitHub-style: side dir buttons + middle Expand all
  assert.ok(virt.includes("data-expand-dir=\"fromStart\""));
  assert.ok(virt.includes("data-expand-dir=\"fromEnd\""));
  assert.ok(virt.includes("data-expand-dir=\"all\""));
  assert.ok(virt.includes('prp-hunk-expand__btn--dir'));
  const css = fs.readFileSync(
    path.join(__dirname, '../src/modal/styles.css'),
    'utf8'
  );
  assert.ok(css.includes('.prp-hunk-expand'));
  assert.ok(css.includes('.prp-hunk-expand-rail'));
  assert.ok(css.includes('.prp-unified-lns'));
  assert.ok(css.includes('.prp-unified-ln--old'));
  assert.ok(css.includes('.prp-hunk-expand + .prp-hunk-expand'));
}

console.log('diff-expand-gap.test.js: all assertions passed');
console.log(
  'expand-trio=true (▼|all|▲) unified-ln=true busy-gap-id=true single-gap-mount=true'
);
