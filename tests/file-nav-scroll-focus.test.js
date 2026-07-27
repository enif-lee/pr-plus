/**
 * File nav: scroll file header to scrollport start + header focus UI.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  scrollTopForIndex,
  scrollTopToRevealIndex,
} = require('../src/modal/lib/virtual-range.ts');

// Default (quarter): not flush to top
const quarter = scrollTopForIndex(100, 20, 400, 1000);
assert.equal(quarter, 100 * 20 - Math.floor(400 / 4)); // 1900
assert.ok(quarter < 100 * 20);

// align start: pin index to first line of viewport
const start = scrollTopForIndex(100, 20, 400, 1000, null, { align: 'start' });
assert.equal(start, 100 * 20, 'start align = index * rowHeight');

// offsets path
const offsets = [];
for (let i = 0; i <= 50; i++) offsets.push(i * 22);
const startOff = scrollTopForIndex(10, 22, 300, 50, offsets, {
  align: 'start',
});
assert.equal(startOff, offsets[10]);
const quarterOff = scrollTopForIndex(10, 22, 300, 50, offsets);
assert.equal(quarterOff, offsets[10] - Math.floor(300 / 4));

// App: file select uses align start
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /function onSelectFile[\s\S]*align:\s*['"]start['"]/.test(appSrc),
  'onSelectFile pins file header to scroll start'
);
assert.ok(
  /activeFilePath=\{activeFilePath\}/.test(appSrc) ||
    appSrc.includes('activeFilePath={activeFilePath}'),
  'passes activeFilePath into VirtualDiff for header focus'
);

// VirtualDiff focus class on active header
const vdSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
  'utf8'
);
assert.ok(vdSrc.includes('prp-vline--header-focus'), 'focus class on header');
assert.ok(vdSrc.includes('data-file-focus'), 'data-file-focus attribute');
assert.ok(
  /activeFilePath\s*=\s*null/.test(vdSrc) || vdSrc.includes('activeFilePath'),
  'VirtualDiff accepts activeFilePath'
);

// CSS focus chrome
const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
assert.ok(css.includes('.prp-vline--header-focus'), 'focus styles present');

// Minimal reveal: keep scroll when row already visible (arrow key within file)
{
  const rh = 20;
  const vp = 400;
  const total = 1000;
  // File pinned at top: scrollTop = headerY; line a few rows down still visible
  const headerIdx = 100;
  const lineIdx = 105; // 5 rows below header
  const filePinTop = scrollTopForIndex(headerIdx, rh, vp, total, null, {
    align: 'start',
  });
  const reveal = scrollTopToRevealIndex(
    lineIdx,
    filePinTop,
    rh,
    vp,
    total,
    null,
    { pad: 2 }
  );
  assert.equal(
    reveal,
    filePinTop,
    'arrow within viewport must not change scroll (no previous-file flash)'
  );
  // Forced quarter align on a line near the file top jumps ABOVE the pin
  const nearTopLine = headerIdx + 1;
  const quarterJump = scrollTopForIndex(nearTopLine, rh, vp, total);
  assert.ok(
    quarterJump < filePinTop,
    'quarter align jumps above file pin — that was the bug'
  );

  // Below viewport → scroll just enough
  const farIdx = 200;
  const farTop = scrollTopToRevealIndex(farIdx, filePinTop, rh, vp, total);
  assert.ok(farTop > filePinTop);
  const farY = farIdx * rh;
  assert.ok(farY + rh <= farTop + vp + 1, 'far row bottom fits in view');

  // Above viewport → scroll up just enough
  const above = scrollTopToRevealIndex(50, 5000, rh, vp, total);
  assert.equal(above, 50 * rh);

  // Sticky header inset: row under fixed header must scroll so caret clears it
  const stickyH = 22;
  // Line sits just under sticky (still "visible" with pad=2 only)
  const scrollDeep = headerIdx * rh + 300;
  const underStickyIdx = Math.floor(scrollDeep / rh) + 1; // first row under sticky edge
  const underY = underStickyIdx * rh;
  // Without padTop: treated as visible (y >= scrollTop + 2)
  const noInset = scrollTopToRevealIndex(
    underStickyIdx,
    scrollDeep,
    rh,
    vp,
    total,
    null,
    { pad: 2 }
  );
  assert.equal(noInset, scrollDeep, 'tiny pad leaves row under sticky');
  // With padTop = sticky height: must scroll so row clears sticky
  const withSticky = scrollTopToRevealIndex(
    underStickyIdx,
    scrollDeep,
    rh,
    vp,
    total,
    null,
    { padTop: stickyH + 2, padBottom: 2 }
  );
  assert.ok(
    withSticky < scrollDeep,
    'padTop scrolls up to clear sticky header'
  );
  assert.ok(
    underY >= withSticky + stickyH,
    'row top is at or below sticky bottom'
  );
}

assert.ok(
  appSrc.includes('scrollTopToRevealIndex'),
  'keyboard selection uses minimal reveal scroll'
);

console.log('file-nav-scroll-focus.test.js: ok');
