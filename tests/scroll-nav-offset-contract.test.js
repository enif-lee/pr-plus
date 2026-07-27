/**
 * Scroll contracts for ⌥J/K navigation (shipped virtual-range + context-thread-dom).
 * Conversation: start + 24px pad. Diff: third (y - vh/3). In-group: DOM refine.
 */
'use strict';

const assert = require('node:assert/strict');
const { scrollTopForIndex } = require('../src/modal/lib/virtual-range.ts');
const {
  scrollChildToScrollerTop,
} = require('../src/modal/lib/context-thread-dom.ts');

const off = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const vh = 600;

// Conversation keyboard nav: fixed top band
{
  const top = scrollTopForIndex(2, 100, vh, 10, off, {
    align: 'start',
    pad: 24,
  });
  assert.equal(top, 176, 'conv: y(200) - 24');
}

// Diff keyboard nav: ~1/3 viewport
{
  const top = scrollTopForIndex(5, 100, vh, 10, off, { align: 'third' });
  assert.equal(top, 300, 'diff: y(500) - vh/3(200)');
}

// Near-end clamp does not invent scroll past max
{
  const maxScroll = 1000 - vh;
  const top = scrollTopForIndex(9, 100, vh, 10, off, {
    align: 'start',
    pad: 24,
  });
  assert.ok(top <= maxScroll, 'clamped to maxScroll');
  assert.equal(top, maxScroll);
}

// In-group refine (shared virtual row)
{
  const sc = {
    scrollTop: 500,
    clientHeight: 400,
    scrollHeight: 2000,
    getBoundingClientRect() {
      return {
        top: 100,
        bottom: 500,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
      };
    },
  };
  const child = {
    getBoundingClientRect() {
      return {
        top: 300,
        bottom: 380,
        left: 0,
        right: 300,
        width: 300,
        height: 80,
      };
    },
  };
  const d = scrollChildToScrollerTop(sc, child, { pad: 24 });
  assert.equal(d, 176, 'delta = child.top - scroller.top - 24');
  assert.equal(sc.scrollTop, 676);
}

// Source wiring: VCL uses pad 24 + group refine; Diff uses third
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const vcl = fs.readFileSync(
    path.join(root, 'src/modal/views/conversation/VirtualConversationList.tsx'),
    'utf8'
  );
  const app = fs.readFileSync(
    path.join(root, 'src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(vcl.includes("pad: 24") || vcl.includes('pad:24'));
  assert.ok(vcl.includes('scrollChildToScrollerTop'));
  assert.ok(
    /align:\s*['"]third['"]/.test(app) || app.includes("align: 'third'")
  );
}

console.log('scroll-nav-offset-contract.test.js: ok');
