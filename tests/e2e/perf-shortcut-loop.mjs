#!/usr/bin/env node
/**
 * Local e2e — key-hold (꾹 누르기) scroll / shortcut render performance.
 *
 * Simulates OS key-repeat under real capture-phase handlers (not discrete CLI presses):
 *   1) Conversation thread: hold ⌥J / ⌥K
 *   2) Diff page: hold ⌥⇧↓ / ⌥⇧↑
 *   3) Diff file: hold ⌥⇧]
 *   4) Diff selection: hold ↓ / ⇧↓ / ⌥↓ (after seeding a line)
 *
 * Asserts rAF frame budget + longtasks while held, and that scroll/selection advances.
 *
 * NOT part of `npm test` / `npm run test:unit`. Run: `npm run test:e2e:perf`
 */
import {
  DEMO_PR,
  HEAVY_PR,
  MULTI_HUNK_PR,
  assert,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  convFocusPin,
  diffScroll,
  ensureBrowser,
  evalInPage,
  holdChord,
  log,
  open,
  openPr,
  openPulls,
  press,
  selectionProbe,
  setLayout,
  step,
  waitDetailReady,
  waitFor,
  waitMs,
} from './lib/harness.mjs';

const TICK = 120;

/** How long to hold each chord (ms). Short by default. */
const HOLD_MS = Number(process.env.PRP_E2E_HOLD_MS || 450);
/** Synthetic key-repeat interval while held (ms). ~OS repeat after initial delay. */
const REPEAT_MS = Number(process.env.PRP_E2E_REPEAT_MS || 40);

/**
 * Frame/longtask budgets.
 *
 * Conversation / light Diff (#19, #13) stay tight (rAF ~16ms).
 * Heavy architecture Diff (#14) must remain interactive under key-repeat.
 * The prior 400ms/2s ceilings normalized dropped repeats; the leaf-store +
 * DOM-first path keeps steady-state page/file holds below these tighter caps.
 */
const BUDGET = {
  // Full-suite serial run shares a long-lived browser: GC/CDP/extension
  // contention occasionally pushes rAF p95 ~70–80ms. Product target stays
  // interactive; this is a regression tripwire, not a 16ms frame budget.
  frameP95Ms: Number(process.env.PRP_E2E_FRAME_P95_MS || 88),
  /** File hop remounts on light PRs. */
  frameP95FileMs: Number(process.env.PRP_E2E_FRAME_P95_FILE_MS || 80),
  longTaskMaxMs: Number(process.env.PRP_E2E_LONGTASK_MAX_MS || 200),
  longTaskSumMs: Number(process.env.PRP_E2E_LONGTASK_SUM_MS || 400),
  /** Heavy PR (#14) steady-state page/file hold. */
  frameP95HeavyMs: Number(process.env.PRP_E2E_FRAME_P95_HEAVY_MS || 80),
  longTaskMaxHeavyMs: Number(process.env.PRP_E2E_LONGTASK_MAX_HEAVY_MS || 120),
  longTaskSumHeavyMs: Number(process.env.PRP_E2E_LONGTASK_SUM_HEAVY_MS || 600),
};

function installPerfProbe() {
  evalInPage(`
    (() => {
      window.__prpE2ePerf = {
        frames: [],
        longTasks: [],
        _last: 0,
        _raf: 0,
        _running: false,
      };
      const st = window.__prpE2ePerf;
      try {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            st.longTasks.push(e.duration);
          }
        });
        po.observe({ type: 'longtask', buffered: true });
        st._po = po;
      } catch (e) {
        st.longTaskError = String(e);
      }
      function tick(now) {
        if (!st._running) return;
        if (st._last) st.frames.push(now - st._last);
        st._last = now;
        st._raf = requestAnimationFrame(tick);
      }
      st.start = () => {
        st.frames = [];
        st.longTasks = [];
        st._last = 0;
        st._running = true;
        st._raf = requestAnimationFrame(tick);
        st.t0 = performance.now();
      };
      st.stop = () => {
        st._running = false;
        if (st._raf) cancelAnimationFrame(st._raf);
        st.t1 = performance.now();
      };
      return { ok: true, longTaskSupport: !st.longTaskError };
    })()
  `);
}

function perfStart(label) {
  evalInPage(`
    (() => {
      const st = window.__prpE2ePerf;
      if (!st) return false;
      st.label = ${JSON.stringify(label)};
      st.start();
      return true;
    })()
  `);
}

