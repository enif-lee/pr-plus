/**
 * Fullscreen Mermaid/Image viewer wheel policy (shipped pure helpers).
 * Plain scroll pans; Opt+scroll zooms continuously.
 */
import { describe, expect, test } from '@rstest/core';
import {
  applyViewerWheelEvent,
  applyViewerWheelGesture,
  identityMermaidTransform,
  mapViewerWheelGesture,
  normalizeViewerWheelDeltas,
  panMermaidTransform,
  zoomMermaidTransform,
} from '../src/modal/lib/mermaid-viewer';

describe('normalizeViewerWheelDeltas', () => {
  test('pixel mode passes through', () => {
    expect(normalizeViewerWheelDeltas({ deltaX: 3, deltaY: -12, deltaMode: 0 })).toEqual({
      dx: 3,
      dy: -12,
    });
  });

  test('line mode scales to px-ish', () => {
    const n = normalizeViewerWheelDeltas({ deltaX: 0, deltaY: 1, deltaMode: 1 });
    expect(n.dy).toBe(16);
  });
});

describe('mapViewerWheelGesture', () => {
  test('plain vertical scroll → pan dy (inverted)', () => {
    const g = mapViewerWheelGesture({ deltaY: 40, deltaX: 0, altKey: false });
    expect(g).toEqual({ kind: 'pan', dx: 0, dy: -40 });
  });

  test('plain horizontal scroll → pan dx (inverted)', () => {
    const g = mapViewerWheelGesture({ deltaY: 0, deltaX: 25, altKey: false });
    expect(g).toEqual({ kind: 'pan', dx: -25, dy: 0 });
  });

  test('Opt+vertical scroll → zoom (not pan)', () => {
    const g = mapViewerWheelGesture({
      deltaY: 30,
      deltaX: 0,
      altKey: true,
      ctrlKey: false,
    });
    expect(g).toEqual({ kind: 'zoom', deltaY: 30 });
  });

  test('ctrl-only (macOS pinch→wheel) does not zoom', () => {
    const g = mapViewerWheelGesture({
      deltaY: -20,
      altKey: false,
      ctrlKey: true,
    });
    expect(g?.kind).toBe('pan');
  });

  test('zero deltas → null', () => {
    expect(mapViewerWheelGesture({ deltaX: 0, deltaY: 0 })).toBeNull();
  });
});

describe('viewer wiring (static shipped sources)', () => {
  test('MermaidViewer + ImageViewer use applyViewerWheelEvent / Opt+scroll policy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const m = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MermaidViewer.tsx'),
      'utf8'
    );
    const i = fs.readFileSync(
      path.join(root, 'src/modal/components/common/ImageViewer.tsx'),
      'utf8'
    );
    expect(m).toMatch(/applyViewerWheelEvent/);
    expect(i).toMatch(/applyViewerWheelEvent/);
    expect(m).toMatch(/altKey/);
    expect(i).toMatch(/altKey/);
    expect(m).toMatch(/Scroll pan/);
    expect(i).toMatch(/Scroll pan/);
  });

  test('syncOptHintsActive suppresses tips when mermaid/image viewer open', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(app).toMatch(/data-prp-mermaid-viewer/);
    expect(app).toMatch(/data-prp-image-viewer/);
    expect(app).toMatch(/!viewerOpen/);
  });
});

describe('applyViewerWheelEvent (shipped path)', () => {
  test('plain pan moves ty/tx', () => {
    const t0 = identityMermaidTransform();
    const t1 = applyViewerWheelEvent(t0, { deltaY: 50, deltaX: 10, altKey: false });
    expect(t1.scale).toBe(1);
    expect(t1.ty).toBe(-50);
    expect(t1.tx).toBe(-10);
  });

  test('Opt+scroll changes scale continuously (not identity)', () => {
    const t0 = { scale: 1, tx: 100, ty: 80 };
    const pivot = { x: 100, y: 80 };
    const t1 = applyViewerWheelEvent(
      t0,
      { deltaY: -40, altKey: true },
      pivot
    );
    // Negative deltaY → zoom in → scale > 1
    expect(t1.scale).toBeGreaterThan(1);
    expect(t1.scale).toBeLessThan(2);
    // Same pure zoom helper path
    const viaZoom = zoomMermaidTransform(t0, -40, pivot);
    expect(t1.scale).toBeCloseTo(viaZoom.scale, 6);
  });

  test('gesture pan matches panMermaidTransform', () => {
    const t0 = identityMermaidTransform();
    const g = mapViewerWheelGesture({ deltaX: 5, deltaY: -8 });
    const a = applyViewerWheelGesture(t0, g);
    const b = panMermaidTransform(t0, -5, 8);
    expect(a).toEqual(b);
  });
});
