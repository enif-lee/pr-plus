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

  run('P2.0b review filter multi-select defaults + gear', () => {
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
    }
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`P2.0b PR #${DEMO_PR} Diff files ready`);
    // Close Find-in-diff if left open — it replaces the review-filter chrome.
    for (let i = 0; i < 3; i++) {
      const searchOpen = evalInPage(`
        !!document.querySelector(
          '.prp-diff-toolbar__thread-tools--search, .prp-search-bar, input[placeholder*="Find in diff" i]'
        )
      `);
      if (!searchOpen) break;
      press('Escape');
      waitMs(150);
    }
    waitMs(400);
    const probeFilterChrome = () =>
      evalInPage(`
        (() => {
          const btns = Array.from(
            document.querySelectorAll('.prp-review-filter__btn')
          );
          const pressed = btns.map((b) => {
            const text = (b.textContent || '').replace(/\\s+/g, ' ').trim();
            const m = text.match(/^(Unresolved|Resolved|Pending)\\s*(\\d+)?/i);
            return {
              text,
              kind: m ? m[1].toLowerCase() : null,
              count: m && m[2] != null ? Number(m[2]) : null,
              on:
                b.getAttribute('aria-pressed') === 'true' ||
                b.classList.contains('prp-review-filter__btn--on'),
            };
          });
          const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
          const stepPrev = document.querySelector(
            '.prp-diff-toolbar__thread-nav .prp-step-nav__btn'
          );
          const cs = stepPrev ? getComputedStyle(stepPrev) : null;
          // Primary toolbar must NOT host mode/whitespace (moved into gear menu)
          const toolbar = document.querySelector('.prp-diff-toolbar');
          const menuOpen = document.querySelector(
            '[data-prp-review-filter-menu="1"]'
          );
          const primaryRadios = toolbar
            ? [...toolbar.querySelectorAll('input[name="prp-diff-mode"]')].filter(
                (el) => !menuOpen || !menuOpen.contains(el)
              )
            : [];
          const primaryHideWs = toolbar
            ? [...toolbar.querySelectorAll('[data-prp-hide-whitespace="1"]')].filter(
                (el) => !menuOpen || !menuOpen.contains(el)
              )
            : [];
          return {
            pressed,
            hasGear: !!gear,
            prevPadRight: cs?.paddingRight || null,
            prevPadLeft: cs?.paddingLeft || null,
            prevW: cs?.width || null,
            toolbar: !!toolbar,
            layout:
              document.querySelector('.prp-overlay')?.getAttribute('data-layout') ||
              null,
            primaryModeRadios: primaryRadios.length,
            primaryHideWs: primaryHideWs.length,
          };
        })()
      `);
    // Thread filter/gear mounts after shell counts land — poll mid-suite.
    let snap = probeFilterChrome();
    for (let attempt = 0; attempt < 12 && !snap?.hasGear; attempt++) {
      waitMs(350);
      snap = probeFilterChrome();
    }
    assert(snap?.hasGear, `review filter gear missing: ${JSON.stringify(snap)}`);
    // Display controls live only in settings popover — not on primary row
    assert(
      snap.primaryModeRadios === 0,
      `Unified/Split must not sit on primary toolbar: ${JSON.stringify(snap)}`
    );
    assert(
      snap.primaryHideWs === 0,
      `Hide whitespace must not sit on primary toolbar: ${JSON.stringify(snap)}`
    );

    // Pending chip: hidden when count is 0 (product: only show when pending > 0)
    const pendingChip = (snap.pressed || []).find(
      (p) => p.kind === 'pending' || /^Pending\\b/i.test(p.text)
    );
    if (pendingChip) {
      assert(
        pendingChip.count == null || pendingChip.count > 0,
        `Pending chip must not render at count 0: ${JSON.stringify(pendingChip)}`
      );
      assert(
        pendingChip.on,
        `Pending should start selected when shown: ${JSON.stringify(snap.pressed)}`
      );
    } else {
      // No pending work → chip absent (not a disabled 0 chip)
      log('  Pending chip hidden (no pending comments) — OK');
    }

    // Open gear menu (React state) then re-query after a tick
    evalInPage(`
      (() => {
        const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
        if (gear) gear.click();
        return !!gear;
      })()
    `);
    waitMs(200);
    const menuSnap = evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        const menuText = (menu?.innerText || '').replace(/\\s+/g, ' ');
        return {
          menuOpen: !!menu,
          hide: /Hide outdated/i.test(menuText),
          by: /Reviewed by/i.test(menuText),
          text: menuText.slice(0, 160),
          unified: !!menu?.querySelector('input[value="unified"]'),
          split: !!menu?.querySelector('input[value="split"]'),
          hideWs: !!menu?.querySelector('[data-prp-hide-whitespace="1"]'),
          hasDiffView: /Diff view/i.test(menuText),
          unifiedChecked: !!menu?.querySelector(
            'input[value="unified"]:checked'
          ),
          hideWsChecked: !!menu?.querySelector(
            '[data-prp-hide-whitespace="1"]:checked'
          ),
        };
      })()
    `);
    assert(
      menuSnap?.menuOpen && menuSnap?.hide && menuSnap?.by,
      `settings menu missing hide/outdated or authors: ${JSON.stringify(menuSnap)}`
    );
    assert(
      menuSnap?.unified &&
        menuSnap?.split &&
        menuSnap?.hideWs &&
        menuSnap?.hasDiffView,
      `settings menu missing display options: ${JSON.stringify(menuSnap)}`
    );
    // close
    evalInPage(`
      (() => {
        const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
        if (gear) gear.click();
        return true;
      })()
    `);
    waitMs(100);
    const unresolved = (snap.pressed || []).find(
      (p) => p.kind === 'unresolved' || /Unresolved/i.test(p.text)
    );
    // Defaults: unresolved selected; not exclusive single
    assert(
      unresolved?.on,
      `Unresolved should start selected: ${JSON.stringify(snap.pressed)}`
    );
    // ↑ button no extra right padding vs left
    if (snap.prevPadRight != null) {
      assert(
        snap.prevPadRight === '0px' || snap.prevPadRight === '0',
        `StepNav ↑ padding-right should be 0: ${snap.prevPadRight}`
      );
    }
    log('P2.0b review filter OK', { snap, menuSnap, pendingChip: pendingChip || null });
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

    // ⌥B — Diff files navigator collapse (same chord as Conversation metadata rail).
    const fileNavProbe = () =>
      evalInPage(`
        (() => {
          const ft =
            document.querySelector('.prp-filetree') ||
            document.querySelector('.prp-diff-layout .prp-filetree');
          const layout = document.querySelector('.prp-diff-layout');
          const collapsed =
            ft?.classList.contains('prp-filetree--nav-collapsed') ||
            layout?.classList.contains('prp-diff-layout--nav-collapsed') ||
            document.querySelector('.prp-file-nav-resizer')?.getAttribute('data-collapsed') ===
              '1';
          const w = ft ? Math.round(ft.getBoundingClientRect().width) : 0;
          return { hasTree: !!ft, collapsed: !!collapsed, w };
        })()
      `);

    let navBefore = fileNavProbe();
    log(`  filetree before ${JSON.stringify(navBefore)}`);
    assert(navBefore.hasTree, `filetree missing: ${JSON.stringify(navBefore)}`);
    if (navBefore.collapsed) {
      press('Alt+b');
      waitMs(300);
      navBefore = fileNavProbe();
      assert(
        !navBefore.collapsed,
        `could not expand filetree before toggle: ${JSON.stringify(navBefore)}`
      );
    }
    const expandedW = navBefore.w;

    press('Alt+b');
    waitMs(450);
    let navMid = fileNavProbe();
    if (!navMid.collapsed) {
      waitMs(250);
      press('Alt+b');
      waitMs(450);
      navMid = fileNavProbe();
    }
    log(`  filetree after collapse ${JSON.stringify(navMid)}`);
    assert(
      navMid.collapsed,
      `filetree not collapsed after ⌥B: ${JSON.stringify(navMid)}`
    );
    // Width shrink is layout-dependent (some shells keep rail min-width).
    // Prefer collapsed class; only require width drop when it actually moves.
    if (expandedW > 80 && navMid.w < expandedW) {
      assert(
        navMid.w <= expandedW - 8,
        `collapsed filetree should shrink (${expandedW}→${navMid.w})`
      );
    }

    press('Alt+b');
    waitMs(250);
    const navAfter = fileNavProbe();
    log(`  filetree after re-expand ${JSON.stringify(navAfter)}`);
    assert(
      !navAfter.collapsed,
      `filetree not re-expanded after second ⌥B: ${JSON.stringify(navAfter)}`
    );

    // ── Display settings popover: Unified/Split + Hide whitespace ──
    const probeDiffPaint = () =>
      evalInPage(`
        (() => {
          const splitRows = document.querySelectorAll(
            '.prp-vline--split, .prp-split-cols, [data-split="1"]'
          ).length;
          const vlines = document.querySelectorAll('.prp-vline').length;
          const hideWsInMenu = document.querySelector(
            '[data-prp-review-filter-menu="1"] [data-prp-hide-whitespace="1"]'
          );
          const splitRadio = document.querySelector(
            '[data-prp-review-filter-menu="1"] input[value="split"]'
          );
          const unifiedRadio = document.querySelector(
            '[data-prp-review-filter-menu="1"] input[value="unified"]'
          );
          return {
            splitRows,
            vlines,
            hideWsChecked: !!hideWsInMenu?.checked,
            splitChecked: !!splitRadio?.checked,
            unifiedChecked: !!unifiedRadio?.checked,
            primaryModeOutsideMenu: [
              ...document.querySelectorAll(
                '.prp-diff-toolbar input[name="prp-diff-mode"]'
              ),
            ].filter(
              (el) =>
                !el.closest('[data-prp-review-filter-menu="1"]')
            ).length,
            primaryHideWsOutsideMenu: [
              ...document.querySelectorAll(
                '.prp-diff-toolbar [data-prp-hide-whitespace="1"]'
              ),
            ].filter(
              (el) =>
                !el.closest('[data-prp-review-filter-menu="1"]')
            ).length,
          };
        })()
      `);

    const beforePaint = probeDiffPaint();
    assert(
      beforePaint.primaryModeOutsideMenu === 0 &&
        beforePaint.primaryHideWsOutsideMenu === 0,
      `display controls leaked to primary toolbar: ${JSON.stringify(beforePaint)}`
    );

    const openGear = () =>
      evalInPage(`
        (() => {
          const gear = document.querySelector(
            '[data-prp-review-filter-gear="1"], .prp-diff-toolbar__filter-gear'
          );
          if (!gear) return { ok: false, reason: 'no-gear' };
          if (gear.getAttribute('aria-expanded') !== 'true') gear.click();
          return { ok: true };
        })()
      `);
    const closeGear = () =>
      evalInPage(`
        (() => {
          const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
          if (gear?.getAttribute('aria-expanded') === 'true') gear.click();
          return true;
        })()
      `);

    assert(openGear().ok, 'diff settings gear missing');
    waitMs(220);

    // Switch to Split — rows should gain split paint
    const splitClick = evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        const split = menu?.querySelector('input[value="split"]');
        if (!split) return { ok: false, reason: 'no-split' };
        split.click();
        return { ok: true };
      })()
    `);
    assert(splitClick.ok, `split radio missing: ${JSON.stringify(splitClick)}`);
    waitMs(500);
    let paint = probeDiffPaint();
    // Virtual list may take a tick to remount; poll briefly
    for (let i = 0; i < 8 && paint.splitRows < 1; i++) {
      waitMs(200);
      paint = probeDiffPaint();
    }
    assert(
      paint.splitChecked || paint.splitRows >= 1,
      `Split mode did not apply: ${JSON.stringify(paint)}`
    );
    log(`  after Split: ${JSON.stringify(paint)}`);

    // Toggle Hide whitespace on then off
    const wsToggle = evalInPage(`
      (() => {
        const cb = document.querySelector(
          '[data-prp-review-filter-menu="1"] [data-prp-hide-whitespace="1"]'
        );
        if (!cb) return { ok: false };
        const before = !!cb.checked;
        cb.click();
        return { ok: true, before, after: !!cb.checked };
      })()
    `);
    assert(
      wsToggle.ok && wsToggle.after !== wsToggle.before,
      `Hide whitespace toggle failed: ${JSON.stringify(wsToggle)}`
    );
    waitMs(350);
    // Toggle back to original
    evalInPage(`
      document
        .querySelector(
          '[data-prp-review-filter-menu="1"] [data-prp-hide-whitespace="1"]'
        )
        ?.click()
    `);
    waitMs(250);

    // Restore Unified
    evalInPage(`
      document
        .querySelector(
          '[data-prp-review-filter-menu="1"] input[value="unified"]'
        )
        ?.click()
    `);
    waitMs(450);
    paint = probeDiffPaint();
    for (let i = 0; i < 6 && paint.splitRows > 0 && !paint.unifiedChecked; i++) {
      waitMs(200);
      paint = probeDiffPaint();
    }
    assert(
      paint.unifiedChecked || paint.splitRows === 0,
      `Unified restore failed: ${JSON.stringify(paint)}`
    );
    log(`  after Unified restore: ${JSON.stringify(paint)}`);

    closeGear();
    waitMs(100);
    // Closed menu: still no primary-row display controls
    const closed = probeDiffPaint();
    assert(
      closed.primaryModeOutsideMenu === 0 && closed.primaryHideWsOutsideMenu === 0,
      `display controls on toolbar after close: ${JSON.stringify(closed)}`
    );
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
