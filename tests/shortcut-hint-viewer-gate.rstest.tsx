/**
 * Fullscreen previewer (mermaid / image / markdown) owns the stage:
 * Opt-hold must not paint ShortcutHint badges over it, and must paint again
 * once the viewer closes (root marker set/cleared by FullscreenViewer).
 */
import React from 'react';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { ShortcutHint } from '../src/modal/components/common/ShortcutHint';
import { FullscreenViewer } from '../src/modal/components/common/FullscreenViewer';
import { useModalStore } from '../src/modal/store/modal-store';
import {
  FULLSCREEN_VIEWER_OPEN_ATTR,
  escapeOverlayCount,
  resetEscapeOverlayStack,
} from '../src/modal/lib/escape-layer';

const OPT_HELD_ATTR = 'data-prp-opt-held';

function mountDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.Element = dom.window.Element;
  g.HTMLElement = dom.window.HTMLElement;
  g.MutationObserver = dom.window.MutationObserver;
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  g.ResizeObserver = undefined;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** jsdom has no layout: fake a 100×40 box so the tip has coords to portal to. */
function stubBox(el: Element) {
  (el as any).getBoundingClientRect = () => ({
    x: 10,
    y: 10,
    top: 10,
    left: 10,
    bottom: 50,
    right: 110,
    width: 100,
    height: 40,
    toJSON() {
      return {};
    },
  });
  (el as any).checkVisibility = () => true;
}

const tips = () => document.querySelectorAll('kbd.prp-opt-btn-hint').length;

describe('ShortcutHint viewer gate', () => {
  test('no tips while a fullscreen viewer is open; tips return after close', async () => {
    const dom = mountDom();
    const doc = dom.window.document;
    const { createRoot } = await import('react-dom/client');

    useModalStore.getState().setOptHintsActive(false);
    doc.documentElement.setAttribute(OPT_HELD_ATTR, '1');
    doc.documentElement.setAttribute(FULLSCREEN_VIEWER_OPEN_ATTR, '1');

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    stubBox(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <div className="prp-opt-hint-host">
            <ShortcutHint label="⌥E" />
            <button type="button">Emoji</button>
          </div>
        );
      });
      expect(tips()).toBe(0);

      // Viewer closes → marker drops → observer re-syncs this leaf
      await act(async () => {
        doc.documentElement.removeAttribute(FULLSCREEN_VIEWER_OPEN_ATTR);
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(tips()).toBeGreaterThanOrEqual(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      doc.documentElement.removeAttribute(OPT_HELD_ATTR);
      doc.documentElement.removeAttribute(FULLSCREEN_VIEWER_OPEN_ATTR);
      useModalStore.getState().setOptHintsActive(false);
    }
  });
});

function ViewerStack({ count }: { count: number }) {
  return (
    <>
      <FullscreenViewer
        layer="mermaid"
        title="Diagram"
        closeLabel="Close diagram viewer"
        hint="Scroll pan · Esc"
        onClose={() => {}}
      >
        <div>diagram</div>
      </FullscreenViewer>
      {count > 1 ? (
        <FullscreenViewer
          layer="image"
          title="Image"
          closeLabel="Close image viewer"
          onClose={() => {}}
        >
          <div>image</div>
        </FullscreenViewer>
      ) : null}
    </>
  );
}

describe('FullscreenViewer root marker', () => {
  test('stamped while a viewer is mounted, cleared only after the last one', async () => {
    const dom = mountDom();
    const doc = dom.window.document;
    const { createRoot } = await import('react-dom/client');
    resetEscapeOverlayStack();

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const root = createRoot(container);
    const open = () => doc.documentElement.hasAttribute(FULLSCREEN_VIEWER_OPEN_ATTR);
    try {
      await act(async () => root.render(<ViewerStack count={1} />));
      expect(open()).toBe(true);
      expect(escapeOverlayCount()).toBe(1);

      await act(async () => root.render(<ViewerStack count={2} />));
      expect(open()).toBe(true);

      await act(async () => root.render(<ViewerStack count={1} />));
      expect(open()).toBe(true);

      await act(async () => root.unmount());
      expect(open()).toBe(false);
      expect(escapeOverlayCount()).toBe(0);
    } finally {
      container.remove();
      resetEscapeOverlayStack();
    }
  });
});