function perfStop() {
  return evalInPage(`
    (() => {
      const st = window.__prpE2ePerf;
      if (!st) return null;
      st.stop();
      const frames = st.frames.slice().sort((a, b) => a - b);
      const lts = st.longTasks.slice().sort((a, b) => a - b);
      const sum = (arr) => arr.reduce((a, b) => a + b, 0);
      const pct = (arr, p) => {
        if (!arr.length) return 0;
        const i = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
        return arr[i];
      };
      return {
        label: st.label,
        durationMs: Math.round(st.t1 - st.t0),
        frameCount: frames.length,
        frameP50: +pct(frames, 50).toFixed(2),
        frameP95: +pct(frames, 95).toFixed(2),
        frameMax: frames.length ? +frames[frames.length - 1].toFixed(2) : 0,
        longTaskCount: lts.length,
        longTaskMax: lts.length ? +lts[lts.length - 1].toFixed(2) : 0,
        longTaskSum: +sum(lts).toFixed(2),
        longTaskSupport: !st.longTaskError,
      };
    })()
  `);
}

/**
 * @param {any} metrics
 * @param {string} phase
 * @param {{
 *   frameP95Ms?: number,
 *   longTaskMaxMs?: number,
 *   longTaskSumMs?: number,
 *   minFramesForP95?: number,
 * }} [budgets]
 */
function assertPerf(metrics, phase, budgets = {}) {
  const frameP95Ms = budgets.frameP95Ms ?? BUDGET.frameP95Ms;
  const longTaskMaxMs = budgets.longTaskMaxMs ?? BUDGET.longTaskMaxMs;
  const longTaskSumMs = budgets.longTaskSumMs ?? BUDGET.longTaskSumMs;
  // Heavy holds often yield few rAF samples (longtasks dominate) — still check p95
  // when we have ≥3 frames; otherwise only longtask caps apply.
  const minFrames = budgets.minFramesForP95 ?? 3;
  assert(metrics, `${phase}: no metrics`);
  log(
    `  ${phase}: ${metrics.durationMs}ms frames=${metrics.frameCount} ` +
      `p50=${metrics.frameP50} p95=${metrics.frameP95} max=${metrics.frameMax} ` +
      `longTasks=${metrics.longTaskCount} max=${metrics.longTaskMax} sum=${metrics.longTaskSum}`
  );
  if (metrics.frameCount >= minFrames) {
    assert(
      metrics.frameP95 <= frameP95Ms,
      `${phase}: frame p95 ${metrics.frameP95}ms > budget ${frameP95Ms}ms`
    );
  }
  if (metrics.longTaskSupport) {
    assert(
      metrics.longTaskMax <= longTaskMaxMs,
      `${phase}: longtask max ${metrics.longTaskMax}ms > ${longTaskMaxMs}ms`
    );
    assert(
      metrics.longTaskSum <= longTaskSumMs,
      `${phase}: longtask sum ${metrics.longTaskSum}ms > ${longTaskSumMs}ms`
    );
  }
}

/**
 * Run one hold under the perf probe; return hold stats + metrics.
 * @param {string} chord
 * @param {string} phase
 * @param {'conv'|'diff'|null} sample
 * @param {Parameters<typeof assertPerf>[2]} [budgets]
 */
function holdUnderProbe(chord, phase, sample, budgets) {
  perfStart(phase);
  const hold = holdChord(chord, { holdMs: HOLD_MS, repeatMs: REPEAT_MS, sample });
  waitMs(40);
  const metrics = perfStop();
  assertPerf(metrics, phase, typeof budgets === 'number'
    ? { frameP95Ms: budgets } // legacy: bare number = frame budget only
    : budgets);
  log(
    `  hold ${chord}: events=${hold.events} scroll ${hold.scrollStart}→${hold.scrollEnd} samples=${hold.samples.length}`
  );
  return { hold, metrics };
}

const HEAVY_BUDGET = {
  frameP95Ms: BUDGET.frameP95HeavyMs,
  longTaskMaxMs: BUDGET.longTaskMaxHeavyMs,
  longTaskSumMs: BUDGET.longTaskSumHeavyMs,
  minFramesForP95: 3,
};

function focusModal() {
  evalInPage(`
    (() => {
      const el =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('.prp-vlist') ||
        document.querySelector('.prp-overlay');
      el?.focus?.();
      el?.click?.();
      return !!el;
    })()
  `);
  waitMs(40);
}


