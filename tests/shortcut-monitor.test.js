/**
 * Shortcut monitor: format, catalog, fire payload, dismiss, opt-hold view,
 * and App keyboard wiring contracts.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  formatShortcutMonitorText,
  formatOptHeldLabel,
  describeShortcutAction,
  buildShortcutMonitorFire,
  buildShortcutMonitorFireFromParts,
  isShortcutMonitorFireActive,
  isOptAloneHeld,
  resolveShortcutMonitorView,
  SHORTCUT_MONITOR_DISMISS_MS,
  SHORTCUT_MONITOR_CATALOG,
} = require('../src/modal/lib/shortcut-monitor.ts');

// --- format ---
assert.equal(
  formatShortcutMonitorText('⌥⇧]', 'Next file'),
  '[⌥⇧] - Next file]'
);
assert.equal(formatOptHeldLabel(true), '⌥ held');
assert.equal(formatOptHeldLabel(false), 'Alt held');

// --- describe / fire for real shipped actions ---
const next = describeShortcutAction('navFileNext', true);
assert.equal(next.shortcut, '⌥⇧]');
assert.equal(next.title, 'Next file');
const fire = buildShortcutMonitorFire('navFileNext', true, 1_700_000_000_000);
assert.equal(fire.text, '[⌥⇧] - Next file]');
assert.equal(fire.action, 'navFileNext');
assert.equal(fire.at, 1_700_000_000_000);

const fromParts = buildShortcutMonitorFireFromParts('⌥⇧K', 'Command palette', 'openPalette', 10);
assert.equal(fromParts.text, '[⌥⇧K - Command palette]');

// stack digit
const stack = describeShortcutAction('navStackDigit3', true);
assert.ok(stack.shortcut.includes('3'));
assert.ok(/stack/i.test(stack.title));

// catalog covers core Diff chords
assert.ok(SHORTCUT_MONITOR_CATALOG.navFileNext);
assert.ok(SHORTCUT_MONITOR_CATALOG.scrollDiffPageNext);
assert.ok(SHORTCUT_MONITOR_CATALOG.moveSelectionDown);

// --- dismiss timing ---
const t0 = 1_000_000;
const f = buildShortcutMonitorFire('navFilePrev', true, t0);
assert.equal(isShortcutMonitorFireActive(f, t0 + 100, 1800), true);
assert.equal(
  isShortcutMonitorFireActive(f, t0 + SHORTCUT_MONITOR_DISMISS_MS + 1, SHORTCUT_MONITOR_DISMISS_MS),
  false,
  'expired after dismiss window'
);
assert.equal(isShortcutMonitorFireActive(null, t0), false);

// --- Opt-alone vs chord modifiers ---
assert.equal(isOptAloneHeld({ alt: true }), true);
assert.equal(isOptAloneHeld({ alt: true, shift: true }), false, '⌥⇧ not alone');
assert.equal(isOptAloneHeld({ alt: true, mod: true }), false, '⌥⌘ not alone');
assert.equal(isOptAloneHeld({ alt: false }), false);

// --- single floating view: fire wins over held (no stack) ---
const viewFire = resolveShortcutMonitorView(f, true, {
  isMac: true,
  now: t0 + 50,
  dismissMs: 1800,
});
assert.equal(viewFire.visible, true);
assert.equal(viewFire.mode, 'fire');
assert.equal(viewFire.text, f.text);
assert.equal(viewFire.showHeld, false, 'fire does not stack with held');

const viewHeldOnly = resolveShortcutMonitorView(null, true, {
  isMac: false,
  now: t0,
});
assert.equal(viewHeldOnly.visible, true);
assert.equal(viewHeldOnly.mode, 'held');
assert.equal(viewHeldOnly.text, 'Alt held');
assert.equal(viewHeldOnly.showFire, false);

// Chord modifiers held alone (optAlone=false) → no held label
const viewChordHold = resolveShortcutMonitorView(null, false, {
  isMac: true,
  now: t0,
});
assert.equal(viewChordHold.visible, false, 'no opt-alone → no held HUD');

const viewHidden = resolveShortcutMonitorView(f, false, {
  now: t0 + 99999,
  dismissMs: 100,
});
assert.equal(viewHidden.visible, false);

// --- component + CSS exist ---
const root = path.join(__dirname, '..');
assert.ok(
  fs.existsSync(path.join(root, 'src/modal/components/common/ShortcutMonitor.tsx'))
);
const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
assert.ok(css.includes('.prp-shortcut-monitor'));
assert.ok(css.includes('background: #0d1117') || css.includes('background:#0d1117'));
assert.ok(css.includes('color: #f0f6fc') || css.includes('color:#f0f6fc'));
assert.ok(
  css.includes('bottom: 20px') || css.includes('bottom:20px'),
  'HUD sits at bottom center'
);
assert.ok(
  css.includes('prp-shortcut-monitor--out') && css.includes('opacity'),
  'fade-out phase styles'
);

// --- bus isolation (no App setState for monitor fire) ---
const {
  publishShortcutMonitorFire,
  getShortcutMonitorFire,
  subscribeShortcutMonitorFire,
  clearShortcutMonitorFire,
} = require('../src/modal/lib/shortcut-monitor-bus.ts');
let busHits = 0;
const unsub = subscribeShortcutMonitorFire(() => {
  busHits += 1;
});
publishShortcutMonitorFire(buildShortcutMonitorFire('navFileNext', true, 42));
assert.equal(getShortcutMonitorFire()?.action, 'navFileNext');
assert.ok(busHits >= 1, 'subscribers notified without React App');
clearShortcutMonitorFire();
assert.equal(getShortcutMonitorFire(), null);
unsub();

// --- App wiring: report on resolve→dispatch via bus, mount self-contained HUD ---
const appSrc = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(appSrc.includes('ShortcutMonitor'), 'mounts ShortcutMonitor');
assert.ok(appSrc.includes('reportShortcutAction'), 'report helper');
assert.ok(
  /if \(!action\) return;[\s\S]{0,400}reportShortcutAction/.test(appSrc),
  'reports after action resolves, before switch'
);
assert.ok(
  appSrc.includes('publishShortcutMonitorFire'),
  'fires go through bus (not App useState)'
);
assert.ok(
  !appSrc.includes('optAloneHeld={'),
  'App does not pass optAloneHeld — monitor owns hold'
);
assert.ok(
  appSrc.includes('startTransition'),
  'opt tip badges deferred with startTransition'
);
assert.ok(
  appSrc.includes('buildShortcutMonitorFireFromParts'),
  'opt peer path reports title+chord'
);

const monSrc = fs.readFileSync(
  path.join(root, 'src/modal/components/common/ShortcutMonitor.tsx'),
  'utf8'
);
assert.ok(monSrc.includes('subscribeShortcutMonitorFire'));
assert.ok(monSrc.includes('isOptAloneHeld'));
assert.ok(
  !monSrc.includes('setInterval'),
  'no poll interval — single dismiss timeout only'
);

// selection C shortcuts report too
assert.ok(appSrc.includes("reportShortcutAction('copySelectionCode')"));
assert.ok(appSrc.includes("reportShortcutAction('copySelectionUrl')"));
assert.ok(appSrc.includes("reportShortcutAction('openSelectionComment')"));

console.log('shortcut-monitor.test.js: ok');
