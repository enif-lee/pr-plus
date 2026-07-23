const assert = require('node:assert/strict');
const {
  FILE_NAV_MIN_WIDTH,
  FILE_NAV_MAX_WIDTH,
  FILE_NAV_DEFAULT_WIDTH,
  FILE_NAV_RAIL_WIDTH,
  FILE_NAV_PREF_KEY,
  clampFileNavWidth,
  toggleFileNavCollapsed,
  nextFileNavWidthFromDrag,
  fileNavGridTemplate,
  serializeFileNavPref,
  parseFileNavPref,
  loadFileNavPref,
  saveFileNavPref,
} = require('../src/modal/lib/file-nav-layout.ts');

// clamp
assert.equal(clampFileNavWidth(200), 200);
assert.equal(clampFileNavWidth(10), FILE_NAV_MIN_WIDTH);
assert.equal(clampFileNavWidth(9999), FILE_NAV_MAX_WIDTH);
assert.equal(clampFileNavWidth(NaN), FILE_NAV_DEFAULT_WIDTH);
assert.equal(clampFileNavWidth(null), FILE_NAV_DEFAULT_WIDTH);
assert.equal(clampFileNavWidth(100, { min: 80, max: 90 }), 90);

// toggle
assert.equal(toggleFileNavCollapsed(false), true);
assert.equal(toggleFileNavCollapsed(true), false);
assert.equal(toggleFileNavCollapsed(null), true);

// drag
assert.equal(nextFileNavWidthFromDrag(200, 40), 240);
assert.equal(nextFileNavWidthFromDrag(200, -100), FILE_NAV_MIN_WIDTH);
assert.equal(nextFileNavWidthFromDrag(200, 10000), FILE_NAV_MAX_WIDTH);
assert.equal(nextFileNavWidthFromDrag(200, NaN), 200);

// grid template
assert.equal(
  fileNavGridTemplate({ collapsed: false, width: 300 }),
  '300px 4px minmax(0, 1fr)'
);
// Collapsed = 0-width nav+resizer tracks (children stay mounted for animation)
assert.equal(
  fileNavGridTemplate({ collapsed: true, width: 300 }),
  '0px 0px minmax(0, 1fr)'
);
assert.equal(FILE_NAV_RAIL_WIDTH, 0);
assert.ok(fileNavGridTemplate({ width: 50 }).startsWith(`${FILE_NAV_MIN_WIDTH}px`));

// serialize / parse / storage
const snap = serializeFileNavPref({ collapsed: true, width: 320 });
assert.ok(snap.includes('"collapsed":true'));
const parsed = parseFileNavPref(snap);
assert.equal(parsed.collapsed, true);
assert.equal(parsed.width, 320);
assert.equal(parseFileNavPref(null).width, FILE_NAV_DEFAULT_WIDTH);
assert.equal(parseFileNavPref('280').width, 280);

const mem = {
  data: {},
  getItem(k) {
    return this.data[k] ?? null;
  },
  setItem(k, v) {
    this.data[k] = String(v);
  },
};
assert.equal(loadFileNavPref(null).collapsed, false);
assert.equal(saveFileNavPref(mem, { collapsed: true, width: 300 }), true);
assert.ok(mem.data[FILE_NAV_PREF_KEY]);
const loaded = loadFileNavPref(mem);
// Load always opens expanded; width is restored
assert.equal(loaded.collapsed, false);
assert.equal(loaded.width, 300);
assert.equal(parseFileNavPref(mem.data[FILE_NAV_PREF_KEY]).collapsed, true);

// round-trip toggle + resize
let pref = loadFileNavPref(mem);
pref = { ...pref, collapsed: toggleFileNavCollapsed(pref.collapsed) };
pref = { ...pref, width: nextFileNavWidthFromDrag(pref.width, -20) };
saveFileNavPref(mem, pref);
const again = loadFileNavPref(mem);
assert.equal(again.collapsed, false);
assert.equal(again.width, 280);

console.log('file-nav-layout.test.js: all assertions passed');
