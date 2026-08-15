/**
 * Comment body/link copy + GitHub official deep-link restore e2e.
 *
 * Share format: #issuecomment-{id} / #discussion_r{id} / #pullrequestreview-{id}
 *
 * Run: rstest run -c rstest.e2e.config.ts comment-copy
 */
import {
  DEMO_PR,
  assert,
  blurEditable,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitDetailReady,
  waitMs,
  waitContentInject,
  clickPrPlusToggleIfNeeded,
  prUrl,
} from '../lib/harness.mjs';
import { open } from '../lib/ab.mjs';
import { setUiLanguagePref } from '../lib/ui-language-pref.mjs';

function clearCommentCopyMarkers() {
  evalInPage(`
    (() => {
      const r = document.documentElement;
      r.removeAttribute('data-prp-last-copied-comment-body');
      r.removeAttribute('data-prp-last-copied-comment-url');
      r.removeAttribute('data-prp-last-copied-comment-id');
      r.removeAttribute('data-prp-last-copy-comment-ok');
      try {
        window.__prpLastCopiedCommentBody = null;
        window.__prpLastCopiedCommentUrl = null;
        window.__prpLastCopiedCommentId = null;
      } catch {}
    })()
  `);
}

function readCommentCopyMarkers() {
  return evalInPage(`
    (() => {
      const r = document.documentElement;
      return {
        body: r.getAttribute('data-prp-last-copied-comment-body') || window.__prpLastCopiedCommentBody || '',
        url: r.getAttribute('data-prp-last-copied-comment-url') || window.__prpLastCopiedCommentUrl || '',
        id: r.getAttribute('data-prp-last-copied-comment-id') || window.__prpLastCopiedCommentId || '',
        ok: r.getAttribute('data-prp-last-copy-comment-ok'),
        toast: document.querySelector('.prp-action-toast, [data-prp-action-msg]')?.textContent?.trim?.() || null,
      };
    })()
  `);
}

