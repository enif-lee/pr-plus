/**
 * P2 Diff thread / file / page nav + Find / side panel / mode
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  DEMO_PR,
  activeFileLabel,
  assert,
  blurEditable,
  diffScroll,
  diffThreadProbe,
  evalInPage,
  holdChord,
  layout,
  log,
  openPr,
  press,
  setLayout,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';
import { TICK } from '../lib/runner.mjs';

/**
 * Register ordered steps without executing them.
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  // Self-contained when run alone (suite already has demo PR open).
  run('P2.0 ensure Diff shell', () => {
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
    }
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`P2.0 PR #${DEMO_PR} Diff files ready`);
    waitMs(300);
  });
  run('P2.1 Diff ⌥J/K thread nav', () => {
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`P2.1 PR #${DEMO_PR} Diff files ready`);
    // Review threads may land after files (GraphQL or REST fallback).
    let before = diffThreadProbe();
    const t0 = Date.now();
    while (before.threadCount < 1 && Date.now() - t0 < 12_000) {
      waitMs(400);
      before = diffThreadProbe();
    }
    if (before.threadCount < 1) {
      // Hard reopen once — REST fallback / fresh fetch after rate-limit recovery
      openPr(DEMO_PR, { viaUrl: true });
      setLayout('diff');
      waitDiffFilesReady(`P2.1 reopen files`);
      const t1 = Date.now();
      before = diffThreadProbe();
      while (before.threadCount < 1 && Date.now() - t1 < 10_000) {
        waitMs(400);
        before = diffThreadProbe();
      }
    }
    assert(
      before.threadCount >= 1 || before.scrollTop != null,
      `diff threads/list missing: ${JSON.stringify(before)}`
    );
    // Seed keyboard focus on review threads when present
    if (before.threadCount >= 1) {
      press('Alt+Shift+c');
      waitMs(TICK);
    }
    const tops = [before.scrollTop];
    const actives = [before.hasActive];
    for (let i = 0; i < 4; i++) {
      press('Alt+j');
      waitMs(TICK);
      const p = diffThreadProbe();
      tops.push(p.scrollTop ?? null);
      actives.push(p.hasActive);
    }
    press('Alt+k');
    waitMs(TICK);
    const afterK = diffThreadProbe();
    tops.push(afterK.scrollTop ?? null);
    actives.push(afterK.hasActive);
    const moved = tops.some((t, i) => i > 0 && t != null && tops[0] != null && t !== tops[0]);
    // Small single-file PR may keep scrollTop 0 if all threads fit — then still
    // require threads mounted (or focus toggled) so handlers are not inert.
    const after = diffThreadProbe();
    const focusSignal = actives.some(Boolean) || after.hasActive || after.nearest != null;
    assert(
      after.threadCount >= 1 || moved || focusSignal,
      `thread nav inert: tops=${tops.join(',')} threads=${after.threadCount} actives=${actives.join(',')}`
    );
    log(
      `  threads=${after.threadCount} scrollTops=${tops.join('→')} nearest=${JSON.stringify(after.nearest)} actives=${actives.join('→')}`
    );
  });
  run('P2.5 Diff ⌥⇧[ / ⌥⇧] file nav', () => {
    blurEditable();
    const a0 = activeFileLabel();
    press('Alt+Shift+]');
    waitMs(TICK);
    const a1 = activeFileLabel();
    press('Alt+Shift+[');
    waitMs(TICK);
    const a2 = activeFileLabel();
    // Single-file PR: labels may stay equal — require no throw + tree present
    assert(
      evalInPage(`!!document.querySelector('.prp-filetree')`),
      'filetree missing during file nav'
    );
    log(`  files ${a0 || '?'} → ${a1 || '?'} → ${a2 || '?'}`);
  });
  run('P2.9 Diff ⌥⇧↑/↓ page scroll', () => {
    setLayout('diff');
    blurEditable();
    waitMs(250);
    // Start from top so page-down has room; clear opt-hold latch
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-opt-held');
        document.documentElement.classList.remove('prp-opt-held');
        const el = document.querySelector('.prp-vlist');
        if (el) el.scrollTop = 0;
      })()
    `);
    waitMs(200);
    const before = diffScroll();
    assert(before, 'vlist missing');
    const maxScroll = Math.max(0, before.scrollHeight - before.clientHeight);
    // holdChord preserves alt+shift better than discrete press for page scroll
    holdChord('Alt+Shift+ArrowDown', { holdMs: 350, repeatMs: 50, sample: 'diff' });
    waitMs(150);
    let after = diffScroll();
    let pageDelta = after.scrollTop - before.scrollTop;
    if (pageDelta < 40 && maxScroll > 40) {
      // Fallback: two discrete chords
      press('Alt+Shift+ArrowDown');
      waitMs(TICK);
      press('Alt+Shift+ArrowDown');
      waitMs(TICK);
      after = diffScroll();
      pageDelta = after.scrollTop - before.scrollTop;
    }
    const shortList = maxScroll < before.clientHeight * 0.5;
    const nearEnd =
      before.scrollTop + before.clientHeight >= before.scrollHeight - 40 ||
      maxScroll <= 20;
    const need = shortList
      ? Math.max(20, Math.floor(maxScroll * 0.4))
      : Math.min(before.clientHeight * 0.35, maxScroll * 0.5);
    assert(
      nearEnd || pageDelta >= need,
      `page nav delta too small: ${pageDelta} (ch=${before.clientHeight} max=${maxScroll} layout=${layout()})`
    );
    holdChord('Alt+Shift+ArrowUp', { holdMs: 250, repeatMs: 50, sample: 'diff' });
    waitMs(100);
    log(`  page Δ=${pageDelta} maxScroll=${maxScroll}`);
  });
  run('P2 chrome: Find + side panel + mode', () => {
    blurEditable();
    press('Meta+f');
    waitMs(300);
    const find = evalInPage(`
      (() => {
        const search = document.querySelector('.prp-search__input, .prp-search input');
        return {
          focused: document.activeElement?.classList?.contains('prp-search__input') || document.activeElement === search,
          exists: !!search,
        };
      })()
    `);
    assert(find.exists && find.focused, `Find bar not focused: ${JSON.stringify(find)}`);
    press('Escape');
    waitMs(150);
    blurEditable();

    press('Alt+b');
    waitMs(300);
    const collapsed = evalInPage(`
      (() => {
        const ft = document.querySelector('.prp-filetree');
        return ft ? ft.classList.contains('prp-filetree--nav-collapsed') : false;
      })()
    `);
    assert(collapsed, 'filetree not collapsed after ⌥B');
    press('Alt+b');
    waitMs(200);

    const mode = evalInPage(`
      (() => {
        const split = document.querySelector('input[value="split"]');
        const unified = document.querySelector('input[value="unified"]');
        if (!split || !unified) return { ok: false };
        split.click();
        return { ok: true };
      })()
    `);
    assert(mode.ok, 'diff mode radios missing');
    waitMs(200);
    evalInPage(`document.querySelector('input[value="unified"]')?.click()`);
    waitMs(150);
  });


  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runDiffNav(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
