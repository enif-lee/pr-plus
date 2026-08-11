#!/usr/bin/env node
/**
 * Real-path deep-link probe for issue comment hashes on PR #19 (was #7).
 *
 *   COMMENT_ID=5175738702 node scripts/probe-deeplink-4743059284.mjs
 *   COMMENT_ID=4743059284 node scripts/probe-deeplink-4743059284.mjs  # goal URL (may 404 on GH)
 *
 * Exit 0 only when comment is kb-focused AND in viewport.
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

const COMMENT_ID = String(process.env.COMMENT_ID || '4743059284');
const TARGET_URL =
  process.env.TARGET_URL ||
  `https://github.com/enif-lee/pr-plus/pull/19#issuecomment-${COMMENT_ID}`;
const BUDGET_MS = Number(process.env.BUDGET_MS || 30_000);

function probe() {
  return evalInPage(`
    (() => {
      const id = ${JSON.stringify(COMMENT_ID)};
      const overlay = !!document.querySelector('.prp-overlay');
      const layout =
        document.querySelector('.prp-overlay')?.getAttribute('data-layout') || null;
      const href = (location.href || '').slice(0, 200);
      const hash = (location.hash || '').slice(0, 80);
      const stampFocused =
        document.documentElement.getAttribute('data-prp-focused-conv-anchor') || '';
      const stampPending =
        document.documentElement.getAttribute('data-prp-pending-conv-anchor') || '';
      const isKbFocused = (el) => {
        if (!el) return false;
        if (
          el.classList?.contains?.('prp-card--kb-focus') ||
          el.classList?.contains?.('prp-conversation-kb-focus')
        )
          return true;
        return !!(
          el.closest?.(
            '.prp-card--kb-focus, .prp-conversation-kb-focus'
          ) ||
          el.querySelector?.(
            '.prp-card--kb-focus, .prp-conversation-kb-focus'
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
      const anchor = 'issue-comment:' + id;
      const pick = document.querySelector(
        '[data-search-anchor="' + anchor + '"]'
      );
      const stampMatch = stampFocused === anchor;
      const pendingMatch = stampPending === anchor;
      const focused = !!(pick && isKbFocused(pick)) || stampMatch;
      const inView = pick ? inViewport(pick) : false;
      const mountedIssue = document.querySelectorAll(
        '[data-search-anchor^="issue-comment:"]'
      ).length;
      return {
        ok: focused && inView && overlay,
        reason: !overlay
          ? 'no-overlay'
          : !pick
            ? 'anchor-missing'
            : !focused
              ? pendingMatch
                ? 'still-pending'
                : 'not-kb-focused'
              : !inView
                ? 'not-in-view'
                : 'ok',
        overlay,
        layout,
        href,
        hash,
        stampFocused,
        stampPending,
        stampMatch,
        pendingMatch,
        focused,
        inView,
        pick: pick
          ? {
              anchor: pick.getAttribute('data-search-anchor'),
              cls: String(pick.className || '').slice(0, 120),
              top: Math.round(pick.getBoundingClientRect().top),
              h: Math.round(pick.getBoundingClientRect().height),
            }
          : null,
        mountedIssue,
      };
    })()
  `);
}

async function main() {
  log(`=== deeplink probe start id=${COMMENT_ID} ===`);
  log(`  url=${TARGET_URL}`);
  ensureBrowser();

  // Close any open overlay so the next open is a cold deep-link
  try {
    evalInPage(`
      (() => {
        document.querySelector('.prp-overlay [aria-label="Close"]')?.click?.();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return true;
      })()
    `);
    waitMs(400);
  } catch {
    /* ignore */
  }

  // Cold navigate with full hash — host mergePathTargetWithUriRoute reads it
  open(TARGET_URL);
  waitMs(1000);
  waitContentInject({ timeoutMs: 15_000, label: 'deeplink inject' });
  clickPrPlusToggleIfNeeded();
  waitMs(800);
  try {
    waitDetailReady({ meta: true, files: false, label: 'deeplink detail' });
  } catch (e) {
    log(`  waitDetailReady soft: ${e?.message || e}`);
  }
  waitMs(500);

  let last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < BUDGET_MS) {
    last = probe();
    log(
      `  t=${Date.now() - t0}ms probe=${JSON.stringify({
        ok: last?.ok,
        reason: last?.reason,
        focused: last?.focused,
        inView: last?.inView,
        stampFocused: last?.stampFocused,
        stampPending: last?.stampPending,
        mountedIssue: last?.mountedIssue,
        pickTop: last?.pick?.top,
        hash: last?.hash,
      })}`
    );
    if (last?.ok) break;
    waitMs(400);
  }

  log(`  final: ${JSON.stringify(last)}`);
  if (!last?.ok) {
    log(`FAIL: deep-link restore did not focus+scroll comment ${COMMENT_ID}`);
    process.exit(1);
  }
  log(`PASS: issue-comment:${COMMENT_ID} focused and in viewport`);
  process.exit(0);
}

main().catch((e) => {
  log(`FATAL: ${e?.stack || e}`);
  process.exit(1);
});