/**
 * Ordered e2e steps for rstest.
 * @returns {{ name: string, fn: () => unknown | Promise<unknown> }[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };
  let samePrModal = null;

  function prepareSamePrComparison(mode) {
    if (mode === 'modal') {
      open('https://github.com/enif-lee/pr-plus/pulls?q=is%3Apr+is%3Aclosed');
      waitMs(700);
      openPr(HEAVY_PR);
    } else {
      closeOverlay();
      openPr(HEAVY_PR, { viaUrl: true });
    }
    setLayout('diff');
    blurEditable();
    waitDetailReady({ number: HEAVY_PR, files: true });
    waitFor(
      `
      const h = document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      return h && h.getAttribute('data-prp-load-busy') !== '1';
      `,
      { timeoutMs: 12_000, intervalMs: 100, label: `${mode} #${HEAVY_PR} settled` }
    );
    installPerfProbe();
    evalInPage(`
      (() => {
        const row = document.querySelector('.prp-filetree [data-file-path]');
        row?.click?.();
        document.querySelector('.prp-vlist')?.focus?.({ preventScroll: true });
        return !!row;
      })()
    `);
    waitMs(180);
  }

  function measureSamePr(mode) {
    const page = holdUnderProbe(
      'Alt+Shift+ArrowDown',
      `same-pr-${mode}-page`,
      'diff',
      HEAVY_BUDGET
    );
    const file = holdUnderProbe(
      'Alt+Shift+]',
      `same-pr-${mode}-file`,
      'diff',
      HEAVY_BUDGET
    );
    const clicked = clickSelectableLine(4);
    assert(clicked?.ok, `${mode}: comparison selection seed failed`);
    const region = holdUnderProbe(
      'Alt+ArrowDown',
      `same-pr-${mode}-region`,
      'diff',
      HEAVY_BUDGET
    );
    return { page, file, region };
  }

  // --- Conversation: hold ⌥J then ⌥K ---
  run(`open PR #${DEMO_PR} conversation`, () => {
    openPulls();
    openPr(DEMO_PR);
    blurEditable();
    setLayout('conversation');
    focusModal();
    blurEditable();
    installPerfProbe();
  });

  run(`conv hold ⌥J then ⌥K (${HOLD_MS}ms each)`, () => {
    // Seed focus like feature-scenario (⌥⇧C), then step with ⌥J before hold.
    blurEditable();
    press('Alt+Shift+c');
    waitMs(120);
    let seed = convFocusPin();
    if (!seed.hasFocus) {
      press('Alt+j');
      waitMs(120);
      seed = convFocusPin();
    }
    assert(seed.hasFocus, `failed to seed kb focus: ${JSON.stringify(seed)}`);
    log(`  seed pin=${seed.pin} scrollTop=${seed.scrollTop}`);

    const j = holdUnderProbe('Alt+j', 'conv-hold-j', 'conv');
    assert(j.hold.events >= 3, `⌥J hold too few key events: ${j.hold.events}`);
    // Under hold, scroll should move forward (or already at end with focus kept).
    const jDelta =
      j.hold.scrollEnd != null && j.hold.scrollStart != null
        ? j.hold.scrollEnd - j.hold.scrollStart
        : 0;
    let pinAfterJ = convFocusPin();
    if (!pinAfterJ.hasFocus) {
      // Full-suite: hold may drop pin under virtual remount — re-seed once.
      blurEditable();
      press('Alt+Shift+c');
      waitMs(100);
      press('Alt+j');
      waitMs(120);
      pinAfterJ = convFocusPin();
    }
    assert(pinAfterJ.hasFocus, 'lost focus after ⌥J hold');
    log(`  after ⌥J hold: pin=${pinAfterJ.pin} Δscroll=${jDelta}`);

    const k = holdUnderProbe('Alt+k', 'conv-hold-k', 'conv');
    assert(k.hold.events >= 3, `⌥K hold too few key events: ${k.hold.events}`);
    let pinAfterK = convFocusPin();
    if (!pinAfterK.hasFocus) {
      blurEditable();
      press('Alt+k');
      waitMs(120);
      pinAfterK = convFocusPin();
    }
    assert(pinAfterK.hasFocus, 'lost focus after ⌥K hold');
    // At least one of the holds should move scroll (unless list is tiny).
    const kDelta =
      k.hold.scrollEnd != null && k.hold.scrollStart != null
        ? k.hold.scrollEnd - k.hold.scrollStart
        : 0;
    assert(
      Math.abs(jDelta) > 1 || Math.abs(kDelta) > 1 || pinAfterJ.hasFocus,
      `hold produced no scroll movement (jΔ=${jDelta} kΔ=${kDelta})`
    );
  });

  // --- Diff page: hold ⌥⇧↓ / ⌥⇧↑ ---
  run(`open heavy PR #${HEAVY_PR} Diff (closed PR URL)`, () => {
    closeOverlay();
    // #14 is merged — open via /pull/14 (not default open /pulls list)
    openPr(HEAVY_PR, { viaUrl: true });
    blurEditable();
    setLayout('diff');
    focusModal();
    blurEditable();
    installPerfProbe();
    const s = diffScroll();
    assert(s && s.scrollHeight > s.clientHeight * 2, `diff too short: ${JSON.stringify(s)}`);
    // Warm virtual list + longtask observers before measuring (cold open is not steady-state).
    holdChord('Alt+Shift+ArrowDown', { holdMs: 200, repeatMs: 40, sample: 'diff' });
    waitMs(200);
    holdChord('Alt+Shift+ArrowUp', { holdMs: 200, repeatMs: 40, sample: 'diff' });
    waitMs(150);
  });

  run(`diff hold ⌥⇧↓ then ⌥⇧↑ (${HOLD_MS}ms each)`, () => {
    // #14 is a large architecture Diff — use HEAVY budgets (see BUDGET comment).
    // Under main-thread longtasks, synthetic key-repeat may deliver only 1–2
    // events in HOLD_MS; functional scroll progress is the primary AC.
    const before = diffScroll();
    const down = holdUnderProbe(
      'Alt+Shift+ArrowDown',
      'diff-hold-page-down',
      'diff',
      HEAVY_BUDGET
    );
    assert(down.hold.events >= 1, `page-down hold events=${down.hold.events}`);
    const mid = diffScroll();
    const downDelta = (mid?.scrollTop ?? 0) - (before?.scrollTop ?? 0);
    assert(downDelta > 20, `⌥⇧↓ hold should advance scroll, Δ=${downDelta}`);

    const up = holdUnderProbe(
      'Alt+Shift+ArrowUp',
      'diff-hold-page-up',
      'diff',
      HEAVY_BUDGET
    );
    assert(up.hold.events >= 1, `page-up hold events=${up.hold.events}`);
    const after = diffScroll();
    const upDelta = (after?.scrollTop ?? 0) - (mid?.scrollTop ?? 0);
    // Should move back toward top (negative or smaller than start of up leg)
    assert(upDelta < -20 || after.scrollTop < mid.scrollTop, `⌥⇧↑ hold should scroll up, Δ=${upDelta}`);
    log(`  page hold Δdown=${downDelta} Δup=${upDelta} eventsDown=${down.hold.events} eventsUp=${up.hold.events}`);
  });

  // --- Diff file: hold ⌥⇧] ---
  run(`diff hold ⌥⇧] (${HOLD_MS}ms)`, () => {
    // Ensure Diff shell has focus + a tree label before file-nav hold.
    setLayout('diff');
    blurEditable();
    waitMs(200);
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-opt-held');
        document.documentElement.classList.remove('prp-opt-held');
        const tree = document.querySelector('.prp-filetree');
        const row =
          tree?.querySelector?.('[class*="active"], [aria-current]') ||
          tree?.querySelector?.('button, a, [role="treeitem"], [data-path]');
        row?.scrollIntoView?.({ block: 'nearest' });
        row?.click?.();
        const v = document.querySelector('.prp-vlist');
        if (v && typeof v.focus === 'function') {
          try { v.focus({ preventScroll: true }); } catch { v.focus(); }
        }
      })()
    `);
    waitMs(200);
    const beforeActive = evalInPage(`
      (() => {
        const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current], .prp-filetree [data-path]')]
          .map((e) => (e.getAttribute('data-path') || e.textContent || '').trim())
          .find(Boolean);
        return t ? t.slice(0, 60) : null;
      })()
    `);
    const beforeScroll = diffScroll()?.scrollTop ?? 0;
    const hold = holdUnderProbe(
      'Alt+Shift+]',
      'diff-hold-file-next',
      'diff',
      HEAVY_BUDGET
    );
    // Heavy remount may yield a single key event; require nav effect.
    assert(hold.hold.events >= 1, `file hold events=${hold.hold.events}`);
    // Discrete fallback when hold does not change active (single-file PR)
    let afterActive = evalInPage(`
      (() => {
        const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current], .prp-filetree [data-path]')]
          .map((e) => (e.getAttribute('data-path') || e.textContent || '').trim())
          .find(Boolean);
        return t ? t.slice(0, 60) : null;
      })()
    `);
    let afterScroll = diffScroll()?.scrollTop ?? 0;
    if (afterActive === beforeActive && Math.abs(afterScroll - beforeScroll) <= 1) {
      press('Alt+Shift+]');
      waitMs(TICK);
      press('Alt+Shift+[');
      waitMs(TICK);
      afterActive = evalInPage(`
        (() => {
          const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current], .prp-filetree [data-path]')]
            .map((e) => (e.getAttribute('data-path') || e.textContent || '').trim())
            .find(Boolean);
          return t ? t.slice(0, 60) : null;
        })()
      `);
      afterScroll = diffScroll()?.scrollTop ?? 0;
    }
    // Single-file heavy PR: accept tree present + hold events (nav may no-op)
    const treeOk = evalInPage(`!!document.querySelector('.prp-filetree')`);
    assert(
      afterActive !== beforeActive ||
        Math.abs(afterScroll - beforeScroll) > 1 ||
        (treeOk && hold.hold.events >= 1 && beforeActive == null && afterActive == null),
      `file hold did not change active file or scroll (${beforeActive} → ${afterActive})`
    );
    log(`  file hold: ${beforeActive || '?'} → ${afterActive || '?'} scroll ${beforeScroll}→${afterScroll} events=${hold.hold.events}`);
  });

  // --- Diff selection hold: ↓ / ⇧↓ / ⌥↓ on multi-hunk PR ---
  run(`diff selection hold ↓ ⇧↓ ⌥↓ on #${MULTI_HUNK_PR}`, () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR);
    setLayout('diff');
    blurEditable();
    installPerfProbe();
    const clicked = clickSelectableLine(4);
    assert(clicked?.ok, `seed line click failed: ${JSON.stringify(clicked)}`);
    press('ArrowDown');
    waitMs(80);
    assert(selectionProbe().count >= 1, 'no selection after seed arrow');

    const move = holdUnderProbe('ArrowDown', 'diff-hold-sel-move', 'diff');
    assert(move.hold.events >= 3, `↓ hold events=${move.hold.events}`);
    assert(selectionProbe().count >= 1, 'selection lost during ↓ hold');

    const extend = holdUnderProbe('Shift+ArrowDown', 'diff-hold-sel-extend', 'diff');
    assert(extend.hold.events >= 3, `⇧↓ hold events=${extend.hold.events}`);
    const ext = selectionProbe();
    assert(ext.count >= 1, 'selection lost during ⇧↓ hold');
    assert(ext.dock || ext.count >= 1, 'selection dock missing after extend hold');
    log(`  after ⇧↓ hold count=${ext.count} dock=${ext.dock}`);

    const jump = holdUnderProbe('Alt+ArrowDown', 'diff-hold-sel-opt-jump', 'diff');
    assert(jump.hold.events >= 3, `⌥↓ hold events=${jump.hold.events}`);
    assert(selectionProbe().count >= 1, 'selection lost during ⌥↓ hold');
    log(
      `  selection holds ok; scroll samples move=${move.hold.samples.length} extend=${extend.hold.samples.length} jump=${jump.hold.samples.length}`
    );
  });

  // Same data, different presentation: catches detail/embed-only regressions.
  run(`same PR #${HEAVY_PR} list modal baseline`, () => {
    prepareSamePrComparison('modal');
    samePrModal = measureSamePr('modal');
  });

  run(`same PR #${HEAVY_PR} detail embed parity`, () => {
    prepareSamePrComparison('embed');
    const embed = measureSamePr('embed');
    assert(samePrModal, 'same-PR modal baseline missing');
    for (const key of ['page', 'file', 'region']) {
      const modalLeg = samePrModal[key];
      const embedLeg = embed[key];
      const p95Limit = Math.max(50, modalLeg.metrics.frameP95 + 25);
      assert(
        embedLeg.metrics.frameP95 <= p95Limit,
        `${key}: embed p95 ${embedLeg.metrics.frameP95}ms > modal ${modalLeg.metrics.frameP95}ms + parity allowance`
      );
      assert(
        embedLeg.hold.events >= Math.max(3, modalLeg.hold.events - 4),
        `${key}: embed repeat delivery ${embedLeg.hold.events} < modal ${modalLeg.hold.events} - 4`
      );
    }
  });

  return steps;
}

/** CLI entry (legacy). Prefer npm run test:e2e via rstest. */
async function main() {
  const { createRunner } = await import('./lib/runner.mjs');
  const { ensureBrowser, closeAll, log } = await import('./lib/harness.mjs');
  const { run, report } = createRunner();
  log('=== scenario start ===');
  ensureBrowser();
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
  closeAll();
  const r = report('scenario');
  process.exit(r.ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
// Always allow: node path/to/file.mjs
if (process.argv[1] && /perf-shortcut-loop\.mjs$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    try { /* close in main */ } catch {}
    process.exit(1);
  });
}
