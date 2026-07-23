/**
 * Overlay floating scrollbar metrics (no native gutter).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  floatingScrollbarMetrics,
  scrollTopFromThumbDrag,
  FLOATING_SCROLLBAR_IDLE_MS,
} = require('../src/modal/lib/floating-scrollbar.ts');

// No overflow → no thumb
{
  const m = floatingScrollbarMetrics(0, 400, 400);
  assert.equal(m.needed, false);
}

// Overflow → thumb scales with viewport/content
{
  const m = floatingScrollbarMetrics(0, 400, 800);
  assert.equal(m.needed, true);
  assert.equal(m.thumbHeight, 200); // 400/800 * 400
  assert.equal(m.thumbTop, 0);
}

// Mid-scroll
{
  const m = floatingScrollbarMetrics(200, 400, 800);
  assert.equal(m.needed, true);
  assert.equal(m.thumbTop, 100); // half of maxTop (400-200)
}

// Drag maps pointer into scroll range
{
  const top = scrollTopFromThumbDrag(100, 200, 400, 800);
  assert.ok(top >= 0 && top <= 400);
}

// CSS: native bar killed, custom float present
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
assert.ok(css.includes('.prp-scroll-float'));
assert.ok(css.includes('.prp-float-sb'));
assert.ok(/scrollbar-width:\s*none/.test(css));
assert.ok(/::-webkit-scrollbar[\s\S]*?display:\s*none/.test(css));
// Flush track (no inset) + soft thumb
assert.ok(/\.prp-float-sb\s*\{[^}]*top:\s*0/.test(css));
assert.ok(/\.prp-float-sb\s*\{[^}]*right:\s*0/.test(css));
assert.ok(css.includes('var(--prp-fg-muted) 26%') || /26%/.test(css));
// Idle auto-hide: only --active shows the bar (not bare :hover)
assert.ok(Number(FLOATING_SCROLLBAR_IDLE_MS) >= 500);
assert.ok(css.includes('prp-float-sb--active'));
assert.ok(!/\.prp-float-sb:hover\s*,/.test(css) && !/\.prp-float-sb:hover\s*\{/.test(css));

const virt = fs.readFileSync(
  path.join(root, 'src/modal/views/conversation/VirtualConversationList.tsx'),
  'utf8'
);
assert.ok(virt.includes('FloatingScrollbar'));
assert.ok(virt.includes('prp-scroll-float-host'));

const conv = fs.readFileSync(
  path.join(root, 'src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(conv.includes('FloatingScrollbar'));
assert.ok(conv.includes('prp-conversation__aside-host'));

console.log('floating-scrollbar.test.js: all assertions passed');
console.log('float-metrics=true');
console.log('native-scrollbar-hidden=true');
