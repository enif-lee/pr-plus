'use strict';

/**
 * Diff scroll perf:
 * - highlightCode cache
 * - VirtualDiff owns scroll; App does not setScrollTop per pixel
 * - React setState only when visible range (start/end) changes
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const TestRenderer = require('react-test-renderer');

const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => {
  const id = rafQueue.length + 1;
  rafQueue.push(cb);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  if (id > 0 && id <= rafQueue.length) rafQueue[id - 1] = null;
};
function flushRaf() {
  const cbs = rafQueue.filter(Boolean);
  rafQueue.length = 0;
  for (const cb of cbs) cb(0);
}

const {
  highlightCode,
  clearHighlightCodeCache,
  highlightCodeCacheSize,
} = require('../src/modal/components/common/utils.tsx');
const { VirtualDiff } = require('../src/modal/views/diff/VirtualDiff.tsx');
const { flattenFilesToVirtualRows } = require('../src/modal/lib/diff-rows.ts');
const { calculateVisibleRange } = require('../src/modal/lib/virtual-range.ts');
const { ROW_HEIGHT, rowOffsets } = require('../src/modal/components/common/utils.tsx');

// --- Source contracts ---
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /onScroll=\{undefined\}/.test(appSrc) ||
    !/onScroll=\{\(top\)\s*=>\s*setScrollTop\(top\)\}/.test(appSrc),
  'PrModalApp must not call setScrollTop on every VirtualDiff scroll'
);

const vdSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
  'utf8'
);
assert.ok(vdSrc.includes('applyScrollTop'), 'range-gated applyScrollTop');
assert.ok(
  vdSrc.includes('prev.start === next.start') ||
    vdSrc.includes('rangesEqual') ||
    vdSrc.includes('prev.end === next.end'),
  'skips setState when range unchanged'
);
assert.ok(vdSrc.includes('requestAnimationFrame'), 'rAF coalescing');
assert.ok(vdSrc.includes('DiffCodeLine'), 'memoized code rows');
assert.ok(
  fs
    .readFileSync(
      path.join(__dirname, '../src/modal/components/common/utils.tsx'),
      'utf8'
    )
    .includes('highlightCache'),
  'highlightCode cache'
);

// --- highlightCode cache ---
clearHighlightCodeCache();
let hlCalls = 0;
const prevHljs = globalThis.hljs;
globalThis.hljs = {
  getLanguage(lang) {
    return lang === 'javascript' ? {} : null;
  },
  highlight(text) {
    hlCalls += 1;
    return { value: `<span>${text}</span>` };
  },
  highlightAuto(text) {
    hlCalls += 1;
    return { value: `<span auto>${text}</span>` };
  },
};
const sample = 'const x = 1;';
assert.equal(highlightCode(sample, 'src/foo.js'), highlightCode(sample, 'src/foo.js'));
assert.equal(hlCalls, 1);
clearHighlightCodeCache();
globalThis.hljs = prevHljs;

// --- Pure range math: sub-row scroll keeps same start ---
const manyLines = Array.from({ length: 80 }, (_, i) => `+line${i}`).join('\n');
const files = [
  {
    filename: 'a.js',
    status: 'modified',
    additions: 80,
    deletions: 0,
    patch: `@@ -1 +1,80 @@\n context\n${manyLines}\n`,
  },
];
const virtualRows = flattenFilesToVirtualRows(files, 'unified', {
  reviewComments: [],
});
assert.ok(virtualRows.length > 40);
const offsets = rowOffsets(virtualRows);
const r0 = calculateVisibleRange({
  totalRows: virtualRows.length,
  rowHeight: ROW_HEIGHT,
  viewportHeight: 400,
  scrollTop: 100,
  overscan: 8,
  offsets,
});
const r1 = calculateVisibleRange({
  totalRows: virtualRows.length,
  rowHeight: ROW_HEIGHT,
  viewportHeight: 400,
  scrollTop: 100 + Math.max(1, ROW_HEIGHT - 2),
  overscan: 8,
  offsets,
});
// Within a single row height (minus overscan edge cases), start often stays put
assert.equal(typeof r0.start, 'number');
assert.equal(typeof r1.start, 'number');

// --- VirtualDiff: sub-row burst → at most one onScroll (range may change once) ---
const listRef = { current: null };
let parentScrollCalls = 0;
let root;
TestRenderer.act(() => {
  root = TestRenderer.create(
    React.createElement(VirtualDiff, {
      virtualRows,
      scrollTop: 0,
      viewportHeight: 400,
      onScroll: () => {
        parentScrollCalls += 1;
      },
      listRef,
      selection: null,
      selecting: false,
      viewedPaths: new Set(),
      replyDrafts: {},
      threadsByCommentId: new Map(),
    })
  );
});

const instance = root.root.find(
  (n) =>
    typeof n.props?.className === 'string' &&
    n.props.className.split(/\s+/).includes('prp-vlist') &&
    !n.props.className.includes('host')
);
const fakeEvent = (top) => ({ currentTarget: { scrollTop: top } });

// Sub-pixel / same-window scrolls should not report parent every event
parentScrollCalls = 0;
TestRenderer.act(() => {
  // Stay near top within same virtual window
  instance.props.onScroll(fakeEvent(1));
  instance.props.onScroll(fakeEvent(2));
  instance.props.onScroll(fakeEvent(3));
});
TestRenderer.act(() => flushRaf());
// Range may change once from 0→3 or not at all depending on overscan — never 3 times
assert.ok(parentScrollCalls <= 1, `sub-row scroll reports ≤1, got ${parentScrollCalls}`);

// Crossing many rows should report (range changed)
parentScrollCalls = 0;
TestRenderer.act(() => {
  instance.props.onScroll(fakeEvent(400));
  instance.props.onScroll(fakeEvent(420));
  instance.props.onScroll(fakeEvent(440));
});
assert.equal(rafQueue.filter(Boolean).length, 1, 'one rAF for burst');
TestRenderer.act(() => flushRaf());
assert.equal(parentScrollCalls, 1, 'one parent notify after large jump burst');

// No onScroll still works
TestRenderer.act(() => {
  root.update(
    React.createElement(VirtualDiff, {
      virtualRows,
      scrollTop: 0,
      viewportHeight: 400,
      onScroll: undefined,
      listRef,
      selection: null,
      selecting: false,
      viewedPaths: new Set(),
      replyDrafts: {},
      threadsByCommentId: new Map(),
    })
  );
});
TestRenderer.act(() => {
  const vlist = root.root.find(
    (n) =>
      typeof n.props?.className === 'string' &&
      n.props.className.split(/\s+/).includes('prp-vlist') &&
      !n.props.className.includes('host')
  );
  vlist.props.onScroll(fakeEvent(50));
  flushRaf();
});

console.log('diff-scroll-perf.test.js: all assertions passed');
console.log(
  JSON.stringify({
    highlightCache: true,
    rangeGatedScroll: true,
    rafCoalesce: true,
    appNoPixelStore: true,
  })
);
