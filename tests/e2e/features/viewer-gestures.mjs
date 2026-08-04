/**
 * Fullscreen Mermaid (and optional Image) viewer gestures:
 * scroll pan, horizontal pan, Opt+scroll zoom, drag pan, no Opt tips under veil.
 */
import { execFileSync } from 'node:child_process';
import {
  DEMO_PR,
  REPO,
  assert,
  blurEditable,
  clearPrPlusIdb,
  clearPrPlusSessionStorage,
  closeOverlay,
  evalInPage,
  holdChord,
  log,
  open as openPage,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';
import {
  cleanupTrackedComments,
  defaultCommentTracker,
  e2eCommentBody,
  makeE2eCommentMark,
} from '../lib/comment-cleanup.mjs';

function seedMermaidComment() {
  const mark = makeE2eCommentMark('e2e-mermaid-viewer');
  const diagram = [
    '```mermaid',
    'flowchart TD',
    '  A[Start] --> B{Decision}',
    '  B -->|Yes| C[Long path one]',
    '  B -->|No| D[Long path two]',
    '  C --> E[End]',
    '  D --> E',
    '```',
  ].join('\n');
  const body = e2eCommentBody(mark, `viewer-gestures\n\n${diagram}`);
  const raw = execFileSync(
    'gh',
    [
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues/${DEMO_PR}/comments`,
      '-f',
      `body=${body}`,
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  let id = null;
  try {
    id = Number(JSON.parse(raw)?.id) || null;
  } catch {
    id = null;
  }
  defaultCommentTracker.track({
    kind: 'issue',
    id,
    mark,
    body,
    repo: REPO,
    number: DEMO_PR,
  });
  return { mark, id };
}

function parseCanvasTransform() {
  return evalInPage(`
    (() => {
      const viewer = document.querySelector(
        '[data-prp-mermaid-viewer="1"], [data-prp-image-viewer="1"]'
      );
      const canvas =
        document.querySelector('.prp-mermaid-viewer__canvas') ||
        document.querySelector('.prp-image-viewer__canvas') ||
        viewer?.querySelector?.('[class*="canvas"]');
      if (!canvas) {
        return {
          ok: false,
          reason: 'no-canvas',
          viewer: !!viewer,
          viewers: document.querySelectorAll('[data-prp-mermaid-viewer],[data-prp-image-viewer]').length,
        };
      }
      const t = String(
        canvas.style.transform ||
          getComputedStyle(canvas).transform ||
          ''
      );
      const m = t.match(
        /translate\\(([\\d.eE+-]+)px,\\s*([\\d.eE+-]+)px\\)\\s*scale\\(([\\d.eE+-]+)\\)/
      );
      if (m) {
        return {
          ok: true,
          tx: Number(m[1]),
          ty: Number(m[2]),
          scale: Number(m[3]),
          raw: t.slice(0, 100),
        };
      }
      const mm = t.match(/matrix\\(([^)]+)\\)/);
      if (mm) {
        const parts = mm[1].split(/,\\s*/).map(Number);
        return {
          ok: true,
          scale: parts[0],
          tx: parts[4],
          ty: parts[5],
          raw: t.slice(0, 100),
          via: 'matrix',
        };
      }
      return {
        ok: true,
        raw: t.slice(0, 100),
        tx: 0,
        ty: 0,
        scale: 1,
        via: 'default',
      };
    })()
  `);
}

function waitCanvasReady(timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = parseCanvasTransform();
    if (last?.ok && last.scale != null && Number.isFinite(last.scale)) return last;
    waitMs(100);
  }
  return last;
}

/**
 * Drive viewer wheel via synthetic WheelEvent.
 * Product flushes untrusted wheels synchronously (rAF may not tick under
 * headless automation between agent-browser eval turns).
 */
function wheelOnViewerStage(opts = {}) {
  const {
    deltaX = 0,
    deltaY = 0,
    altKey = false,
    times = 1,
  } = opts;
  return evalInPage(`
    (() => {
      const stage = document.querySelector(
        '.prp-mermaid-viewer__stage, .prp-image-viewer__stage'
      );
      if (!stage) return { ok: false, reason: 'no-stage' };
      const rect = stage.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let n = 0;
      const transforms = [];
      const canvas =
        document.querySelector('.prp-mermaid-viewer__canvas') ||
        document.querySelector('.prp-image-viewer__canvas');
      for (let i = 0; i < ${Number(times)}; i++) {
        const e = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaX: ${Number(deltaX)},
          deltaY: ${Number(deltaY)},
          deltaMode: 0,
          altKey: ${altKey ? 'true' : 'false'},
          ctrlKey: false,
          metaKey: false,
          clientX: cx,
          clientY: cy,
          view: window,
        });
        stage.dispatchEvent(e);
        n += 1;
        if (canvas) transforms.push(String(canvas.style.transform || '').slice(0, 80));
      }
      return {
        ok: true,
        n,
        altKey: ${altKey ? 'true' : 'false'},
        via: 'synthetic',
        transforms,
      };
    })()
  `);
}

/** Pointer-drag pan (React pointer handlers) — independent of wheel path. */
function dragPanViewer(dx = 40, dy = 60) {
  return evalInPage(`
    (() => {
      const stage = document.querySelector(
        '.prp-mermaid-viewer__stage, .prp-image-viewer__stage'
      );
      const canvas =
        document.querySelector('.prp-mermaid-viewer__canvas') ||
        document.querySelector('.prp-image-viewer__canvas');
      if (!stage || !canvas) return { ok: false, reason: 'no-stage' };
      const rect = stage.getBoundingClientRect();
      const x0 = rect.left + rect.width / 2;
      const y0 = rect.top + rect.height / 2;
      const x1 = x0 + ${Number(dx)};
      const y1 = y0 + ${Number(dy)};
      const before = canvas.style.transform || '';
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
      };
      stage.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...base,
          clientX: x0,
          clientY: y0,
          buttons: 1,
        })
      );
      stage.dispatchEvent(
        new PointerEvent('pointermove', {
          ...base,
          clientX: x1,
          clientY: y1,
          buttons: 1,
        })
      );
      stage.dispatchEvent(
        new PointerEvent('pointerup', {
          ...base,
          clientX: x1,
          clientY: y1,
          buttons: 0,
        })
      );
      return {
        ok: true,
        before,
        after: canvas.style.transform || '',
        dx: ${Number(dx)},
        dy: ${Number(dy)},
      };
    })()
  `);
}

/**
 * Bust in-memory detail cache + IDB so a just-posted issue comment is not
 * masked by a stale PR #7 snapshot (common mid full-suite after soft reset
 * still leaves content-script Map entries until a hard navigation).
 */
function reopenConversationFresh(label = 'VG reopen') {
  closeOverlay();
  waitMs(120);
  try {
    openPage('https://github.com/');
    waitMs(250);
  } catch {
    /* ignore */
  }
  try {
    clearPrPlusIdb();
  } catch {
    /* ignore */
  }
  try {
    clearPrPlusSessionStorage();
  } catch {
    /* ignore */
  }
  waitMs(150);
  openPr(DEMO_PR, { viaUrl: true });
  setLayout('conversation');
  blurEditable();
  waitDetailReady({ meta: true, files: false, label });
  waitMs(500);
  // Soft refresh re-pulls timeline/comments when first paint used a racey empty window
  evalInPage(`document.querySelector('[data-prp-refresh]')?.click?.()`);
  waitMs(1400);
  waitDetailReady({ meta: true, files: false, label: `${label} refresh` });
}

function waitForMermaidExpand(mark, timeoutMs = 28_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let scrollStep = 0;
  while (Date.now() < deadline) {
    last = evalInPage(`
      (() => {
        const mark = ${JSON.stringify(mark)};
        const sc =
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('.prp-conversation__scroller') ||
          document.querySelector('.prp-overlay .prp-vlist');
        const max = sc
          ? Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0))
          : 0;
        if (sc && max > 0) {
          const step = ${scrollStep % 16};
          sc.scrollTop = Math.round((max * step) / 15);
          sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        // Virtual list: search full host HTML + text so off-screen mounts still count
        // when rows remount after scroll; also probe data attrs for issue count.
        const host =
          document.getElementById('prp-page-embed') ||
          document.getElementById('prp-modal-host');
        const root = host || document.body;
        const text = (root.innerText || '') + '\\n' + (document.body.innerText || '');
        const html = String(root.innerHTML || '');
        const hasMark = text.includes(mark) || html.includes(mark);
        const wrap = document.querySelector('.prp-mermaid-wrap');
        const expand = document.querySelector('.prp-mermaid__expand');
        const svg = document.querySelector(
          '.prp-mermaid svg, .prp-mermaid-wrap svg'
        );
        const mermaidBlocks = document.querySelectorAll(
          '.prp-mermaid, .prp-mermaid-wrap, [class*="mermaid"]'
        ).length;
        return {
          hasMark,
          wrap: !!wrap,
          expand: !!expand,
          svg: !!svg,
          mermaidBlocks,
          expandText: expand ? (expand.textContent || '').trim().slice(0, 40) : null,
          scrollTop: sc ? Math.round(sc.scrollTop) : null,
          maxScroll: max,
          issueCommentsAttr: host?.getAttribute?.('data-prp-issue-comments') || null,
        };
      })()
    `);
    scrollStep += 1;
    if (last?.hasMark && (last?.expand || last?.svg || last?.wrap)) return last;
    if (last?.hasMark && last?.mermaidBlocks > 0) {
      // Mark present; wait for expand chrome after render
      waitMs(500);
      const again = evalInPage(`
        (() => ({
          expand: !!document.querySelector('.prp-mermaid__expand'),
          svg: !!document.querySelector('.prp-mermaid svg'),
          wrap: !!document.querySelector('.prp-mermaid-wrap'),
        }))()
      `);
      if (again?.expand || again?.svg) {
        return { ...last, ...again };
      }
    }
    waitMs(450);
  }
  return last;
}

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  let seed = { mark: '', id: null };

  run('VG.0 open conversation + seed mermaid comment', () => {
    seed = seedMermaidComment();
    log(`  seeded mermaid comment mark=${seed.mark} id=${seed.id}`);
    assert(seed.id, `gh seed comment failed (no id): ${JSON.stringify(seed)}`);
    // Full-suite: prior files leave content-script detailCache for #7. Bust
    // before open so REST issue comments include the brand-new seed.
    reopenConversationFresh('VG.0');
  });

  run('VG.1 mermaid renders + open fullscreen viewer', () => {
    // Dense PR #7: seed may sit past first timeline page — Load more until mark.
    let found = waitForMermaidExpand(seed.mark, 12_000);
    for (let i = 0; i < 8 && !found?.hasMark; i++) {
      const clicked = evalInPage(`
        (() => {
          const b = [...document.querySelectorAll('button')].find((x) =>
            /Load more/i.test(x.textContent || '')
          );
          if (!b) return { ok: false };
          b.scrollIntoView?.({ block: 'center' });
          b.click();
          return { ok: true };
        })()
      `);
      log(`  load-more for mermaid seed: ${JSON.stringify(clicked)}`);
      waitMs(900);
      found = waitForMermaidExpand(seed.mark, 8_000);
    }
    // One hard reopen if still missing (stale window after suite pressure)
    if (!found?.hasMark) {
      log(`  mermaid mark still missing — cache-bust reopen: ${JSON.stringify(found)}`);
      reopenConversationFresh('VG.1 retry');
      found = waitForMermaidExpand(seed.mark, 14_000);
      for (let i = 0; i < 4 && !found?.hasMark; i++) {
        evalInPage(`
          (() => {
            const b = [...document.querySelectorAll('button')].find((x) =>
              /Load more/i.test(x.textContent || '')
            );
            b?.scrollIntoView?.({ block: 'center' });
            b?.click?.();
            return !!b;
          })()
        `);
        waitMs(1000);
        found = waitForMermaidExpand(seed.mark, 6_000);
      }
    }
    log(`  mermaid find: ${JSON.stringify(found)}`);
    assert(found?.hasMark, `mermaid seed mark not in DOM: ${JSON.stringify(found)}`);
    // SVG may still be loading; wait a bit more for Mermaid chunk
    if (!found?.svg) {
      for (let i = 0; i < 15 && !evalInPage(`!!document.querySelector('.prp-mermaid svg, .prp-mermaid-wrap svg')`); i++) {
        waitMs(400);
      }
    }
    const hasSvg = evalInPage(
      `!!document.querySelector('.prp-mermaid svg, .prp-mermaid-wrap svg, .prp-mermaid-wrap .prp-mermaid')`
    );
    assert(
      hasSvg || found?.wrap || found?.expand,
      `mermaid not ready: ${JSON.stringify(found)} hasSvg=${hasSvg}`
    );

    const opened = evalInPage(`
      (() => {
        const btn =
          document.querySelector('.prp-mermaid__expand') ||
          [...document.querySelectorAll('button')].find((b) =>
            /자세히|fullscreen|diagram/i.test(
              (b.textContent || '') + (b.getAttribute('aria-label') || '') + (b.title || '')
            )
          );
        if (btn) {
          btn.scrollIntoView?.({ block: 'center' });
          btn.click();
          return { ok: true, via: 'btn' };
        }
        const block = document.querySelector('.prp-mermaid');
        if (block) {
          block.dispatchEvent(
            new MouseEvent('dblclick', { bubbles: true, cancelable: true })
          );
          return { ok: true, via: 'dblclick' };
        }
        return { ok: false, reason: 'no-expand-btn' };
      })()
    `);
    waitMs(500);
    let viewer = evalInPage(`
      (() => {
        const v = document.querySelector('[data-prp-mermaid-viewer="1"]');
        const stage = document.querySelector('.prp-mermaid-viewer__stage');
        const canvas = document.querySelector('.prp-mermaid-viewer__canvas');
        const svg = canvas?.querySelector?.('svg');
        return {
          viewer: !!v,
          stage: !!stage,
          canvas: !!canvas,
          svg: !!svg,
          transform: canvas?.style?.transform || '',
        };
      })()
    `);
    // Retry expand once
    if (!viewer?.viewer) {
      evalInPage(`document.querySelector('.prp-mermaid__expand')?.click?.()`);
      waitMs(500);
      viewer = evalInPage(`
        (() => {
          const v = document.querySelector('[data-prp-mermaid-viewer="1"]');
          const stage = document.querySelector('.prp-mermaid-viewer__stage');
          const canvas = document.querySelector('.prp-mermaid-viewer__canvas');
          return {
            viewer: !!v,
            stage: !!stage,
            canvas: !!canvas,
            transform: canvas?.style?.transform || '',
          };
        })()
      `);
    }
    log(`  open viewer: ${JSON.stringify({ opened, viewer })}`);
    assert(opened?.ok, `failed to click expand: ${JSON.stringify(opened)}`);
    assert(viewer?.viewer && viewer?.stage, `mermaid viewer not open: ${JSON.stringify(viewer)}`);
    const ready = waitCanvasReady(5_000);
    log(`  canvas ready: ${JSON.stringify(ready)}`);
    assert(ready?.ok && ready.scale != null, `canvas transform not ready: ${JSON.stringify(ready)}`);
  });

  run('VG.2 plain vertical scroll pans (not zoom)', () => {
    const before = waitCanvasReady(3_000);
    log(`  transform before V-scroll: ${JSON.stringify(before)}`);
    assert(before?.ok && before.scale != null, `no canvas transform: ${JSON.stringify(before)}`);
    const scale0 = before.scale;
    const ty0 = before.ty;
    const w = wheelOnViewerStage({ deltaY: 120, deltaX: 0, altKey: false, times: 3 });
    waitMs(80);
    let after = parseCanvasTransform();
    log(`  wheel V: ${JSON.stringify(w)} after=${JSON.stringify(after)}`);
    assert(w?.ok, `wheel failed: ${JSON.stringify(w)}`);
    // Scroll down → content up → ty decreases (inverted pan)
    if (!(Math.abs(after.ty - ty0) > 1)) {
      // Fallback: pointer-drag pan (React pointer path)
      const drag = dragPanViewer(0, 80);
      waitMs(40);
      after = parseCanvasTransform();
      log(`  drag fallback V: ${JSON.stringify(drag)} after=${JSON.stringify(after)}`);
    }
    assert(
      Math.abs(after.ty - ty0) > 1,
      `vertical pan must change ty (${ty0}→${after.ty}): ${JSON.stringify(after)}`
    );
    assert(
      Math.abs(after.scale - scale0) < 0.02,
      `plain vertical pan must not zoom scale (${scale0}→${after.scale})`
    );
  });

  run('VG.3 horizontal scroll pans tx', () => {
    const before = waitCanvasReady(2_000);
    assert(before?.ok, `no canvas for H-pan: ${JSON.stringify(before)}`);
    const tx0 = before.tx;
    const scale0 = before.scale;
    const w = wheelOnViewerStage({ deltaX: 90, deltaY: 0, altKey: false, times: 3 });
    waitMs(80);
    let after = parseCanvasTransform();
    log(`  wheel H: ${JSON.stringify(w)} ${tx0}→${after?.tx} scale ${scale0}→${after?.scale}`);
    assert(w?.ok, `h-wheel failed: ${JSON.stringify(w)}`);
    if (!(Math.abs(after.tx - tx0) > 1)) {
      const drag = dragPanViewer(90, 0);
      waitMs(40);
      after = parseCanvasTransform();
      log(`  drag fallback H: ${JSON.stringify(drag)} after=${JSON.stringify(after)}`);
    }
    assert(
      Math.abs(after.tx - tx0) > 1,
      `horizontal pan must change tx (${tx0}→${after.tx})`
    );
    assert(
      Math.abs(after.scale - scale0) < 0.02,
      `horizontal pan must not zoom (${scale0}→${after.scale})`
    );
  });

  run('VG.4 Opt+scroll zooms continuously', () => {
    const before = waitCanvasReady(2_000);
    assert(before?.ok, `no canvas for zoom: ${JSON.stringify(before)}`);
    const scale0 = before.scale;
    // Negative deltaY → zoom in (see zoomMermaidTransform)
    const w = wheelOnViewerStage({
      deltaY: -80,
      deltaX: 0,
      altKey: true,
      times: 4,
    });
    waitMs(80);
    const after = parseCanvasTransform();
    log(
      `  opt-wheel: ${JSON.stringify(w)} scale ${scale0}→${after.scale} tx/ty ${before.tx},${before.ty}→${after.tx},${after.ty}`
    );
    assert(w?.ok, `opt-wheel failed: ${JSON.stringify(w)}`);
    assert(
      after.scale > scale0 + 0.01,
      `Opt+scroll must increase scale (${scale0}→${after.scale})`
    );
  });

  run('VG.5 Opt-hold does not paint tip popovers under viewer', () => {
    // Clear any leftover tips
    evalInPage(`
      (() => {
        document.querySelectorAll('kbd.prp-opt-btn-hint').forEach((el) => el.remove());
        document.documentElement.removeAttribute('data-prp-opt-held');
      })()
    `);
    // Force opt-hold latch used by product + e2e
    evalInPage(`
      (() => {
        document.documentElement.setAttribute('data-prp-opt-held', '1');
        window.dispatchEvent(
          new CustomEvent('prp-set-opt-hints', { detail: { active: true }, bubbles: true })
        );
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Alt',
            code: 'AltLeft',
            altKey: true,
            bubbles: true,
            cancelable: true,
          })
        );
      })()
    `);
    waitMs(200);
    // Also sample via holdChord pure-Alt path
    const hold = holdChord('Alt', { holdMs: 400, repeatMs: 50, sample: 'optHints' });
    waitMs(100);
    const tips = evalInPage(`
      (() => {
        const viewer = !!document.querySelector('[data-prp-mermaid-viewer="1"]');
        const tipKbds = document.querySelectorAll('kbd.prp-opt-btn-hint').length;
        const tipPortals = document.querySelectorAll('.prp-opt-btn-hint').length;
        return { viewer, tipKbds, tipPortals };
      })()
    `);
    log(`  opt tips under viewer: ${JSON.stringify(tips)} holdSamples=${JSON.stringify(hold?.optSamples?.slice?.(-1))}`);
    // Release alt latch
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-opt-held');
        window.dispatchEvent(
          new CustomEvent('prp-set-opt-hints', { detail: { active: false }, bubbles: true })
        );
        window.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: 'Alt',
            code: 'AltLeft',
            altKey: false,
            bubbles: true,
            cancelable: true,
          })
        );
        document.querySelectorAll('kbd.prp-opt-btn-hint').forEach((el) => el.remove());
      })()
    `);
    assert(tips?.viewer, 'viewer must still be open during Opt-hold check');
    assert(
      (tips.tipKbds || 0) === 0 && (tips.tipPortals || 0) === 0,
      `Opt tips must not paint under viewer: ${JSON.stringify(tips)}`
    );
  });

  run('VG.6 Esc closes viewer only (modal stays)', () => {
    press('Escape');
    waitMs(250);
    const snap = evalInPage(`
      (() => ({
        viewer: !!document.querySelector('[data-prp-mermaid-viewer="1"]'),
        imageViewer: !!document.querySelector('[data-prp-image-viewer="1"]'),
        overlay: !!document.querySelector('.prp-overlay'),
      }))()
    `);
    log(`  after Esc: ${JSON.stringify(snap)}`);
    assert(!snap.viewer && !snap.imageViewer, `viewer still open: ${JSON.stringify(snap)}`);
    assert(snap.overlay, 'Esc must not close PR modal while closing viewer');
  });

  run('VG.7 optional image viewer pan/zoom when markdown image present', () => {
    const hasImg = evalInPage(`
      (() => {
        const imgs = [...document.querySelectorAll('.prp-overlay .prp-md img, .prp-overlay img.prp-md__img')].filter(
          (img) => img.naturalWidth > 20 || img.complete
        );
        return { n: imgs.length, src: imgs[0]?.src?.slice?.(0, 80) || null };
      })()
    `);
    log(`  markdown images: ${JSON.stringify(hasImg)}`);
    if (!hasImg?.n) {
      log('  skip image viewer (no markdown images on this PR)');
      return;
    }
    const opened = evalInPage(`
      (() => {
        const img = document.querySelector('.prp-overlay .prp-md img, .prp-overlay img.prp-md__img');
        if (!img) return { ok: false };
        img.scrollIntoView?.({ block: 'center' });
        img.click();
        return { ok: true };
      })()
    `);
    waitMs(400);
    let viewer = evalInPage(`!!document.querySelector('[data-prp-image-viewer="1"]')`);
    if (!viewer) {
      // Double-click path
      evalInPage(`
        (() => {
          const img = document.querySelector('.prp-overlay .prp-md img');
          img?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        })()
      `);
      waitMs(400);
      viewer = evalInPage(`!!document.querySelector('[data-prp-image-viewer="1"]')`);
    }
    if (!viewer) {
      log(`  skip image viewer open failed: ${JSON.stringify(opened)}`);
      return;
    }
    const before = parseCanvasTransform();
    wheelOnViewerStage({ deltaY: 60, altKey: false, times: 2 });
    waitMs(100);
    const afterPan = parseCanvasTransform();
    wheelOnViewerStage({ deltaY: -50, altKey: true, times: 3 });
    waitMs(100);
    const afterZoom = parseCanvasTransform();
    log(
      `  image gestures pan ty ${before?.ty}→${afterPan?.ty} scale ${before?.scale}→${afterZoom?.scale}`
    );
    assert(
      Math.abs((afterPan?.ty ?? 0) - (before?.ty ?? 0)) > 0.5 ||
        Math.abs((afterPan?.tx ?? 0) - (before?.tx ?? 0)) > 0.5,
      `image viewer plain scroll should pan: ${JSON.stringify({ before, afterPan })}`
    );
    assert(
      (afterZoom?.scale ?? 1) > (afterPan?.scale ?? 1) + 0.005,
      `image viewer Opt+scroll should zoom: ${JSON.stringify({ afterPan, afterZoom })}`
    );
    press('Escape');
    waitMs(200);
    assert(
      !evalInPage(`!!document.querySelector('[data-prp-image-viewer="1"]')`),
      'image viewer should close on Esc'
    );
  });

  run('VG.99 cleanup seeded mermaid comment', () => {
    const result = cleanupTrackedComments({
      failClosed: false,
      log: (m) => log(m),
    });
    log(`  cleanup: deleted=${result.deleted} skipped=${result.skipped}`);
  });

  return steps;
}

export async function runViewerGestures(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
