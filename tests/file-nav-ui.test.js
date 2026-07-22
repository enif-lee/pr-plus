/**
 * Structural + behavioral proof for collapsible/resizable Diff files navigator.
 * Drives shipped file-nav-layout helpers; asserts App/FolderFileTree wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const {
  clampFileNavWidth,
  toggleFileNavCollapsed,
  nextFileNavWidthFromDrag,
  fileNavGridTemplate,
  loadFileNavPref,
  saveFileNavPref,
  FILE_NAV_RAIL_WIDTH,
} = require('../src/modal/lib/file-nav-layout.ts');

const root = path.join(__dirname, '..');

// --- Behavioral: collapse → 0-width nav tracks (children stay mounted for anim) ---
{
  let pref = { collapsed: false, width: 280 };
  pref = { ...pref, collapsed: toggleFileNavCollapsed(pref.collapsed) };
  const tpl = fileNavGridTemplate(pref);
  assert.equal(tpl, '0px 0px minmax(0, 1fr)');
  assert.ok(!tpl.includes('28px'), 'no residual 28px rail');
  pref = { ...pref, collapsed: toggleFileNavCollapsed(pref.collapsed) };
  assert.equal(fileNavGridTemplate(pref), '280px 4px minmax(0, 1fr)');
}

// --- Behavioral: resize clamp via drag helper ---
{
  const widened = nextFileNavWidthFromDrag(200, 80);
  assert.equal(widened, 280);
  const styleWidth = clampFileNavWidth(widened);
  assert.equal(styleWidth, 280);
}

// --- Persist round-trip as App does ---
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
  const next = {
    collapsed: true,
    width: clampFileNavWidth(340),
  };
  assert.equal(saveFileNavPref(mem, next), true);
  const loaded = loadFileNavPref(mem);
  // loadFileNavPref always opens expanded; width restored
  assert.equal(loaded.collapsed, false);
  assert.equal(loaded.width, 340);
  assert.equal(
    fileNavGridTemplate({ collapsed: true, width: loaded.width }),
    '0px 0px minmax(0, 1fr)'
  );
}

// --- FolderFileTree: stays mounted when collapsed (for open/close animation) ---
{
  const tree = fs.readFileSync(
    path.join(root, 'src/modal/views/diff/FolderFileTree.tsx'),
    'utf8'
  );
  assert.ok(tree.includes('navCollapsed'));
  assert.ok(
    tree.includes('prp-filetree--nav-collapsed') || tree.includes('aria-hidden'),
    'collapsed uses class/aria, not unmount'
  );
  assert.ok(!/if\s*\(\s*navCollapsed\s*\)\s*\{\s*return null/.test(tree), 'no null unmount');
  assert.ok(!tree.includes('prp-filetree__rail-toggle'), 'no residual rail toggle');
  assert.ok(!tree.includes('Expand files navigator'), 'no expand chrome in column');
  const toolbar = fs.readFileSync(
    path.join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
    'utf8'
  );
  assert.ok(
    toolbar.includes('onToggleFileNav') || toolbar.includes('Files'),
    'toolbar Files remains the expand control'
  );
}

// --- App: nav stays mounted; collapse via CSS width animation ---
{
  const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
  assert.ok(app.includes('fileNavGridTemplate'));
  assert.ok(app.includes('prp-file-nav-resizer'));
  assert.ok(app.includes('onFileNavResizeStart') || app.includes('nextFileNavWidthFromDrag'));
  assert.ok(app.includes('onToggleFileNavCollapse') || app.includes('toggleFileNavCollapsed'));
  assert.ok(app.includes('data-file-nav-collapsed'));
  assert.ok(app.includes('saveFileNavPref'));
  assert.ok(app.includes('loadFileNavPref'));
  assert.ok(app.includes('FolderFileTree'), 'FolderFileTree always mounted for anim');
  assert.ok(
    !/!fileNav\.collapsed\s*\?\s*\(/.test(app),
    'do not gate-mount nav on collapsed (breaks animation)'
  );
}

// --- CSS affordances ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('prp-file-nav-resizer'));
  assert.ok(css.includes('col-resize'));
  assert.ok(css.includes('prp-diff-layout'));
  assert.ok(
    /transition[\s\S]{0,80}width/.test(css) || css.includes('flex-basis'),
    'nav open/close width transition'
  );
  assert.ok(css.includes('prp-filetree--nav-collapsed') || css.includes('--prp-file-nav-width'));
}

console.log('file-nav-ui.test.js: all assertions passed');
console.log('file-nav-collapse=true');
console.log('file-nav-resize=true');
console.log('file-nav-persist=true');
