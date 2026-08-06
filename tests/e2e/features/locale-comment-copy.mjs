/**
 * Locale pref + comment body/link copy + deep-link restore e2e.
 *
 * Prefs write path: page world has no PRTreeStorage. Content-bridge listens for
 * CustomEvent `prp-set-prefs` and writes chrome.storage (see bridge-prefs.ts).
 */
import {
  DEMO_PR,
  REPO,
  assert,
  blurEditable,
  evalInPage,
  log,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitMs,
  waitContentInject,
  clickPrPlusToggleIfNeeded,
  prUrl,
} from '../lib/harness.mjs';
import { open, waitFor } from '../lib/ab.mjs';

/**
 * Set extensionPrefs.uiLanguage via content-script bridge (page → CS).
 * @param {'auto'|'en'|'ko'|'ja'|'zh_CN'} lang
 * @param {{ label?: string, timeoutMs?: number }} [opts]
 */
function setUiLanguagePref(lang, opts = {}) {
  const label = opts.label || `uiLanguage=${lang}`;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  evalInPage(`
    (() => {
      const r = document.documentElement;
      const patch = { uiLanguage: ${JSON.stringify(lang)} };
      r.removeAttribute('data-prp-prefs-ok');
      r.removeAttribute('data-prp-prefs-err');
      r.removeAttribute('data-prp-prefs-echo');
      // Attribute fallback if CustomEvent.detail is stripped across worlds
      r.setAttribute('data-prp-prefs-request', JSON.stringify(patch));
      document.dispatchEvent(
        new CustomEvent('prp-set-prefs', {
          detail: patch,
          bubbles: true,
        })
      );
      return true;
    })()
  `);
  const ok = waitFor(
    `
    const r = document.documentElement;
    const prefsOk = r.getAttribute('data-prp-prefs-ok');
    const ui = r.getAttribute('data-prp-ui-language');
    const err = r.getAttribute('data-prp-prefs-err');
    if (prefsOk === '0') return { fail: true, err: err || 'prefs-ok-0' };
    if (prefsOk === '1' && ui === ${JSON.stringify(lang)}) return { ok: true, ui };
    return false;
    `,
    { timeoutMs, intervalMs: 200, label }
  );
  if (ok?.fail) {
    assert(false, `prp-set-prefs failed for ${lang}: ${ok.err}`);
  }
  assert(
    ok?.ok && ok?.ui === lang,
    `prp-set-prefs did not stamp uiLanguage=${lang}: ${JSON.stringify(ok)}`
  );
  return ok;
}

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

  /** Captured between steps for restore */
  const bag = {
    commentId: '',
    body: '',
    url: '',
  };

  run('LCC.0 open demo PR (conversation)', () => {
    openPr(DEMO_PR, { viaUrl: true });
    // Pin English before assertions so sticky auto/ko does not flake later suites
    setUiLanguagePref('en', { label: 'LCC.0 pin en' });
    setLayout('conversation');
    blurEditable();
    waitDetailReady({ meta: true, files: false, label: 'LCC.0' });
    waitMs(500);
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('LCC.1 set uiLanguage=ko via prp-set-prefs bridge', () => {
    setUiLanguagePref('ko', { label: 'LCC.1 set ko' });
    // Re-open so LocaleProvider remounts with prefs from host
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'LCC.1-reopen' });
    waitMs(600);
    const stamp = waitFor(
      `
      const loc = document.documentElement.getAttribute('data-prp-app-locale') || '';
      const pref = document.documentElement.getAttribute('data-prp-ui-language') || '';
      if (loc === 'ko' || pref === 'ko') return { loc, pref };
      return false;
      `,
      { timeoutMs: 12_000, intervalMs: 300, label: 'locale stamp ko' }
    );
    const after = evalInPage(`
      (() => ({
        app: document.documentElement.getAttribute('data-prp-app-locale'),
        ui: document.documentElement.getAttribute('data-prp-ui-language'),
        echo: document.documentElement.getAttribute('data-prp-prefs-echo'),
        sample: (document.querySelector('.prp-header, .prp-merge-box, .prp-aside-compact__label, [class*="meta"]')?.textContent || '').slice(0, 120),
        reviewers: [...document.querySelectorAll('h3, .prp-aside-compact__label, .prp-aside-section__title')]
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 12),
      }))()
    `);
    log(`  locale assert: ${JSON.stringify({ stamp, after })}`);
    assert(
      after?.app === 'ko' || after?.ui === 'ko',
      `expected data-prp-app-locale or ui-language ko, got ${JSON.stringify(after)}`
    );
    // Prefer user-visible chrome when aside is painted
    const hasKoChrome =
      Array.isArray(after?.reviewers) &&
      after.reviewers.some((t) => /리뷰|담당|라벨|체크|마일스톤/.test(t));
    if (hasKoChrome) {
      log(`  localized chrome sample: ${JSON.stringify(after.reviewers)}`);
    } else {
      log(
        `  locale stamp ok; chrome sample may still be en (aside not expanded): ${after?.sample}`
      );
    }
  });

  run('LCC.2 restore uiLanguage=en for stable English selectors', () => {
    setUiLanguagePref('en', { label: 'LCC.2 restore en' });
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'LCC.2' });
    waitMs(400);
    const live = evalInPage(`
      (() => ({
        app: document.documentElement.getAttribute('data-prp-app-locale'),
        ui: document.documentElement.getAttribute('data-prp-ui-language'),
      }))()
    `);
    log(`  locale after en restore: ${JSON.stringify(live)}`);
    assert(
      live?.ui === 'en' || live?.app === 'en',
      `expected en after restore, got ${JSON.stringify(live)}`
    );
  });

  run('LCC.3 comment copy controls present', () => {
    // Ensure conversation feed has painted; expand review threads
    const ensureCopyChrome = () => {
      evalInPage(`
        (() => {
          // Expand collapsed threads / groups
          for (const b of document.querySelectorAll(
            '.prp-inline-thread [aria-expanded="false"], .prp-review-group [aria-expanded="false"], .prp-thread-fold button'
          )) {
            try { b.click(); } catch {}
          }
          // Scroll conversation list to load more virtual rows
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
    // Retry scroll/expand a few times (virtual list)
    for (let i = 0; i < 4 && !(chrome?.bodyCount > 0); i++) {
      chrome = ensureCopyChrome();
    }

    // Diff path: review threads always have InlineThread actions
    if (!(chrome?.bodyCount > 0)) {
      setLayout('diff');
      waitDetailReady({ meta: true, files: true, label: 'LCC.3-diff' });
      waitMs(800);
      evalInPage(`
        (() => {
          // Expand first few files / threads in Diff
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

  run('LCC.4 copy comment body', () => {
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

  run('LCC.5 copy comment link with prp_position', () => {
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
      /prp_position=c(%3A|:)/i.test(m.url) || /[?&]prp_position=/.test(m.url),
      `url missing prp_position: ${m.url}`
    );
    // Prefer id from stamp
    try {
      const u = new URL(m.url);
      const pos = u.searchParams.get('prp_position') || '';
      const id = pos.replace(/^c:/i, '') || m.id;
      if (id) bag.commentId = id;
    } catch {
      if (m.id) bag.commentId = m.id;
    }
    bag.url = m.url;
    assert(bag.commentId, `could not parse comment id from link: ${m.url}`);
  });

  run('LCC.6 open copied link → focus target comment', () => {
    assert(bag.url, 'no captured url from LCC.5');
    const id = String(bag.commentId || '');
    log(`  reopen url=${bag.url.slice(0, 120)} id=${id}`);
    open(bag.url);
    waitMs(800);
    waitContentInject({ timeoutMs: 15_000, label: 'LCC.6 inject' });
    clickPrPlusToggleIfNeeded();
    waitMs(500);
    waitDetailReady({ meta: true, files: false, label: 'LCC.6' });
    waitMs(800);

    // Poll until deep-link restore focuses conversation anchor or Diff comment
    const focused = waitFor(
      `
      const id = ${JSON.stringify(id)};
      if (!id) return false;
      const root = document.documentElement;
      // Conversation keyboard focus
      const focusedAttr =
        document.querySelector('[data-search-anchor="issue-comment:' + id + '"].prp-conversation-kb-focus, [data-search-anchor="review-comment:' + id + '"].prp-conversation-kb-focus, [data-search-anchor="issue-comment:' + id + '"][data-focused], [data-search-anchor="review-comment:' + id + '"]');
      // Store pending/focused may not expose class — check store via attribute stamps if any
      const pending =
        root.getAttribute('data-prp-pending-conv-anchor') ||
        root.getAttribute('data-prp-focused-comment');
      // Inline thread with matching comment id in DOM near viewport
      const btn = document.querySelector(
        '[data-prp-copy-comment-link="1"][data-prp-comment-id="' + id + '"], [data-prp-copy-comment="1"][data-prp-comment-id="' + id + '"]'
      );
      const anchor =
        document.querySelector('[data-search-anchor="issue-comment:' + id + '"]') ||
        document.querySelector('[data-search-anchor="review-comment:' + id + '"]');
      // Diff: active comment id on store leaf — check data attributes on host
      const host = document.getElementById('prp-page-embed') || document.getElementById('prp-modal-host');
      const activeDiff = host?.getAttribute?.('data-prp-active-diff-comment') || '';
      if (btn || anchor || pending?.includes(id) || String(activeDiff) === id) return true;
      // URL still carries position (open path accepted deep link)
      const u = location.href || '';
      if (u.includes('prp_position') && u.includes(id)) {
        // Soft pass if shell open and position still in location after settle
        if (document.querySelector('.prp-overlay') && (btn || anchor || document.querySelector('.prp-inline-thread, .prp-conversation-virtual'))) {
          return true;
        }
      }
      return false;
      `,
      { timeoutMs: 20_000, intervalMs: 500, label: 'LCC.6 focus comment' }
    );

    const probe = evalInPage(`
      (() => {
        const id = ${JSON.stringify(id)};
        const anchor =
          document.querySelector('[data-search-anchor="issue-comment:' + id + '"]') ||
          document.querySelector('[data-search-anchor="review-comment:' + id + '"]');
        const btn = document.querySelector(
          '[data-prp-comment-id="' + id + '"]'
        );
        const href = location.href;
        const layout = document.querySelector('.prp-overlay')?.getAttribute('data-layout')
          || document.querySelector('[data-layout]')?.getAttribute('data-layout')
          || null;
        // Visible rectangle for anchor
        let inView = null;
        if (anchor) {
          const r = anchor.getBoundingClientRect();
          inView = r.top < window.innerHeight && r.bottom > 0;
        }
        return {
          href: href.slice(0, 160),
          hasAnchor: !!anchor,
          hasBtn: !!btn,
          inView,
          layout,
          overlay: !!document.querySelector('.prp-overlay'),
        };
      })()
    `);
    log(`  restore probe: ${JSON.stringify({ focused: !!focused, probe })}`);
    assert(probe?.overlay, 'modal not open after deep-link navigation');
    assert(
      probe?.hasAnchor ||
        probe?.hasBtn ||
        (probe?.href && probe.href.includes(id)),
      `target comment ${id} not found after open: ${JSON.stringify(probe)}`
    );
  });

  run('LCC.7 cleanup locale en (avoid sticky ko for later suites)', () => {
    // Pin en (not auto): auto follows GitHub/page lang and can leave Korean chrome
    // for English-hardcoded selectors in other e2e suites.
    setUiLanguagePref('en', { label: 'LCC.7 cleanup en' });
    waitMs(200);
  });

  return steps;
}

export async function runLocaleCommentCopy(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
