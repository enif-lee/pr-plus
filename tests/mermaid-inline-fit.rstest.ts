/**
 * Inline Mermaid: fit within max-height without nested scroll.
 * Viewer: restore full viewBox resolution from fitted thumbnail SVG.
 */
import { describe, expect, test } from '@rstest/core';
import {
  fitMermaidSvgInline,
  MERMAID_INLINE_MAX_HEIGHT_PX,
  MERMAID_INLINE_PAD_PX,
  MERMAID_ZOOM_MAX,
  prepareMermaidSvgForViewer,
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

describe('prepareMermaidSvgForViewer (full resolution)', () => {
  test('restores viewBox size after inline fit (no upscale blur)', () => {
    const tall = `<svg width="400" height="2000" viewBox="0 0 400 2000" xmlns="http://www.w3.org/2000/svg"><g/></svg>`;
    const fitted = fitMermaidSvgInline(tall, { maxHeight: 720 });
    const hFit = Number(fitted.match(/\sheight="([\d.]+)"/i)?.[1]);
    expect(hFit).toBeLessThan(2000);

    const viewer = prepareMermaidSvgForViewer(fitted);
    const w = Number(viewer.match(/\swidth="([\d.]+)"/i)?.[1]);
    const h = Number(viewer.match(/\sheight="([\d.]+)"/i)?.[1]);
    expect(w).toBe(400);
    expect(h).toBe(2000);
    expect(viewer).toMatch(/viewBox="0 0 400 2000"/);
    expect(viewer).not.toMatch(/data-prp-mermaid-fit=/);
    expect(viewer).toMatch(/data-prp-mermaid-viewer-svg="1"/);
  });

  test('full SVG passthrough keeps native dimensions', () => {
    const full = `<svg width="1200" height="900" viewBox="0 0 1200 900"></svg>`;
    const out = prepareMermaidSvgForViewer(full);
    expect(out).toMatch(/\swidth="1200"/);
    expect(out).toMatch(/\sheight="900"/);
  });

  test('zoom max allows deep zoom on large diagrams', () => {
    expect(MERMAID_ZOOM_MAX).toBeGreaterThanOrEqual(12);
  });
});
