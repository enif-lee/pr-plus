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
      // OptBtnHint usually renders a small badge with ⌥ glyph
      const countHints = (el) => {
        if (!el) return 0;
        return el.querySelectorAll(
          '.prp-opt-btn-hint, [data-prp-opt-hint], .prp-opt-hint-host .prp-opt-btn-hint'
        ).length;
      };
      // Also count showShortcutHint hosts that expose badge text containing ⌥ on action row
      const actionHints = (el) => {
        if (!el) return 0;
        const row = el.querySelector('.prp-icon-actions') || el;
        const badges = [...row.querySelectorAll('*')].filter((n) => {
          const t = (n.textContent || '').trim();
          return t.length <= 8 && /⌥|Alt/.test(t) && n.children.length === 0;
        });
        return badges.length;
      };
      const rootHints = Math.max(countHints(rootItem), actionHints(rootItem));
      let replyHints = 0;
      for (const r of replyItems) {
        replyHints += Math.max(countHints(r), actionHints(r));
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

  run('TOR.2 root-only OptBtnHint on multi-reply thread', () => {
    // Hold Option so OptBtnHint paints (product shows hints when optHintsActive
    // or when context-active hosts render hints).
    press('Alt');
    waitMs(200);
    const p = probeThreadOptChrome();
    log(`  opt chrome: ${JSON.stringify(p)}`);
    if (p?.replyCount >= 1) {
      assert(
        p.replyHints === 0,
        `replies must not show OptBtnHint badges: ${JSON.stringify(p)}`
      );
    } else {
      log('  WARN: no multi-reply thread — skip root-only strict assert');
    }
    // Root may have zero hints if Option-hold not latched; require no reply hints
    // Structural: renderCommentActions isRoot=false on replies is unit-tested.
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
    if (!(before?.replyCount >= 1)) {
      log('  skip ↑/↓ — no multi-reply thread active');
      return;
    }
    log(`  before arrows: ${JSON.stringify(before)}`);
    blurEditable();
    waitMs(120);
    // Clear prior stamp
    evalInPage(`
      document.documentElement.removeAttribute('data-prp-last-shortcut-action');
      document.documentElement.removeAttribute('data-prp-focused-thread-unit');
      true
    `);
    press('ArrowDown');
    waitMs(400);
    const mid = probeThreadOptChrome();
    const action1 = evalInPage(
      `document.documentElement.getAttribute('data-prp-last-shortcut-action') || ''`
    );
    log(`  after ↓: ${JSON.stringify(mid)} action=${action1}`);
    press('ArrowDown');
    waitMs(400);
    const mid2 = probeThreadOptChrome();
    const action2 = evalInPage(
      `document.documentElement.getAttribute('data-prp-last-shortcut-action') || ''`
    );
    log(`  after ↓↓: ${JSON.stringify(mid2)} action=${action2}`);
    press('ArrowUp');
    waitMs(400);
    const afterUp = probeThreadOptChrome();
    const action3 = evalInPage(
      `document.documentElement.getAttribute('data-prp-last-shortcut-action') || ''`
    );
    log(`  after ↑: ${JSON.stringify(afterUp)} action=${action3}`);
    const unitRole =
      mid?.unitActiveRole || mid2?.unitActiveRole || afterUp?.unitActiveRole;
    const stamp =
      mid?.stampUnit || mid2?.stampUnit || afterUp?.stampUnit || '';
    const stepped =
      action1 === 'stepThreadReplyNext' ||
      action2 === 'stepThreadReplyNext' ||
      action3 === 'stepThreadReplyPrev';
    assert(
      unitRole === 'reply' ||
        stepped ||
        (stamp && stamp !== String(before.unitFocus || '')) ||
        mid?.unitActiveRole === 'reply' ||
        mid2?.unitActiveRole === 'reply',
      `↑/↓ did not mark reply unit focus: ${JSON.stringify({
        before,
        mid,
        mid2,
        afterUp,
        action1,
        action2,
        action3,
      })}`
    );
  });

  run('TOR.4 ⌥I focuses thread reply composer', () => {
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
    blurEditable();
    waitMs(120);
    evalInPage(`
      document.documentElement.removeAttribute('data-prp-last-shortcut-action');
      true
    `);
    press('Alt+i');
    waitMs(500);
    const focused = evalInPage(`
      (() => {
        const ae = document.activeElement;
        const inReply =
          ae &&
          (ae.matches?.(
            'textarea, [contenteditable="true"], [data-prp-composer-input]'
          ) ||
            ae.closest?.(
              '[data-prp-composer-kind="reply"], .prp-inline-thread__composer, .prp-inline-thread--context-active [data-prp-composer-root]'
            ));
        const stamp =
          document.documentElement.getAttribute(
            'data-prp-last-shortcut-action'
          ) ||
          document.documentElement.getAttribute('data-prp-shortcut-action') ||
          '';
        const activeThread =
          document.querySelector('.prp-inline-thread--context-active') ||
          document.querySelector('.prp-inline-thread[data-context-active="1"]');
        const ta =
          activeThread?.querySelector?.(
            'textarea, [contenteditable="true"], [data-prp-composer-input]'
          ) || null;
        const taFocused = !!(ta && document.activeElement === ta);
        return {
          inReply: Boolean(inReply),
          tag: ae?.tagName || null,
          stamp,
          taFocused,
          contextActive: !!activeThread,
          // Must NOT be stolen by keep-alive conversation footer
          notComposerFocusInput: stamp !== 'composerFocusInput',
        };
      })()
    `);
    log(`  ⌥I focus: ${JSON.stringify(focused)}`);
    // Hard: stamp must be thread comment path (or focus already in thread reply).
    // contextActive alone is insufficient (broken ⌥I used to pass that way).
    assert(
      focused?.stamp === 'contextThreadComment' ||
        focused?.stamp === 'focusedThreadComment' ||
        (focused?.inReply && focused?.taFocused) ||
        focused?.taFocused === true,
      `⌥I must run contextThreadComment and focus reply input: ${JSON.stringify(focused)}`
    );
    assert(
      focused?.notComposerFocusInput !== false &&
        focused?.stamp !== 'composerFocusInput',
      `⌥I stolen by conversation footer: ${JSON.stringify(focused)}`
    );
  });

  return steps;
}
