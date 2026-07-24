const assert = require('node:assert/strict');
const {
  resolveTipPlacement,
  inferPreferredPlacement,
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
  assert.equal(inferPreferredPlacement(host), 'left');
  const collapse = {
    closest(sel) {
      if (sel === '.prp-aside-collapse-btn') return {};
      return null;
    },
  };
  assert.equal(inferPreferredPlacement(collapse), 'bottom');
}

console.log('tip-popover-placement.test.js: all assertions passed');
