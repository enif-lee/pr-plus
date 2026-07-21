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

// --- Behavioral: collapse hides list width near rail ---
{
  let pref = { collapsed: false, width: 280 };
  pref = { ...pref, collapsed: toggleFileNavCollapsed(pref.collapsed) };
  const tpl = fileNavGridTemplate(pref);
  assert.ok(tpl.startsWith(`${FILE_NAV_RAIL_WIDTH}px`));
  assert.ok(tpl.includes(' 0 ')); // resizer column 0 when collapsed
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
  assert.equal(loaded.collapsed, true);
  assert.equal(loaded.width, 340);
  assert.ok(fileNavGridTemplate(loaded).startsWith(`${FILE_NAV_RAIL_WIDTH}px`));
}

// --- FolderFileTree: collapse control ---
{
  const tree = fs.readFileSync(
    path.join(root, 'src/modal/views/diff/FolderFileTree.tsx'),
    'utf8'
  );
  assert.ok(tree.includes('navCollapsed'));
  assert.ok(tree.includes('onToggleNavCollapse'));
  assert.ok(tree.includes('prp-filetree--collapsed') || tree.includes('rail-toggle'));
  assert.ok(tree.includes('Collapse files navigator') || tree.includes('collapse-nav'));
  assert.ok(tree.includes('Expand files navigator') || tree.includes('rail-toggle'));
}

// --- App: resizer + grid template wiring ---
{
  const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
  assert.ok(app.includes('fileNavGridTemplate'));
  assert.ok(app.includes('prp-file-nav-resizer'));
  assert.ok(app.includes('onFileNavResizeStart') || app.includes('nextFileNavWidthFromDrag'));
  assert.ok(app.includes('onToggleFileNavCollapse') || app.includes('toggleFileNavCollapsed'));
  assert.ok(app.includes('data-file-nav-collapsed'));
  assert.ok(app.includes('saveFileNavPref'));
  assert.ok(app.includes('loadFileNavPref'));
}

// --- CSS affordances ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('prp-file-nav-resizer'));
  assert.ok(css.includes('col-resize'));
  assert.ok(css.includes('prp-filetree--collapsed') || css.includes('rail-toggle'));
  assert.ok(css.includes('prp-diff-layout'));
}

console.log('file-nav-ui.test.js: all assertions passed');
console.log('file-nav-collapse=true');
console.log('file-nav-resize=true');
console.log('file-nav-persist=true');
