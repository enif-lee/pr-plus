/**
 * Focused composer scroll-into-view — drives shipped context-thread-dom helpers
 * with synthetic scroller + child geometry (jsdom + mocked rects).
 */
import { afterEach, beforeAll, describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import {
  scrollChildToMaximizeInScroller,
  scrollChildToRevealInScroller,
  scrollFocusedComposerIntoView,
  resolveComposerFormHost,
  isElementSubstantiallyVisibleInScroller,
  verticalOverlapInScroller,
  queryProductScroller,
  PRODUCT_SCROLLER_SELECTOR,
} from '../src/modal/lib/context-thread-dom';

type Rect = {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  width?: number;
  height: number;
  x?: number;
  y?: number;
};

let dom: JSDOM;
let document: Document;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  document = dom.window.document;
  // Shipped helpers use global document only for focus; scroller math uses nodes.
  (globalThis as any).document = document;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).Element = dom.window.Element;
});

function mockRect(el: HTMLElement, rect: Rect) {
  const r = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 100),
    width: rect.width ?? 100,
    height: rect.height,
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top,
    toJSON() {
      return this;
    },
  };
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => r,
  });
}

function makeScroller(opts: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop?: number;
  top?: number;
}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'prp-vlist';
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => opts.clientHeight,
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => opts.scrollHeight,
  });
  let top = opts.scrollTop ?? 0;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Number(v) || 0;
    },
  });
  const sTop = opts.top ?? 0;
  mockRect(el, {
    top: sTop,
    bottom: sTop + opts.clientHeight,
    height: opts.clientHeight,
    width: 400,
  });
  document.body.appendChild(el);
  return el;
}

function makeChild(
  parent: HTMLElement,
  rect: Rect,
  className = 'prp-inline-thread__composer'
): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  mockRect(el, rect);
  parent.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('queryProductScroller', () => {
  test('finds nearest .prp-vlist ancestor', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 2000,
    });
    const child = makeChild(scroller, {
      top: 100,
      bottom: 140,
      height: 40,
    });
    expect(queryProductScroller(child)).toBe(scroller);
    expect(PRODUCT_SCROLLER_SELECTOR).toMatch(/prp-vlist/);
  });
});

describe('scrollChildToMaximizeInScroller (clipped → scroll)', () => {
  test('pulls child up when clipped below viewport', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 4000,
      scrollTop: 0,
      top: 0,
    });
    // Child sits entirely below the 400px viewport (top 500)
    const child = makeChild(scroller, {
      top: 500,
      bottom: 560,
      height: 60,
    });
    expect(
      isElementSubstantiallyVisibleInScroller(scroller, child, {
        minOverlapPx: 24,
      })
    ).toBe(false);

    const delta = scrollChildToMaximizeInScroller(scroller, child, {
      padTop: 24,
      padBottom: 24,
    });
    expect(delta).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeGreaterThan(0);

    // Simulate layout after scroll: child moves up by delta
    mockRect(child, {
      top: 500 - delta,
      bottom: 560 - delta,
      height: 60,
    });
    expect(
      isElementSubstantiallyVisibleInScroller(scroller, child, {
        minOverlapPx: 24,
        padTop: 24,
        padBottom: 24,
      })
    ).toBe(true);
  });

  test('no-op when child already fully in padded view', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 2000,
      scrollTop: 100,
      top: 0,
    });
    const child = makeChild(scroller, {
      top: 80,
      bottom: 140,
      height: 60,
    });
    const before = scroller.scrollTop;
    const delta = scrollChildToMaximizeInScroller(scroller, child, {
      padTop: 24,
      padBottom: 24,
    });
    expect(delta).toBe(0);
    expect(scroller.scrollTop).toBe(before);
    expect(
      isElementSubstantiallyVisibleInScroller(scroller, child, {
        minOverlapPx: 24,
      })
    ).toBe(true);
  });
});

describe('scrollChildToRevealInScroller (minimal focus band)', () => {
  test('no-op when enough of child is already visible', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 2000,
      scrollTop: 50,
      top: 0,
    });
    const child = makeChild(scroller, {
      top: 100,
      bottom: 160,
      height: 60,
    });
    const before = scroller.scrollTop;
    const delta = scrollChildToRevealInScroller(scroller, child, {
      padTop: 24,
      padBottom: 16,
      minVisiblePx: 40,
    });
    expect(delta).toBe(0);
    expect(scroller.scrollTop).toBe(before);
  });

  test('only scrolls enough to bring clipped-below focus into view', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 4000,
      scrollTop: 0,
      top: 0,
    });
    // Focus band just below viewport
    const child = makeChild(scroller, {
      top: 420,
      bottom: 480,
      height: 60,
    });
    const delta = scrollChildToRevealInScroller(scroller, child, {
      padTop: 24,
      padBottom: 16,
      minVisiblePx: 40,
    });
    expect(delta).toBeGreaterThan(0);
    // Minimal: should not jump by more than needed to clear bottom pad
    expect(delta).toBeLessThanOrEqual(120);
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });
});

