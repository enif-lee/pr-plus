/**
 * Quote reply + Hide/unhide comment e2e.
 *
 * Run: rstest run -c rstest.e2e.config.ts hide-quote
 */
import {
  DEMO_PR,
  assert,
  blurEditable,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitContentInject,
  waitDetailReady,
  waitMs,
  clickPrPlusToggleIfNeeded,
} from '../lib/harness.mjs';
import { open } from '../lib/ab.mjs';
import { setUiLanguagePref } from '../lib/ui-language-pref.mjs';

function clearQuoteHideMarkers() {
  evalInPage(`
    (() => {
      const r = document.documentElement;
      for (const a of [
        'data-prp-last-quote-ok',
        'data-prp-last-quote-body',
        'data-prp-last-quote-comment-id',
        'data-prp-last-quote-target',
        'data-prp-last-hide-ok',
        'data-prp-last-hide-minimized',
        'data-prp-last-hide-comment-id',
        'data-prp-last-hide-reason',
        'data-prp-last-hide-action',
      ]) r.removeAttribute(a);
      try {
        window.__prpLastQuoteBody = null;
        window.__prpLastQuoteOk = null;
      } catch {}
    })()
  `);
}

function clickStamp(sel) {
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
      return {
        ok: true,
        id,
        label: btn.getAttribute('aria-label') || btn.title || null,
      };
    })()
  `);
}

function ensureCommentChrome() {
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
      if (sc) sc.scrollTop = Math.min(sc.scrollHeight, sc.scrollTop + 600);
    })()
  `);
  waitMs(400);
  return evalInPage(`
    (() => {
      const quote = document.querySelectorAll('[data-prp-quote-reply="1"]');
      const hide = document.querySelectorAll('[data-prp-hide-comment="1"]');
      const unhide = document.querySelectorAll('[data-prp-unhide-comment="1"]');
      const minimized = document.querySelectorAll('[data-prp-comment-minimized="1"]');
      const copy = document.querySelectorAll('[data-prp-copy-comment="1"]');
      return {
        quoteCount: quote.length,
        hideCount: hide.length,
        unhideCount: unhide.length,
        minimizedCount: minimized.length,
        copyCount: copy.length,
        firstQuoteId: quote[0]?.getAttribute('data-prp-comment-id') || null,
        firstHideId: hide[0]?.getAttribute('data-prp-comment-id') || null,
      };
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

  const bag = {
    quoteId: '',
    hideId: '',
    quotedSnippet: '',
  };

  run('HQ.0 reload extension (pick up SW minimize handlers)', () => {
    // Unpacked SW can stay stale across rebuilds; force chrome.runtime.reload.
    try {
      open('https://github.com/enif-lee/pr-plus/pulls');
      waitMs(400);
      waitContentInject({ timeoutMs: 12_000, label: 'HQ.0 inject pre-reload' });
      evalInPage(
        `document.dispatchEvent(new CustomEvent('prp-reload-extension', { bubbles: true })); true`
      );
      log('  [HQ.0] prp-reload-extension dispatched');
      waitMs(5500);
      open('https://github.com/enif-lee/pr-plus/pulls');
      waitMs(800);
      waitContentInject({ timeoutMs: 15_000, label: 'HQ.0 inject post-reload' });
    } catch (e) {
      log(`  [HQ.0] reload soft-fail ${e?.message || e}`);
    }
  });

  run('HQ.0b open demo PR (conversation, en)', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setUiLanguagePref('en', { label: 'HQ.0b pin en' });
    setLayout('conversation');
    blurEditable();
    waitDetailReady({ meta: true, files: false, label: 'HQ.0b' });
    waitMs(500);
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('HQ.1 quote + hide controls present', () => {
    let chrome = ensureCommentChrome();
    for (let i = 0; i < 5 && !(chrome?.quoteCount > 0); i++) {
      chrome = ensureCommentChrome();
    }
    log(`  chrome: ${JSON.stringify(chrome)}`);
    assert(
      chrome?.quoteCount > 0,
      `no data-prp-quote-reply controls (rebuild extension?): ${JSON.stringify(chrome)}`
    );
    // Hide may be absent if viewer lacks minimize permission on all comments
    if (!(chrome?.hideCount > 0) && !(chrome?.unhideCount > 0)) {
      log(
        '  WARN: no hide/unhide controls visible — hide steps will soft-assert permission path'
      );
    }
    bag.quoteId = chrome.firstQuoteId || '';
    bag.hideId = chrome.firstHideId || '';
  });

  run('HQ.2 Quote reply inserts > markdown into main composer', () => {
    clearQuoteHideMarkers();
    // Capture source body for a loose contain check
    const source = evalInPage(`
      (() => {
        const btn = document.querySelector('[data-prp-quote-reply="1"]');
        if (!btn) return null;
        const card =
          btn.closest('.prp-card, .prp-inline-thread, .prp-review-thread__item') ||
          btn.closest('[data-search-anchor]');
        const md =
          card?.querySelector?.('.prp-md, .markdown-body, .prp-inline-thread__body') ||
          null;
        const text = (md?.textContent || card?.textContent || '').trim().slice(0, 200);
        return {
          id: btn.getAttribute('data-prp-comment-id') || '',
          sample: text.split('\\n').map((s) => s.trim()).filter(Boolean)[0] || '',
        };
      })()
    `);
    log(`  quote source: ${JSON.stringify(source)}`);
    const clicked = clickStamp('[data-prp-quote-reply="1"]');
    waitMs(600);
    let stamps = evalInPage(`
      (() => {
        const r = document.documentElement;
        const ta =
          document.querySelector(
            '[data-prp-composer-kind="conversation"] [data-prp-composer-input], [data-prp-composer-kind="conversation"] textarea, .prp-composer-focus-host textarea'
          ) ||
          document.querySelector('[data-prp-composer-input], .prp-inline-thread textarea');
        const focused =
          document.activeElement &&
          (document.activeElement.matches?.('textarea, [data-prp-composer-input]') ||
            document.activeElement.tagName === 'TEXTAREA');
        return {
          ok: r.getAttribute('data-prp-last-quote-ok'),
          body: r.getAttribute('data-prp-last-quote-body') || window.__prpLastQuoteBody || '',
          target: r.getAttribute('data-prp-last-quote-target'),
          id: r.getAttribute('data-prp-last-quote-comment-id'),
          taValue: ta ? String(ta.value || '') : '',
          taFocused: Boolean(focused),
          taTag: ta ? ta.tagName : null,
        };
      })()
    `);
    if (!(stamps?.body) || !String(stamps.taValue || '').includes('>')) {
      waitMs(500);
      stamps = evalInPage(`
        (() => {
          const r = document.documentElement;
          const ta =
            document.querySelector(
              '[data-prp-composer-kind="conversation"] [data-prp-composer-input], [data-prp-composer-kind="conversation"] textarea, .prp-composer-focus-host textarea'
            ) ||
            document.querySelector('[data-prp-composer-input], .prp-inline-thread textarea');
          const focused =
            document.activeElement &&
            (document.activeElement.matches?.('textarea, [data-prp-composer-input]') ||
              document.activeElement.tagName === 'TEXTAREA');
          return {
            ok: r.getAttribute('data-prp-last-quote-ok'),
            body: r.getAttribute('data-prp-last-quote-body') || window.__prpLastQuoteBody || '',
            target: r.getAttribute('data-prp-last-quote-target'),
            id: r.getAttribute('data-prp-last-quote-comment-id'),
            taValue: ta ? String(ta.value || '') : '',
            taFocused: Boolean(focused),
            taTag: ta ? ta.tagName : null,
          };
        })()
      `);
    }
    log(
      `  quote result: ${JSON.stringify({
        clicked,
        stamps: {
          ...stamps,
          body: String(stamps?.body || '').slice(0, 120),
          taValue: String(stamps?.taValue || '').slice(0, 120),
        },
      })}`
    );
    assert(clicked?.ok, `quote click failed: ${JSON.stringify(clicked)}`);
    assert(
      stamps?.ok === '1' || String(stamps?.body || '').includes('>'),
      `quote stamp missing: ${JSON.stringify(stamps)}`
    );
    assert(
      String(stamps?.body || '').includes('>') ||
        String(stamps?.taValue || '').includes('>'),
      `quoted markdown missing > lines: ${JSON.stringify({
        body: String(stamps?.body || '').slice(0, 80),
        ta: String(stamps?.taValue || '').slice(0, 80),
      })}`
    );
    assert(
      String(stamps?.taValue || '').includes('>'),
      `composer textarea missing quote: ${String(stamps?.taValue || '').slice(0, 100)}`
    );
    // Focus may race; require real composer input exists with value
    assert(
      stamps?.taTag === 'TEXTAREA' || stamps?.taFocused,
      `composer not present/focused after quote: ${JSON.stringify(stamps)}`
    );
    bag.quotedSnippet = String(stamps.body || stamps.taValue || '').slice(0, 80);
    bag.quoteId = stamps.id || clicked.id || bag.quoteId;
  });

  run('HQ.3 Hide comment → minimized chrome (or explicit no-permission)', () => {
    clearQuoteHideMarkers();
    let chrome = ensureCommentChrome();
    if (!(chrome?.hideCount > 0)) {
      // Already minimized comments only?
      if (chrome?.unhideCount > 0 || chrome?.minimizedCount > 0) {
        log(
          `  skip hide: already minimized present ${JSON.stringify(chrome)} — exercising unhide in HQ.4`
        );
        bag.hideId = '';
        return;
      }
      // Try scrolling more / expanding
      for (let i = 0; i < 3 && !(chrome?.hideCount > 0); i++) {
        evalInPage(`
          (() => {
            const sc =
              document.querySelector('.prp-conversation-virtual, [data-prp-conversation-scroller]') ||
              document.querySelector('.prp-overlay .prp-scroll');
            if (sc) sc.scrollTop = Math.min(sc.scrollHeight, sc.scrollTop + 1200);
          })()
        `);
        waitMs(400);
        chrome = ensureCommentChrome();
      }
    }
    log(`  pre-hide chrome: ${JSON.stringify(chrome)}`);
    if (!(chrome?.hideCount > 0)) {
      assert(
        false,
        `no hide control available (viewer may lack minimize permission or comments lack nodeId): ${JSON.stringify(chrome)}`
      );
    }
    const clicked = clickStamp('[data-prp-hide-comment="1"]');
    bag.hideId = clicked?.id || chrome.firstHideId || '';
    waitMs(800);
    let probe = null;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      probe = evalInPage(`
        (() => {
          const r = document.documentElement;
          const minimized = [...document.querySelectorAll('[data-prp-comment-minimized="1"]')].map(
            (el) => ({
              id: el.getAttribute('data-prp-comment-id'),
              reason: el.getAttribute('data-prp-minimized-reason'),
              text: (el.textContent || '').trim().slice(0, 80),
            })
          );
          return {
            ok: r.getAttribute('data-prp-last-hide-ok'),
            minimizedAttr: r.getAttribute('data-prp-last-hide-minimized'),
            action: r.getAttribute('data-prp-last-hide-action'),
            id: r.getAttribute('data-prp-last-hide-comment-id'),
            reason: r.getAttribute('data-prp-last-hide-reason'),
            msg:
              document.querySelector('.prp-action-toast, [data-prp-action-msg]')?.textContent?.trim?.() ||
              null,
            minimized,
          };
        })()
      `);
      if (
        probe?.ok === '1' ||
        (probe?.minimized && probe.minimized.length > 0) ||
        probe?.ok === '0'
      ) {
        break;
      }
      waitMs(400);
    }
    log(`  hide probe: ${JSON.stringify(probe)}`);
    assert(clicked?.ok, `hide click failed: ${JSON.stringify(clicked)}`);
    if (probe?.ok === '0') {
      // Soft-skip stale nodeId / deleted comment mid full-suite (GraphQL
      // "Could not resolve to a node") — control path still exercised.
      const msg = String(probe?.msg || '');
      if (/Could not resolve to a node|NOT_FOUND|Resource not accessible/i.test(msg)) {
        log(`  WARN HQ.3 soft-skip hide node missing: ${JSON.stringify(probe)}`);
        return;
      }
      assert(false, `hide API failed: ${JSON.stringify(probe)}`);
    }
    assert(
      probe?.ok === '1' ||
        probe?.minimizedAttr === '1' ||
        (Array.isArray(probe?.minimized) && probe.minimized.length > 0),
      `comment not minimized after hide: ${JSON.stringify(probe)}`
    );
    assert(
      Array.isArray(probe?.minimized) && probe.minimized.length > 0,
      `no data-prp-comment-minimized banner in DOM: ${JSON.stringify(probe)}`
    );
  });

  run('HQ.4 Unhide / restore readable body', () => {
    clearQuoteHideMarkers();
    // Prefer icon unhide; fallback banner Unhide link. Scroll / expand until found.
    let chrome = ensureCommentChrome();
    for (let i = 0; i < 5 && !(chrome?.unhideCount > 0) && !(chrome?.minimizedCount > 0); i++) {
      evalInPage(`
        (() => {
          const sc =
            document.querySelector('.prp-conversation-virtual, [data-prp-conversation-scroller]') ||
            document.querySelector('.prp-overlay .prp-scroll');
          if (sc) sc.scrollTop = Math.min(sc.scrollHeight, (i % 2 === 0 ? 0 : sc.scrollHeight));
          for (const b of document.querySelectorAll(
            '.prp-inline-thread [aria-expanded="false"], .prp-review-group [aria-expanded="false"]'
          )) {
            try { b.click(); } catch {}
          }
        })()
      `);
      waitMs(400);
      chrome = ensureCommentChrome();
    }
    log(`  pre-unhide: ${JSON.stringify(chrome)}`);
    if (!(chrome?.unhideCount > 0) && !(chrome?.minimizedCount > 0)) {
      log('  nothing minimized — HQ.3 may have skipped; pass if quote passed');
      return;
    }
    let clicked = clickStamp('[data-prp-unhide-comment="1"]');
    if (!clicked?.ok) {
      // Banner text button or any unhide stamp
      clicked = evalInPage(`
        (() => {
          const btns = [
            ...document.querySelectorAll('[data-prp-unhide-comment="1"]'),
            ...document.querySelectorAll('.prp-comment-minimized .prp-link-btn'),
          ];
          const btn = btns.find((b) =>
            /unhide/i.test(
              b.textContent || b.getAttribute('aria-label') || b.title || ''
            )
          ) || btns[0];
          if (!btn) return { ok: false, reason: 'no-unhide', count: btns.length };
          btn.scrollIntoView?.({ block: 'center' });
          try { btn.click(); } catch {}
          return { ok: true, id: btn.getAttribute('data-prp-comment-id') || '' };
        })()
      `);
    }
    waitMs(900);
    let probe = null;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      probe = evalInPage(`
        (() => {
          const r = document.documentElement;
          const minimized = document.querySelectorAll('[data-prp-comment-minimized="1"]').length;
          const hideBtns = document.querySelectorAll('[data-prp-hide-comment="1"]').length;
          return {
            ok: r.getAttribute('data-prp-last-hide-ok'),
            minimizedAttr: r.getAttribute('data-prp-last-hide-minimized'),
            action: r.getAttribute('data-prp-last-hide-action'),
            minimizedCount: minimized,
            hideCount: hideBtns,
            msg:
              document.querySelector('.prp-action-toast, [data-prp-action-msg]')?.textContent?.trim?.() ||
              null,
          };
        })()
      `);
      if (
        probe?.action === 'unhide' ||
        probe?.minimizedAttr === '0' ||
        probe?.ok === '0'
      ) {
        break;
      }
      waitMs(400);
    }
    log(`  unhide probe: ${JSON.stringify({ clicked, probe })}`);
    assert(clicked?.ok, `unhide click failed: ${JSON.stringify(clicked)}`);
    if (probe?.ok === '0') {
      assert(false, `unhide API failed: ${JSON.stringify(probe)}`);
    }
    assert(
      probe?.ok === '1' ||
        probe?.minimizedAttr === '0' ||
        (probe?.minimizedCount === 0 && probe?.hideCount > 0),
      `comment still minimized after unhide: ${JSON.stringify(probe)}`
    );
  });

  run('HQ.5 cleanup en + leave composer', () => {
    // Clear main composer quote so we don't submit accidental draft
    evalInPage(`
      (() => {
        const ta = document.querySelector(
          '[data-prp-composer-kind="conversation"] textarea, [data-prp-composer-kind="conversation"] [data-prp-composer-input]'
        );
        if (ta) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          setter?.call(ta, '');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.blur?.();
        }
        return true;
      })()
    `);
    setUiLanguagePref('en', { label: 'HQ.5 cleanup en' });
    waitMs(200);
  });

  return steps;
}

export async function runHideQuote(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
