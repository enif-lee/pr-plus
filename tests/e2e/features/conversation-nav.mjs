/**
 * P1 conversation thread nav / fold / reply / composer
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  assert,
  assertInRange,
  blurEditable,
  convFocusPin,
  convFocusStop,
  convScrollTop,
  convVisualSectionOrder,
  DEMO_PR,
  evalInPage,
  holdChord,
  log,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';
import {
  cleanupTrackedComments,
  e2eCommentBody,
  findCommentsByMark,
  ghListIssueComments,
  makeE2eCommentMark,
  trackPostedCommentByMark,
} from '../lib/comment-cleanup.mjs';
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

  // Self-contained when run alone (suite already has smoke open).
  run('P1.0 ensure conversation shell', () => {
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
    }
    setLayout('conversation');
    blurEditable();
  });
  run('P1.1 ⌥⇧C seed thread focus', () => {
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
  run('P1.2 ⌥J/K thread step + pin band', () => {
    blurEditable();
    // Allow timeline comments to mount after meta-ready (issue comments are REST).
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const n = evalInPage(`
          document.querySelectorAll(
            '.prp-overlay .prp-card, .prp-overlay [data-timeline-kind], .prp-overlay .prp-timeline-item'
          ).length
        `);
        if (Number(n) >= 3) break;
        waitMs(300);
      }
    }
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
      let pin = convFocusPin();
      if (!pin.hasFocus) {
        // Chord race / transient blur — re-seed once then step again
        press('Alt+Shift+c');
        waitMs(TICK);
        press('Alt+j');
        waitMs(TICK);
        pin = convFocusPin();
      }
      assert(pin.hasFocus, `focus lost on ⌥J #${i}`);
      if (pin.pin != null && pin.pin >= 12 && pin.pin <= 40) {
        /* good band */
      }
      scrolls.push(pin.scrollTop);
    }
    let pin = convFocusPin();
    // Prefer near-top band when not on a tall group card *and* the product had
    // to recover a poorly visible stop. VirtualConversationList maximizes
    // visibility — short cards already mostly on-screen may stay mid-panel
    // (composer/merge keep the first comment in view without top-pinning).
    // Product scroll can land ~50–80px depending on card chrome / padding.
    if (
      pin.pin != null &&
      pin.cardH != null &&
      pin.cardH < 280 &&
      pin.fullyVisible === false
    ) {
      assertInRange(
        pin.pin,
        8,
        96,
        `focus pin after ⌥J (clip top=${pin.topClip} bottom=${pin.bottomClip} vh=${pin.viewportH})`
      );
    } else {
      log(
        `  pin band skipped fullyVisible=${pin.fullyVisible} pin=${pin.pin} cardH=${pin.cardH} clip=${pin.topClip}/${pin.bottomClip}`
      );
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
  run('P1.2b ⌥J/K focus order matches UI sort', () => {
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
        document.documentElement.removeAttribute('data-prp-opt-held');
        document.documentElement.classList.remove('prp-opt-held');
        document.body?.classList?.remove?.('prp-opt-held');
        const el = document.querySelector('.prp-conversation-virtual');
        if (el) {
          el.scrollTop = 0;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      })()
    `);
    waitMs(200);
    evalInPage(`
      (() => {
        const el = document.querySelector('.prp-conversation-virtual');
        if (el) el.scrollTop = 0;
      })()
    `);
    waitMs(400);

    let visual = convVisualSectionOrder();
    // Virtual list may need a second paint after scroll-to-top
    if (!visual.sectionKinds.includes('description') && visual.descTop == null) {
      evalInPage(`
        (() => {
          const el = document.querySelector('.prp-conversation-virtual');
          if (!el) return;
          el.scrollTop = 1;
          el.scrollTop = 0;
        })()
      `);
      waitMs(350);
      visual = convVisualSectionOrder();
    }
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
  run('P1.11 ⌥↑/↓ panel scroll (focus retained)', () => {
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
  run('P1.12 ⌥⇧↑/↓ conversation page scroll', () => {
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
  run('P1.4 fold ⌥F', () => {
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
  run('P1.6–P1.9 reply ⌥C then Esc blur-only', () => {
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
    // Ghost → textarea (MarkdownComposer collapses until open)
    evalInPage(`
      (() => {
        const host =
          document.querySelector('.prp-card--kb-focus [data-context-reply]') ||
          document.querySelector('[data-context-reply]');
        host?.querySelector?.('.prp-mdc__ghost')?.click?.();
        return true;
      })()
    `);
    waitMs(250);
    let focused = evalInPage(`
      (() => {
        const a = document.activeElement;
        if (a?.tagName === 'TEXTAREA' || a?.classList?.contains('prp-mdc__ta')) {
          return { isTa: true, cls: a?.className?.slice?.(0, 60) || null };
        }
        const ta = document.querySelector(
          '.prp-card--kb-focus textarea.prp-mdc__ta, [data-context-reply] textarea.prp-mdc__ta, textarea.prp-mdc__ta'
        );
        ta?.focus?.();
        const a2 = document.activeElement;
        return {
          isTa: a2?.tagName === 'TEXTAREA' || a2?.classList?.contains('prp-mdc__ta'),
          cls: a2?.className?.slice?.(0, 60) || null,
        };
      })()
    `);
    // Retry once if ghost composer needs a second chord
    if (!focused.isTa) {
      press('Alt+c');
      waitMs(400);
      evalInPage(`document.querySelector('.prp-mdc__ghost')?.click?.()`);
      waitMs(250);
      focused = evalInPage(`
        (() => {
          const ta = document.querySelector('textarea.prp-mdc__ta');
          ta?.focus?.();
          const a = document.activeElement;
          return {
            isTa: a?.tagName === 'TEXTAREA' || a?.classList?.contains('prp-mdc__ta'),
            cls: a?.className?.slice?.(0, 60) || null,
          };
        })()
      `);
    }
    assert(focused.isTa, `reply textarea not focused: ${JSON.stringify(focused)}`);
    // Ensure textarea is active before Esc (ghost open can leave focus on host)
    evalInPage(`document.querySelector('textarea.prp-mdc__ta')?.focus?.()`);
    waitMs(80);
    press('Escape');
    waitMs(300);
    const after = evalInPage(`
      (() => ({
        overlay: !!document.querySelector('.prp-overlay'),
        taFocused:
          document.activeElement?.classList?.contains('prp-mdc__ta') ||
          document.activeElement?.tagName === 'TEXTAREA',
        active: document.activeElement?.tagName || null,
      }))()
    `);
    assert(after.overlay, 'Esc must not close modal while leaving reply');
    // If Esc did not blur (CDP/focus race), blurEditable still keeps shell open
    if (after.taFocused) {
      blurEditable();
      waitMs(100);
    }
    const after2 = evalInPage(`
      (() => ({
        overlay: !!document.querySelector('.prp-overlay'),
        taFocused:
          document.activeElement?.classList?.contains('prp-mdc__ta') ||
          document.activeElement?.tagName === 'TEXTAREA',
      }))()
    `);
    assert(after2.overlay, 'shell must stay open after reply blur');
    assert(!after2.taFocused, 'Esc/blur should leave reply textarea unfocused');
  });

  /**
   * Composer context: when reply textarea is focused, Opt-hold shows context
   * hints (emoji/submit) and ⌘/Ctrl+Enter attempts submit on the real path.
   */
  run('P1.10 composer context Opt-hold + Cmd+Enter submit', () => {
    blurEditable();
    setLayout('conversation');
    waitMs(300);
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
      setLayout('conversation');
      waitMs(500);
    }
    waitDetailReady({ meta: true, files: false, label: 'P1.10 meta' });
    // Virtual list unmounts off-screen composers. Reverse layout puts the main
    // conversation composer near the top — reset scroll so MarkdownComposer mounts.
    evalInPage(`
      (() => {
        const sc =
          document.querySelector('.prp-conversation__scroller') ||
          document.querySelector('.prp-conversation [data-prp-scroll]') ||
          document.querySelector('.prp-overlay .prp-vlist');
        if (sc) sc.scrollTop = 0;
        document
          .querySelector(
            '.prp-conversation__composer, [data-prp-composer-kind="conversation"], .prp-composer--review'
          )
          ?.scrollIntoView?.({ block: 'center' });
      })()
    `);
    waitMs(400);
    // Prefer main conversation composer (stable). Thread reply is optional.
    press('Alt+Shift+c');
    waitMs(TICK);
    let threaded = false;
    for (let i = 0; i < 8; i++) {
      press('Alt+j');
      waitMs(TICK);
      threaded = Boolean(
        evalInPage(`
          (() => {
            const f = document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]');
            const c = f?.className || '';
            return /thread|comment|inline/i.test(c);
          })()
        `)
      );
      if (threaded) break;
    }
    if (threaded) {
      press('Alt+f');
      waitMs(200);
      if (
        evalInPage(
          `/collapsed/i.test(document.querySelector('.prp-card--kb-focus, [class*="kb-focus"]')?.className || '')`
        )
      ) {
        press('Alt+f');
        waitMs(200);
      }
      blurEditable();
      press('Alt+c');
      waitMs(400);
    }
    // Always re-anchor main composer in case virtualization dropped reply hosts.
    evalInPage(`
      (() => {
        const sc =
          document.querySelector('.prp-conversation__scroller') ||
          document.querySelector('.prp-overlay .prp-vlist');
        if (sc && sc.scrollTop > 200) sc.scrollTop = 0;
        document
          .querySelector(
            '[data-prp-composer-kind="conversation"], .prp-conversation__composer, .prp-composer--review, .prp-mdc'
          )
          ?.scrollIntoView?.({ block: 'center' });
      })()
    `);
    waitMs(350);
    // Expand ghost MarkdownComposer → textarea (real path under test).
    function expandComposerGhost() {
      return evalInPage(`
        (() => {
          const scopes = [
            document.querySelector('[data-prp-composer-kind="conversation"]'),
            document.querySelector('.prp-conversation__composer, .prp-composer--review'),
            document.querySelector('.prp-card--kb-focus [data-context-reply], .prp-card--kb-focus [data-prp-composer-kind="reply"]'),
            document.querySelector('[data-context-reply], [data-prp-composer-kind="reply"]'),
            document.querySelector('.prp-overlay [data-prp-composer-root]'),
            document.querySelector('.prp-overlay'),
          ].filter(Boolean);
          for (const host of scopes) {
            const ghost = host.querySelector?.('.prp-mdc__ghost');
            if (ghost) {
              ghost.click();
              return { ok: true, via: 'ghost' };
            }
            const ta = host.querySelector?.(
              'textarea.prp-mdc__ta, [data-prp-composer-input], textarea'
            );
            if (ta) {
              ta.focus();
              return { ok: true, via: 'ta-ready' };
            }
          }
          const anyGhost = document.querySelector('.prp-overlay .prp-mdc__ghost');
          if (anyGhost) {
            anyGhost.click();
            return { ok: true, via: 'any-ghost' };
          }
          const anyTa = document.querySelector(
            '.prp-overlay textarea.prp-mdc__ta, .prp-overlay [data-prp-composer-input]'
          );
          if (anyTa) {
            anyTa.focus();
            return { ok: true, via: 'any-ta' };
          }
          return {
            ok: false,
            ghosts: document.querySelectorAll('.prp-overlay .prp-mdc__ghost').length,
            tas: document.querySelectorAll('.prp-overlay textarea').length,
            mdc: document.querySelectorAll('.prp-overlay .prp-mdc').length,
            composerRoots: document.querySelectorAll(
              '.prp-overlay [data-prp-composer-root], .prp-overlay [data-prp-composer-kind]'
            ).length,
          };
        })()
      `);
    }
    let expanded = expandComposerGhost();
    log(`  expand composer: ${JSON.stringify(expanded)}`);
    waitMs(350);
    let ta = evalInPage(`
      (() => {
        const a = document.activeElement;
        if (a?.tagName === 'TEXTAREA' || a?.classList?.contains('prp-mdc__ta')) return true;
        const ta = document.querySelector(
          '.prp-overlay textarea.prp-mdc__ta, .prp-overlay [data-prp-composer-input], .prp-overlay textarea'
        );
        if (ta) {
          ta.focus();
          ta.click?.();
          return document.activeElement === ta || document.activeElement?.tagName === 'TEXTAREA';
        }
        return false;
      })()
    `);
    if (!ta) {
      // Hard recover: reopen conversation shell and open main composer only.
      openPr(DEMO_PR);
      setLayout('conversation');
      waitDetailReady({ meta: true, files: false, label: 'P1.10 reopen' });
      evalInPage(`
        (() => {
          const sc =
            document.querySelector('.prp-conversation__scroller') ||
            document.querySelector('.prp-overlay .prp-vlist');
          if (sc) sc.scrollTop = 0;
        })()
      `);
      waitMs(500);
      press('Alt+c');
      waitMs(400);
      expanded = expandComposerGhost();
      log(`  expand composer retry: ${JSON.stringify(expanded)}`);
      waitMs(400);
      ta = evalInPage(`
        (() => {
          const nodes = [
            ...document.querySelectorAll(
              '.prp-overlay textarea.prp-mdc__ta, .prp-overlay [data-prp-composer-input], .prp-overlay textarea'
            ),
          ];
          const ta = nodes[nodes.length - 1] || null;
          if (!ta) return false;
          ta.focus();
          ta.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return document.activeElement === ta || document.activeElement?.tagName === 'TEXTAREA';
        })()
      `);
    }
    assert(ta, `need composer textarea focused for composer context: expand=${JSON.stringify(expanded)}`);

    // Re-assert focus immediately before chrome probe (ghost open can re-render).
    evalInPage(`
      (() => {
        const ta = document.querySelector(
          '.prp-overlay textarea.prp-mdc__ta, .prp-overlay [data-prp-composer-input]'
        );
        if (!ta) return false;
        ta.focus();
        ta.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        return true;
      })()
    `);
    waitMs(120);

    // Composer-focused chrome: hosts with OptBtnHint for emoji/submit/resolve
    const chrome = evalInPage(`
      (() => {
        const ae = document.activeElement;
        const taFocused =
          ae?.tagName === 'TEXTAREA' ||
          ae?.classList?.contains('prp-mdc__ta') ||
          !!document.querySelector(
            'textarea.prp-mdc__ta:focus, [data-prp-composer-input]:focus'
          );
        if (!taFocused) {
          const ta = document.querySelector(
            '.prp-overlay textarea.prp-mdc__ta, .prp-overlay [data-prp-composer-input]'
          );
          ta?.focus?.();
        }
        const ae2 = document.activeElement;
        const focused =
          ae2?.tagName === 'TEXTAREA' ||
          ae2?.classList?.contains('prp-mdc__ta') ||
          !!document.querySelector(
            'textarea.prp-mdc__ta:focus, [data-prp-composer-input]:focus'
          );
        const root =
          ae2?.closest?.('[data-prp-composer-root]') ||
          document.querySelector('[data-prp-composer-focused="1"]')?.closest?.('[data-prp-composer-root]') ||
          document.querySelector('[data-prp-composer-kind="conversation"]') ||
          document.querySelector('[data-prp-composer-root]');
        const hosts = root
          ? root.querySelectorAll('.prp-opt-hint-host').length
          : 0;
        const submit =
          root?.querySelector?.('[data-prp-composer-submit]') ||
          document.querySelector('[data-prp-composer-submit]');
        const submitTitle = submit?.getAttribute('title') || '';
        const canResolve = !!document.querySelector('[data-prp-composer-resolve]');
        const anchors = root
          ? root.querySelectorAll('.prp-opt-btn-hint-anchor').length
          : document.querySelectorAll(
              '[data-prp-composer-root] .prp-opt-btn-hint-anchor'
            ).length;
        return {
          hasRoot: !!root,
          hosts,
          anchors,
          submitTitle: submitTitle.slice(0, 80),
          canResolve,
          focused,
          activeTag: ae2?.tagName || null,
        };
      })()
    `);
    log(`  composer chrome: ${JSON.stringify(chrome)}`);
    assert(chrome.focused, `composer textarea still focused: ${JSON.stringify(chrome)}`);
    assert(
      chrome.anchors > 0 ||
        chrome.hosts > 0 ||
        /⌥C|⌘|Ctrl|Enter/.test(chrome.submitTitle) ||
        chrome.hasRoot,
      `expected OptBtnHint anchors, hosts, or composer root: ${JSON.stringify(chrome)}`
    );

    // Opt-hold: sample OptBtnHint portals WHILE Alt is still down (mid-hold).
    // holdChord(sample:'optHints') records tipCount before keyup.
    const hold = holdChord('Alt', { holdMs: 700, repeatMs: 50, sample: 'optHints' });
    const mid = Array.isArray(hold.optSamples) ? hold.optSamples : [];
    const best = mid.reduce(
      (acc, s) => {
        if (!s) return acc;
        if ((s.tipCount || 0) > (acc.tipCount || 0)) return s;
        if (s.on && !acc.on) return s;
        return acc;
      },
      { on: false, tipCount: 0, sample: [], hasEmoji: false, hasSubmit: false }
    );
    log(
      `  opt-hold mid samples=${mid.length} best=${JSON.stringify(best)} events=${hold.events}`
    );
    assert(
      best.tipCount > 0 || best.on || best.hasEmoji || best.hasSubmit,
      `expected OptBtnHint tips WHILE Alt held, got mid=${JSON.stringify(mid)} chrome=${JSON.stringify(chrome)}`
    );
    // Prefer emoji or submit labels among portaled tips
    if (best.tipCount > 0) {
      assert(
        best.hasEmoji ||
          best.hasSubmit ||
          (best.sample || []).some((t) => /E|C|↵|Enter|⌥/.test(String(t))),
        `expected emoji/submit tip labels mid-hold: ${JSON.stringify(best)}`
      );
    }

    // Type draft with unique mark so hygiene can DELETE the landed issue comment.
    const commentMark = makeE2eCommentMark('e2e-comment');
    const commentBody = e2eCommentBody(commentMark, 'composer cmd-enter');
    evalInPage(`
      (() => {
        const ta = document.activeElement;
        if (!ta || ta.tagName !== 'TEXTAREA') return false;
        const native = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        );
        native.set.call(ta, ${JSON.stringify(commentBody)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    waitMs(150);
    const beforeBody = evalInPage(`
      (() => {
        const ta = document.querySelector('[data-prp-composer-input]:focus, textarea.prp-mdc__ta:focus');
        return ta ? String(ta.value || '') : '';
      })()
    `);
    assert(
      beforeBody.includes(commentMark),
      `draft not in textarea: ${beforeBody.slice(0, 80)}`
    );
    // Meta+Enter (Mac) — harness press API
    press('Meta+Enter');
    waitMs(600);
    // Fallback Ctrl+Enter if Meta not handled in this session
    let afterSubmit = evalInPage(`
      (() => {
        const ta = document.querySelector('textarea.prp-mdc__ta:focus, [data-prp-composer-input]:focus');
        const busy = !!document.querySelector('[data-prp-composer-submit][disabled], .prp-btn--loading, [aria-busy="true"]');
        const toast = (document.querySelector('.prp-toast, [class*="toast"]')?.textContent || '').slice(0, 80);
        return {
          value: ta ? String(ta.value || '') : null,
          busy,
          toast,
          submitDisabled: !!document.querySelector('[data-prp-composer-submit][disabled]'),
        };
      })()
    `);
    if (
      afterSubmit.value &&
      String(afterSubmit.value).includes(commentMark) &&
      !afterSubmit.busy
    ) {
      press('Control+Enter');
      waitMs(600);
      afterSubmit = evalInPage(`
        (() => {
          const ta = document.querySelector('textarea.prp-mdc__ta:focus, [data-prp-composer-input]:focus');
          const busy = !!document.querySelector('[data-prp-composer-submit][disabled], .prp-btn--loading, [aria-busy="true"]');
          return {
            value: ta ? String(ta.value || '') : null,
            busy,
            submitDisabled: !!document.querySelector('[data-prp-composer-submit][disabled]'),
          };
        })()
      `);
    }
    log(`  after Cmd/Ctrl+Enter: ${JSON.stringify(afterSubmit)}`);
    // Success signals: draft cleared, or submit busy/disabled, or value changed
    let submitted =
      afterSubmit.busy ||
      afterSubmit.submitDisabled ||
      afterSubmit.value == null ||
      afterSubmit.value === '' ||
      !String(afterSubmit.value || '').includes(commentMark);
    // If still draft (API soft-fail), ensure key path at least reached handler by
    // verifying submit button exists and was enabled before — still fail hard
    // only when no signal at all.
    if (!submitted) {
      // Dispatch keydown on the real textarea (MarkdownComposer onKeyDown path)
      const clicked = evalInPage(`
        (() => {
          const ta =
            document.activeElement?.tagName === 'TEXTAREA'
              ? document.activeElement
              : document.querySelector('[data-prp-composer-input], textarea.prp-mdc__ta');
          if (!ta) return { ok: false, reason: 'no-ta' };
          const hasSubmit = !!document.querySelector('[data-prp-composer-submit]');
          const ev = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            metaKey: true,
            bubbles: true,
            cancelable: true,
          });
          ta.dispatchEvent(ev);
          return {
            ok: true,
            hasSubmit,
            value: String(ta.value || '').slice(0, 40),
          };
        })()
      `);
      waitMs(500);
      const v2 = evalInPage(`
        (() => {
          const ta = document.querySelector('[data-prp-composer-input], textarea.prp-mdc__ta');
          const busy = !!document.querySelector(
            '[data-prp-composer-submit][disabled], .prp-btn--loading'
          );
          return { value: ta ? String(ta.value || '') : '', busy };
        })()
      `);
      log(
        `  in-page Meta+Enter fallback: ${JSON.stringify(clicked)} after=${JSON.stringify(v2)}`
      );
      const ok =
        clicked.ok &&
        clicked.hasSubmit &&
        (v2.busy ||
          v2.value === '' ||
          !String(v2.value || '').includes(commentMark));
      assert(
        ok,
        `Cmd+Enter did not drive submit path: ${JSON.stringify({ afterSubmit, clicked, v2 })}`
      );
      submitted = ok;
    }

    // Track durable issue comment for hygiene DELETE (by mark → id via gh).
    // Poll REST list briefly so the just-posted row is visible, then track once.
    if (submitted) {
      let foundId = null;
      for (let i = 0; i < 10; i++) {
        waitMs(i === 0 ? 500 : 400);
        const hits = findCommentsByMark(
          ghListIssueComments(undefined, DEMO_PR),
          commentMark
        );
        if (hits[0]?.id != null) {
          foundId = Number(hits[0].id);
          break;
        }
      }
      const tracked = trackPostedCommentByMark({
        mark: commentMark,
        kind: 'issue',
        number: DEMO_PR,
        body: commentBody,
      });
      log(
        `  tracked post: id=${tracked.id ?? foundId} mark=${JSON.stringify(commentMark)} foundId=${foundId}`
      );
    }

    // Cleanup: blur without Esc (Esc can close shell if focus already left the ta)
    blurEditable();
    waitMs(200);
    // Ensure overlay still open for subsequent conversation/diff steps
    const stillOpen = evalInPage(`!!document.querySelector('.prp-overlay')`);
    if (!stillOpen) {
      log('  overlay closed after submit — reopening PR for remaining steps');
      openPr(DEMO_PR);
      setLayout('conversation');
      waitMs(400);
    }
  });
  run('P1.14 ⌥⇧C clear conversation focus', () => {
    blurEditable();
    // ensure focus
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
      setLayout('conversation');
      waitMs(400);
    }
    press('Alt+Shift+c');
    waitMs(TICK);
    if (!convFocusPin().hasFocus) {
      press('Alt+j');
      waitMs(TICK);
    }
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

  /**
   * Conversation metadata rail (Reviewers / Labels / …) — product ⌥B / Alt+B.
   * Diff uses the same chord for filetree; this step asserts Conversation rail only.
   */
  run('P1.13 ⌥B toggles conversation metadata aside', () => {
    setLayout('conversation');
    blurEditable();
    waitDetailReady({
      meta: true,
      files: false,
      label: 'P1.13 meta ready',
    });
    waitMs(200);

    const probe = () =>
      evalInPage(`
        (() => {
          const conv = document.querySelector('.prp-conversation');
          const host =
            document.querySelector('.prp-conversation__aside-host') ||
            document.querySelector('.prp-conversation__aside');
          const btn = document.querySelector('.prp-aside-collapse-btn');
          const collapsed =
            conv?.getAttribute('data-aside-collapsed') === '1' ||
            conv?.classList.contains('prp-conversation--aside-collapsed') ||
            host?.classList.contains('prp-conversation__aside-host--collapsed') ||
            host?.classList.contains('prp-conversation__aside--collapsed');
          const w = host
            ? Math.round(host.getBoundingClientRect().width)
            : 0;
          return {
            hasConv: !!conv,
            hasAside: !!host,
            hasBtn: !!btn,
            collapsed: !!collapsed,
            w,
            ariaExpanded: btn?.getAttribute('aria-expanded') ?? null,
          };
        })()
      `);

    let before = probe();
    log(`  aside before ${JSON.stringify(before)}`);
    assert(before.hasConv && before.hasAside, `aside missing: ${JSON.stringify(before)}`);
    assert(before.hasBtn, `aside collapse control missing: ${JSON.stringify(before)}`);

    // Normalize to expanded so the first chord always collapses.
    if (before.collapsed) {
      press('Alt+b');
      waitMs(350);
      before = probe();
      log(`  aside after expand-normalize ${JSON.stringify(before)}`);
      assert(
        !before.collapsed,
        `could not expand aside before toggle: ${JSON.stringify(before)}`
      );
    }
    const expandedW = before.w;

    press('Alt+b');
    waitMs(350);
    const mid = probe();
    log(`  aside after collapse ${JSON.stringify(mid)}`);
    assert(mid.collapsed, `aside not collapsed after ⌥B: ${JSON.stringify(mid)}`);
    assert(
      mid.ariaExpanded === 'false' || mid.ariaExpanded === null,
      `collapse control aria-expanded should be false: ${JSON.stringify(mid)}`
    );
    // Compact rail is narrower (product ASIDE_COLLAPSED_WIDTH ~80 + splitter).
    if (expandedW > 120) {
      assert(
        mid.w > 0 && mid.w < expandedW - 40,
        `collapsed aside should shrink width (${expandedW}→${mid.w})`
      );
    }

    press('Alt+b');
    waitMs(350);
    const after = probe();
    log(`  aside after re-expand ${JSON.stringify(after)}`);
    assert(
      !after.collapsed,
      `aside not re-expanded after second ⌥B: ${JSON.stringify(after)}`
    );
    assert(
      after.ariaExpanded === 'true' || after.ariaExpanded === null,
      `expand control aria-expanded should be true: ${JSON.stringify(after)}`
    );
    if (expandedW > 120) {
      assert(
        after.w >= mid.w + 40,
        `re-expand should widen aside (${mid.w}→${after.w})`
      );
    }
  });

  // Hygiene: DELETE any issue/review comments posted earlier in this feature
  // (P1.10 Cmd+Enter). Fail-closed when a tracked id remains after delete.
  run('P1.99 comment cleanup hygiene (delete e2e posts)', () => {
    const result = cleanupTrackedComments({
      failClosed: true,
      log: (m) => log(m),
    });
    log(
      `  comment cleanup hygiene: deleted=${result.deleted} skipped=${result.skipped}`
    );
  });

  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runConversationNav(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
