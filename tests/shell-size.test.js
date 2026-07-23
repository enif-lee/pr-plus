/**
 * Unit tests for shipped shell-size helpers: clamp, drag, load/save, fullscreen.
 * Drives real module entry points with an injected storage mock.
 */
const assert = require('node:assert/strict');
const {
  SHEET_MIN_WIDTH,
  SHEET_MAX_WIDTH,
  SHEET_DEFAULT_WIDTH,
  MODAL_MIN_WIDTH,
  MODAL_MAX_WIDTH,
  MODAL_DEFAULT_WIDTH,
  MODAL_MIN_HEIGHT,
  MODAL_MAX_HEIGHT,
  MODAL_DEFAULT_HEIGHT,
  SHELL_SHEET_WIDTH_KEY,
  SHELL_MODAL_SIZE_KEY,
  clampShellSize,
  clampSheetWidth,
  clampModalWidth,
  clampModalHeight,
  clampModalSize,
  nextSheetWidthFromDrag,
  nextModalSizeFromDrag,
  toggleShellFullscreen,
  shellFullscreenClassName,
  serializeSheetWidth,
  parseSheetWidth,
  serializeModalSize,
  parseModalSize,
  loadSheetWidth,
  saveSheetWidth,
  loadModalSize,
  saveModalSize,
  loadShellSizePref,
  saveShellSizePref,
  resolveShellSizeStorage,
} = require('../src/modal/lib/shell-size.ts');
const {
  resolveModalShortcutAction,
} = require('../src/modal/lib/shortcut-policy.ts');

// --- clamp bounds ---
assert.equal(clampSheetWidth(700), 700);
assert.equal(clampSheetWidth(10), SHEET_MIN_WIDTH);
assert.equal(clampSheetWidth(99999), SHEET_MAX_WIDTH);
assert.equal(clampSheetWidth(NaN), SHEET_DEFAULT_WIDTH);
assert.equal(clampSheetWidth(null), SHEET_DEFAULT_WIDTH);
assert.equal(clampSheetWidth(undefined), SHEET_DEFAULT_WIDTH);
assert.equal(clampSheetWidth(''), SHEET_DEFAULT_WIDTH);
assert.equal(clampSheetWidth('not-a-number'), SHEET_DEFAULT_WIDTH);

// Viewport-aware: never exceed viewport; min softens when viewport < min
assert.equal(clampSheetWidth(900, { viewportWidth: 800 }), 800);
assert.equal(clampSheetWidth(100, { viewportWidth: 800 }), Math.min(SHEET_MIN_WIDTH, 800));
assert.equal(clampSheetWidth(2000, { viewportWidth: 1000 }), 1000);
// narrow window: min > vw → pin to vw
assert.equal(clampSheetWidth(SHEET_MIN_WIDTH, { viewportWidth: 400 }), 400);

assert.equal(clampModalWidth(800), 800);
assert.equal(clampModalWidth(10), MODAL_MIN_WIDTH);
assert.equal(clampModalWidth(99999), MODAL_MAX_WIDTH);
assert.equal(clampModalHeight(500), 500);
assert.equal(clampModalHeight(10), MODAL_MIN_HEIGHT);
assert.equal(clampModalHeight(99999), MODAL_MAX_HEIGHT);

const ms = clampModalSize({ width: 50, height: 99999 });
assert.equal(ms.width, MODAL_MIN_WIDTH);
assert.equal(ms.height, MODAL_MAX_HEIGHT);

// Generic clamp with custom min/max
assert.equal(clampShellSize(5, { min: 10, max: 20, fallback: 15 }), 10);
assert.equal(clampShellSize(50, { min: 10, max: 20, fallback: 15 }), 20);
assert.equal(clampShellSize(NaN, { min: 10, max: 20, fallback: 15 }), 15);

// --- drag: side sheet (left edge; leftward pointer widens) ---
assert.equal(nextSheetWidthFromDrag(700, 100, 50), 750); // moved left 50
assert.equal(nextSheetWidthFromDrag(700, 100, 150), 650); // moved right 50
assert.equal(nextSheetWidthFromDrag(700, 100, 10000), SHEET_MIN_WIDTH);
assert.equal(nextSheetWidthFromDrag(700, 100, -10000), SHEET_MAX_WIDTH);
assert.equal(nextSheetWidthFromDrag(700, NaN, 50), 700);
assert.equal(
  nextSheetWidthFromDrag(700, 100, 0, { viewportWidth: 720 }),
  720 // 700+100 clamped to viewport
);