describe('resolveComposerFormHost', () => {
  test('prefers outer Conversation card over nested mdc root', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 2000,
    });
    const card = makeChild(scroller, {
      top: 100,
      bottom: 280,
      height: 180,
    }, 'prp-card--composer');
    const root = document.createElement('div');
    root.setAttribute('data-prp-composer-root', '1');
    card.appendChild(root);
    const mdc = document.createElement('div');
    mdc.className = 'prp-mdc';
    root.appendChild(mdc);
    const ta = document.createElement('textarea');
    mdc.appendChild(ta);

    expect(resolveComposerFormHost(ta)).toBe(card);
  });
});

describe('scrollFocusedComposerIntoView', () => {
  test('scrolls off-screen composer host when focusing nested textarea', () => {
    const scroller = makeScroller({
      clientHeight: 300,
      scrollHeight: 3000,
      scrollTop: 0,
      top: 0,
    });
    const host = makeChild(scroller, {
      top: 800,
      bottom: 900,
      height: 100,
    });
    const ta = document.createElement('textarea');
    ta.className = 'prp-mdc__ta';
    mockRect(ta, { top: 820, bottom: 860, height: 40 });
    host.appendChild(ta);

    expect(verticalOverlapInScroller(scroller, ta)).toBe(0);
    const delta = scrollFocusedComposerIntoView(ta, {
      padTop: 24,
      padBottom: 48,
    });
    expect(delta).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  test('stable no-op when composer already visible', () => {
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 2000,
      scrollTop: 50,
      top: 0,
    });
    const host = makeChild(scroller, {
      top: 100,
      bottom: 180,
      height: 80,
    });
    const ta = document.createElement('textarea');
    mockRect(ta, { top: 120, bottom: 160, height: 40 });
    host.appendChild(ta);

    const before = scroller.scrollTop;
    const delta = scrollFocusedComposerIntoView(ta, {
      padTop: 24,
      padBottom: 48,
    });
    expect(delta).toBe(0);
    expect(scroller.scrollTop).toBe(before);
  });

  test('pulls form up when growth clips bottom past viewport', () => {
    // Form started near bottom; after open/actions the bottom is past vh
    const scroller = makeScroller({
      clientHeight: 400,
      scrollHeight: 4000,
      scrollTop: 0,
      top: 0,
    });
    const host = makeChild(scroller, {
      top: 280,
      bottom: 460, // 60px past bottom of 400 viewport
      height: 180,
    });
    const ta = document.createElement('textarea');
    mockRect(ta, { top: 290, bottom: 360, height: 70 });
    host.appendChild(ta);

    const delta = scrollFocusedComposerIntoView(ta, {
      padTop: 16,
      padBottom: 28,
    });
    expect(delta).toBeGreaterThan(0);
    // Need enough scroll to clear bottom pad: bottom 460 → viewBottom 372
    expect(scroller.scrollTop).toBeGreaterThanOrEqual(80);
  });

  test('tall form pins bottom so CTAs stay reachable', () => {
    const scroller = makeScroller({
      clientHeight: 300,
      scrollHeight: 4000,
      scrollTop: 0,
      top: 0,
    });
    // Form taller than padded viewport (300 - 16 - 28 = 256)
    const host = makeChild(scroller, {
      top: 40,
      bottom: 40 + 400,
      height: 400,
    });
    const ta = document.createElement('textarea');
    mockRect(ta, { top: 50, bottom: 150, height: 100 });
    host.appendChild(ta);

    const delta = scrollFocusedComposerIntoView(ta, {
      padTop: 16,
      padBottom: 28,
    });
    expect(delta).toBeGreaterThan(0);
    // Pin bottom: childBottom 440 → viewBottom 272 → delta ≈ 168
    expect(scroller.scrollTop).toBeGreaterThanOrEqual(150);
  });

  test('scrolls outer card (not only nested mdc) when clipped', () => {
    const scroller = makeScroller({
      clientHeight: 350,
      scrollHeight: 3000,
      scrollTop: 0,
      top: 0,
    });
    const card = makeChild(
      scroller,
      { top: 300, bottom: 480, height: 180 },
      'prp-card--composer'
    );
    const mdc = document.createElement('div');
    mdc.className = 'prp-mdc';
    // Nested mdc alone would fit if we only measured it — card does not
    mockRect(mdc, { top: 320, bottom: 380, height: 60 });
    card.appendChild(mdc);
    const ta = document.createElement('textarea');
    mockRect(ta, { top: 330, bottom: 370, height: 40 });
    mdc.appendChild(ta);

    const delta = scrollFocusedComposerIntoView(ta, {
      padTop: 16,
      padBottom: 28,
    });
    expect(delta).toBeGreaterThan(0);
    expect(resolveComposerFormHost(ta)).toBe(card);
  });
});
