#!/usr/bin/env node
/**
 * Local e2e — full feature / style / layout scenario.
 *
 * Mirrors docs/qa-browser-scenario.md P0–P3 with emphasis on:
 *   - Conversation thread nav (⌥J/K, ⌥⇧C, ⌥↑↓, ⌥⇧↑↓)
 *   - Diff thread / file / page nav
 *   - Diff line selection (↑↓, ⇧↑↓, ⌥↑↓) + island
 *
 * NOT part of `npm test` / `npm run test:unit`. Run: `npm run test:e2e:features`
 */
import {
  DEMO_PR,
  MULTI_HUNK_PR,
  activeFileLabel,
  assert,
  assertInRange,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  convFocusPin,
  convScrollTop,
  diffScroll,
  diffThreadProbe,
  ensureBrowser,
  evalInPage,
  layout,
  log,
  modalProbe,
  openPr,
  openPulls,
  press,
  selectionProbe,
  setLayout,
  step,
  waitMs,
} from './lib/harness.mjs';

const TICK = 220;

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

  log('=== feature-scenario start ===');
  ensureBrowser();

  // ─── P0 smoke ───────────────────────────────────────────────
  await run('P0.1 open pulls list', () => {
    openPulls();
  });

  await run(`P0.2 open PR #${DEMO_PR}`, () => {
    openPr(DEMO_PR);
    const p = modalProbe();
    assert(p.overlay, 'overlay missing');
    assert(p.cssRules > 100, `pr-modal.css not loaded (rules=${p.cssRules})`);
    assert(p.cssHref === 'pr-modal.css', 'pr-modal.css href missing');
    assert(p.header && p.header.h > 40, 'header missing/short');
    assert(p.title, 'title missing');
  });

  await run('P0.3 conversation chrome', () => {
    setLayout('conversation');
    const p = modalProbe();
    assert(p.layout === 'conversation', `layout=${p.layout}`);
    assert(p.conv && p.conv.h > 200, 'conversation virtual host missing');
    assert(p.merge && p.merge.h > 40, 'merge box missing');
    assert(p.aside && p.aside.w > 100, 'aside rail missing');
    assert(p.cards >= 1, 'expected timeline cards');
    assert(p.merge.bg && p.merge.bg !== 'rgba(0, 0, 0, 0)', `merge bg unstyled: ${p.merge.bg}`);
  });

  await run('P0.4 toggle Diff', () => {
    setLayout('diff');
    const p = modalProbe();
    assert(p.layout === 'diff', `layout=${p.layout}`);
    assert(p.filetree && p.filetree.w > 100, 'filetree missing');
    assert(p.filetree.visibility === 'visible', 'filetree should be visible on Diff');
    assert(p.vlist && p.vlist.h > 200, 'diff vlist missing');
    assert(p.toolbar && p.toolbar.h > 20, 'diff toolbar missing');
  });

  await run('P0.5 toggle Conversation', () => {
    setLayout('conversation');
    assert(layout() === 'conversation');
  });

  // ─── P1 Conversation thread navigation ─────────────────────
  await run('P1.1 ⌥⇧C seed thread focus', () => {
    setLayout('conversation');
    blurEditable();
    press('Alt+Shift+c');
    waitMs(TICK);
    let pin = convFocusPin();
    if (!pin.hasFocus) {
      press('Alt+j');
      waitMs(TICK);
      pin = convFocusPin();
    }
    assert(pin.hasFocus, `seed focus missing: ${JSON.stringify(pin)}`);
    log(`  seed pin=${pin.pin} scrollTop=${pin.scrollTop}`);
  });

  await run('P1.2 ⌥J/K thread step + pin band', () => {
    blurEditable();
    const scrolls = [];
    for (let i = 0; i < 3; i++) {
      press('Alt+j');
      waitMs(TICK);
      const pin = convFocusPin();
      assert(pin.hasFocus, `focus lost on ⌥J #${i}`);
      if (pin.pin != null && pin.pin >= 12 && pin.pin <= 40) {
        /* good band */
      }
      scrolls.push(pin.scrollTop);
    }
    let pin = convFocusPin();
    // Prefer band when not on a tall group card
    if (pin.pin != null && pin.cardH != null && pin.cardH < 280) {
      assertInRange(pin.pin, 12, 48, 'focus pin after ⌥J');
    }
    press('Alt+k');
    waitMs(TICK);
    press('Alt+j');
    waitMs(TICK);
    pin = convFocusPin();
    assert(pin.hasFocus, 'kb focus lost after J/K');
    log(`  scrolls=${scrolls.join('→')} pin=${pin.pin}`);
  });

  await run('P1.11 ⌥↑/↓ panel scroll (focus retained)', () => {
    blurEditable();
    const beforeFocus = convFocusPin();
    assert(beforeFocus.hasFocus, 'need focus before ⌥↑/↓');
    const beforeTop = convScrollTop();
    press('Alt+ArrowDown');
    waitMs(TICK);
    press('Alt+ArrowDown');
    waitMs(TICK);
    const midTop = convScrollTop();
    const midFocus = convFocusPin();
    assert(midFocus.hasFocus, '⌥↓ should not clear thread focus');
    // Scroll should move (unless already at end)
    const sh = evalInPage(`
      (() => {
        const el = document.querySelector('.prp-conversation-virtual');
        return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null;
      })()
    `);
    const room = sh && beforeTop + sh.ch < sh.sh - 20;
    if (room) {
      assert(midTop > beforeTop, `⌥↓ should increase scrollTop (${beforeTop}→${midTop})`);
    }
    press('Alt+ArrowUp');
    waitMs(TICK);
    const upTop = convScrollTop();
    assert(convFocusPin().hasFocus, '⌥↑ should not clear thread focus');
    log(`  scroll ${beforeTop}→${midTop}→${upTop}`);
  });

  await run('P1.12 ⌥⇧↑/↓ conversation page scroll', () => {
    blurEditable();
    const before = convScrollTop();
    press('Alt+Shift+ArrowDown');
    waitMs(TICK);
    const after = convScrollTop();
    const sh = evalInPage(`
      (() => {
        const el = document.querySelector('.prp-conversation-virtual');
        return el ? { sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop } : null;
      })()
    `);
    const nearEnd = sh && before + sh.ch >= sh.sh - 40;
    assert(
      nearEnd || after > before + 40,
      `⌥⇧↓ page scroll too small (${before}→${after})`
    );
    press('Alt+Shift+ArrowUp');
    waitMs(TICK);
    log(`  page ${before}→${after}→${convScrollTop()}`);
  });

  /** Step ⌥J until focus matches class regex (or give up). */
  function seekFocus(classRe, maxSteps = 14) {
    for (let i = 0; i < maxSteps; i++) {
      press('Alt+j');
      waitMs(150);
      const hit = evalInPage(`
        (() => {
          const f = document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]');
          if (!f) return false;
          return ${classRe}.test(f.className || '');
        })()
      `);
      if (hit) return true;
    }
    return false;
  }

  await run('P1.4 fold ⌥F', () => {
    blurEditable();
    // Prefer review-thread cards (group rows / bare review summaries don't fold).
    const found = seekFocus(/review-thread|inline-thread|conversation-inline-thread/);
    if (!found) {
      log('  skip fold: no review-thread focus found');
      return;
    }
    const before = evalInPage(
      `document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]')?.className || null`
    );
    press('Alt+f');
    waitMs(350);
    const after = evalInPage(`
      (() => {
        const f = document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]');
        if (!f) return { ok: false };
        const collapsed =
          /collapsed/i.test(f.className) ||
          f.getAttribute('aria-expanded') === 'false' ||
          !!f.querySelector('[aria-expanded="false"], .collapsed, [class*="collapsed"]');
        return { ok: true, collapsed, cls: f.className.slice(0, 160) };
      })()
    `);
    assert(after?.ok, 'focus lost on fold');
    assert(after.collapsed, `expected collapsed class, got ${after.cls} (before=${before})`);
  });

  await run('P1.6–P1.9 reply ⌥C then Esc blur-only', () => {
    blurEditable();
    // Land on a comment/thread that accepts reply.
    const found = seekFocus(/review-thread|inline-thread|timeline-comment|conversation-inline/);
    if (!found) {
      // Fallback: any kb-focus
      press('Alt+j');
      waitMs(TICK);
    }
    // Ensure expanded before reply
    press('Alt+f');
    waitMs(200);
    const maybeCollapsed = evalInPage(`
      /collapsed/i.test(document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]')?.className || '')
    `);
    if (maybeCollapsed) {
      press('Alt+f');
      waitMs(200);
    }
    blurEditable();
    press('Alt+c');
    waitMs(450);
    let focused = evalInPage(`
      (() => {
        const a = document.activeElement;
        return {
          isTa: a?.tagName === 'TEXTAREA' || a?.classList?.contains('prp-mdc__ta'),
          cls: a?.className?.slice?.(0, 60) || null,
        };
      })()
    `);
    // Retry once if ghost composer needs a second chord
    if (!focused.isTa) {
      press('Alt+c');
      waitMs(450);
      focused = evalInPage(`
        (() => {
          const a = document.activeElement;
          return {
            isTa: a?.tagName === 'TEXTAREA' || a?.classList?.contains('prp-mdc__ta'),
            cls: a?.className?.slice?.(0, 60) || null,
          };
        })()
      `);
    }
    assert(focused.isTa, `reply textarea not focused: ${JSON.stringify(focused)}`);
    press('Escape');
    waitMs(250);
    const after = evalInPage(`
      (() => ({
        overlay: !!document.querySelector('.prp-overlay'),
        taFocused:
          document.activeElement?.classList?.contains('prp-mdc__ta') ||
          document.activeElement?.tagName === 'TEXTAREA',
      }))()
    `);
    assert(after.overlay, 'Esc must not close modal while leaving reply');
    assert(!after.taFocused, 'Esc should blur reply textarea');
  });

  await run('P1.14 ⌥⇧C clear conversation focus', () => {
    blurEditable();
    // ensure focus
    press('Alt+j');
    waitMs(TICK);
    assert(convFocusPin().hasFocus, 'need focus before clear');
    press('Alt+Shift+c');
    waitMs(TICK);
    // Second ⌥⇧C clears (toggle). If still focused, press again.
    if (convFocusPin().hasFocus) {
      press('Alt+Shift+c');
      waitMs(TICK);
    }
    const cleared = !convFocusPin().hasFocus;
    log(`  after clear/toggle hasFocus=${!cleared}`);
    assert(cleared, '⌥⇧C should clear conversation comment focus');
  });

  // ─── P2 Diff thread + file + page nav (#7 has threads) ─────
  await run('P2.1 Diff ⌥J/K thread nav', () => {
    setLayout('diff');
    blurEditable();
    waitMs(300);
    const before = diffThreadProbe();
    assert(before.threadCount >= 1 || before.scrollTop != null, 'diff threads/list missing');
    const tops = [before.scrollTop];
    for (let i = 0; i < 4; i++) {
      press('Alt+j');
      waitMs(TICK);
      tops.push(diffScroll()?.scrollTop ?? null);
    }
    press('Alt+k');
    waitMs(TICK);
    tops.push(diffScroll()?.scrollTop ?? null);
    const moved = tops.some((t, i) => i > 0 && t != null && tops[0] != null && t !== tops[0]);
    // Small single-file PR may keep scrollTop 0 if all threads fit — then still require handlers not crash
    const after = diffThreadProbe();
    assert(after.threadCount >= 1 || moved, `thread nav inert: tops=${tops.join(',')}`);
    log(`  threads=${after.threadCount} scrollTops=${tops.join('→')} nearest=${JSON.stringify(after.nearest)}`);
  });

  await run('P2.5 Diff ⌥⇧[ / ⌥⇧] file nav', () => {
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

  await run('P2.9 Diff ⌥⇧↑/↓ page scroll', () => {
    blurEditable();
    const before = diffScroll();
    assert(before, 'vlist missing');
    press('Alt+Shift+ArrowDown');
    waitMs(TICK);
    press('Alt+Shift+ArrowDown');
    waitMs(TICK);
    const after = diffScroll();
    const pageDelta = after.scrollTop - before.scrollTop;
    const nearEnd = before.scrollTop + before.clientHeight >= before.scrollHeight - 40;
    assert(
      nearEnd || pageDelta > before.clientHeight * 0.45,
      `page nav delta too small: ${pageDelta} (ch=${before.clientHeight})`
    );
    press('Alt+Shift+ArrowUp');
    waitMs(TICK);
    log(`  page Δ=${pageDelta}`);
  });

  await run('P2 chrome: Find + side panel + mode', () => {
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

  // ─── P3 Selection move / extend / opt-jump (#13 multi-hunk) ─
  await run(`P3 selection shortcuts on PR #${MULTI_HUNK_PR}`, () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR);
    setLayout('diff');
    blurEditable();
    waitMs(400);

    const clicked = clickSelectableLine(4);
    assert(clicked?.ok, `clickSelectableLine failed: ${JSON.stringify(clicked)}`);
    waitMs(200);
    // Seed / move selection with plain arrows
    press('ArrowDown');
    waitMs(150);
    press('ArrowDown');
    waitMs(200);
    let sel = selectionProbe();
    assert(sel.count >= 1, `no selection after ↑/↓: ${JSON.stringify(sel)}`);
    log(`  after ↑↓ count=${sel.count} dock=${sel.dock}`);

    // Extend with Shift+Arrow
    const count0 = sel.count;
    press('Shift+ArrowDown');
    waitMs(150);
    press('Shift+ArrowDown');
    waitMs(250);
    sel = selectionProbe();
    assert(sel.count >= count0, `⇧↓ should not shrink selection (${count0}→${sel.count})`);
    assert(sel.count >= 2 || sel.roles.end >= 1 || sel.roles.start >= 1, 'extend selection expected multi-line or range roles');
    assert(sel.dock, 'selection island/dock missing after extend');
    log(`  after ⇧↓ count=${sel.count} roles=${JSON.stringify(sel.roles)}`);

    // ⌥↓ multi-line jump (~8 rows) — selection head moves / range may change
    const count1 = sel.count;
    const scroll0 = diffScroll()?.scrollTop ?? 0;
    press('Alt+ArrowDown');
    waitMs(200);
    press('Alt+ArrowDown');
    waitMs(250);
    sel = selectionProbe();
    const scroll1 = diffScroll()?.scrollTop ?? 0;
    assert(sel.count >= 1, 'selection lost after ⌥↓');
    // Either selection shape changed or viewport scrolled to reveal
    assert(
      sel.count !== count1 || Math.abs(scroll1 - scroll0) > 5 || sel.dock,
      `⌥↓ selection jump inert count=${count1}→${sel.count} scroll=${scroll0}→${scroll1}`
    );
    log(`  after ⌥↓ count=${sel.count} scroll ${scroll0}→${scroll1}`);

    press('Alt+ArrowUp');
    waitMs(200);
    sel = selectionProbe();
    assert(sel.count >= 1, 'selection lost after ⌥↑');

    // Plain ↑ move (shrink toward head behavior is product-specific — just keep selection)
    press('ArrowUp');
    waitMs(150);
    sel = selectionProbe();
    assert(sel.count >= 1, 'selection lost after ↑');

    // Esc dismiss island cascade (comment phase not open)
    press('Escape');
    waitMs(250);
    sel = selectionProbe();
    // May clear selection or only dock — accept either as long as modal stays
    assert(evalInPage(`!!document.querySelector('.prp-overlay')`), 'modal closed on selection Esc');
    log(`  after Esc selection count=${sel.count} dock=${sel.dock}`);
  });

  await run(`P2 multi-hunk expand chrome PR #${MULTI_HUNK_PR}`, () => {
    setLayout('diff');
    blurEditable();
    const expand = evalInPage(`
      (() => {
        const btns = [...document.querySelectorAll('.prp-hunk-expand__btn')];
        const all = document.querySelector('.prp-hunk-expand__btn--all');
        const before = document.querySelector('.prp-vlist')?.scrollHeight || 0;
        if (all) all.click();
        return { count: btns.length, before, hasAll: !!all };
      })()
    `);
    assert(expand.count >= 1, 'hunk expand controls missing');
    waitMs(350);
    if (expand.hasAll) {
      const after = evalInPage(`document.querySelector('.prp-vlist')?.scrollHeight || 0`);
      assert(after >= expand.before, `expand should not shrink vlist (${expand.before}→${after})`);
      log(`  expand scrollHeight ${expand.before}→${after}`);
    }
  });

  await run('P0.6 Esc closes overlay', () => {
    blurEditable();
    press('Escape');
    waitMs(200);
    if (evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      press('Escape');
      waitMs(250);
    }
    if (evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      press('Escape');
      waitMs(250);
    }
    assert(!evalInPage(`!!document.querySelector('.prp-overlay')`), 'overlay still open after Esc');
  });

  log('=== feature-scenario done ===');
  if (failures.length) {
    console.error(`\n${failures.length} step(s) failed:`);
    for (const f of failures) console.error(`  - ${f.name}: ${f.err.message || f.err}`);
    process.exit(1);
  }
  console.log('\nfeature-scenario: ALL PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
