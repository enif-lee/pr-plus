/**
 * Structural + behavioral proof for shell resize + fullscreen wiring.
 * Drives shipped pure helpers and asserts chrome/app/CSS presence.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  clampSheetWidth,
  clampModalSize,
  nextSheetWidthFromDrag,
  nextModalSizeFromDrag,
  loadSheetWidth,
  saveSheetWidth,
  loadModalSize,
  saveModalSize,
  SHEET_MIN_WIDTH,
  SHEET_MAX_WIDTH,
  SHELL_SHEET_WIDTH_KEY,
  SHELL_MODAL_SIZE_KEY,
  toggleShellFullscreen,
  shellFullscreenClassName,
} = require('../src/modal/lib/shell-size.ts');
const { resolveModalShortcutAction } = require('../src/modal/lib/shortcut-policy.ts');

const root = path.join(__dirname, '..');

// --- pure path: resize end → save → load (as App does) ---
{
  const mem = {
    data: {},
    getItem(k) {
      return this.data[k] ?? null;
    },
    setItem(k, v) {
      this.data[k] = String(v);
    },
  };

  // Side sheet drag past max → clamp → persist
  let w = nextSheetWidthFromDrag(700, 100, -5000);
  assert.equal(w, SHEET_MAX_WIDTH);
  assert.equal(saveSheetWidth(mem, w), true);
  assert.equal(loadSheetWidth(mem), SHEET_MAX_WIDTH);

  // Side sheet drag past min
  w = nextSheetWidthFromDrag(700, 100, 10000);
  assert.equal(w, SHEET_MIN_WIDTH);
  saveSheetWidth(mem, w);
  assert.equal(loadSheetWidth(mem), SHEET_MIN_WIDTH);

  // Modal SE resize + persist (dx/dy doubled so centered edges track the pointer)
  let size = nextModalSizeFromDrag({ width: 900, height: 700 }, 50, 40);
  assert.equal(size.width, 1000);
  assert.equal(size.height, 780);
  assert.equal(saveModalSize(mem, size), true);
  const restored = loadModalSize(mem);
  assert.equal(restored.width, 1000);
  assert.equal(restored.height, 780);

  // Keys are separate
  assert.ok(mem.data[SHELL_SHEET_WIDTH_KEY]);
  assert.ok(mem.data[SHELL_MODAL_SIZE_KEY]);
  assert.notEqual(mem.data[SHELL_SHEET_WIDTH_KEY], mem.data[SHELL_MODAL_SIZE_KEY]);

  // Fullscreen toggle does not change stored sizes
  let fs = false;
  fs = toggleShellFullscreen(fs);
  assert.equal(fs, true);
  assert.equal(shellFullscreenClassName(fs), 'prp-shell--fullscreen');
  assert.equal(loadSheetWidth(mem), SHEET_MIN_WIDTH);
  assert.equal(loadModalSize(mem).width, 1000);
  fs = toggleShellFullscreen(fs);
  assert.equal(fs, false);
  assert.equal(shellFullscreenClassName(fs), '');
}

// --- shortcut policy: Ctrl+F search; Ctrl+Shift+F fullscreen ---
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: false, key: 'f' }),
  'openSearch'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: true, key: 'f' }),
  'toggleFullscreen'
);

// --- App wiring ---
{
  const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
  assert.ok(app.includes('loadSheetWidth') || app.includes('saveSheetWidth'));
  assert.ok(app.includes('loadModalSize') || app.includes('saveModalSize'));
  assert.ok(app.includes('onSheetResizeStart'));
  assert.ok(app.includes('onModalResizeStart'));
  assert.ok(app.includes('prp-shell-resizer'));
  assert.ok(app.includes('prp-shell-resizer--sheet'));
  assert.ok(app.includes('prp-shell-resizer--modal'));
  assert.ok(app.includes('toggleFullscreen') || app.includes('toggleShellFullscreen'));
  assert.ok(app.includes("case 'toggleFullscreen'"));
  assert.ok(app.includes('shellFullscreen'));
  assert.ok(app.includes('data-fullscreen'));
  assert.ok(app.includes('--prp-shell-w'));
  assert.ok(app.includes('--prp-shell-h'));
  assert.ok(app.includes('persistSheetWidth') || app.includes('saveSheetWidth'));
  assert.ok(app.includes('resolveShellSizeStorage'));
}

// --- CSS ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('.prp-shell-resizer'));
  assert.ok(css.includes('.prp-shell-resizer--sheet'));
  assert.ok(css.includes('.prp-shell-resizer--modal'));
  assert.ok(css.includes('prp-shell--fullscreen'));
  assert.ok(css.includes('--prp-shell-w'));
  assert.ok(css.includes('--prp-shell-h'));
  assert.ok(css.includes('prp-modal--resizing'));
}

// --- command palette still exposes Find ---
{
  const pal = fs.readFileSync(path.join(root, 'src/modal/lib/command-palette.ts'), 'utf8');
  assert.ok(pal.includes("action: 'openSearch'"));
  assert.ok(pal.includes("action: 'toggleFullscreen'"));
  assert.ok(pal.includes("shortcut: 'mod+f'") || pal.includes('mod+f'));
  assert.ok(pal.includes('mod+shift+f') || pal.includes("shortcut: 'mod+shift+f'"));
}

// clamp with viewport after "resize" beyond bounds
assert.equal(clampSheetWidth(2000, { viewportWidth: 1000 }), 1000);
assert.deepEqual(clampModalSize({ width: 50, height: 50 }), {
  width: 640, // MODAL_MIN — asserted via clampModalSize defaults in helper
  height: 420,
});

console.log('shell-resize-ui.test.js: all assertions passed');
console.log('shell-resize-ui-wire=true');
console.log('shell-fullscreen-mod-shift-f=true');
console.log('shell-size-persist=true');
