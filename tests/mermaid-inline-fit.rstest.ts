/**
 * Inline Mermaid: fit within max-height without nested scroll.
 */
import { describe, expect, test } from '@rstest/core';
import {
  fitMermaidSvgInline,
  MERMAID_INLINE_MAX_HEIGHT_PX,
  MERMAID_INLINE_PAD_PX,
} from '../src/modal/lib/mermaid-viewer';

describe('fitMermaidSvgInline (shipped pure)', () => {
  test('exports 720px max height constant', () => {
    expect(MERMAID_INLINE_MAX_HEIGHT_PX).toBe(720);
    expect(MERMAID_INLINE_PAD_PX).toBe(24);
  });

  test('scales tall diagram down to fit content max height', () => {
    const tall = `<svg width="400" height="2000" viewBox="0 0 400 2000" xmlns="http://www.w3.org/2000/svg"></svg>`;
    const out = fitMermaidSvgInline(tall, { maxHeight: 720 });
    const contentMax = 720 - MERMAID_INLINE_PAD_PX;
    const h = Number(out.match(/\sheight="([\d.]+)"/i)?.[1]);
    const w = Number(out.match(/\swidth="([\d.]+)"/i)?.[1]);
    expect(h).toBeLessThanOrEqual(contentMax + 0.01);
    expect(h).toBeGreaterThan(0);
    // Aspect 400:2000 preserved
    expect(w / h).toBeCloseTo(400 / 2000, 2);
    expect(out).toMatch(/data-prp-mermaid-fit="1"/);
    expect(out).toMatch(/viewBox="0 0 400 2000"/);
  });

  test('does not upscale small diagrams', () => {
    const small = `<svg width="100" height="50" viewBox="0 0 100 50"></svg>`;
    const out = fitMermaidSvgInline(small, { maxHeight: 720 });
    expect(out).toMatch(/\swidth="100"/);
    expect(out).toMatch(/\sheight="50"/);
  });

  test('respects maxWidth as well as maxHeight', () => {
    const wide = `<svg width="2000" height="100" viewBox="0 0 2000 100"></svg>`;
    const out = fitMermaidSvgInline(wide, { maxHeight: 720, maxWidth: 500 });
    const w = Number(out.match(/\swidth="([\d.]+)"/i)?.[1]);
    expect(w).toBeLessThanOrEqual(500 + 0.01);
  });

  test('empty / non-svg passthrough', () => {
    expect(fitMermaidSvgInline('')).toBe('');
    expect(fitMermaidSvgInline('<div>nope</div>')).toBe('<div>nope</div>');
  });
});
