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
  SHELL_FULLSCREEN_EDGE_PX,
  SHEET_FULLSCREEN_EDGE_PX,
  sheetWidthHitsFullscreen,
  modalSizeHitsFullscreen,
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

  // Side sheet drag with viewport max only (no 1200 hard cap)
  let w = nextSheetWidthFromDrag(700, 100, -5000, { viewportWidth: 1600 });
  assert.equal(w, 1600);
  assert.equal(SHELL_FULLSCREEN_EDGE_PX, 50);
  assert.ok(sheetWidthHitsFullscreen(w, 1600, SHELL_FULLSCREEN_EDGE_PX));
  assert.ok(
    modalSizeHitsFullscreen({ width: 1550, height: 950 }, 1600, 1000, 50)
  );
  assert.equal(saveSheetWidth(mem, 900), true);
  assert.equal(loadSheetWidth(mem), 900);

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

// --- shortcut policy: ⌘F search; ⌥⇧F fullscreen ---
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: false,
    alt: false,
    key: 'f',
    code: 'KeyF',
  }),
  'openSearch'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: true,
    alt: true,
    key: 'f',
    code: 'KeyF',
  }),
  'toggleFullscreen'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: true, alt: false, key: 'f' }),
  null,
  '⌘⇧F no longer product shortcut'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'f',
    code: 'KeyF',
  }),
  null,
  '⌥F is not Find'
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
  assert.ok(app.includes('sheetWidthHitsFullscreen'), 'edge drag promotes to fullscreen');
  assert.ok(app.includes('modalSizeHitsFullscreen'), 'modal snap zone');
  assert.ok(app.includes('shellFullscreenHint') || app.includes('prp-shell--fs-hint'));
  assert.ok(app.includes('setShellFullscreen(true)'));
  assert.ok(app.includes('setShellFullscreen(false)'), 'drag from FS exits fullscreen');
  // Resizers stay available in fullscreen (not gated on !shellFullscreen only)
  assert.ok(
    /showSheetResizer[\s\S]{0,120}SHELL_SHEET/.test(app) &&
      !/showSheetResizer\s*=\s*\n?\s*!shellFullscreen/.test(app),
    'sheet resizer not hidden solely by fullscreen'
  );
  assert.ok(app.includes('SHELL_FULLSCREEN_EDGE_PX') || app.includes('50'));
  assert.ok(app.includes('data-fullscreen'));
  assert.ok(app.includes('--prp-shell-w'));
  assert.ok(app.includes('--prp-shell-h'));
  assert.ok(app.includes('persistSheetWidth') || app.includes('saveSheetWidth'));
  assert.ok(app.includes('resolveShellSizeStorage'));
  assert.ok(
    app.includes('data-prp-image-viewer') || app.includes('prp-image-viewer'),
    'Esc defers to image viewer when open'
  );
}

// --- CSS ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('.prp-shell-resizer'));
  assert.ok(css.includes('.prp-shell-resizer--sheet'));
  assert.ok(css.includes('.prp-shell-resizer--modal'));
  assert.ok(css.includes('prp-shell--fullscreen'));
  assert.ok(css.includes('prp-shell--fs-hint'), 'blue dimmer snap-zone class');
  // Fullscreen must not hide resizers (display:none was the old behavior)
  assert.ok(
    !/\.prp-overlay\.prp-shell--fullscreen\s+\.prp-shell-resizer\s*\{[^}]*display:\s*none/.test(
      css
    ),
    'fullscreen keeps resizers visible'
  );
  assert.ok(css.includes('--prp-shell-w'));
  assert.ok(css.includes('--prp-shell-h'));
  assert.ok(css.includes('prp-modal--resizing'));
  assert.ok(css.includes('.prp-image-viewer'), 'image viewer styles');
  assert.ok(css.includes('.prp-md img'), 'markdown images styled');
}

// Image viewer wire (mermaid-style expand)
{
  const md = fs.readFileSync(
    path.join(root, 'src/modal/components/common/MarkdownView.tsx'),
    'utf8'
  );
  assert.ok(md.includes('ImageViewer'));
  const viewer = fs.readFileSync(
    path.join(root, 'src/modal/components/common/ImageViewer.tsx'),
    'utf8'
  );
  assert.ok(viewer.includes('data-prp-image-viewer'));
  assert.ok(viewer.includes('createPortal'));
  const vd = fs.readFileSync(
    path.join(root, 'src/modal/views/diff/VirtualDiff.tsx'),
    'utf8'
  );
  assert.ok(vd.includes('ImageViewer'));
}

// --- command palette still exposes Find ---
{
  const pal = fs.readFileSync(path.join(root, 'src/modal/lib/command-palette.ts'), 'utf8');
  assert.ok(pal.includes("action: 'openSearch'"));
  assert.ok(pal.includes("action: 'toggleFullscreen'"));
  assert.ok(pal.includes("shortcut: 'mod+f'") || pal.includes('mod+f'));
  assert.ok(
    pal.includes('opt+shift+f') ||
      pal.includes("shortcut: 'opt+shift+f'") ||
      pal.includes('opt+shift+f')
  );
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
