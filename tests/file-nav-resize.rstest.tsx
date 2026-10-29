import React, { act } from 'react';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import { PrModalApp } from '../src/modal/app/PrModalApp';
import { PAGE_EMBED_BUBBLE_SHIELD_EVENTS } from '../src/modal/lib/page-embed';
import { FILE_NAV_PREF_KEY } from '../src/modal/lib/file-nav-layout';

describe('Diff file navigator resize', () => {
  test('tracks and finishes drags behind the embed event shield', async () => {
    const dom = new JSDOM('<!doctype html><div id="prp-page-embed"></div>', {
      url: 'https://github.com/enif-lee/pr-plus/pull/19/files',
      pretendToBeVisual: true,
    });
    const globals = {
      window: dom.window,
      open: dom.window.open,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      MutationObserver: dom.window.MutationObserver,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = new Map(Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const { createRoot } = await import('react-dom/client');
    const host = document.getElementById('prp-page-embed')!;
    // Same bubble shield as ensureEmbedBubbleShield in the host.
    for (const type of PAGE_EMBED_BUBBLE_SHIELD_EVENTS) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<PrModalApp
          open
          loading={false}
          presentation="embed"
          initialRoute={{ page: 'diff' }}
          openPulls={[]}
          detail={{
            owner: 'enif-lee', repo: 'pr-plus', number: 19,
            title: 'Resize fixture', state: 'open', body: '',
            files: [], comments: [], reviewComments: [], reviews: [], commits: [],
          }}
        />);
      });
      const separator = host.querySelector('.prp-file-nav-resizer')!;
      const layout = host.querySelector('.prp-diff-layout')!;
      const fire = async (type: string, clientX: number) => {
        await act(async () => {
          // jsdom has no PointerEvent constructor; MouseEvent supplies clientX.
          separator.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX, button: 0 }));
        });
      };
      for (const [endEvent, start, end] of [
        ['pointerup', 260, 340],
        ['pointercancel', 340, 220],
      ] as const) {
        await fire('pointerdown', start);
        expect(layout.classList.contains('prp-diff-layout--resizing')).toBe(true);
        await fire('pointermove', end);
        expect(separator.getAttribute('aria-valuenow')).toBe(String(end));
        await fire(endEvent, end);
        expect(layout.classList.contains('prp-diff-layout--resizing')).toBe(false);
        expect(JSON.parse(dom.window.localStorage.getItem(FILE_NAV_PREF_KEY)!).width).toBe(end);
        // Moving after release/cancellation must leave the width unchanged.
        await fire('pointermove', end + 30);
        expect(separator.getAttribute('aria-valuenow')).toBe(String(end));
      }
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
});
