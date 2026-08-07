#!/usr/bin/env node
/**
 * Deep-link restore when the target is already loaded but scrolled off-screen,
 * and when re-applying a hash on an open modal (soft-nav).
 */
import {
  clickPrPlusToggleIfNeeded,
  ensureBrowser,
  evalInPage,
  log,
  open,
  waitContentInject,
  waitDetailReady,
  waitMs,
} from '../tests/e2e/lib/harness.mjs';

const PR = process.env.PR_URL || 'https://github.com/enif-lee/pr-plus/pull/7';
const BUDGET_MS = Number(process.env.BUDGET_MS || 20_000);

function probe(id) {
  return evalInPage(`
    (() => {
      const id = ${JSON.stringify(String(id))};
      const stamp =
        document.documentElement.getAttribute('data-prp-focused-conv-anchor') || '';
      const pending =
        document.documentElement.getAttribute('data-prp-pending-conv-anchor') || '';
      const pick = document.querySelector(
        '[data-search-anchor="issue-comment:' + id + '"]'
      );
      const sc = document.querySelector('.prp-conversation-virtual');
      const r = pick?.getBoundingClientRect();
      const s = sc?.getBoundingClientRect();
      let inView = false;
      if (r && s) {
        const visible = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
        inView = visible > Math.min(48, Math.max(20, (r.height || 1) * 0.15));
      }
      const focused =
        stamp === 'issue-comment:' + id ||
        !!pick?.classList?.contains?.('prp-card--kb-focus') ||
        !!pick?.closest?.('.prp-card--kb-focus');
      return {
        ok: focused && inView,
        focused,
        inView,
        stamp,
        pending,
        top: r ? Math.round(r.top) : null,
        scrollTop: sc ? Math.round(sc.scrollTop) : null,
        id,
      };
    })()
  `);
}

async function main() {
  log('=== deeplink offscreen probe ===');
  ensureBrowser();
  open(PR);
  waitMs(800);
  waitContentInject({ timeoutMs: 15_000, label: 'offscreen inject' });
  clickPrPlusToggleIfNeeded();
  waitDetailReady({ meta: true, files: false, label: 'offscreen detail' });
  waitMs(1200);

  const ids = evalInPage(`
    (() => {
      const issues = [...document.querySelectorAll('[data-search-anchor^="issue-comment:"]')]
        .map((el) => el.getAttribute('data-search-anchor').replace('issue-comment:', ''));
      return { issues, n: issues.length };
    })()
  `);
  log(`  issue anchors: ${JSON.stringify(ids)}`);
  const target = ids?.issues?.[ids.issues.length - 1] || ids?.issues?.[0];
  if (!target) {
    log('FAIL: no issue comments mounted');
    process.exit(1);
  }

  // Scroll to top so target is off-window
  evalInPage(`
    (() => {
      const sc = document.querySelector('.prp-conversation-virtual');
      if (sc) sc.scrollTop = 0;
      return sc?.scrollTop ?? null;
    })()
  `);
  waitMs(250);
  const before = probe(target);
  log(`  before: ${JSON.stringify(before)}`);

  const url = `${PR.replace(/#.*$/, '')}#issuecomment-${target}`;
  const applied = evalInPage(`
    (() => {
      const target = ${JSON.stringify(url)};
      try {
        history.replaceState(history.state || null, '', target);
      } catch (e) {
        return { ok: false, err: String(e && e.message || e) };
      }
      document.dispatchEvent(new CustomEvent('soft-nav:end', { bubbles: true }));
      try { window.dispatchEvent(new PopStateEvent('popstate')); } catch {}
      return { ok: true, href: location.href.slice(0, 160), hash: location.hash };
    })()
  `);
  log(`  apply: ${JSON.stringify(applied)}`);

  let last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < BUDGET_MS) {
    last = probe(target);
    log(`  t=${Date.now() - t0}ms ${JSON.stringify(last)}`);
    if (last?.ok) break;
    waitMs(400);
  }

  if (!last?.ok) {
    log(`FAIL: off-screen deep-link did not focus+scroll ${target}`);
    process.exit(1);
  }
  log(`PASS: off-screen issue-comment:${target} focused and in view`);
  process.exit(0);
}

main().catch((e) => {
  log(`FATAL: ${e?.stack || e}`);
  process.exit(1);
});
