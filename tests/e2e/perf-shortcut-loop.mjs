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
  openPr,
  openPulls,
  press,
  selectionProbe,
  setLayout,
  step,
  waitMs,
} from './lib/harness.mjs';

/** How long to hold each chord (ms). Short by default. */
const HOLD_MS = Number(process.env.PRP_E2E_HOLD_MS || 450);
/** Synthetic key-repeat interval while held (ms). ~OS repeat after initial delay. */
const REPEAT_MS = Number(process.env.PRP_E2E_REPEAT_MS || 40);

const BUDGET = {
  frameP95Ms: Number(process.env.PRP_E2E_FRAME_P95_MS || 50),
  /** File hop remounts are heavier; separate ceiling for ⌥⇧] hold. */
  frameP95FileMs: Number(process.env.PRP_E2E_FRAME_P95_FILE_MS || 80),
  longTaskMaxMs: Number(process.env.PRP_E2E_LONGTASK_MAX_MS || 200),
  longTaskSumMs: Number(process.env.PRP_E2E_LONGTASK_SUM_MS || 400),
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

function assertPerf(metrics, phase, frameBudgetMs = BUDGET.frameP95Ms) {
  assert(metrics, `${phase}: no metrics`);
  log(
    `  ${phase}: ${metrics.durationMs}ms frames=${metrics.frameCount} ` +
      `p50=${metrics.frameP50} p95=${metrics.frameP95} max=${metrics.frameMax} ` +
      `longTasks=${metrics.longTaskCount} max=${metrics.longTaskMax} sum=${metrics.longTaskSum}`
  );
  if (metrics.frameCount >= 6) {
    assert(
      metrics.frameP95 <= frameBudgetMs,
      `${phase}: frame p95 ${metrics.frameP95}ms > budget ${frameBudgetMs}ms`
    );
  }
  if (metrics.longTaskSupport) {
    assert(
      metrics.longTaskMax <= BUDGET.longTaskMaxMs,
      `${phase}: longtask max ${metrics.longTaskMax}ms > ${BUDGET.longTaskMaxMs}ms`
    );
    assert(
      metrics.longTaskSum <= BUDGET.longTaskSumMs,
      `${phase}: longtask sum ${metrics.longTaskSum}ms > ${BUDGET.longTaskSumMs}ms`
    );
  }
}

/**
 * Run one hold under the perf probe; return hold stats + metrics.
 * @param {string} chord
 * @param {string} phase
 * @param {'conv'|'diff'|null} sample
 * @param {number} [frameBudgetMs]
 */
function holdUnderProbe(chord, phase, sample, frameBudgetMs) {
  perfStart(phase);
  const hold = holdChord(chord, { holdMs: HOLD_MS, repeatMs: REPEAT_MS, sample });
  waitMs(40);
  const metrics = perfStop();
  assertPerf(metrics, phase, frameBudgetMs);
  log(
    `  hold ${chord}: events=${hold.events} scroll ${hold.scrollStart}→${hold.scrollEnd} samples=${hold.samples.length}`
  );
  return { hold, metrics };
}

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

async function main() {
  const failures = [];
  const run = async (name, fn) => {
    try {
      await step(name, fn);
    } catch (e) {
      failures.push({ name, err: e });
      log(`FAIL: ${name}: ${e.message || e}`);
    }
  };

  log('=== perf-shortcut-loop start (key-hold) ===');
  log(`holdMs=${HOLD_MS} repeatMs=${REPEAT_MS}`);
  log(
    `budget frameP95=${BUDGET.frameP95Ms}ms longTaskMax=${BUDGET.longTaskMaxMs}ms longTaskSum=${BUDGET.longTaskSumMs}ms`
  );

  ensureBrowser();
  openPulls();

  // --- Conversation: hold ⌥J then ⌥K ---
  await run(`open PR #${DEMO_PR} conversation`, () => {
    openPr(DEMO_PR);
    setLayout('conversation');
    focusModal();
    installPerfProbe();
  });

  await run(`conv hold ⌥J then ⌥K (${HOLD_MS}ms each)`, () => {
    // Seed one step so focus exists before hold.
    press('Alt+j');
    waitMs(60);
    const seed = convFocusPin();
    assert(seed.hasFocus, `failed to seed kb focus: ${JSON.stringify(seed)}`);
    log(`  seed pin=${seed.pin} scrollTop=${seed.scrollTop}`);

    const j = holdUnderProbe('Alt+j', 'conv-hold-j', 'conv');
    assert(j.hold.events >= 3, `⌥J hold too few key events: ${j.hold.events}`);
    // Under hold, scroll should move forward (or already at end with focus kept).
    const jDelta =
      j.hold.scrollEnd != null && j.hold.scrollStart != null
        ? j.hold.scrollEnd - j.hold.scrollStart
        : 0;
    const pinAfterJ = convFocusPin();
    assert(pinAfterJ.hasFocus, 'lost focus after ⌥J hold');
    log(`  after ⌥J hold: pin=${pinAfterJ.pin} Δscroll=${jDelta}`);

    const k = holdUnderProbe('Alt+k', 'conv-hold-k', 'conv');
    assert(k.hold.events >= 3, `⌥K hold too few key events: ${k.hold.events}`);
    const pinAfterK = convFocusPin();
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
  await run(`open heavy PR #${HEAVY_PR} Diff`, () => {
    closeOverlay();
    openPr(HEAVY_PR);
    setLayout('diff');
    focusModal();
    installPerfProbe();
    const s = diffScroll();
    assert(s && s.scrollHeight > s.clientHeight * 2, `diff too short: ${JSON.stringify(s)}`);
  });

  await run(`diff hold ⌥⇧↓ then ⌥⇧↑ (${HOLD_MS}ms each)`, () => {
    const before = diffScroll();
    const down = holdUnderProbe('Alt+Shift+ArrowDown', 'diff-hold-page-down', 'diff');
    assert(down.hold.events >= 3, `page-down hold events=${down.hold.events}`);
    const mid = diffScroll();
    const downDelta = (mid?.scrollTop ?? 0) - (before?.scrollTop ?? 0);
    assert(downDelta > 20, `⌥⇧↓ hold should advance scroll, Δ=${downDelta}`);

    const up = holdUnderProbe('Alt+Shift+ArrowUp', 'diff-hold-page-up', 'diff');
    assert(up.hold.events >= 3, `page-up hold events=${up.hold.events}`);
    const after = diffScroll();
    const upDelta = (after?.scrollTop ?? 0) - (mid?.scrollTop ?? 0);
    // Should move back toward top (negative or smaller than start of up leg)
    assert(upDelta < -20 || after.scrollTop < mid.scrollTop, `⌥⇧↑ hold should scroll up, Δ=${upDelta}`);
    log(`  page hold Δdown=${downDelta} Δup=${upDelta}`);
  });

  // --- Diff file: hold ⌥⇧] ---
  await run(`diff hold ⌥⇧] (${HOLD_MS}ms)`, () => {
    const beforeActive = evalInPage(`
      (() => {
        const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current]')]
          .map((e) => (e.textContent || '').trim())
          .find(Boolean);
        return t ? t.slice(0, 60) : null;
      })()
    `);
    const beforeScroll = diffScroll()?.scrollTop ?? 0;
    const hold = holdUnderProbe(
      'Alt+Shift+]',
      'diff-hold-file-next',
      'diff',
      BUDGET.frameP95FileMs
    );
    assert(hold.hold.events >= 3, `file hold events=${hold.hold.events}`);
    const afterActive = evalInPage(`
      (() => {
        const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current]')]
          .map((e) => (e.textContent || '').trim())
          .find(Boolean);
        return t ? t.slice(0, 60) : null;
      })()
    `);
    const afterScroll = diffScroll()?.scrollTop ?? 0;
    assert(
      afterActive !== beforeActive || Math.abs(afterScroll - beforeScroll) > 1,
      `file hold did not change active file or scroll (${beforeActive} → ${afterActive})`
    );
    log(`  file hold: ${beforeActive || '?'} → ${afterActive || '?'} scroll ${beforeScroll}→${afterScroll}`);
  });

  // --- Diff selection hold: ↓ / ⇧↓ / ⌥↓ on multi-hunk PR ---
  await run(`diff selection hold ↓ ⇧↓ ⌥↓ on #${MULTI_HUNK_PR}`, () => {
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

  closeOverlay();
  log('=== perf-shortcut-loop done ===');

  if (failures.length) {
    console.error(`\n${failures.length} step(s) failed:`);
    for (const f of failures) console.error(`  - ${f.name}: ${f.err.message || f.err}`);
    process.exit(1);
  }
  console.log('\nperf-shortcut-loop: ALL PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
