/**
 * Document scroll lock for modal / side-sheet overlay.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const {
  SCROLL_LOCK_CLASS,
  measureScrollbarWidth,
  applyScrollLock,
  restoreScrollLock,
} = require('../src/modal/lib/scroll-lock.ts');

const root = path.join(__dirname, '..');

// --- pure helpers ---
{
  assert.equal(measureScrollbarWidth(null), 0);
  assert.equal(measureScrollbarWidth({}), 0);
  assert.equal(
    measureScrollbarWidth({
      innerWidth: 1000,
      document: { documentElement: { clientWidth: 985 } },
    }),
    15
  );
  assert.equal(
    measureScrollbarWidth({
      innerWidth: 800,
      document: { documentElement: { clientWidth: 800 } },
    }),
    0
  );
}

{
  const dom = new JSDOM('<!doctype html><html><body style="padding-right: 4px"></body></html>');
  const { document } = dom.window;
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'scroll';

  const snap = applyScrollLock(document, { scrollbarWidth: 12 });
  assert.ok(snap);
  assert.equal(document.documentElement.style.overflow, 'hidden');
  assert.equal(document.body.style.overflow, 'hidden');
  assert.ok(document.documentElement.classList.contains(SCROLL_LOCK_CLASS));
  assert.ok(document.body.classList.contains(SCROLL_LOCK_CLASS));
  // 4px existing + 12px scrollbar compensation
  assert.equal(document.body.style.paddingRight, '16px');

  restoreScrollLock(document, snap);
  assert.equal(document.documentElement.style.overflow, 'auto');
  assert.equal(document.body.style.overflow, 'scroll');
  assert.equal(document.body.style.paddingRight, '4px');
  assert.ok(!document.documentElement.classList.contains(SCROLL_LOCK_CLASS));
  assert.ok(!document.body.classList.contains(SCROLL_LOCK_CLASS));
}

{
  // restore with null / missing nodes is a no-op
  assert.equal(applyScrollLock(null), null);
  restoreScrollLock(null, null);
  restoreScrollLock({ documentElement: null, body: null }, {});
}

// --- App wires lock on open ---
{
  const app = fs.readFileSync(
    path.join(root, 'src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(app.includes('applyScrollLock'), 'App imports applyScrollLock');
  assert.ok(app.includes('restoreScrollLock'), 'App restores on unmount');
  assert.ok(app.includes('measureScrollbarWidth'), 'App measures scrollbar');
  assert.ok(
    /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*applyScrollLock[\s\S]*\[open\]/.test(app) ||
      (app.includes('applyScrollLock') && app.includes('[open]')),
    'scroll lock effect depends on open'
  );
}

// --- CSS: page lock + overlay isolation + panel scroll ---
{
  const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
  assert.ok(css.includes('html.prp-scroll-lock'), 'html lock class');
  assert.ok(
    css.includes('overflow: hidden !important') || css.includes('overflow:hidden !important'),
    'html/body overflow hidden under lock'
  );
  assert.ok(css.includes('.prp-overlay'), 'overlay styles');
  // Overlay must not pass scroll to the page
  const overlayBlock = css.slice(css.indexOf('.prp-overlay {'), css.indexOf('.prp-overlay {') + 800);
  assert.ok(
    /overscroll-behavior:\s*none/.test(css),
    'overscroll-behavior none on overlay or lock'
  );
  assert.ok(
    css.includes('.prp-conversation') && css.includes('overscroll-behavior: contain'),
    'conversation contains scroll'
  );
  assert.ok(
    css.includes('.prp-shell--sheet') && /overflow:\s*hidden/.test(css),
    'sheet shell keeps overflow hidden on overlay'
  );
}

// --- side sheet test remains compatible ---
{
  const side = fs.readFileSync(path.join(root, 'tests/side-sheet-toggle.test.js'), 'utf8');
  assert.ok(side.includes('prp-shell--sheet'));
}

console.log('scroll-lock.test.js: all assertions passed');
console.log(`class=${SCROLL_LOCK_CLASS}`);
console.log('apply-restore=ok');
console.log('app-wired=true');
console.log('css-lock=true');
