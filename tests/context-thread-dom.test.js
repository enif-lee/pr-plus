/**
 * Context-thread DOM scroll helpers (in-group thread hops).
 */
'use strict';

const assert = require('node:assert/strict');
const {
  scrollChildToScrollerTop,
} = require('../src/modal/lib/context-thread-dom.ts');

// Mock scroller + child geometry
function makeScroller(opts) {
  const {
    scrollTop = 0,
    clientHeight = 400,
    scrollHeight = 2000,
    top = 100,
  } = opts || {};
  const el = {
    scrollTop,
    clientHeight,
    scrollHeight,
    getBoundingClientRect() {
      return {
        top,
        bottom: top + clientHeight,
        left: 0,
        right: 300,
        width: 300,
        height: clientHeight,
      };
    },
  };
  return el;
}

function makeChild(top) {
  return {
    getBoundingClientRect() {
      return {
        top,
        bottom: top + 80,
        left: 0,
        right: 300,
        width: 300,
        height: 80,
      };
    },
  };
}

// Child already at scroller top → no-op
{
  const sc = makeScroller({ scrollTop: 500, top: 100 });
  const child = makeChild(100);
  const d = scrollChildToScrollerTop(sc, child);
  assert.equal(d, 0);
  assert.equal(sc.scrollTop, 500);
}

// Child 200px below scroller top → scroll down 200
{
  const sc = makeScroller({ scrollTop: 500, top: 100 });
  const child = makeChild(300); // 200 below scroller top
  const d = scrollChildToScrollerTop(sc, child);
  assert.equal(d, 200);
  assert.equal(sc.scrollTop, 700);
}

// Child above scroller top → scroll up
{
  const sc = makeScroller({ scrollTop: 500, top: 100 });
  const child = makeChild(20); // 80 above
  const d = scrollChildToScrollerTop(sc, child);
  assert.equal(d, -80);
  assert.equal(sc.scrollTop, 420);
}

// Clamp to max scroll
{
  const sc = makeScroller({
    scrollTop: 1900,
    clientHeight: 400,
    scrollHeight: 2000,
    top: 100,
  });
  // max = 1600 already past — clamp
  const child = makeChild(500);
  scrollChildToScrollerTop(sc, child);
  assert.ok(sc.scrollTop <= 1600);
}

console.log('context-thread-dom.test.js: ok');
