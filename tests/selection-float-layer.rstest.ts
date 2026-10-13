/**
 * Selection comment dock paints above the file-focus outline and the
 * unfocused dim. The virtual window's translate3d traps in-flow z-index,
 * so the dock is portaled into a later sibling layer and glued to the row.
 */
import { beforeAll, describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { syncSelectionFloatLayer } from '../src/modal/lib/selection-float-layer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let document: Document;

beforeAll(() => {
  document = new JSDOM('<!doctype html><html><body></body></html>').window
    .document;
});

function rect(top: number, height: number) {
  return {
    x: 0,
    y: top,
    left: 0,
    right: 400,
    top,
    bottom: top + height,
    width: 400,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe('syncSelectionFloatLayer', () => {
  test('shell tracks the anchor in the float layer and keeps split modifiers', () => {
    document.body.innerHTML = `
      <div class="prp-vlist">
        <div class="prp-vlist__window">
          <div class="prp-sel-dock-host prp-sel-dock-host--split-right" data-prp-selection-anchor="1"></div>
        </div>
        <div class="prp-file-unfocused-dim-host"></div>
        <div class="prp-file-focus-outline"></div>
        <div class="prp-selection-float-layer" data-prp-selection-float="1">
          <div class="prp-portal prp-sel-dock-host" data-prp-selection-float-shell="1"></div>
        </div>
      </div>
    `;
    const vlist = document.querySelector('.prp-vlist') as HTMLElement;
    const anchor = vlist.querySelector(
      '[data-prp-selection-anchor="1"]'
    ) as HTMLElement;
    const layer = vlist.querySelector(
      '[data-prp-selection-float="1"]'
    ) as HTMLElement;
    const shell = vlist.querySelector(
      '[data-prp-selection-float-shell="1"]'
    ) as HTMLElement;
    anchor.getBoundingClientRect = () => rect(180, 22);
    layer.getBoundingClientRect = () => rect(40, 0);
    syncSelectionFloatLayer(vlist);
    expect(shell.style.top).toBe('140px');
    expect(shell.style.height).toBe('22px');
    expect(shell.className).toBe(
      'prp-portal prp-sel-dock-host prp-sel-dock-host--split-right'
    );
    syncSelectionFloatLayer(null);
    syncSelectionFloatLayer(vlist);
    expect(shell.style.top).toBe('140px');
  });

  test('missing shell does not throw', () => {
    document.body.innerHTML = `<div class="prp-vlist"></div>`;
    expect(() =>
      syncSelectionFloatLayer(document.querySelector('.prp-vlist'))
    ).not.toThrow();
  });
});

describe('selection float layer wiring', () => {
  test('layer follows the outline inside the spacer and stacks above it', () => {
    const vdiff = read('src/modal/views/diff/VirtualDiff.tsx');
    const css = read('src/modal/views/diff/DiffActiveRow.css');
    const tokens = read('src/modal/styles/tokens.css');
    const bar = read('src/modal/views/diff/SelectionCommentBar.tsx');
    const outlineAt = vdiff.indexOf('<DiffFileFocusOutline');
    const layerAt = vdiff.indexOf('data-prp-selection-float="1"');
    expect(outlineAt).toBeGreaterThan(0);
    expect(layerAt).toBeGreaterThan(outlineAt);
    expect(css).toMatch(
      /\.prp-selection-float-layer\s*\{[^}]*z-index:\s*var\(--prp-z-island,\s*70\)/
    );
    expect(css).toMatch(
      /\.prp-file-focus-outline\s*\{[^}]*z-index:\s*var\(--prp-z-content-raised,\s*2\)/
    );
    expect(css).toMatch(
      /\.prp-file-unfocused-dim-host\s*\{[^}]*z-index:\s*var\(--prp-z-content,\s*1\)/
    );
    expect(tokens).toMatch(/--prp-z-island:\s*70/);
    expect(tokens).toMatch(/--prp-z-content-raised:\s*2/);
    expect(tokens).toMatch(/--prp-z-content:\s*1/);
    expect(bar).toMatch(/createPortal\(shell,\s*portalTarget\)/);
    expect(bar).toMatch(/prp-portal/);
    expect(bar).toMatch(/data-prp-selection-float-shell="1"/);
    // Sticky clone is outside .prp-vlist, so it is not portaled under the scroller.
    expect(bar).toContain("closest?.('.prp-vlist')");
  });
});
