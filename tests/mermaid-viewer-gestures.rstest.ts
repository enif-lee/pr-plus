/**
 * Fullscreen Mermaid/Image viewer wheel + keyboard policy (shipped pure helpers).
 * Plain scroll pans; Opt+scroll zooms continuously; arrows pan 48px; Opt± zoom.
 */
import { describe, expect, test } from '@rstest/core';
import {
  applyViewerKeyGesture,
  applyViewerWheelEvent,
  applyViewerWheelGesture,
  clampMermaidZoom,
  identityMermaidTransform,
  mapViewerKeyGesture,
  mapViewerWheelGesture,
  MERMAID_KEY_PAN_STEP,
  MERMAID_ZOOM_MAX,
  MERMAID_ZOOM_MIN,
  MERMAID_ZOOM_STEP,
  normalizeViewerWheelDeltas,
  panMermaidTransform,
  panMermaidTransformByArrowKey,
  zoomMermaidTransform,
  zoomMermaidTransformByKeyboardStep,
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

  test('MermaidViewer + ImageViewer wire Escape, Opt± zoom, Arrow pan', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    for (const rel of [
      'src/modal/components/common/MermaidViewer.tsx',
      'src/modal/components/common/ImageViewer.tsx',
    ]) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src).toMatch(/mapViewerKeyGesture/);
      expect(src).toMatch(/applyViewerKeyGesture/);
      expect(src).toMatch(/kind === 'close'/);
      expect(src).toMatch(/keydown/);
      // Mid-gesture: paint only (no setXf every rAF/pointermove)
      expect(src).toMatch(/paintTransform\(next\)/);
      expect(src).toMatch(/scheduleWheelCommit|wheelIdleTimerRef/);
      // Discrete keys commit
      expect(src).toMatch(/commitTransform\(next\)/);
    }
  });

  test('syncOptHintsActive suppresses tips when mermaid/image viewer open', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(app).toMatch(/data-prp-mermaid-viewer/);
    expect(app).toMatch(/data-prp-image-viewer/);
    expect(app).toMatch(/!viewerOpen/);
  });
});

describe('keyboard pan/zoom (shipped pure)', () => {
  test('MERMAID_KEY_PAN_STEP is 48', () => {
    expect(MERMAID_KEY_PAN_STEP).toBe(48);
  });

  test('arrow keys pan by ±48 on the corresponding axis', () => {
    const t0 = identityMermaidTransform();
    expect(panMermaidTransformByArrowKey(t0, 'ArrowLeft')).toEqual({
      scale: 1,
      tx: 48,
      ty: 0,
    });
    expect(panMermaidTransformByArrowKey(t0, 'ArrowRight')).toEqual({
      scale: 1,
      tx: -48,
      ty: 0,
    });
    expect(panMermaidTransformByArrowKey(t0, 'ArrowUp')).toEqual({
      scale: 1,
      tx: 0,
      ty: 48,
    });
    expect(panMermaidTransformByArrowKey(t0, 'ArrowDown')).toEqual({
      scale: 1,
      tx: 0,
      ty: -48,
    });
    expect(panMermaidTransformByArrowKey(t0, 'Enter')).toBeNull();
  });

  test('keyboard zoom in/out uses MERMAID_ZOOM_STEP and clamps', () => {
    const t0 = { scale: 1, tx: 10, ty: 20 };
    const zin = zoomMermaidTransformByKeyboardStep(t0, 'in');
    expect(zin.scale).toBeCloseTo(MERMAID_ZOOM_STEP, 6);
    expect(zin.scale).toBeGreaterThan(1);
    const zout = zoomMermaidTransformByKeyboardStep(zin, 'out');
    expect(zout.scale).toBeCloseTo(1, 6);

    const hi = zoomMermaidTransformByKeyboardStep(
      { scale: MERMAID_ZOOM_MAX, tx: 0, ty: 0 },
      'in'
    );
    expect(hi.scale).toBe(clampMermaidZoom(MERMAID_ZOOM_MAX));
    const lo = zoomMermaidTransformByKeyboardStep(
      { scale: MERMAID_ZOOM_MIN, tx: 0, ty: 0 },
      'out'
    );
    expect(lo.scale).toBe(clampMermaidZoom(MERMAID_ZOOM_MIN));
  });

  test('mapViewerKeyGesture: Opt± zoom, arrows pan, Escape close', () => {
    expect(mapViewerKeyGesture({ key: 'Escape' })).toEqual({ kind: 'close' });
    expect(
      mapViewerKeyGesture({ key: '=', code: 'Equal', altKey: true })
    ).toEqual({ kind: 'zoom', direction: 'in' });
    expect(
      mapViewerKeyGesture({ key: '-', code: 'Minus', altKey: true })
    ).toEqual({ kind: 'zoom', direction: 'out' });
    expect(
      mapViewerKeyGesture({ key: 'ArrowLeft', altKey: false })
    ).toEqual({ kind: 'pan', key: 'ArrowLeft' });
    // Plain = without Opt is not zoom
    expect(mapViewerKeyGesture({ key: '=', code: 'Equal', altKey: false })).toBeNull();
  });

  test('applyViewerKeyGesture pans and zooms', () => {
    const t0 = identityMermaidTransform();
    const pan = applyViewerKeyGesture(t0, { kind: 'pan', key: 'ArrowDown' });
    expect(pan).toEqual({ scale: 1, tx: 0, ty: -48 });
    const zoom = applyViewerKeyGesture(t0, { kind: 'zoom', direction: 'in' });
    expect(zoom!.scale).toBeGreaterThan(1);
    expect(applyViewerKeyGesture(t0, { kind: 'close' })).toBeNull();
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
