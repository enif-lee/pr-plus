/**
 * Composer @ / / / : suggest-menu placement (viewport coords).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { placeComposerSuggestMenu } from '../src/modal/lib/markdown-composer';

const root = path.join(__dirname, '..');

describe('placeComposerSuggestMenu', () => {
  const vp = {
    viewportWidth: 1000,
    viewportHeight: 800,
    menuHeight: 200,
    gap: 4,
    edge: 8,
    minWidth: 220,
    maxWidth: 360,
  };

  test('prefers above the textarea when there is room', () => {
    const pos = placeComposerSuggestMenu(
      { top: 400, left: 120, bottom: 520, width: 480, height: 120 },
      { ...vp, prefer: 'above' }
    );
    expect(pos.placement).toBe('above');
    expect(pos.top).toBe(400 - 200 - 4);
    expect(pos.left).toBe(120);
    expect(pos.width).toBe(360);
  });

  test('flips below when the composer is near the top of the viewport', () => {
    const pos = placeComposerSuggestMenu(
      { top: 20, left: 80, bottom: 120, width: 400, height: 100 },
      { ...vp, prefer: 'above' }
    );
    expect(pos.placement).toBe('below');
    expect(pos.top).toBe(124);
  });

  test('stays above a bottom Conversation composer (no room below)', () => {
    const pos = placeComposerSuggestMenu(
      { top: 620, left: 80, bottom: 760, width: 520, height: 140 },
      { ...vp, prefer: 'above' }
    );
    expect(pos.placement).toBe('above');
    expect(pos.top).toBe(620 - 200 - 4);
    expect(pos.top + 200).toBeLessThan(620);
  });

  test('clamps left so a wide menu stays on-screen', () => {
    const pos = placeComposerSuggestMenu(
      { top: 200, left: 900, bottom: 280, width: 200 },
      { ...vp }
    );
    expect(pos.left + pos.width).toBeLessThanOrEqual(1000 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  test('prefer below flips above when the bottom is tight', () => {
    const pos = placeComposerSuggestMenu(
      { top: 620, left: 80, bottom: 760, width: 400 },
      { ...vp, prefer: 'below' }
    );
    expect(pos.placement).toBe('above');
    expect(pos.top).toBe(620 - 200 - 4);
  });
});

describe('portal CSS wiring', () => {
  test('does not reset top to auto !important (beats inline coords)', () => {
    const css = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownComposer.css'),
      'utf8'
    );
    expect(css).toMatch(/--prp-composer-menu-top/);
    expect(css).not.toMatch(/top:\s*auto\s*!important/);
    const src = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownComposer.tsx'),
      'utf8'
    );
    expect(src).toMatch(/placeComposerSuggestMenu/);
    expect(src).toMatch(/--prp-composer-menu-top/);
  });
});