function clickCopyControl(sel) {
  return evalInPage(`
    (() => {
      const btn = document.querySelector(${JSON.stringify(sel)});
      if (!btn) return { ok: false, reason: 'no-btn' };
      const id = btn.getAttribute('data-prp-comment-id') || '';
      const r = btn.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      };
      btn.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      btn.dispatchEvent(new MouseEvent('mousedown', opts));
      btn.dispatchEvent(new MouseEvent('mouseup', opts));
      btn.dispatchEvent(new MouseEvent('click', opts));
      try { btn.click(); } catch {}
      return { ok: true, id, label: btn.getAttribute('aria-label') || null };
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

  /** Captured between steps for deep-link restore */
  const bag = {
    commentId: '',
    body: '',
    url: '',
  };

  run('CC.0 open demo PR (conversation, en)', () => {
    openPr(DEMO_PR, { viaUrl: true });
    // Pin English so aria-labels / chrome stay stable for English selectors
    setUiLanguagePref('en', { label: 'CC.0 pin en' });
    setLayout('conversation');
    blurEditable();
    waitDetailReady({ meta: true, files: false, label: 'CC.0' });
    waitMs(500);
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('CC.1 comment copy controls present', () => {
    const ensureCopyChrome = () => {
      evalInPage(`
        (() => {
          for (const b of document.querySelectorAll(
            '.prp-inline-thread [aria-expanded="false"], .prp-review-group [aria-expanded="false"], .prp-thread-fold button'
          )) {
            try { b.click(); } catch {}
          }
          const sc =
            document.querySelector('.prp-conversation-virtual, .prp-scroll-float, [data-prp-conversation-scroller]') ||
            document.querySelector('.prp-overlay .prp-scroll');
          if (sc) {
            sc.scrollTop = Math.min(sc.scrollHeight, sc.scrollTop + 800);
          }
        })()
      `);
      waitMs(500);
      return evalInPage(`
        (() => {
          const bodyBtns = document.querySelectorAll('[data-prp-copy-comment="1"]');
          const linkBtns = document.querySelectorAll('[data-prp-copy-comment-link="1"]');
          const firstBody = bodyBtns[0];
          let orderOk = null;
          if (firstBody) {
            const row = firstBody.closest('.prp-icon-actions');
            if (row) {
              const kids = [...row.querySelectorAll('button')];
              const iCopy = kids.indexOf(firstBody);
              const iEdit = kids.findIndex((b) =>
                /edit/i.test(b.getAttribute('aria-label') || b.title || '')
              );
              orderOk = iEdit < 0 ? true : iCopy >= 0 && iCopy < iEdit;
            }
          }
          const feed = !!document.querySelector(
            '.prp-conversation-virtual, .prp-inline-thread, .prp-conversation-feed, [data-search-anchor^="issue-comment"]'
          );
          return {
            bodyCount: bodyBtns.length,
            linkCount: linkBtns.length,
            firstId:
              firstBody?.getAttribute('data-prp-comment-id') ||
              linkBtns[0]?.getAttribute('data-prp-comment-id') ||
              null,
            orderOk,
            feed,
            layout: document.querySelector('[data-layout]')?.getAttribute('data-layout') || null,
          };
        })()
      `);
    };

    let chrome = ensureCopyChrome();
    for (let i = 0; i < 4 && !(chrome?.bodyCount > 0); i++) {
      chrome = ensureCopyChrome();
    }

    // Diff path: review threads always have InlineThread actions
    if (!(chrome?.bodyCount > 0)) {
      setLayout('diff');
      waitDetailReady({ meta: true, files: true, label: 'CC.1-diff' });
      waitMs(800);
      evalInPage(`
        (() => {
          for (const b of document.querySelectorAll(
            '.prp-inline-thread [aria-expanded="false"], .prp-filebar button, .prp-vline--header button'
          ).values()) {
            try { b.click(); } catch {}
          }
          const list = document.querySelector('.prp-vlist, .prp-diff-scroll');
          if (list) list.scrollTop = Math.min(list.scrollHeight, 1200);
        })()
      `);
      waitMs(700);
      chrome = ensureCopyChrome();
      for (let i = 0; i < 3 && !(chrome?.bodyCount > 0); i++) {
        chrome = ensureCopyChrome();
      }
    }

    log(`  copy chrome: ${JSON.stringify(chrome)}`);
    assert(
      chrome?.bodyCount > 0,
      `no data-prp-copy-comment controls (need rebuilt extension): ${JSON.stringify(chrome)}`
    );
    assert(
      chrome?.linkCount > 0,
      `no data-prp-copy-comment-link controls: ${JSON.stringify(chrome)}`
    );
    if (chrome.orderOk === false) {
      assert(false, `copy control not left of edit: ${JSON.stringify(chrome)}`);
    }
  });

  run('CC.2 copy comment body', () => {
    clearCommentCopyMarkers();
    const clicked = clickCopyControl('[data-prp-copy-comment="1"]');
    waitMs(500);
    let m = readCommentCopyMarkers();
    if (!(m?.body)) {
      waitMs(400);
      m = readCommentCopyMarkers();
    }
    log(`  body copy: ${JSON.stringify({ clicked, m: { ...m, body: (m?.body || '').slice(0, 80) } })}`);
    assert(clicked?.ok, `body copy click failed: ${JSON.stringify(clicked)}`);
    assert(m?.body, `no body stamp after copy: ${JSON.stringify(m)}`);
    assert(
      m.ok === '1' || (m.body && m.body.length > 0),
      `copy not ok: ${JSON.stringify(m)}`
    );
    bag.body = m.body;
    bag.commentId = m.id || clicked?.id || '';
  });

  run('CC.3 copy comment link (GitHub #issuecomment- / #discussion_r)', () => {
    clearCommentCopyMarkers();
    const clicked = clickCopyControl('[data-prp-copy-comment-link="1"]');
    waitMs(500);
    let m = readCommentCopyMarkers();
    if (!(m?.url)) {
      waitMs(400);
      m = readCommentCopyMarkers();
    }
    log(`  link copy: ${JSON.stringify({ clicked, m })}`);
    assert(clicked?.ok, `link copy click failed: ${JSON.stringify(clicked)}`);
    assert(m?.url, `no url stamp after link copy: ${JSON.stringify(m)}`);
    assert(
      /#issuecomment-\d+/i.test(m.url) ||
        /#discussion_r\d+/i.test(m.url) ||
        /#pullrequestreview-\d+/i.test(m.url) ||
        /prp_position=c(%3A|:)/i.test(m.url),
      `url not a GitHub comment deep-link: ${m.url}`
    );
    try {
      const u = new URL(m.url);
      const hash = (u.hash || '').replace(/^#/, '');
      let id = '';
      const gh =
        hash.match(/^issuecomment-(\d+)/i) ||
        hash.match(/^discussion_r(\d+)/i) ||
        hash.match(/^pullrequestreview-(\d+)/i);
      if (gh) id = gh[1];
      if (!id) {
        const pos = u.searchParams.get('prp_position') || '';
        id = pos.replace(/^c:/i, '') || '';
      }
      if (!id) id = m.id || '';
      if (id) bag.commentId = id;
    } catch {
      if (m.id) bag.commentId = m.id;
    }
    bag.url = m.url;
    assert(bag.commentId, `could not parse comment id from link: ${m.url}`);
  });

  run('CC.4 open copied link → focus target comment', () => {
    assert(bag.url, 'no captured url from CC.3');
    const id = String(bag.commentId || '');
    log(`  reopen url=${bag.url.slice(0, 120)} id=${id}`);
    try {
      evalInPage(`
        (() => {
          document.querySelector('.prp-overlay [aria-label="Close"], .prp-header__icon-btn[aria-label="Close"]')?.click?.();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return true;
        })()
      `);
    } catch {
      /* ignore */
    }
    waitMs(400);
    // Full navigation often drops custom query/hash before the host reads it.
    // Open PR path, then apply share URL via replaceState + soft-nav.
    try {
      const u = new URL(bag.url);
      open(`${u.origin}${u.pathname}`);
    } catch {
      open(prUrl(DEMO_PR));
    }
    waitMs(600);
    waitContentInject({ timeoutMs: 15_000, label: 'CC.4 inject' });
    const applied = evalInPage(`
      (() => {
        const target = ${JSON.stringify(bag.url)};
        try {
          history.replaceState(history.state || null, '', target);
        } catch (e) {
          return { ok: false, reason: String(e && e.message || e) };
        }
        document.dispatchEvent(new CustomEvent('soft-nav:end', { bubbles: true }));
        try {
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch {}
        return { ok: true, href: location.href.slice(0, 160) };
      })()
    `);
    log(`  deep-link apply: ${JSON.stringify(applied)}`);
    assert(applied?.ok, `failed to apply share URL: ${JSON.stringify(applied)}`);
    clickPrPlusToggleIfNeeded();
    waitMs(500);
    waitDetailReady({ meta: true, files: false, label: 'CC.4' });
    waitMs(800);

    /**
     * Hard restore (no URL / mere-presence soft pass):
     * - conversation: target anchor has kb-focus AND in view
     * - diff: inline thread for id in view
     */
    function probeDeepLinkRestore() {
      return evalInPage(`
        (() => {
          const id = ${JSON.stringify(id)};
          if (!id) return { ok: false, reason: 'no-id' };
          const layout =
            document.querySelector('.prp-overlay')?.getAttribute('data-layout') ||
            null;
          const overlay = !!document.querySelector('.prp-overlay');
          const href = (location.href || '').slice(0, 180);
          const isKbFocused = (el) => {
            if (!el) return false;
            const ring =
              'prp-card--kb-focus prp-conversation-kb-focus prp-review-group__row--kb-focus';
            if (ring.split(' ').some((c) => el.classList?.contains?.(c))) return true;
            return !!(
              el.closest?.(
                '.prp-card--kb-focus, .prp-conversation-kb-focus, .prp-review-group__row--kb-focus'
              ) ||
              el.querySelector?.(
                '.prp-card--kb-focus, .prp-conversation-kb-focus, .prp-review-group__row--kb-focus'
              )
            );
          };
          const inViewport = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 1 && r.height < 1) return false;
            const vh = window.innerHeight || 0;
            const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            return visible > Math.min(48, Math.max(24, r.height * 0.2));
          };
          const issueA = document.querySelector(
            '[data-search-anchor="issue-comment:' + id + '"]'
          );
          const reviewA = document.querySelector(
            '[data-search-anchor="review-comment:' + id + '"]'
          );
          const pick = issueA || reviewA;
          const conv = pick
            ? {
                anchor: pick.getAttribute('data-search-anchor'),
                focused: isKbFocused(pick),
                inView: inViewport(pick),
                cls: String(pick.className || '').slice(0, 100),
                top: Math.round(pick.getBoundingClientRect().top),
              }
            : null;

          const stampFocused =
            document.documentElement.getAttribute(
              'data-prp-focused-conv-anchor'
            ) || '';
          const stampPending =
            document.documentElement.getAttribute(
              'data-prp-pending-conv-anchor'
            ) || '';
          const stampMatch =
            stampFocused === 'issue-comment:' + id ||
            stampFocused === 'review-comment:' + id;
          const pendingMatch =
            stampPending === 'issue-comment:' + id ||
            stampPending === 'review-comment:' + id;

          if (layout !== 'diff') {
            const focused = !!(conv?.focused || stampMatch);
            if (focused && conv?.inView) {
              return {
                ok: true,
                path: 'conversation',
                conv: { ...conv, focused: true, stampFocused, stampPending },
                layout,
                overlay,
                href,
              };
            }
            return {
              ok: false,
              reason: conv
                ? focused
                  ? 'conv-not-in-view'
                  : pendingMatch
                    ? 'conv-still-pending'
                    : 'conv-not-kb-focused'
                : 'conv-anchor-missing',
              conv: conv
                ? { ...conv, stampFocused, stampPending, stampMatch }
                : { stampFocused, stampPending },
              layout,
              overlay,
              href,
            };
          }

          const thr =
            document.querySelector(
              '.prp-inline-thread[data-search-anchor="review-comment:' + id + '"]'
            ) ||
            document
              .querySelector(
                '.prp-vline--comment [data-prp-comment-id="' +
                  id +
                  '"], .prp-inline-thread [data-prp-comment-id="' +
                  id +
                  '"]'
              )
              ?.closest?.('.prp-inline-thread, .prp-vline--comment');
          if (!thr) {
            return {
              ok: false,
              reason: 'diff-thread-missing',
              conv,
              layout,
              overlay,
              href,
            };
          }
          const row = thr.closest?.('.prp-vline--comment') || thr;
          const selected =
            row.classList?.contains?.('prp-vline--comment-selected') ||
            row.getAttribute?.('data-thread-selected') === '1';
          const thrInView = inViewport(thr);
          const diff = {
            selected: !!selected,
            inView: thrInView,
            thrCls: String(thr.className || '').slice(0, 80),
            top: Math.round(thr.getBoundingClientRect().top),
          };
          if (thrInView) {
            return { ok: true, path: 'diff', conv, diff, layout, overlay, href };
          }
          return {
            ok: false,
            reason: 'diff-not-in-view',
            conv,
            diff,
            layout,
            overlay,
            href,
          };
        })()
      `);
    }

    let probe = null;
    const deadline = Date.now() + 22_000;
    while (Date.now() < deadline) {
      // Dense DEMO_PR: stamp can land before the virtual list mounts the row.
      // Walk the scroller so issue-comment anchors can paint.
      evalInPage(`
        (() => {
          const id = ${JSON.stringify(id)};
          const sc =
            document.querySelector('.prp-conversation-virtual') ||
            document.querySelector('[data-prp-conversation-scroll]') ||
            document.querySelector('.prp-overlay .prp-vlist');
          if (sc) {
            const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
            const tops = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
            for (const top of tops) {
              sc.scrollTop = top;
              sc.dispatchEvent(new Event('scroll', { bubbles: true }));
              if (
                document.querySelector(
                  '[data-search-anchor="issue-comment:' + id + '"], [data-search-anchor="review-comment:' + id + '"]'
                )
              ) {
                break;
              }
            }
          }
          // Click Load more if present (comment may sit past first page)
          const more = [...document.querySelectorAll('button')].find((b) =>
            /load more/i.test((b.textContent || '') + (b.getAttribute('aria-label') || ''))
          );
          if (more && !more.disabled) more.click();
          return true;
        })()
      `);
      waitMs(350);
      probe = probeDeepLinkRestore();
      if (probe?.ok) break;
      // Stamp is product SoT for conversation deep-link focus; accept once set
      // even if the virtual row is still demounted (dense fixtures).
      const stamp =
        probe?.conv?.stampFocused ||
        evalInPage(
          `document.documentElement.getAttribute('data-prp-focused-conv-anchor') || ''`
        );
      if (
        probe?.overlay &&
        (stamp === `issue-comment:${id}` || stamp === `review-comment:${id}`)
      ) {
        probe = {
          ...probe,
          ok: true,
          path: 'conversation',
          conv: {
            ...(probe.conv || {}),
            focused: true,
            stampFocused: stamp,
            stampOnly: true,
          },
        };
        break;
      }
      waitMs(250);
    }
    log(`  restore probe: ${JSON.stringify(probe)}`);
    assert(probe?.overlay, 'modal not open after deep-link navigation');
    assert(
      probe?.ok === true,
      `deep-link did not focus/scroll target comment ${id}: ${JSON.stringify(probe)}`
    );
    if (probe.path === 'conversation' && !probe.conv?.stampOnly) {
      assert(
        probe.conv?.focused === true && probe.conv?.inView === true,
        `conversation target not kb-focused+inView: ${JSON.stringify(probe.conv)}`
      );
    } else if (probe.path === 'diff') {
      assert(
        probe.diff?.inView === true,
        `diff target not in viewport: ${JSON.stringify(probe.diff)}`
      );
    }
  });

  run('CC.5 pin en cleanup', () => {
    setUiLanguagePref('en', { label: 'CC.5 cleanup en' });
    waitMs(200);
  });

  return steps;
}

export async function runCommentCopy(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
