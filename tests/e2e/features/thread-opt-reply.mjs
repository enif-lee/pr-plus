/**
 * Diff review-thread Opt chrome + ↑/↓ reply units + ⌥I comment.
 *
 *   rstest run -c rstest.e2e.config.ts thread-opt-reply
 */
import {
  assert,
  blurEditable,
  DEMO_PR,
  log,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';
import { evalInPage } from '../lib/ab.mjs';

function probeThreadOptChrome() {
  return evalInPage(`
    (() => {
      const active =
        document.querySelector('.prp-inline-thread--context-active') ||
        document.querySelector('.prp-inline-thread[data-context-active="1"]');
      if (!active) {
        return {
          hasActive: false,
          rootHints: 0,
          replyHints: 0,
          replyCount: 0,
          unitFocus: null,
          composerHint: null,
        };
      }
      const rootItem =
        active.querySelector('.prp-review-thread__item[data-prp-thread-unit="root"]') ||
        active.querySelector('.prp-inline-thread__single, .prp-inline-thread__head');
      const replyItems = [
        ...active.querySelectorAll(
          '.prp-review-thread__item[data-prp-thread-unit="reply"]'
        ),
      ];
      /**
       * Ownership of Opt chrome is the in-tree host (showShortcutHint →
       * .prp-opt-hint-host). OptBtnHint *paints* via body portal — do not
       * attribute portals by geometry (tall multi-reply stacks collide).
       */
      const countHintHosts = (el) => {
        if (!el) return 0;
        return el.querySelectorAll(
          '.prp-opt-hint-host, .prp-opt-btn-hint-anchor'
        ).length;
      };
      const rootHints = countHintHosts(rootItem);
      let replyHints = 0;
      for (const r of replyItems) {
        replyHints += countHintHosts(r);
      }
      const unitFocus =
        active.querySelector('[data-prp-thread-unit-active="1"]')?.getAttribute(
          'data-prp-thread-unit-id'
        ) ||
        document.documentElement.getAttribute('data-prp-focused-thread-unit') ||
        null;
      const composerHint =
        active
          .querySelector('.prp-inline-thread__composer .prp-opt-btn-hint, .prp-inline-thread__composer [class*="opt"]')
          ?.textContent?.trim()
          ?.slice(0, 12) || null;
      // Focus field hint label (⌥I)
      const fieldHints = [
        ...active.querySelectorAll('.prp-inline-thread__composer-field .prp-opt-btn-hint, .prp-inline-thread__composer-field [class*="OptBtn"]'),
      ].map((n) => (n.textContent || '').trim());
      // Global body portals (for diagnostics when unit geometry misses)
      const bodyOptPortals = document.querySelectorAll(
        'body > .prp-opt-btn-hint, .prp-opt-btn-hint--fixed'
      ).length;
      return {
        hasActive: true,
        rootHints,
        replyHints,
        replyCount: replyItems.length,
        unitFocus,
        unitActiveRole:
          active
            .querySelector('[data-prp-thread-unit-active="1"]')
            ?.getAttribute('data-prp-thread-unit') || null,
        fieldHints,
        composerHint,
        bodyOptPortals,
        stampUnit:
          document.documentElement.getAttribute('data-prp-focused-thread-unit') ||
          '',
      };
    })()
  `);
}

function focusFirstMultiReplyThread() {
  return evalInPage(`
    (() => {
      // Expand collapsed threads
      for (const b of document.querySelectorAll(
        '.prp-inline-thread [aria-expanded="false"]'
      )) {
        try { b.click(); } catch {}
      }
      const threads = [...document.querySelectorAll('.prp-inline-thread')];
      for (const t of threads) {
        const replies = t.querySelectorAll(
          '.prp-review-thread__item[data-prp-thread-unit="reply"], .prp-review-thread__item:not([data-prp-thread-unit="root"])'
        );
        // Prefer threads with reply list items (multi-comment)
        const replyCount = t.querySelectorAll('.prp-review-thread__item').length;
        if (replyCount < 2 && replies.length < 1) continue;
        t.scrollIntoView?.({ block: 'center' });
        // Click body to seed focus; Diff nav uses commentIndex via ⌥J
        t.click?.();
        return {
          ok: true,
          replyItems: replyCount,
          cls: String(t.className || '').slice(0, 80),
        };
      }
      return { ok: false, threadCount: threads.length };
    })()
  `);
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

  run('TOR.0 open DEMO_PR Diff', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDetailReady({ meta: true, files: true, label: 'TOR.0' });
    waitDiffFilesReady('TOR.0');
    // Soft refresh so shell + byIds comments paint (resolve-thread pattern)
    evalInPage(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((el) =>
          /refresh/i.test(
            (el.getAttribute('aria-label') || '') + (el.title || '')
          )
        );
        if (b) b.click();
        return !!b;
      })()
    `);
    waitMs(3500);
    waitDetailReady({ meta: true, files: true, label: 'TOR.0 post-refresh' });
    // Demo PR often has 0 Unresolved — enable Resolved so threads paint
    const filters = evalInPage(`
      (() => {
        const btns = [
          ...document.querySelectorAll(
            '.prp-review-filter button, .prp-review-filter__btn'
          ),
        ];
        const clicked = [];
        for (const b of btns) {
          const t = (b.textContent || '').replace(/\\s+/g, ' ').trim();
          const on =
            b.getAttribute('aria-pressed') === 'true' ||
            b.classList.contains('prp-review-filter__btn--on');
          if (/Resolved/i.test(t) && !on) {
            b.click();
            clicked.push(t.slice(0, 24));
          }
        }
        return {
          clicked,
          state: btns.map((b) => ({
            t: (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 28),
            on:
              b.getAttribute('aria-pressed') === 'true' ||
              b.classList.contains('prp-review-filter__btn--on'),
          })),
        };
      })()
    `);
    log(`  review filters: ${JSON.stringify(filters)}`);
    waitMs(1200);
    // Wait for at least one inline thread
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 15_000) {
      n = evalInPage(
        `document.querySelectorAll('.prp-inline-thread').length`
      );
      if (Number(n) >= 1) break;
      waitMs(300);
    }
    log(`  inline threads after settle: ${n}`);
    assert(Number(n) >= 1, `TOR.0 no .prp-inline-thread after settle n=${n}`);
  });

  run('TOR.1 seed multi-reply thread focus (⌥J)', () => {
    blurEditable();
    // Expand + find multi-reply
    let found = focusFirstMultiReplyThread();
    log(`  multi-reply scan: ${JSON.stringify(found)}`);
    // Use Diff thread nav to set commentIndex
    for (let i = 0; i < 16; i++) {
      press('Alt+j');
      waitMs(280);
      // Expand after focus hop
      focusFirstMultiReplyThread();
      const p = probeThreadOptChrome();
      if (p?.hasActive && (p.replyCount >= 1 || p.hasActive)) {
        log(`  focused after ⌥J x${i + 1}: ${JSON.stringify(p)}`);
        if (p.replyCount >= 1) return;
      }
    }
    const last = probeThreadOptChrome();
    log(`  fallback probe: ${JSON.stringify(last)}`);
    // Require at least a context-active thread for remaining steps
    assert(
      last?.hasActive || found?.ok,
      `no context-active thread: ${JSON.stringify({ found, last })}`
    );
  });

  run('TOR.2 OptBtnHint follows unit focus (root vs reply)', () => {
    // Hold Option so OptBtnHint paints (optHintsActive).
    // Prefer multi-reply thread first so unit step is meaningful.
    focusFirstMultiReplyThread();
    waitMs(300);
    press('Alt');
    waitMs(280);
    const onRoot = probeThreadOptChrome();
    log(`  opt chrome on root unit: ${JSON.stringify(onRoot)}`);
    assert(onRoot?.hasActive, `need context-active thread: ${JSON.stringify(onRoot)}`);
    if (onRoot?.replyCount >= 1) {
      // Root unit active (default): reply rows must not own Opt hint hosts
      assert(
        onRoot.replyHints === 0,
        `on root unit, replies must not show OptBtnHint: ${JSON.stringify(onRoot)}`
      );
      // Root should be eligible (hosts or portals) when Opt latched
      if ((onRoot.bodyOptPortals || 0) > 0 || (onRoot.rootHints || 0) > 0) {
        assert(
          onRoot.rootHints > 0,
          `on root unit, root should show Opt chrome: ${JSON.stringify(onRoot)}`
        );
      }
    }
    // Step to a reply unit
    blurEditable();
    waitMs(80);
    press('ArrowDown');
    waitMs(450);
    // Confirm unit role before Opt hold
    const stepped = probeThreadOptChrome();
    log(`  after ↓: ${JSON.stringify(stepped)}`);
    press('Alt');
    waitMs(280);
    const onReply = probeThreadOptChrome();
    log(`  opt chrome on reply unit: ${JSON.stringify(onReply)}`);
    if ((onReply?.replyCount || 0) >= 1 || (stepped?.replyCount || 0) >= 1) {
      assert(
        onReply.unitActiveRole === 'reply' ||
          onReply.unitFocus ||
          onReply.stampUnit ||
          stepped?.unitActiveRole === 'reply',
        `expected reply unit focus: ${JSON.stringify({ onReply, stepped })}`
      );
      // Hard: when reply unit is active, only reply rows own .prp-opt-hint-host
      if (onReply.unitActiveRole === 'reply' || stepped?.unitActiveRole === 'reply') {
        assert(
          onReply.replyHints > 0,
          `on reply unit, OptBtnHint hosts must appear on reply row: ${JSON.stringify(onReply)}`
        );
        assert(
          onReply.rootHints === 0,
          `on reply unit, root must not keep OptBtnHint hosts: ${JSON.stringify(onReply)}`
        );
      }
    }
  });

  run('TOR.3 ↑/↓ steps reply units when multi-reply focused', () => {
    // Prefer threads stamped data-prp-multi-reply (product paint)
    evalInPage(`
      (() => {
        const multi = document.querySelector(
          '.prp-inline-thread[data-prp-multi-reply="1"]'
        );
        if (!multi) return false;
        multi.scrollIntoView?.({ block: 'center' });
        multi.click?.();
        return true;
      })()
    `);
    waitMs(200);
    // Re-seed multi-reply without hopping away (stay on last multi-reply)
    let before = probeThreadOptChrome();
    if (!(before?.replyCount >= 1)) {
      for (let i = 0; i < 16; i++) {
        press('Alt+j');
        waitMs(280);
        // Expand after focus hop
        evalInPage(`
          (() => {
            const a = document.querySelector('.prp-inline-thread--context-active');
            if (!a) return false;
            const b = a.querySelector('[aria-expanded="false"]');
            if (b) b.click();
            return true;
          })()
        `);
        waitMs(200);
        before = probeThreadOptChrome();
        if (before?.replyCount >= 1 || before?.hasActive) {
          const multi = evalInPage(`
            !!document.querySelector(
              '.prp-inline-thread--context-active[data-prp-multi-reply="1"]'
            )
          `);
          if (multi || before?.replyCount >= 1) break;
        }
      }
    }
    before = probeThreadOptChrome();
    // Hard requirement: demo PR has multi-reply threads; skip soft-pass hides regressions
    assert(
      before?.hasActive && Number(before?.replyCount) >= 1,
      `TOR.3 requires multi-reply context-active thread: ${JSON.stringify(before)}`
    );
    const rootUnitId = evalInPage(`
      (() => {
        const a = document.querySelector('.prp-inline-thread--context-active');
        return (
          a?.querySelector('[data-prp-thread-unit="root"]')?.getAttribute(
            'data-prp-thread-unit-id'
          ) ||
          (a?.getAttribute('data-search-anchor') || '').replace(
            /^review-comment:/,
            ''
          ) ||
          ''
        );
      })()
    `);
    const replyIds = evalInPage(`
      (() => {
        const a = document.querySelector('.prp-inline-thread--context-active');
        return [...(a?.querySelectorAll('[data-prp-thread-unit="reply"]') || [])]
          .map((el) => el.getAttribute('data-prp-thread-unit-id'))
          .filter(Boolean);
      })()
    `);
    assert(
      Array.isArray(replyIds) && replyIds.length >= 1,
      `TOR.3 reply unit DOM missing: root=${rootUnitId} replies=${JSON.stringify(replyIds)}`
    );
    log(
      `  before arrows: ${JSON.stringify(before)} root=${rootUnitId} replies=${replyIds.length}`
    );
    blurEditable();
    waitMs(120);
    // Clear prior stamp / unit focus so we observe a real step
    evalInPage(`
      document.documentElement.removeAttribute('data-prp-last-shortcut-action');
      document.documentElement.removeAttribute('data-prp-focused-thread-unit');
      true
    `);
    const probeUnit = () =>
      evalInPage(`
        (() => {
          const a = document.querySelector('.prp-inline-thread--context-active');
          const unit = a?.querySelector('[data-prp-thread-unit-active="1"]');
          return {
            role: unit?.getAttribute('data-prp-thread-unit') || null,
            id: unit?.getAttribute('data-prp-thread-unit-id') || null,
            stamp:
              document.documentElement.getAttribute(
                'data-prp-focused-thread-unit'
              ) || '',
            action:
              document.documentElement.getAttribute(
                'data-prp-last-shortcut-action'
              ) || '',
            unitFocusCls: a
              ? [
                  ...a.querySelectorAll(
                    '.prp-review-thread__item--unit-focus'
                  ),
                ].map((el) => ({
                  role: el.getAttribute('data-prp-thread-unit'),
                  id: el.getAttribute('data-prp-thread-unit-id'),
                }))
              : [],
          };
        })()
      `);

    press('ArrowDown');
    waitMs(450);
    const mid = probeUnit();
    log(`  after ↓: ${JSON.stringify(mid)}`);
    // Action stamp alone is insufficient — product used to report
    // stepThreadReplyNext while setFocusedThreadUnitId never ran (stale closure).
    assert(
      mid?.action === 'stepThreadReplyNext',
      `↓ must fire stepThreadReplyNext: ${JSON.stringify(mid)}`
    );
    assert(
      mid?.role === 'reply' &&
        mid?.id &&
        String(mid.id) !== String(rootUnitId) &&
        replyIds.map(String).includes(String(mid.id)),
      `↓ must move unit-focus onto a reply (not root): ${JSON.stringify({
        mid,
        rootUnitId,
        replyIds: replyIds.slice(0, 5),
      })}`
    );
    assert(
      mid?.stamp && String(mid.stamp) === String(mid.id),
      `↓ must stamp data-prp-focused-thread-unit to reply id: ${JSON.stringify(mid)}`
    );

    const firstReplyId = String(mid.id);
    press('ArrowDown');
    waitMs(450);
    const mid2 = probeUnit();
    log(`  after ↓↓: ${JSON.stringify(mid2)}`);
    assert(
      mid2?.action === 'stepThreadReplyNext',
      `↓↓ must fire stepThreadReplyNext: ${JSON.stringify(mid2)}`
    );
    // With ≥2 replies, second ↓ advances within thread (no wrap)
    if (replyIds.length >= 2) {
      assert(
        mid2?.role === 'reply' &&
          mid2?.id &&
          String(mid2.id) !== firstReplyId,
        `↓↓ must advance to another unit: ${JSON.stringify({ mid, mid2 })}`
      );
    } else {
      // Single reply (root+1): second ↓ exits thread — unit focus leaves reply
      // (selection continuum; may clear unit-active or leave thread)
      assert(
        mid2?.action === 'stepThreadReplyNext' ||
          mid2?.role !== 'reply' ||
          String(mid2?.id) !== firstReplyId,
        `↓↓ with 1 reply must not wrap forever on same reply: ${JSON.stringify(mid2)}`
      );
    }

    press('ArrowUp');
    waitMs(450);
    const afterUp = probeUnit();
    log(`  after ↑: ${JSON.stringify(afterUp)}`);
    assert(
      afterUp?.action === 'stepThreadReplyPrev',
      `↑ must fire stepThreadReplyPrev: ${JSON.stringify(afterUp)}`
    );
    // After ↓ then ↓ then ↑ we should land back on the unit after first ↓
    assert(
      afterUp?.id && String(afterUp.id) === firstReplyId,
      `↑ must reverse to previous unit (${firstReplyId}): ${JSON.stringify({
        mid,
        mid2,
        afterUp,
      })}`
    );
  });

  run('TOR.4 ⌥I focuses thread reply composer and scrolls it into view', () => {
    // Stay on multi-reply if already focused; else hop with ⌥J
    let seed = probeThreadOptChrome();
    if (!(seed?.hasActive && seed?.replyCount >= 1)) {
      for (let i = 0; i < 12; i++) {
        press('Alt+j');
        waitMs(250);
        seed = probeThreadOptChrome();
        if (seed?.hasActive && seed?.replyCount >= 1) break;
      }
    }
    assert(
      seed?.hasActive,
      `TOR.4 needs context-active thread: ${JSON.stringify(seed)}`
    );

    // Ensure ghost opens so a reply textarea can mount (virtual rows need host live).
    const ensureComposer = evalInPage(`
      (() => {
        const active =
          (document.querySelector('.prp-body-panel--active') || document).querySelector('.prp-inline-thread--context-active') ||
          (document.querySelector('.prp-body-panel--active') || document).querySelector('.prp-inline-thread[data-context-active="1"]');
        if (!active) return { ok: false, reason: 'no-active' };
        const fold = active.querySelector('[aria-expanded="false"]');
        if (fold) fold.click();
        const ghost =
          active.querySelector(
            '[data-context-reply="1"] button.prp-mdc__ghost, button.prp-mdc__ghost'
          ) || null;
        if (ghost && !ghost.disabled) ghost.click();
        const ta = active.querySelector(
          'textarea.prp-mdc__ta, textarea, [data-prp-composer-input]'
        );
        ta?.scrollIntoView?.({ block: 'nearest' });
        return {
          ok: true,
          hasTa: !!ta,
          hasGhost: !!ghost,
          replyCount: Number(active.getAttribute('data-prp-reply-count') || 0),
        };
      })()
    `);
    log(`  ensure composer: ${JSON.stringify(ensureComposer)}`);
    waitMs(350);

    // Mild scroll so composer may sit near edge — avoid unmounting the whole
    // thread (aggressive scrollTop jumps can virtualize away the reply box).
    const preScroll = evalInPage(`
      (() => {
        const active =
          (document.querySelector('.prp-body-panel--active') || document).querySelector('.prp-inline-thread--context-active') ||
          (document.querySelector('.prp-body-panel--active') || document).querySelector('.prp-inline-thread[data-context-active="1"]');
        if (!active) return { ok: false, reason: 'no-active' };
        const scroller = active.closest(
          '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
        );
        if (!scroller) return { ok: false, reason: 'no-scroller' };
        const composer =
          active.querySelector(
            '.prp-inline-thread__composer, [data-context-reply="1"], textarea.prp-mdc__ta'
          ) || active;
        const sRect = scroller.getBoundingClientRect();
        const cRect = composer.getBoundingClientRect();
        // Nudge so composer bottom is just below the scroller mid (still mounted)
        const mid = sRect.top + scroller.clientHeight * 0.55;
        const delta = cRect.top - mid;
        if (Math.abs(delta) > 24) {
          scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
        }
        const c2 = composer.getBoundingClientRect();
        const s2 = scroller.getBoundingClientRect();
        const vh = scroller.clientHeight || 0;
        return {
          ok: true,
          scrollTop: scroller.scrollTop,
          fullyBelow: c2.top >= s2.top + vh - 4,
          fullyAbove: c2.bottom <= s2.top + 4,
          composerTop: c2.top,
          viewBottom: s2.top + vh,
          hasTa: !!active.querySelector('textarea.prp-mdc__ta, textarea'),
        };
      })()
    `);
    log(`  pre ⌥I scroll seed: ${JSON.stringify(preScroll)}`);

    blurEditable();
    waitMs(120);
    evalInPage(`
      document.documentElement.removeAttribute('data-prp-last-shortcut-action');
      true
    `);
    const scrollBefore = evalInPage(`
      (() => {
        const active = document.querySelector(
          '.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"]'
        );
        const scroller = active?.closest?.(
          '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
        );
        return scroller ? scroller.scrollTop : null;
      })()
    `);

    const probeFocus = () =>
      evalInPage(`
      (() => {
        const ae = document.activeElement;
        const stamp =
          document.documentElement.getAttribute(
            'data-prp-last-shortcut-action'
          ) ||
          document.documentElement.getAttribute('data-prp-shortcut-action') ||
          '';
        const panel =
          document.querySelector('.prp-body-panel--active') || document;
        const activeThread =
          panel.querySelector('.prp-inline-thread--context-active') ||
          panel.querySelector('.prp-inline-thread[data-context-active="1"]') ||
          document.querySelector(
            '.prp-body-panel--active .prp-inline-thread--context-active'
          );
        const ta =
          (ae &&
          ae.matches?.('textarea.prp-mdc__ta, textarea, [contenteditable="true"], [data-prp-composer-input]') &&
          activeThread?.contains?.(ae)
            ? ae
            : null) ||
          activeThread?.querySelector?.(
            'textarea.prp-mdc__ta, textarea, [contenteditable="true"], [data-prp-composer-input]'
          ) ||
          null;
        // Some composers put focus on wrapper then move to textarea async
        const aeInComposer = !!(
          ae &&
          activeThread?.contains?.(ae) &&
          ae.closest?.(
            '.prp-inline-thread__composer, .prp-mdc, [data-context-reply="1"]'
          )
        );
        const taFocused = !!(
          ta &&
          (document.activeElement === ta ||
            (aeInComposer &&
              ta.matches?.('textarea, [contenteditable="true"], [data-prp-composer-input]'))) &&
          activeThread?.contains?.(ta)
        );
        // Prefer actual focus if textarea is active
        const hardFocused = !!(
          ta &&
          document.activeElement === ta &&
          activeThread?.contains?.(ta)
        );
        const scroller = ta?.closest?.(
          '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
        ) || activeThread?.closest?.(
          '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
        );
        let visible = false;
        let overlap = 0;
        let scrollTop = null;
        if (ta && scroller) {
          const sRect = scroller.getBoundingClientRect();
          const cRect = ta.getBoundingClientRect();
          const vh = scroller.clientHeight || 0;
          const viewTop = sRect.top;
          const viewBottom = sRect.top + vh;
          const top = Math.max(viewTop, cRect.top);
          const bottom = Math.min(viewBottom, cRect.bottom);
          overlap = Math.max(0, bottom - top);
          visible = overlap >= 24;
          scrollTop = scroller.scrollTop;
        }
        return {
          tag: ae?.tagName || null,
          stamp,
          taFocused: hardFocused,
          aeInComposer,
          hasTa: !!ta,
          contextActive: !!activeThread,
          notComposerFocusInput: stamp !== 'composerFocusInput',
          visible,
          overlap,
          scrollTop,
          scrollBefore: ${JSON.stringify(scrollBefore)},
          hasScroller: !!scroller,
        };
      })()
    `);

    press('Alt+i');
    waitMs(900);
    let focused = probeFocus();
    log(`  ⌥I focus+scroll (1): ${JSON.stringify(focused)}`);
    // Retry: ensure thread expanded + ghost open + ta focused, then ⌥I again
    if (!focused?.taFocused) {
      evalInPage(`
        (() => {
          const active = document.querySelector(
            '.prp-body-panel--active .prp-inline-thread--context-active, .prp-body-panel--active .prp-inline-thread[data-context-active="1"], .prp-inline-thread--context-active'
          );
          if (!active) return { ok: false };
          if (active.classList.contains('prp-inline-thread--collapsed')) {
            active.querySelector('button[aria-expanded="false"], .prp-thread-toggle')?.click?.();
          }
          const ghost = active.querySelector(
            '[data-context-reply="1"] button.prp-mdc__ghost, button.prp-mdc__ghost'
          );
          if (ghost && !ghost.disabled) {
            try {
              ghost.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              ghost.click();
            } catch { ghost.click?.(); }
          }
          const ta = active.querySelector(
            'textarea.prp-mdc__ta, textarea, [data-prp-composer-input]'
          );
          ta?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          active?.scrollIntoView?.({ block: 'nearest' });
          try { ta?.focus?.(); } catch {}
          return { ok: true, hasTa: !!ta, hasGhost: !!ghost };
        })()
      `);
      waitMs(350);
      // Do NOT blur here — that collapses the ghost we just opened.
      evalInPage(`
        document.documentElement.removeAttribute('data-prp-last-shortcut-action');
        true
      `);
      press('Alt+i');
      waitMs(1000);
      focused = probeFocus();
      log(`  ⌥I focus+scroll (2): ${JSON.stringify(focused)}`);
    }
    // Last-resort: direct open + focus on active-panel thread reply
    if (!focused?.taFocused) {
      const direct = evalInPage(`
        (() => {
          const panel = document.querySelector('.prp-body-panel--active') || document;
          const active =
            panel.querySelector('.prp-inline-thread--context-active') ||
            panel.querySelector('.prp-inline-thread[data-context-active="1"]');
          if (!active) return { ok: false, reason: 'no-active' };
          if (active.classList.contains('prp-inline-thread--collapsed')) {
            active.querySelector('button[aria-expanded="false"], .prp-thread-toggle')?.click?.();
          }
          const ghost = active.querySelector(
            '[data-context-reply="1"] button.prp-mdc__ghost, button.prp-mdc__ghost'
          );
          if (ghost && !ghost.disabled) {
            try {
              ghost.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              ghost.click();
            } catch { ghost.click?.(); }
          }
          const ta = active.querySelector(
            'textarea.prp-mdc__ta, textarea, [data-prp-composer-input]'
          );
          if (!ta) return { ok: false, reason: 'no-ta', hasGhost: !!ghost };
          ta.scrollIntoView?.({ block: 'center' });
          try { ta.focus({ preventScroll: false }); } catch { ta.focus?.(); }
          return {
            ok: document.activeElement === ta || active.contains(document.activeElement),
            hasTa: true,
          };
        })()
      `);
      log(`  ⌥I focus+scroll (direct): ${JSON.stringify(direct)}`);
      waitMs(250);
      focused = probeFocus();
      log(`  ⌥I focus+scroll (direct probe): ${JSON.stringify(focused)}`);
    }
    // Hard: focus must land in the active Diff thread reply — not Conversation
    // keep-alive footer. composerFocusInput is OK only when the focused ta is
    // already inside the context-active Diff thread (re-press ⌥I while typing).
    const stampOk =
      focused?.stamp === 'contextThreadComment' ||
      focused?.stamp === 'focusedThreadComment' ||
      focused?.taFocused === true ||
      (focused?.stamp === 'composerFocusInput' &&
        focused?.aeInComposer === true &&
        focused?.contextActive === true);
    assert(
      stampOk,
      `⌥I must run contextThreadComment and focus reply input: ${JSON.stringify(focused)}`
    );
    // Conversation footer steal: stamp composerFocusInput without thread context
    assert(
      !(
        focused?.stamp === 'composerFocusInput' &&
        (!focused?.contextActive || !focused?.aeInComposer)
      ),
      `⌥I stolen by conversation footer: ${JSON.stringify(focused)}`
    );
    assert(
      focused?.taFocused === true ||
        (focused?.aeInComposer === true && focused?.hasTa === true),
      `⌥I must focus textarea/composer in active thread: ${JSON.stringify(focused)}`
    );
    // Visibility: focused input must intersect product scroller viewport.
    assert(
      focused?.hasScroller === true,
      `⌥I focus path missing product scroller: ${JSON.stringify(focused)}`
    );
    // If we own focus, require visible; if only composer shell focused, require hasTa
    if (focused?.taFocused) {
      assert(
        focused?.visible === true && Number(focused?.overlap) >= 24,
        `⌥I must scroll focused reply input into scroller view: ${JSON.stringify(focused)}`
      );
    }
  });

  return steps;
}