// --- drag: modal SE (2× delta: centered panel, edge follows pointer) ---
{
  const next = nextModalSizeFromDrag({ width: 800, height: 600 }, 40, 30);
  assert.equal(next.width, 880); // 800 + 40*2
  assert.equal(next.height, 660); // 600 + 30*2
}
{
  const next = nextModalSizeFromDrag({ width: 800, height: 600 }, -10000, -10000);
  assert.equal(next.width, MODAL_MIN_WIDTH);
  assert.equal(next.height, MODAL_MIN_HEIGHT);
}
{
  const next = nextModalSizeFromDrag({ width: 800, height: 600 }, 100000, 100000);
  assert.equal(next.width, MODAL_MAX_WIDTH);
  assert.equal(next.height, MODAL_MAX_HEIGHT);
}
{
  const next = nextModalSizeFromDrag({ width: 800, height: 600 }, NaN, 20);
  assert.equal(next.width, 800);
  assert.equal(next.height, 640); // 600 + 20*2
}

// --- fullscreen pure ---
assert.equal(toggleShellFullscreen(false), true);
assert.equal(toggleShellFullscreen(true), false);
assert.equal(toggleShellFullscreen(null), true);
assert.equal(shellFullscreenClassName(true), 'prp-shell--fullscreen');
assert.equal(shellFullscreenClassName(false), '');
assert.equal(shellFullscreenClassName(0), '');

// --- serialize / parse ---
assert.equal(parseSheetWidth(serializeSheetWidth(720)), 720);
assert.equal(parseSheetWidth(null), SHEET_DEFAULT_WIDTH);
assert.equal(parseSheetWidth('880'), 880);
assert.equal(parseSheetWidth('{"width":910}').valueOf(), 910);

const modalSnap = serializeModalSize({ width: 1000, height: 700 });
const modalParsed = parseModalSize(modalSnap);
assert.equal(modalParsed.width, 1000);
assert.equal(modalParsed.height, 700);
assert.equal(parseModalSize(null).width, MODAL_DEFAULT_WIDTH);
assert.equal(parseModalSize('nope').height, MODAL_DEFAULT_HEIGHT);

// --- storage round-trip (injected mock) ---
const mem = {
  data: {},
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null;
  },
  setItem(k, v) {
    this.data[k] = String(v);
  },
  removeItem(k) {
    delete this.data[k];
  },
};

assert.equal(loadSheetWidth(null), SHEET_DEFAULT_WIDTH);
assert.equal(saveSheetWidth(mem, 850), true);
assert.ok(mem.data[SHELL_SHEET_WIDTH_KEY]);
assert.equal(loadSheetWidth(mem), 850);
// out-of-bounds saved value clamps on load
assert.equal(saveSheetWidth(mem, 50), true);
assert.equal(loadSheetWidth(mem), SHEET_MIN_WIDTH);
assert.equal(saveSheetWidth(mem, 99999), true);
assert.equal(loadSheetWidth(mem), SHEET_MAX_WIDTH);

assert.equal(saveModalSize(mem, { width: 1024, height: 768 }), true);
assert.ok(mem.data[SHELL_MODAL_SIZE_KEY]);
const loadedModal = loadModalSize(mem);
assert.equal(loadedModal.width, 1024);
assert.equal(loadedModal.height, 768);

// Separate keys: sheet + modal independent
assert.equal(saveSheetWidth(mem, 920), true);
assert.equal(loadSheetWidth(mem), 920);
assert.equal(loadModalSize(mem).width, 1024);

const pref = loadShellSizePref(mem);
assert.equal(pref.sheetWidth, 920);
assert.equal(pref.modal.width, 1024);
assert.equal(pref.modal.height, 768);

assert.equal(
  saveShellSizePref(mem, {
    sheetWidth: 880,
    modal: { width: 960, height: 720 },
  }),
  true
);
assert.equal(loadSheetWidth(mem), 880);
assert.deepEqual(loadModalSize(mem), { width: 960, height: 720 });

// resolveShellSizeStorage prefers localStorage
{
  const fakeLocal = { getItem() { return null; }, setItem() {} };
  const fakeSession = { getItem() { return null; }, setItem() {} };
  assert.equal(
    resolveShellSizeStorage({ localStorage: fakeLocal, sessionStorage: fakeSession }),
    fakeLocal
  );
  assert.equal(resolveShellSizeStorage({ sessionStorage: fakeSession }), fakeSession);
  assert.equal(resolveShellSizeStorage({}), null);
  assert.equal(resolveShellSizeStorage(null), null);
}

// --- shortcut policy: mod+f → openSearch; mod+shift+f → toggleFullscreen ---
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: false, key: 'f' }),
  'openSearch'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: true, key: 'f' }),
  'toggleFullscreen'
);
// Fullscreen class from pure helper matches expected shell state
assert.equal(shellFullscreenClassName(toggleShellFullscreen(false)), 'prp-shell--fullscreen');
assert.equal(shellFullscreenClassName(toggleShellFullscreen(true)), '');

console.log('shell-size.test.js: all assertions passed');
console.log('shell-clamp-bounds=true');
console.log('shell-drag-clamp=true');
console.log('shell-persist-roundtrip=true');
console.log('shell-fullscreen-shortcut=true');
