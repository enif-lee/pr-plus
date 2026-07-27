/**
 * Review-filter ⌥U/R/P toggles + Goto parse + selection move helpers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  resolveModalShortcutAction,
  toggleReviewFilter,
  REVIEW_FILTER_SHORTCUT,
} = require('../src/modal/lib/shortcut-policy.ts');
const {
  parseGotoQuery,
  selectionFromGoto,
  moveLineSelection,
  beginLineSelection,
  normalizeSelection,
  isSelectableDiffRow,
  isFileCollapsedInVirtualRows,
  resolvePendingGotoSelection,
  resolveGotoPathAmongFiles,
} = require('../src/modal/lib/line-selection.ts');

// --- toggleReviewFilter ---
assert.equal(toggleReviewFilter(null, 'unresolved'), 'unresolved');
assert.equal(toggleReviewFilter('unresolved', 'unresolved'), null);
assert.equal(toggleReviewFilter('unresolved', 'resolved'), 'resolved');
assert.equal(toggleReviewFilter('pending', 'pending'), null);
assert.equal(toggleReviewFilter(null, 'pending'), 'pending');

// --- shortcut resolve Diff-only ---
for (const [key, code, action] of [
  ['u', 'KeyU', REVIEW_FILTER_SHORTCUT.unresolved.action],
  ['r', 'KeyR', REVIEW_FILTER_SHORTCUT.resolved.action],
  ['p', 'KeyP', REVIEW_FILTER_SHORTCUT.pending.action],
]) {
  assert.equal(
    resolveModalShortcutAction({
      mod: false,
      alt: true,
      shift: false,
      key,
      code,
      layoutMode: 'diff',
      editableTarget: false,
    }),
    action,
    `${key} on Diff`
  );
  assert.equal(
    resolveModalShortcutAction({
      mod: false,
      alt: true,
      shift: false,
      key,
      code,
      layoutMode: 'conversation',
      editableTarget: false,
    }),
    null,
    `${key} not on conversation`
  );
  assert.equal(
    resolveModalShortcutAction({
      mod: false,
      alt: true,
      shift: false,
      key,
      code,
      layoutMode: 'diff',
      editableTarget: true,
    }),
    null,
    `${key} blocked while typing`
  );
}

// opt+shift+r still viewed toggle (not resolved filter)
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'r',
    code: 'KeyR',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'toggleViewedActiveFile'
);

// --- parseGotoQuery ---
assert.deepEqual(parseGotoQuery('12'), {
  path: null,
  startLine: 12,
  endLine: null,
});
assert.deepEqual(parseGotoQuery('10:20'), {
  path: null,
  startLine: 10,
  endLine: 20,
});
assert.deepEqual(parseGotoQuery('src/a.ts:5'), {
  path: 'src/a.ts',
  startLine: 5,
  endLine: null,
});
assert.deepEqual(parseGotoQuery('src/a.ts:5:12'), {
  path: 'src/a.ts',
  startLine: 5,
  endLine: 12,
});
assert.equal(parseGotoQuery(''), null);
assert.equal(parseGotoQuery('nope'), null);

// --- selectionFromGoto + moveLineSelection ---
function row(filePath, rowIndex, newLine, lineType = 'context') {
  return {
    kind: 'diff-line',
    lineType,
    filePath,
    rowIndex,
    newLine,
    oldLine: newLine,
  };
}
const rows = [
  { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
  row('a.ts', 1, 1, 'add'),
  row('a.ts', 2, 2, 'context'),
  row('a.ts', 3, 3, 'context'),
  row('a.ts', 4, 4, 'del'),
  { kind: 'file-header', filePath: 'b.ts', rowIndex: 5 },
  row('b.ts', 6, 1, 'add'),
];

const single = selectionFromGoto(rows, 'a.ts', 2, null);
assert.ok(single);
assert.equal(single.anchorLine, 2);
assert.equal(single.headLine, 2);
assert.equal(single.anchorRowIndex, 2);

const range = selectionFromGoto(rows, 'a.ts', 2, 4);
assert.ok(range);
assert.equal(range.anchorRowIndex, 2);
assert.equal(range.headRowIndex, 4);
const norm = normalizeSelection(range);
assert.equal(norm.multi, true);
assert.equal(norm.startLine, 2);
assert.equal(norm.endLine, 4);

// plain move → single line at next
const moved = moveLineSelection(single, rows, 1, { shift: false });
assert.equal(moved.headLine, 3);
assert.equal(moved.anchorLine, 3);
assert.equal(moved.anchorRowIndex, moved.headRowIndex);

// shift extend
const extended = moveLineSelection(single, rows, 1, { shift: true });
assert.equal(extended.anchorLine, 2);
assert.equal(extended.headLine, 3);
assert.notEqual(extended.anchorRowIndex, extended.headRowIndex);

// plain after range collapses to single at head direction
const collapsed = moveLineSelection(extended, rows, 1, { shift: false });
assert.equal(collapsed.anchorLine, collapsed.headLine);
assert.equal(collapsed.headLine, 4);

// --- selection keyboard resolve ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: false,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    hasLineSelection: true,
    editableTarget: false,
  }),
  'moveSelectionDown'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: false,
    shift: true,
    key: 'ArrowUp',
    code: 'ArrowUp',
    layoutMode: 'diff',
    hasLineSelection: true,
    editableTarget: false,
  }),
  'extendSelectionUp'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: false,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    hasLineSelection: false,
    editableTarget: false,
  }),
  'moveSelectionDown',
  'arrows seed first line when no selection (after file nav)'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: false,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    hasLineSelection: false,
    editableTarget: true,
  }),
  null,
  'no steal arrows while typing'
);

// --- Goto across collapsed → expanded virtual rows (App apply pattern) ---
{
  const collapsedRows = [
    {
      kind: 'file-header',
      filePath: 'src/a.ts',
      rowIndex: 0,
      collapsed: true,
    },
  ];
  assert.equal(
    isFileCollapsedInVirtualRows(collapsedRows, 'src/a.ts'),
    true
  );
  const pending = { path: 'src/a.ts', startLine: 2, endLine: 4 };
  assert.equal(
    resolvePendingGotoSelection(collapsedRows, pending).status,
    'waiting',
    'collapsed: wait for expand'
  );
  // Immediate selectionFromGoto fails on collapsed rows (the race bug)
  assert.equal(
    selectionFromGoto(collapsedRows, 'src/a.ts', 2, 4),
    null,
    'no selection while collapsed'
  );

  const expandedRows = [
    { kind: 'file-header', filePath: 'src/a.ts', rowIndex: 0, collapsed: false },
    row('a.ts'.replace('a.ts', 'src/a.ts'), 1, 1, 'add'),
    row('src/a.ts', 2, 2, 'context'),
    row('src/a.ts', 3, 3, 'context'),
    row('src/a.ts', 4, 4, 'del'),
  ];
  // fix paths properly
  const expanded = [
    { kind: 'file-header', filePath: 'src/a.ts', rowIndex: 0, collapsed: false },
    {
      kind: 'diff-line',
      lineType: 'add',
      filePath: 'src/a.ts',
      rowIndex: 1,
      newLine: 1,
      oldLine: null,
    },
    {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'src/a.ts',
      rowIndex: 2,
      newLine: 2,
      oldLine: 1,
    },
    {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'src/a.ts',
      rowIndex: 3,
      newLine: 3,
      oldLine: 2,
    },
    {
      kind: 'diff-line',
      lineType: 'del',
      filePath: 'src/a.ts',
      rowIndex: 4,
      newLine: null,
      oldLine: 3,
    },
  ];
  // wait: line 4 del has oldLine only - findSelectable prefers RIGHT. use lines 2-3
  const afterExpand = resolvePendingGotoSelection(expanded, {
    path: 'src/a.ts',
    startLine: 2,
    endLine: 3,
  });
  assert.equal(afterExpand.status, 'ready');
  assert.ok(afterExpand.selection);
  assert.equal(afterExpand.selection.anchorRowIndex, 2);
  assert.equal(afterExpand.selection.headRowIndex, 3);

  // Expanded but missing line
  assert.equal(
    resolvePendingGotoSelection(expanded, {
      path: 'src/a.ts',
      startLine: 999,
      endLine: null,
    }).status,
    'missing'
  );

  // Path resolution among files
  assert.equal(
    resolveGotoPathAmongFiles(
      'a.ts',
      null,
      [{ path: 'src/a.ts' }, { filename: 'src/b.ts' }]
    ),
    'src/a.ts'
  );
  assert.equal(
    resolveGotoPathAmongFiles(null, 'cur.ts', [{ path: 'x.ts' }]),
    'cur.ts'
  );
}

// --- expandPathInCollapsedSet: sole viewed file must stay expanded ---
{
  const {
    expandPathInCollapsedSet,
    isPathCollapsed,
    materializeCollapsedPaths,
  } = require('../src/modal/lib/collapse.ts');
  const files = [{ path: 'solo.ts', defaultCollapsed: false }];
  const viewed = new Set(['solo.ts']);
  // Implicit collapse via empty set + viewed
  assert.equal(
    isPathCollapsed('solo.ts', new Set(), false, false, viewed),
    true
  );
  const expanded = expandPathInCollapsedSet(new Set(), 'solo.ts', files, viewed);
  assert.equal(
    isPathCollapsed('solo.ts', expanded, false, false, viewed),
    false,
    'sole viewed file stays expanded after Goto expand'
  );
  // Naive materialize+delete leaves empty set → re-collapses
  const naive = materializeCollapsedPaths(new Set(), files, viewed);
  naive.delete('solo.ts');
  assert.equal(naive.size, 0);
  assert.equal(
    isPathCollapsed('solo.ts', naive, false, false, viewed),
    true,
    'documents the empty-set trap naive expand would hit'
  );
}

// --- structure: pending goto re-apply after expand ---
const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
const float = fs.readFileSync(
  path.join(root, 'src/modal/views/diff/DiffFloatingController.tsx'),
  'utf8'
);
assert.ok(app.includes("case 'toggleReviewFilterUnresolved'"));
assert.ok(app.includes("case 'toggleReviewFilterResolved'"));
assert.ok(app.includes("case 'toggleReviewFilterPending'"));
assert.ok(app.includes("case 'moveSelectionDown'"));
assert.ok(app.includes("case 'extendSelectionUp'"));
assert.ok(app.includes('applyGotoQuery'));
assert.ok(app.includes('pendingGotoRef'));
assert.ok(app.includes('resolvePendingGotoSelection'));
assert.ok(app.includes('onGoto='));
assert.ok(float.includes('prp-diff-float-nav__goto'));
assert.ok(float.includes('onGoto'));
assert.ok(float.includes('path:line'));

console.log('review-filter-goto.test.js: all assertions passed');
console.log('review-filter-toggle=true');
console.log('goto-parse=true');
console.log('selection-move=true');
console.log('goto-collapsed-expand=true');
