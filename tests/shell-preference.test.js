const assert = require('node:assert/strict');
const {
  SHELL_MODAL,
  SHELL_SHEET,
  SHELL_PREF_KEY,
  normalizeShell,
  isValidShell,
  toggleShell,
  shellClassName,
  withShellClass,
  serializeShellPref,
  parseShellPref,
  loadShellPref,
  saveShellPref,
  resolveShellStorage,
} = require('../src/modal/lib/shell-preference.ts');
const { layoutClassName, LAYOUT_CENTERED, LAYOUT_DIFF } = require('../src/modal/lib/layout-mode.ts');

// defaults
assert.equal(normalizeShell(null), SHELL_MODAL);
assert.equal(normalizeShell(''), SHELL_MODAL);
assert.equal(normalizeShell('sheet'), SHELL_SHEET);
assert.equal(normalizeShell('side-sheet'), SHELL_SHEET);
assert.equal(isValidShell(SHELL_SHEET), true);
assert.equal(isValidShell('drawer'), false);

// toggle round-trip
assert.equal(toggleShell(SHELL_MODAL), SHELL_SHEET);
assert.equal(toggleShell(SHELL_SHEET), SHELL_MODAL);
assert.equal(toggleShell(toggleShell(SHELL_MODAL)), SHELL_MODAL);

// classes
assert.equal(shellClassName(SHELL_MODAL), 'prp-shell--modal');
assert.equal(shellClassName(SHELL_SHEET), 'prp-shell--sheet');
const combined = withShellClass(layoutClassName(LAYOUT_CENTERED), SHELL_SHEET);
assert.ok(combined.includes('prp-modal--centered'));
assert.ok(combined.includes('prp-shell--sheet'));
assert.ok(withShellClass(layoutClassName(LAYOUT_DIFF), SHELL_MODAL).includes('prp-shell--modal'));

// serialize / parse
assert.equal(serializeShellPref(SHELL_SHEET), 'sheet');
assert.equal(parseShellPref('sheet'), SHELL_SHEET);
assert.equal(parseShellPref('{"shell":"sheet"}'), SHELL_SHEET);
assert.equal(parseShellPref({ shell: 'modal' }), SHELL_MODAL);
assert.equal(parseShellPref('nope'), SHELL_MODAL);

// storage I/O
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

assert.equal(loadShellPref(null), SHELL_MODAL, 'missing storage → modal default');
assert.equal(loadShellPref(mem), SHELL_MODAL, 'empty storage → modal default');
assert.equal(saveShellPref(mem, SHELL_SHEET), true);
assert.equal(mem.data[SHELL_PREF_KEY], 'sheet');
assert.equal(loadShellPref(mem), SHELL_SHEET);
assert.equal(saveShellPref(mem, SHELL_MODAL), true);
assert.equal(loadShellPref(mem), SHELL_MODAL);

// round-trip modal → sheet → modal
assert.equal(saveShellPref(mem, toggleShell(loadShellPref(mem))), true);
assert.equal(loadShellPref(mem), SHELL_SHEET);
assert.equal(saveShellPref(mem, toggleShell(loadShellPref(mem))), true);
assert.equal(loadShellPref(mem), SHELL_MODAL);

// resolveShellStorage prefers localStorage
{
  const fakeLocal = { getItem() { return null; }, setItem() {} };
  const fakeSession = { getItem() { return null; }, setItem() {} };
  assert.equal(resolveShellStorage({ localStorage: fakeLocal, sessionStorage: fakeSession }), fakeLocal);
  assert.equal(resolveShellStorage({ sessionStorage: fakeSession }), fakeSession);
  assert.equal(resolveShellStorage({}), null);
}

console.log('shell-preference.test.js: all assertions passed');
