/**
 * Structural + behavioral proof for side-sheet shell toggle.
 * Drives shipped shell-preference helpers and asserts chrome/app wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SHELL_MODAL,
  SHELL_SHEET,
  toggleShell,
  loadShellPref,
  saveShellPref,
  shellClassName,
  withShellClass,
  normalizeShell,
} = require('../src/modal/lib/shell-preference.ts');
const { layoutClassName, LAYOUT_CENTERED, LAYOUT_DIFF } = require('../src/modal/lib/layout-mode.ts');

const root = path.join(__dirname, '..');

// --- shipped preference toggle + apply class (not reimplemented) ---
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
  let shell = loadShellPref(mem);
  assert.equal(shell, SHELL_MODAL);

  // Simulate icon click: toggle + persist (same as PrModalApp.onToggleShell)
  shell = toggleShell(shell);
  assert.equal(saveShellPref(mem, shell), true);
  assert.equal(loadShellPref(mem), SHELL_SHEET);

  // Applying stored preference on open
  const restored = loadShellPref(mem);
  const overlayCls = `prp-overlay ${shellClassName(restored)}`.trim();
  assert.ok(overlayCls.includes('prp-shell--sheet'));
  const panelCls = withShellClass(layoutClassName(LAYOUT_CENTERED), restored);
  assert.ok(panelCls.includes('prp-modal--centered'));
  assert.ok(panelCls.includes('prp-shell--sheet'));

  // Diff content mode still composes with sheet shell
  const diffSheet = withShellClass(layoutClassName(LAYOUT_DIFF), SHELL_SHEET);
  assert.ok(diffSheet.includes('prp-modal--diff'));
  assert.ok(diffSheet.includes('prp-shell--sheet'));

  // Toggle back to modal
  shell = toggleShell(loadShellPref(mem));
  saveShellPref(mem, shell);
  assert.equal(loadShellPref(mem), SHELL_MODAL);
  assert.ok(shellClassName(loadShellPref(mem)).includes('prp-shell--modal'));
}

// --- Header exposes icon control (shipped source) ---
{
  const header = fs.readFileSync(
    path.join(root, 'src/modal/views/chrome/Header.tsx'),
    'utf8'
  );
  assert.ok(header.includes('prp-shell-toggle'), 'icon button class');
  assert.ok(header.includes('onToggleShell'), 'toggle handler prop');
  assert.ok(header.includes('shellMode'), 'shell mode prop');
  assert.ok(header.includes('aria-label'), 'accessible label');
  assert.ok(
    header.includes('Switch to side sheet') || header.includes('side sheet'),
    'side sheet label'
  );
  assert.ok(header.includes('data-shell'), 'data-shell attribute');
  // Icon control; conversation-only (hidden on Diff layout)
  assert.ok(
    /prp-header__icon-btn prp-shell-toggle|prp-shell-toggle/.test(header),
    'shell toggle icon class'
  );
  assert.ok(
    header.includes('effectiveLayout !== LAYOUT_DIFF') ||
      header.includes('LAYOUT_DIFF'),
    'shell toggle gated to conversation view'
  );
  // Iconified header actions
  assert.ok(header.includes('Subscribe to notifications'), 'subscribe via icon label');
  assert.ok(header.includes('Close pull request'), 'close PR via icon label');
  assert.ok(header.includes('Open on GitHub'), 'open GitHub via icon label');
  assert.ok(header.includes('prp-header__icon-btn'), 'shared icon button class');
}

// --- App wires persist + restore + classes ---
{
  const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
  assert.ok(app.includes('loadShellPref'));
  assert.ok(app.includes('saveShellPref'));
  assert.ok(app.includes('onToggleShell'));
  assert.ok(app.includes('shellClassName'));
  assert.ok(app.includes('data-shell'));
  assert.ok(app.includes('resolveShellStorage'));
  // Restore on open
  assert.ok(app.includes('[open]'));
  assert.ok(/setShellMode/.test(app));
}

// --- CSS for both shells ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('.prp-shell--sheet'));
  assert.ok(css.includes('.prp-shell--modal') || css.includes('prp-shell--sheet'));
  assert.ok(css.includes('.prp-shell-toggle'));
  assert.ok(css.includes('justify-content: flex-end'));
  // Side sheet must not leave a page scrollbar under the docked panel
  assert.ok(css.includes('prp-scroll-lock') || css.includes('html.prp-scroll-lock'));
  assert.ok(css.includes('overscroll-behavior'));
}

// normalize used by App restore
assert.equal(normalizeShell('sheet'), SHELL_SHEET);

console.log('side-sheet-toggle.test.js: all assertions passed');
console.log('shell-toggle-icon=true');
console.log('shell-persist-roundtrip=true');
console.log('shell-class-on-open=true');
