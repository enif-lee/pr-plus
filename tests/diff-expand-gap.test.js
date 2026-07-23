/**
 * Diff middle-expand: controls live on @@ hunk rows (right side).
 */
const assert = require('node:assert/strict');
const {
  flattenFilesToVirtualRows,
  mergeLineRanges,
  resolveExpandRange,
  DIFF_EXPAND_CHUNK,
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
  // First @@ is -1,3 +1,3 (symmetric) → hidden/omitted; second is asymmetric + gap
  const hunks = rows.filter((r) => r.lineType === 'hunk');
  assert.equal(hunks.length, 1, 'only asymmetric second hunk is listed');
  assert.ok(hunks[0].expandAbove, 'second hunk carries expandAbove');
  assert.equal(hunks[0].expandAbove.gapStartNew, 4);
  assert.equal(hunks[0].expandAbove.gapEndNew, 19);
  assert.equal(hunks[0].expandAbove.hiddenCount, 16);
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

// resolveExpandRange directions
{
  const gap = { gapStartNew: 10, gapEndNew: 40, expandChunk: 20 };
  assert.deepEqual(resolveExpandRange('all', gap), { start: 10, end: 40 });
  assert.deepEqual(resolveExpandRange('down', gap), { start: 10, end: 29 });
  assert.deepEqual(resolveExpandRange('up', gap), { start: 21, end: 40 });
  assert.equal(DIFF_EXPAND_CHUNK, 20);
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

// UI wiring: controls on hunk row, not expand-gap kind
{
  const fs = require('node:fs');
  const path = require('node:path');
  const virt = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
    'utf8'
  );
  assert.ok(virt.includes('HunkExpandControls') || virt.includes('prp-hunk-expand'));
  assert.ok(virt.includes('expandAbove'));
  assert.ok(!virt.includes("kind === 'expand-gap'"));
  const css = fs.readFileSync(
    path.join(__dirname, '../src/modal/styles.css'),
    'utf8'
  );
  assert.ok(css.includes('.prp-hunk-expand'));
  assert.ok(css.includes('.prp-hunk-expand-rail'));
}

console.log('diff-expand-gap.test.js: all assertions passed');
