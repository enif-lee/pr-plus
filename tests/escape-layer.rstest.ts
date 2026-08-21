/**
 * Nested Escape ownership pure helpers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import {
  claimNestedEscape,
  resolveModalEscapeOwner,
  isNestedEscapeLayerOpen,
  NESTED_ESCAPE_LAYER_SELECTOR,
} from '../src/modal/lib/escape-layer';

describe('resolveModalEscapeOwner', () => {
  test('close-shell when nothing nested', () => {
    expect(resolveModalEscapeOwner({})).toBe('close-shell');
  });

  test('nested layers beat shell close', () => {
    expect(
      resolveModalEscapeOwner({ nestedLayerOpen: true })
    ).toBe('dismiss-nested');
    expect(resolveModalEscapeOwner({ pickerOpen: true })).toBe(
      'dismiss-nested'
    );
    expect(resolveModalEscapeOwner({ paletteOpen: true })).toBe(
      'dismiss-nested'
    );
    expect(resolveModalEscapeOwner({ searchOpen: true })).toBe(
      'dismiss-nested'
    );
    expect(resolveModalEscapeOwner({ confirmOpen: true })).toBe(
      'dismiss-nested'
    );
    expect(resolveModalEscapeOwner({ finishReviewOpen: true })).toBe(
      'dismiss-nested'
    );
    expect(resolveModalEscapeOwner({ reactionPickerOpen: true })).toBe(
      'dismiss-nested'
    );
  });

  test('editable focus blurs instead of shell close', () => {
    expect(resolveModalEscapeOwner({ editableFocused: true })).toBe(
      'blur-input'
    );
    // Nested still wins over editable
    expect(
      resolveModalEscapeOwner({
        nestedLayerOpen: true,
        editableFocused: true,
      })
    ).toBe('dismiss-nested');
  });
});

describe('isNestedEscapeLayerOpen', () => {
  test('detects Diff settings menu and SearchableSelect panel', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div class="prp-overlay"></div>
      </body></html>`
    );
    const doc = dom.window.document;
    expect(isNestedEscapeLayerOpen(doc)).toBe(false);

    const settings = doc.createElement('div');
    settings.setAttribute('data-prp-review-filter-menu', '1');
    settings.className = 'prp-diff-review-settings prp-diff-review-settings--portal';
    doc.body.appendChild(settings);
    expect(isNestedEscapeLayerOpen(doc)).toBe(true);

    settings.remove();
    expect(isNestedEscapeLayerOpen(doc)).toBe(false);

    const sel = doc.createElement('div');
    sel.className = 'prp-sselect-panel';
    sel.setAttribute('data-prp-nested-layer', '1');
    doc.body.appendChild(sel);
    expect(isNestedEscapeLayerOpen(doc)).toBe(true);
  });

  test('selector includes known nested markers', () => {
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/data-prp-review-filter-menu/);
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/prp-sselect-panel/);
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/data-prp-nested-layer/);
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/data-prp-md-viewer/);
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/data-prp-mermaid-viewer/);
    expect(NESTED_ESCAPE_LAYER_SELECTOR).toMatch(/data-prp-image-viewer/);
  });

  test('markdown overlay counts as a nested Escape layer', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div class="prp-overlay"></div>
      </body></html>`
    );
    const doc = dom.window.document;
    expect(isNestedEscapeLayerOpen(doc)).toBe(false);
    const viewer = doc.createElement('div');
    viewer.setAttribute('data-prp-md-viewer', '1');
    doc.body.appendChild(viewer);
    expect(isNestedEscapeLayerOpen(doc)).toBe(true);
  });
});

describe('claimNestedEscape', () => {
  test('prevents default and stops propagation', () => {
    const calls: string[] = [];
    claimNestedEscape({
      preventDefault: () => calls.push('pd'),
      stopPropagation: () => calls.push('sp'),
      stopImmediatePropagation: () => calls.push('sip'),
    });
    expect(calls).toEqual(['pd', 'sp', 'sip']);
  });
});

describe('wiring: Diff settings + App gate use nested markers', () => {
  test('DiffToolbar claims Escape and marks settings menu', () => {
    const root = path.resolve(__dirname, '..');
    const toolbar = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
      'utf8'
    );
    expect(toolbar).toMatch(/data-prp-review-filter-menu=["']1["']/);
    expect(toolbar).toMatch(/stopImmediatePropagation/);
    expect(toolbar).toMatch(/setSettingsOpen\(false\)/);
  });

  test('App Escape uses isNestedEscapeLayerOpen / resolveModalEscapeOwner', () => {
    const root = path.resolve(__dirname, '..');
    // Capture keydown lives in usePrModalHotkeys (Phase 7); shell wires deps.
    const shell = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(shell).toMatch(/isNestedEscapeLayerOpen/);
    expect(shell).toMatch(/resolveModalEscapeOwner/);
    const hotkeys = fs.readFileSync(
      path.join(root, 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(hotkeys).toMatch(/isNestedEscapeLayerOpen/);
    expect(hotkeys).toMatch(/resolveModalEscapeOwner/);
    expect(hotkeys).toMatch(/nestedLayerOpen/);
  });

  test('SearchableSelect marks nested layer and claims Escape', () => {
    const root = path.resolve(__dirname, '..');
    const sel = fs.readFileSync(
      path.join(root, 'src/modal/components/common/SearchableSelect.tsx'),
      'utf8'
    );
    expect(sel).toMatch(/data-prp-nested-layer=["']1["']/);
    expect(sel).toMatch(/stopImmediatePropagation/);
  });
});
