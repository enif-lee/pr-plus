const assert = require('node:assert/strict');
const {
  resolveTipPlacement,
  inferPreferredPlacement,
  clampTipCoords,
} = require('../src/modal/components/common/TipPopover.tsx');

function rect(top, left, width, height) {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

const tip = { offsetHeight: 40, offsetWidth: 120 };

// Prefer top when enough room above
{
  const host = { getBoundingClientRect: () => rect(200, 100, 24, 24) };
  const p = resolveTipPlacement(host, tip, 'top', {
    bounds: { top: 0, left: 0, right: 800, bottom: 600 },
    gap: 8,
  });
  assert.equal(p, 'top');
}

// Flip to bottom when near top edge
{
  const host = { getBoundingClientRect: () => rect(10, 100, 24, 24) };
  const p = resolveTipPlacement(host, tip, 'top', {
    bounds: { top: 0, left: 0, right: 800, bottom: 600 },
    gap: 8,
  });
  assert.equal(p, 'bottom', 'should flip below when top is tight');
}

// Prefer bottom, flip to top near bottom edge
{
  const host = { getBoundingClientRect: () => rect(560, 100, 24, 24) };
  const p = resolveTipPlacement(host, tip, 'bottom', {
    bounds: { top: 0, left: 0, right: 800, bottom: 600 },
    gap: 8,
  });
  assert.equal(p, 'top', 'should flip above when bottom is tight');
}

// Horizontal: left → right when tight on the left
{
  const host = { getBoundingClientRect: () => rect(200, 20, 24, 24) };
  const p = resolveTipPlacement(host, tip, 'left', {
    bounds: { top: 0, left: 0, right: 800, bottom: 600 },
    gap: 8,
  });
  assert.equal(p, 'right', 'should flip right when left is tight');
}

// Horizontal: right stays when room
{
  const host = { getBoundingClientRect: () => rect(200, 100, 24, 24) };
  const p = resolveTipPlacement(host, tip, 'right', {
    bounds: { top: 0, left: 0, right: 800, bottom: 600 },
    gap: 8,
  });
  assert.equal(p, 'right');
}

// Infer preferred from host classes
{
  assert.equal(inferPreferredPlacement(null), 'top');
  const host = {
    closest(sel) {
      if (sel === '.prp-aside-compact') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(host), 'right');
  const aside = {
    closest(sel) {
      if (sel === '.prp-conversation__aside') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(aside), 'right');
  const collapse = {
    closest(sel) {
      if (sel === '.prp-aside-collapse-btn') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(collapse), 'bottom');
  const headerBtn = {
    closest(sel) {
      if (sel === '.prp-header__actions') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(headerBtn), 'bottom');
  const diffToolbar = {
    closest(sel) {
      if (sel === '.prp-diff-toolbar') return {};
      return null;
    },
  };
  assert.equal(
    inferPreferredPlacement(diffToolbar),
    'top',
    'diff review chrome tips open upward'
  );
  const stepNav = {
    closest(sel) {
      if (sel === '.prp-step-nav') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(stepNav), 'top');
}

// Clamp top tip near right edge so it does not overflow viewport
{
  const bounds = { top: 0, left: 0, right: 800, bottom: 600 };
  // center would be 790 → tip extends past 800
  const c = clampTipCoords('top', { top: 40, left: 790 }, 120, 32, bounds, 8);
  assert.ok(c.left <= 800 - 8 - 60, `left clamped: ${c.left}`);
  assert.ok(c.left >= 8 + 60, `left not past left edge: ${c.left}`);
}

// Clamp right tip near right edge
{
  const bounds = { top: 0, left: 0, right: 800, bottom: 600 };
  const c = clampTipCoords('right', { top: 100, left: 780 }, 120, 32, bounds, 8);
  assert.ok(c.left <= 800 - 8 - 120, `right tip left clamped: ${c.left}`);
}

console.log('tip-popover-placement.test.js: all assertions passed');
