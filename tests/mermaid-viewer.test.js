/**
 * Mermaid fullscreen viewer pan/zoom pure helpers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  clampMermaidZoom,
  zoomMermaidTransform,
  panMermaidTransform,
  scaleMermaidTransform,
  pinchMermaidTransform,
  mermaidPointerDistance,
  mermaidPointerMidpoint,
  identityMermaidTransform,
  fitMermaidToStage,
  mermaidTransformStyle,
  prepareMermaidSvgForViewer,
  MERMAID_ZOOM_MIN,
  MERMAID_ZOOM_MAX,
} = require('../src/modal/lib/mermaid-viewer.ts');

assert.equal(clampMermaidZoom(1), 1);
assert.equal(clampMermaidZoom(0.01), MERMAID_ZOOM_MIN);
assert.equal(clampMermaidZoom(99), MERMAID_ZOOM_MAX);

{
  const t0 = identityMermaidTransform();
  const t1 = zoomMermaidTransform(t0, -100); // zoom in
  assert.ok(t1.scale > t0.scale);
  const t2 = zoomMermaidTransform(t1, 100); // zoom out
  assert.ok(t2.scale < t1.scale);
}

{
  // Continuous: small delta → small scale change (not discrete steps)
  const t0 = identityMermaidTransform();
  const tiny = zoomMermaidTransform(t0, -10);
  const big = zoomMermaidTransform(t0, -100);
  assert.ok(tiny.scale > 1);
  assert.ok(big.scale > tiny.scale, 'larger wheel delta scales more');
  assert.ok(tiny.scale - 1 < 0.05, 'tiny delta stays smooth/near 1');
}

{
  // Pivot zoom keeps pivot roughly stable
  const t0 = { scale: 1, tx: 0, ty: 0 };
  const t1 = zoomMermaidTransform(t0, -100, { x: 100, y: 50 });
  assert.ok(t1.scale > 1);
  const wx = (100 - t1.tx) / t1.scale;
  const wy = (50 - t1.ty) / t1.scale;
  assert.ok(Math.abs(wx - 100) < 0.01);
  assert.ok(Math.abs(wy - 50) < 0.01);
}

{
  const t = panMermaidTransform({ scale: 2, tx: 10, ty: 20 }, 5, -3);
  assert.equal(t.tx, 15);
  assert.equal(t.ty, 17);
  assert.equal(t.scale, 2);
}

{
  // Pinch: double distance → double scale
  const t0 = { scale: 1, tx: 0, ty: 0 };
  const t1 = pinchMermaidTransform(t0, 100, 200, { x: 50, y: 50 });
  assert.ok(Math.abs(t1.scale - 2) < 1e-9);
  const t2 = scaleMermaidTransform(t0, 1.5, { x: 0, y: 0 });
  assert.ok(Math.abs(t2.scale - 1.5) < 1e-9);
}

{
  assert.equal(mermaidPointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  const mid = mermaidPointerMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 });
  assert.equal(mid.x, 5);
  assert.equal(mid.y, 10);
}

assert.ok(mermaidTransformStyle({ scale: 1.5, tx: 2, ty: 3 }).includes('scale(1.5)'));

// Fit centers content in stage
{
  const t = fitMermaidToStage(1000, 800, 200, 100, 0);
  assert.ok(t.scale > 1, 'small content is upscaled');
  const expectedTx = (1000 - 200 * t.scale) / 2;
  const expectedTy = (800 - 100 * t.scale) / 2;
  assert.ok(Math.abs(t.tx - expectedTx) < 0.5);
  assert.ok(Math.abs(t.ty - expectedTy) < 0.5);
}

// prepareMermaidSvgForViewer strips % constraints and restores numeric size from viewBox
{
  const raw =
    '<svg width="100%" height="100%" style="max-width: 200px; width: 100%" viewBox="0 0 800 400"></svg>';
  const out = prepareMermaidSvgForViewer(raw);
  assert.ok(!/width="100%"/.test(out));
  assert.ok(!/height="100%"/.test(out));
  assert.ok(!/max-width/.test(out));
  assert.ok(/viewBox="0 0 800 400"/.test(out));
  assert.ok(/width="800"/.test(out), 'numeric width from viewBox');
  assert.ok(/height="400"/.test(out), 'numeric height from viewBox');
}

// Negative viewBox origin still yields positive width/height attrs
{
  const raw = '<svg width="100%" viewBox="-50 -10 1169.5 1042"></svg>';
  const out = prepareMermaidSvgForViewer(raw);
  assert.ok(/width="1169.5"/.test(out));
  assert.ok(/height="1042"/.test(out));
}

const root = path.join(__dirname, '..');
const block = fs.readFileSync(
  path.join(root, 'src/modal/components/common/MermaidBlock.tsx'),
  'utf8'
);
assert.ok(block.includes('MermaidViewer'));
assert.ok(block.includes('자세히 보기'));

const viewer = fs.readFileSync(
  path.join(root, 'src/modal/components/common/MermaidViewer.tsx'),
  'utf8'
);
assert.ok(viewer.includes('createPortal'));
assert.ok(!viewer.includes('isMermaidViewerModKey'));
assert.ok(viewer.includes('Scroll / pinch zoom'));
assert.ok(viewer.includes('pinchMermaidTransform'));
assert.ok(viewer.includes('zoomMermaidTransform'));
assert.ok(viewer.includes('panMermaidTransform'));
assert.ok(viewer.includes('paintTransform'));
assert.ok(viewer.includes('fitMermaidToStage') || viewer.includes('fitToStage'));
assert.ok(viewer.includes('stopImmediatePropagation'));
assert.ok(viewer.includes('passive: false'));
assert.ok(viewer.includes('prp-overlay') || viewer.includes('resolvePortalHost'));

const app = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  app.includes('prp-mermaid-viewer'),
  'App Escape must skip modal close when mermaid viewer is open'
);

const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
assert.ok(css.includes('.prp-mermaid-viewer'));
assert.ok(css.includes('.prp-mermaid__expand'));
assert.ok(/cursor:\s*grab/.test(css), 'stage shows grab handle cursor by default');
assert.ok(/cursor:\s*grabbing/.test(css), 'stage shows grabbing while panning');
assert.ok(/z-index:\s*10001[0-9]/.test(css) || /z-index:\s*20\d{4}/.test(css));
assert.ok(
  css.includes("data-color-mode='dark'") ||
    css.includes("[data-color-mode='dark']") ||
    css.includes('[data-color-mode="dark"]') ||
    css.includes('.prp-mermaid-viewer[data-color-mode=')
);

console.log('mermaid-viewer.test.js: all assertions passed');
console.log('mermaid-viewer-pan-zoom=true');
console.log('mermaid-viewer-pinch=true');
console.log('mermaid-viewer-continuous-zoom=true');
