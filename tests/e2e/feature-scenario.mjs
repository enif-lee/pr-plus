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
  HEAVY_PR,
  MULTI_HUNK_PR,
  activeFileLabel,
  assert,
  assertInRange,
  blurEditable,
  clickSelectableLine,
  closeAll,
  closeOverlay,
  convFocusPin,
  convFocusStop,
  convScrollTop,
  convVisualSectionOrder,
  diffScroll,
  diffThreadProbe,
  ensureBrowser,
  evalInPage,
  fileCollapseProbe,
  holdChord,
  layout,
  lineExpandProbe,
  log,
  mergeBoxProbe,
  modalProbe,
  openPr,
  openPulls,
  press,
  pressOptF,
  selectionProbe,
  setLayout,
  statusBadgeProbe,
  step,
  clickFirstLineExpandBtn,
  clickFileHeaderCollapse,
  pressArrowFold,
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
    // Re-seed if previous step's focus was cleared by blur timing.
    if (!convFocusPin().hasFocus) {
      press('Alt+Shift+c');
      waitMs(TICK);
      if (!convFocusPin().hasFocus) {
        press('Alt+j');
        waitMs(TICK);
      }
    }
    assert(convFocusPin().hasFocus, 'need focus before ⌥J/K loop');
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
    // Prefer near-top band when not on a tall group card.
    // Product scroll-into-view can land ~50–80px depending on card chrome / padding.
    if (pin.pin != null && pin.cardH != null && pin.cardH < 280) {
      assertInRange(pin.pin, 8, 96, 'focus pin after ⌥J');
    }
    press('Alt+k');
    waitMs(TICK);
    press('Alt+j');
    waitMs(TICK);
    pin = convFocusPin();
    assert(pin.hasFocus, 'kb focus lost after J/K');
    log(`  scrolls=${scrolls.join('→')} pin=${pin.pin}`);
  });

  /**
   * ⌥J/K stop order must match on-screen panel order under reverseComments:
   * reverse on  → description → composer → merge → comment/review…
   * reverse off → description → comment/review… → merge → composer
   */
  await run('P1.2b ⌥J/K focus order matches UI sort', () => {
    setLayout('conversation');
    blurEditable();
    // Clear existing focus so the next ⌥J seeds from empty.
    // ⌥⇧C toggles: only press while focused (pressing unfocused seeds).
    if (convFocusStop().hasFocus) {
      press('Alt+Shift+c');
      waitMs(TICK);
    }
    if (convFocusStop().hasFocus) {
      press('Alt+Shift+c');
      waitMs(TICK);
    }
    // Scroll near top so description + composer + merge (reverse layout) mount.
    evalInPage(`
      (() => {
        const el = document.querySelector('.prp-conversation-virtual');
        if (el) el.scrollTop = 0;
      })()
    `);
    waitMs(200);

    const visual = convVisualSectionOrder();
    assert(
      visual.sectionKinds.includes('description') || visual.descTop != null,
      `description missing in DOM: ${JSON.stringify(visual)}`
    );
    assert(
      visual.mergeTop != null || visual.sectionKinds.includes('merge'),
      `merge box missing in DOM: ${JSON.stringify(visual)}`
    );
    log(
      `  visual reverseComments=${visual.reverseComments} sections=${visual.sectionKinds.join('→')} tops d/c/m/t=${visual.descTop}/${visual.composerTop}/${visual.mergeTop}/${visual.commentTop}`
    );

    const kinds = [];
    const maxSteps = 24;
    for (let i = 0; i < maxSteps; i++) {
      press('Alt+j');
      waitMs(180);
      const stop = convFocusStop();
      assert(stop.hasFocus, `focus lost on ⌥J #${i}: ${JSON.stringify(stop)}`);
      kinds.push(stop.kind);
      // Wrap: second time we land on description after leaving it.
      if (i > 0 && stop.kind === 'description') break;
    }

    assert(kinds[0] === 'description', `seed/first must be description, got ${kinds.join('→')}`);

    const first = { description: -1, composer: -1, merge: -1, comment: -1 };
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      if (first[k] === -1 && Object.prototype.hasOwnProperty.call(first, k)) {
        first[k] = i;
      }
    }
    assert(first.description === 0, `description not first: ${kinds.join('→')}`);
    assert(first.merge >= 0, `never reached merge: ${kinds.join('→')}`);
    assert(first.composer >= 0, `never reached composer form: ${kinds.join('→')}`);

    if (visual.reverseComments) {
      // description → composer → merge → comments
      assert(
        first.composer === 1,
        `reverse on: composer must be step after description, got ${kinds.join('→')}`
      );
      assert(
        first.merge === 2,
        `reverse on: merge must be step after composer, got ${kinds.join('→')}`
      );
      if (first.comment >= 0) {
        assert(
          first.merge < first.comment,
          `reverse on: merge before comments, got ${kinds.join('→')}`
        );
      }
      // DOM sectionKinds should place composer before merge before comment
      if (
        visual.sectionKinds.includes('composer') &&
        visual.sectionKinds.includes('merge')
      ) {
        assert(
          visual.sectionKinds.indexOf('composer') <
            visual.sectionKinds.indexOf('merge'),
          `DOM visual order mismatch: ${visual.sectionKinds.join('→')}`
        );
      }
      if (
        visual.sectionKinds.includes('merge') &&
        visual.sectionKinds.includes('comment')
      ) {
        assert(
          visual.sectionKinds.indexOf('merge') <
            visual.sectionKinds.indexOf('comment'),
          `DOM visual order mismatch: ${visual.sectionKinds.join('→')}`
        );
      }
    } else {
      // description → comments → merge → composer
      if (first.comment >= 0) {
        assert(
          first.comment < first.merge,
          `reverse off: comments before merge, got ${kinds.join('→')}`
        );
      }
      assert(
        first.merge < first.composer || first.composer < 0,
        `reverse off: merge before composer, got ${kinds.join('→')}`
      );
    }

    // Coarse kind sequence before wrap (comments collapse to one slot).
    const coarse = [];
    for (const k of kinds) {
      if (k === 'description' && coarse.includes('description') && coarse.length > 1) {
        break; // wrap
      }
      if (k === 'comment') {
        if (coarse[coarse.length - 1] !== 'comment') coarse.push('comment');
      } else if (!coarse.includes(k)) {
        coarse.push(k);
      }
    }
    const expected = visual.reverseComments
      ? first.comment >= 0
        ? ['description', 'composer', 'merge', 'comment']
        : ['description', 'composer', 'merge']
      : first.comment >= 0
        ? ['description', 'comment', 'merge', 'composer']
        : ['description', 'merge', 'composer'];
    assert(
      expected.every((k, i) => coarse[i] === k),
      `coarse order ${coarse.join('→')} != expected ${expected.join('→')} (raw=${kinds.join('→')})`
    );
    log(`  stepped ${kinds.join('→')} coarse=${coarse.join('→')}`);
  });

  await run('P1.11 ⌥↑/↓ panel scroll (focus retained)', () => {
    blurEditable();
    // Prior steps (esp. wrap on P1.2b) may leave focus on description; land on a
    // comment stop so pin geometry matches the historical assertion path.
    if (!convFocusStop().hasFocus || convFocusStop().kind === 'description') {
      press('Alt+j');
      waitMs(TICK);
    }
    if (!convFocusStop().hasFocus) {
      press('Alt+Shift+c');
      waitMs(TICK);
    }
    // Prefer a comment/review unit for scroll-pin checks.
    for (let i = 0; i < 6 && convFocusStop().kind !== 'comment'; i++) {
      press('Alt+j');
      waitMs(150);
    }
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
    // Direct PR URL is more reliable than open-/pulls list click under load.
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitMs(400);

    // Prefer an early line so ⇧↓ has room to extend (EOF single-line fails extend).
    const clicked = clickSelectableLine(1);
    assert(clicked?.ok, `clickSelectableLine failed: ${JSON.stringify(clicked)}`);
    waitMs(200);
    // Seed / move selection with plain arrows (stay mid-file when possible)
    press('ArrowDown');
    waitMs(150);
    press('ArrowDown');
    waitMs(200);
    let sel = selectionProbe();
    assert(sel.count >= 1, `no selection after ↑/↓: ${JSON.stringify(sel)}`);
    log(`  after ↑↓ count=${sel.count} dock=${sel.dock}`);

    // Room below for multi-line extend?
    const room = evalInPage(`
      (() => {
        const head = document.querySelector('.prp-vline--selected[data-row-index]');
        if (!head) return { ok: false };
        const hi = Number(head.getAttribute('data-row-index'));
        const rows = [...document.querySelectorAll('.prp-vline--selectable[data-row-index]')];
        const below = rows.filter((r) => Number(r.getAttribute('data-row-index')) > hi).length;
        return { ok: true, head: hi, below, total: rows.length };
      })()
    `);
    log(`  selection room: ${JSON.stringify(room)}`);
    if (room?.ok && Number(room.below) < 2) {
      // Jump toward top of file then extend
      for (let i = 0; i < 12; i++) press('ArrowUp');
      waitMs(200);
    }

    // Multi-line range via Shift+Arrow hold (holdChord preserves shiftKey under
    // capture; agent-browser press and one-shot synthetic keys often drop it).
    const count0 = selectionProbe().count;
    const hold = holdChord('Shift+ArrowDown', {
      holdMs: 280,
      repeatMs: 40,
      sample: 'diff',
    });
    waitMs(200);
    sel = selectionProbe();
    log(
      `  after ⇧↓ hold: events=${hold.events} count=${sel.count} roles=${JSON.stringify(sel.roles)}`
    );
    assert(hold.events >= 3, `⇧↓ hold events too few: ${hold.events}`);
    assert(sel.count >= count0, `extend should not shrink (${count0}→${sel.count})`);
    const multi =
      sel.count >= 2 ||
      sel.roles.end >= 1 ||
      sel.roles.start >= 1 ||
      sel.roles.middle >= 1;
    assert(
      multi,
      `extend selection expected multi-line/range (count=${sel.count} roles=${JSON.stringify(sel.roles)} holdEvents=${hold.events} room=${JSON.stringify(room)})`
    );
    assert(sel.dock, 'selection island/dock missing after extend');

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

  // ─── P3b cross-side Shift extend, file action island, Arrow fold ─
  // Always re-open #13 via URL (independent of P3 success / shell flakiness).
  await run(`P3b.0 open PR #${MULTI_HUNK_PR} for selection/fold`, () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitMs(400);
    const p = modalProbe();
    assert(p.overlay, 'overlay missing after open #13');
  });

  await run(`P3b.1 Shift extend continues past multi selection on PR #${MULTI_HUNK_PR}`, () => {
    setLayout('diff');
    blurEditable();
    // Expand if folded from prior steps
    const folded = fileCollapseProbe();
    if (folded?.ariaExpanded === 'false') {
      pressArrowFold('right');
      waitMs(350);
    }
    const seed = clickSelectableLine(1);
    assert(seed?.ok, `clickSelectableLine: ${JSON.stringify(seed)}`);
    waitMs(250);
    // Build multi via Shift-click (holdChord alone is flaky for range seed)
    const shiftClick = evalInPage(`
      (() => {
        const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
          (e) => !e.classList.contains('prp-vline--header')
        );
        const row = rows[12] || rows[Math.min(8, rows.length - 1)];
        if (!row) return { ok: false, n: rows.length };
        row.scrollIntoView({ block: 'center' });
        const rect = row.getBoundingClientRect();
        const x = rect.left + 24;
        const y = rect.top + rect.height / 2;
        const el = document.elementFromPoint(x, y) || row;
        const opts = {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          button: 0, buttons: 1, shiftKey: true,
        };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        const list = document.querySelector('.prp-vlist') || el;
        list.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0, shiftKey: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
        return { ok: true, n: rows.length };
      })()
    `);
    assert(shiftClick?.ok, `shift-click multi failed: ${JSON.stringify(shiftClick)}`);
    waitMs(350);
    const mid = selectionProbe();
    assert(
      mid.count >= 2 || mid.roles.middle >= 1 || mid.roles.end >= 1,
      `need multi before further extend: ${JSON.stringify(mid)}`
    );
    const countMid = mid.count;
    // Further Shift+↓ must not shrink (sticky head / opposing-side fix)
    blurEditable();
    holdChord('Shift+ArrowDown', { holdMs: 320, repeatMs: 40, sample: 'diff' });
    waitMs(300);
    const after = selectionProbe();
    log(`  multi extend ${countMid}→${after.count} roles=${JSON.stringify(after.roles)}`);
    assert(
      after.count >= countMid,
      `Shift+↓ stuck or shrunk after multi (${countMid}→${after.count})`
    );
  });

  await run(`P3b.2 file header selection shows action island`, () => {
    setLayout('diff');
    blurEditable();
    press('Escape');
    waitMs(250);
    // Click file header path; mouseup on vlist so selection finalize + reveal run
    const hdr = evalInPage(`
      (() => {
        const header = document.querySelector('.prp-vline--header');
        if (!header) return { ok: false, reason: 'no header' };
        header.scrollIntoView({ block: 'center' });
        const path = header.querySelector('.prp-file-header__path') || header;
        const rect = path.getBoundingClientRect();
        const x = rect.left + Math.min(100, rect.width * 0.5);
        const y = rect.top + rect.height / 2;
        const el = document.elementFromPoint(x, y) || path;
        if (el.closest?.('.prp-file-header__collapse')) {
          return { ok: false, reason: 'hit collapse' };
        }
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        const list = document.querySelector('.prp-vlist') || el;
        list.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
        return { ok: true, el: (el.className || '').toString().slice(0, 80) };
      })()
    `);
    assert(hdr?.ok, `header click failed: ${JSON.stringify(hdr)}`);
    // SELECTION_ACTIONS_REVEAL_MS is 300 — wait past it
    waitMs(700);
    const sel = selectionProbe();
    log(`  file island: ${JSON.stringify(sel)}`);
    assert(sel.dock, `file selection dock missing: ${JSON.stringify(sel)}`);
    assert(
      sel.actionsPhase || (sel.btnLabels || []).includes('Comment'),
      `expected actions phase for file, got comment=${sel.commentPhase} labels=${JSON.stringify(sel.btnLabels)}`
    );
    assert(
      !(sel.commentPhase && !sel.actionsPhase),
      'file selection should not open comment-only island'
    );
    assert(sel.fileTarget || (sel.dockCls || '').includes('file'), `expected fileTarget: ${JSON.stringify(sel)}`);
    const hasCopy = (sel.btnLabels || []).some((t) => /copy code/i.test(t));
    assert(hasCopy, `Copy code missing: ${JSON.stringify(sel.btnLabels)}`);
  });

  await run(`P3b.3 ArrowLeft/Right file fold`, () => {
    setLayout('diff');
    blurEditable();
    // Ensure file focus via header or selection
    clickSelectableLine(1);
    waitMs(150);
    const before = fileCollapseProbe();
    assert(before.hasBtn || before.hasHeader, `no file header: ${JSON.stringify(before)}`);
    // Expand first so collapse is observable
    if (before.ariaExpanded === 'false') {
      pressArrowFold('right');
      waitMs(350);
    }
    const open = fileCollapseProbe();
    assert(open.ariaExpanded !== 'false', `file should be open before collapse: ${JSON.stringify(open)}`);
    const codeOpen = open.codeRows;
    pressArrowFold('left');
    waitMs(400);
    const collapsed = fileCollapseProbe();
    log(`  after ←: ${JSON.stringify(collapsed)}`);
    assert(
      collapsed.ariaExpanded === 'false' || collapsed.codeRows < codeOpen,
      `ArrowLeft should collapse file: ${JSON.stringify(collapsed)} codeOpen=${codeOpen}`
    );
    pressArrowFold('right');
    waitMs(400);
    const expanded = fileCollapseProbe();
    log(`  after →: ${JSON.stringify(expanded)}`);
    assert(
      expanded.ariaExpanded === 'true' || expanded.codeRows >= codeOpen,
      `ArrowRight should expand file: ${JSON.stringify(expanded)}`
    );
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

  // ─── P4 read-only: file fold, auto-expand-off, long-line expand ─
  // (No GitHub mutations — local UI only.)
  // Always re-open #13 Diff: P2 multi-hunk expand can leave the virtual list
  // without selectable rows, and Esc cascade after expand is flaky mid-shell.
  function reopenMultiHunkDiff() {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitMs(500);
    for (let i = 0; i < 16; i++) {
      const snap = evalInPage(`
        (() => {
          const headers = document.querySelectorAll('.prp-vline--header').length;
          const rows = document.querySelectorAll(
            '.prp-vline--selectable:not(.prp-vline--header)'
          ).length;
          const btn = !!document.querySelector('.prp-file-header__collapse');
          return { headers, rows, btn };
        })()
      `);
      if (snap?.headers >= 1 && snap?.btn && Number(snap.rows) >= 1) return snap;
      waitMs(250);
    }
    const last = fileCollapseProbe();
    assert(
      last.hasHeader && last.hasBtn && last.codeRows >= 1,
      `PR #${MULTI_HUNK_PR} Diff not ready after re-open: ${JSON.stringify(last)}`
    );
    return last;
  }

  await run(`P4 Diff file fold on PR #${MULTI_HUNK_PR}`, () => {
    reopenMultiHunkDiff();
    blurEditable();
    // Soft-clear selection/thread context without closing the shell
    press('Escape');
    waitMs(150);

    const before = fileCollapseProbe();
    assert(before.codeRows >= 1, `no code rows before fold: ${JSON.stringify(before)}`);
    assert(before.hasBtn, `file collapse button missing: ${JSON.stringify(before)}`);
    log(
      `  before fold codeRows=${before.codeRows} aria=${before.ariaExpanded} path=${before.activePath || '?'}`
    );

    // Prefer header chevron (stable). ⌥F is fallback when no Diff thread context.
    const clickFold = clickFileHeaderCollapse();
    waitMs(400);
    let mid = fileCollapseProbe();
    if (mid.ariaExpanded !== 'false' && mid.codeRows >= before.codeRows) {
      pressOptF();
      waitMs(400);
      mid = fileCollapseProbe();
    }
    log(
      `  after fold click=${JSON.stringify(clickFold)} codeRows=${mid.codeRows} aria=${mid.ariaExpanded}`
    );
    const folded =
      mid.codeRows < before.codeRows ||
      mid.ariaExpanded === 'false' ||
      clickFold?.after === 'false';
    assert(
      folded,
      `file fold inert before=${JSON.stringify(before)} mid=${JSON.stringify(mid)} click=${JSON.stringify(clickFold)}`
    );

    // Unfold
    clickFileHeaderCollapse();
    waitMs(400);
    const after = fileCollapseProbe();
    log(`  after unfold codeRows=${after.codeRows} aria=${after.ariaExpanded}`);
    assert(
      after.codeRows >= mid.codeRows || after.ariaExpanded === 'true',
      `file unfold inert mid=${JSON.stringify(mid)} after=${JSON.stringify(after)}`
    );
  });

  await run(`P4 file nav does not auto-expand (default pref) PR #${MULTI_HUNK_PR}`, () => {
    // Stay on #13 if previous step left Diff healthy; otherwise re-open.
    const healthy = evalInPage(`
      (() => {
        const ov = document.querySelector('.prp-overlay');
        if (!ov || ov.getAttribute('data-layout') !== 'diff') return false;
        return (
          document.querySelectorAll('.prp-vline--header').length >= 1 &&
          !!document.querySelector('.prp-file-header__collapse')
        );
      })()
    `);
    if (!healthy) reopenMultiHunkDiff();
    else {
      setLayout('diff');
      blurEditable();
    }

    // Collapse current file via header
    let clickFold = clickFileHeaderCollapse();
    waitMs(400);
    let collapsed = fileCollapseProbe();
    if (collapsed.ariaExpanded !== 'false') {
      clickFold = clickFileHeaderCollapse();
      waitMs(400);
      collapsed = fileCollapseProbe();
    }
    assert(
      collapsed.ariaExpanded === 'false' || collapsed.codeRows < 20,
      `need collapsed file before nav: ${JSON.stringify(collapsed)} click=${JSON.stringify(clickFold)}`
    );
    const pathCollapsed = collapsed.activePath;
    const rowsCollapsed = collapsed.codeRows;

    // Hop away and back — default autoExpandOnFileNav=false keeps collapse
    press('Alt+Shift+]');
    waitMs(400);
    press('Alt+Shift+[');
    waitMs(450);
    const back = fileCollapseProbe();
    log(
      `  nav round-trip path=${pathCollapsed || '?'} rows ${rowsCollapsed}→${back.codeRows} aria=${back.ariaExpanded}`
    );
    assert(
      back.ariaExpanded === 'false' ||
        back.codeRows <= rowsCollapsed + 3 ||
        (rowsCollapsed > 0 && back.codeRows < 15),
      `file re-expanded on nav (autoExpand should be off): collapsed=${JSON.stringify(collapsed)} back=${JSON.stringify(back)}`
    );

    // Leave expanded for later steps
    if (back.ariaExpanded === 'false') {
      clickFileHeaderCollapse();
      waitMs(350);
    }
  });

  await run(`P4 long-line expand UI PR #${HEAVY_PR}`, () => {
    closeOverlay();
    openPr(HEAVY_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitMs(900);

    let probe = lineExpandProbe();
    if (probe.expandableCount < 1) {
      for (let i = 0; i < 8 && probe.expandableCount < 1; i++) {
        press('Alt+Shift+]');
        waitMs(300);
        probe = lineExpandProbe();
      }
    }
    log(
      `  lineExpand probe expandable=${probe.expandableCount} maxTextLen=${probe.maxTextLen}`
    );

    if (probe.expandableCount < 1) {
      const rows = evalInPage(
        `document.querySelectorAll('.prp-vline--selectable:not(.prp-vline--header)').length`
      );
      // Heavy PR should eventually show long lines; if vlist empty, shell may still be loading
      assert(
        Number(rows) >= 1,
        `no selectable lines on #${HEAVY_PR} Diff for line-expand probe`
      );
      log(`  skip expand toggle (maxTextLen=${probe.maxTextLen} < 96 in view)`);
      return;
    }

    const beforeH =
      evalInPage(`
        (() => {
          const r = document.querySelector('.prp-vline--line-expandable');
          return r ? Math.round(r.getBoundingClientRect().height) : 0;
        })()
      `) || 22;
    const clicked = clickFirstLineExpandBtn();
    assert(clicked?.ok, `expand btn click failed: ${JSON.stringify(clicked)}`);
    // React state → offsets → re-render (estimate then measure)
    waitMs(550);
    const after = lineExpandProbe();
    log(
      `  expand h ${beforeH}→${after.expandedH} expanded=${after.expanded}`
    );
    assert(after.expanded, `expected .prp-vline--line-expanded after click`);
    assert(
      after.expandedH > beforeH || after.expandedH > 22,
      `expanded height should grow (${beforeH}→${after.expandedH})`
    );

    clickFirstLineExpandBtn();
    waitMs(400);
    const collapsed = lineExpandProbe();
    assert(!collapsed.expanded, 'line still expanded after collapse click');
  });

  // ─── P5 read-only: merged PR badge + merge-box tone (#14) ─
  await run(`P5 merged badge + merge box tone PR #${HEAVY_PR}`, () => {
    // May already be on #14 from P4; ensure shell
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(HEAVY_PR, { viaUrl: true });
    }
    setLayout('conversation');
    blurEditable();
    waitMs(500);

    const badges = statusBadgeProbe();
    log(`  badges=${JSON.stringify(badges.badges?.map((b) => b.text))}`);
    assert(
      badges.hasMerged,
      `expected Merged header badge on #${HEAVY_PR}: ${JSON.stringify(badges)}`
    );

    const box = mergeBoxProbe();
    log(`  mergeBox tone=${box.tone} kind=${box.kind} headline=${box.headline}`);
    assert(box.ok, 'merge box missing');
    assert(
      box.kind === 'merged' || box.tone === 'prp-merge-box--merged',
      `expected merged merge-box chrome: ${JSON.stringify(box)}`
    );
    assert(
      /merged/i.test(String(box.headline || '')),
      `merge box headline should mention merged: ${box.headline}`
    );
  });

  await run('P0.6 Esc closes overlay', () => {
    blurEditable();
    // Cascade: selection/palette/side UI then shell (merged PR may need extra Esc)
    for (let i = 0; i < 6; i++) {
      if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) break;
      press('Escape');
      waitMs(220);
    }
    if (evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      closeOverlay();
    }
    assert(
      !evalInPage(`!!document.querySelector('.prp-overlay')`),
      'overlay still open after Esc cascade'
    );
  });

  log('=== feature-scenario done ===');
  // Drop browser so a subsequent scenario (e.g. perf in run.mjs) starts clean.
  closeAll();
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
