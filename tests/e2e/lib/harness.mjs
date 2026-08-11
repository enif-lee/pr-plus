/**
 * Shared e2e harness for pr+ modal scenarios.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ab,
  clearPrPlusIdb,
  clearPrPlusSessionStorage,
  closeAll,
  ensureSingleTab,
  evalInPage,
  open,
  press as abPress,
  waitFor,
  waitMs,
  waitNetwork,
  ROOT,
} from './ab.mjs';
import {
  ensureSharedSession,
  teardownSharedSession,
} from './session.mjs';

export const REPO = 'enif-lee/pr-plus';
export const PULLS_URL = `https://github.com/${REPO}/pulls`;
/** Preferred multi-thread conversation / keyboard PR (open). Was #7 (closed; reaction-locked). */
export const DEMO_PR = 19;
/**
 * Large architecture PR for heavy diff scroll.
 * Merged — not on default open /pulls; open via closed PR URL.
 */
export const HEAVY_PR = 14;
/** Multi-hunk expand chrome (open) */
export const MULTI_HUNK_PR = 13;
/**
 * Empty-commit-only PR (changedFiles: 0) — Diff layout must stay gated.
 * Fixture: demo/empty-commits-fixture branch; do not add file changes.
 */
export const EMPTY_DIFF_PR = 17;

export function prUrl(n) {
  return `https://github.com/${REPO}/pull/${Number(n)}`;
}

/** Click native-page pr+ toggle if overlay is not already open. */
export function clickPrPlusToggleIfNeeded() {
  return evalInPage(`
    (() => {
      if (document.querySelector('.prp-overlay')) return { already: true };
      const btn =
        document.querySelector('.prp-gh-open-toggle') ||
        document.getElementById('prp-gh-open-toggle');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      // Host may exist without overlay yet (autoOpenEmbed mid-mount, or stale
      // embed shell after close). Prefer re-click when toggle appears later.
      const host =
        document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      // Stale host without overlay: remove so auto-open / toggle can remount.
      if (host && !document.querySelector('.prp-overlay')) {
        const hasShell = !!(
          document.querySelector('.prp-header') ||
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('.prp-vlist')
        );
        if (!hasShell) {
          try {
            host.remove();
          } catch {
            /* ignore */
          }
          document.body?.classList?.remove?.('prp-embed-active');
          return { clicked: false, hasHost: true, clearedStaleHost: true };
        }
      }
      return { clicked: false, hasHost: !!host };
    })()
  `);
}

/**
 * After navigation / extension reload, wait until content inject is usable
 * (toggle, bridge hook, or host) so shell-open does not race SW restart.
 */
export function waitContentInject(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const label = opts.label || 'content inject';
  try {
    return waitFor(
      `
      const bridge =
        document.documentElement.getAttribute('data-prp-bridge') ||
        document.documentElement.getAttribute('data-prp-gql-cost-hook');
      const toggle =
        document.querySelector('.prp-gh-open-toggle') ||
        document.getElementById('prp-gh-open-toggle');
      const host =
        document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      const ov = document.querySelector('.prp-overlay');
      if (ov || toggle || bridge || host) {
        return {
          ok: true,
          via: ov ? 'overlay' : toggle ? 'toggle' : bridge ? 'bridge' : 'host',
        };
      }
      return false;
      `,
      { timeoutMs, intervalMs: 200, label }
    );
  } catch (e) {
    log(`  waitContentInject soft: ${e?.message || e}`);
    return { ok: false };
  }
}

/**
 * Snapshot host e2e load readiness from **page DOM** attributes.
 * Content-script `window.__prpE2eLoad` is isolated — agent-browser eval reads DOM.
 */
export function probeLoad() {
  return evalInPage(`
    (() => {
      const host =
        document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      const root = document.documentElement;
      let snap = null;
      try {
        const raw = host?.getAttribute('data-prp-e2e-load');
        if (raw) snap = JSON.parse(raw);
      } catch {}
      const metaReady =
        host?.getAttribute('data-prp-meta-ready') === '1' ||
        root.getAttribute('data-prp-meta-ready') === '1' ||
        snap?.metaReady === true;
      const filesReady =
        host?.getAttribute('data-prp-files-ready') === '1' ||
        root.getAttribute('data-prp-files-ready') === '1' ||
        snap?.filesReady === true;
      const loadBusy =
        host?.getAttribute('data-prp-load-busy') === '1' ||
        root.getAttribute('data-prp-load-busy') === '1' ||
        snap?.loadBusy === true;
      return {
        snap: snap
          ? { ...snap, metaReady, filesReady, loadBusy }
          : {
              metaReady,
              filesReady,
              loadBusy,
              filesCount: Number(host?.getAttribute('data-prp-files-count') || 0),
              number: host?.getAttribute('data-prp-load-number')
                ? Number(host.getAttribute('data-prp-load-number'))
                : null,
              seq: host?.getAttribute('data-prp-load-seq')
                ? Number(host.getAttribute('data-prp-load-seq'))
                : null,
            },
        seq: host?.getAttribute('data-prp-load-seq') || snap?.seq || null,
        hostBusy: host?.getAttribute('data-prp-load-busy') ?? null,
        hostMeta: host?.getAttribute('data-prp-meta-ready') ?? null,
        hostFiles: host?.getAttribute('data-prp-files-ready') ?? null,
        overlay: !!document.querySelector('.prp-overlay'),
        layout:
          document.querySelector('.prp-overlay')?.getAttribute('data-layout') ||
          null,
      };
    })()
  `);
}

/**
 * Wait until PR detail load is ready for the next action/assert.
 * Reads page-visible data-prp-* attributes published by host.
 *
 * @param {{
 *   number?: number,
 *   files?: boolean,
 *   meta?: boolean,
 *   timeoutMs?: number,
 *   label?: string,
 * }} [opts]
 */
/** Shell/detail ready failure ceiling (cold GH). Success exits early via poll. */
export const DETAIL_READY_TIMEOUT_MS = 30_000;
/** Poll interval for ready waits (local sleep). */
export const DETAIL_READY_INTERVAL_MS = 100;

export function waitDetailReady(opts = {}) {
  const n = opts.number != null ? Number(opts.number) : null;
  const needFiles = Boolean(opts.files);
  const needMeta = opts.meta !== false;
  const timeoutMs = opts.timeoutMs ?? DETAIL_READY_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? DETAIL_READY_INTERVAL_MS;
  const label =
    opts.label ||
    `detail ready${n != null ? ` #${n}` : ''}${needFiles ? ' +files' : ''}`;

  waitFor(
    `
    // Keep overlay mounted while polling
    if (!document.querySelector('.prp-overlay')) {
      const btn = document.querySelector('.prp-gh-open-toggle');
      if (btn) btn.click();
    }
    const ov = document.querySelector('.prp-overlay');
    if (!ov) return false;
    const host =
      document.getElementById('prp-page-embed') ||
      document.getElementById('prp-modal-host');
    const root = document.documentElement;
    let snap = null;
    try {
      const raw = host?.getAttribute('data-prp-e2e-load');
      if (raw) snap = JSON.parse(raw);
    } catch {}
    const metaReady =
      host?.getAttribute('data-prp-meta-ready') === '1' ||
      root.getAttribute('data-prp-meta-ready') === '1' ||
      snap?.metaReady === true;
    const filesReady =
      host?.getAttribute('data-prp-files-ready') === '1' ||
      root.getAttribute('data-prp-files-ready') === '1' ||
      snap?.filesReady === true;
    const loadBusy =
      host?.getAttribute('data-prp-load-busy') === '1' ||
      root.getAttribute('data-prp-load-busy') === '1' ||
      snap?.loadBusy === true;
    const numAttr = host?.getAttribute('data-prp-load-number');
    const number = numAttr != null ? Number(numAttr) : snap?.number;
    ${
      n != null
        ? `if (number != null && Number(number) !== ${n}) return false;`
        : ''
    }
    // Do not gate on loadBusy — open progress can lag (or stick) after shell paint.
    // metaReady reflects core shell interactive; progress bar is independent.
    ${needMeta ? `if (!metaReady) return false;` : ''}
    ${
      needFiles
        ? `
    const selectable = document.querySelectorAll(
      '.prp-vline--selectable:not(.prp-vline--header)'
    ).length;
    // Prefer product filesReady; accept painted selectables as settle fallback
    if (!filesReady && selectable < 1) return false;
    if (filesReady && selectable < 1) {
      // bodies ready but virtual list not painted yet — keep waiting
      return false;
    }
    `
        : ''
    }
    const loading = document.querySelector(
      '.prp-skeleton, [class*="LoadingSkeleton"], .prp-loading'
    );
    if (loading) return false;
    return !!(
      document.querySelector('.prp-header') ||
      document.querySelector('.prp-conversation-virtual') ||
      document.querySelector('.prp-vlist')
    );
    `,
    { timeoutMs, intervalMs, label }
  );
  const snap = probeLoad();
  log(
    `  waitDetailReady ok seq=${snap.seq} meta=${snap.snap?.metaReady} files=${snap.snap?.filesReady} filesCount=${snap.snap?.filesCount} busy=${snap.snap?.loadBusy}`
  );
  return snap;
}

/** Wait until pr+ overlay (modal or embed) is ready for a PR. */
export function waitPrShellReady(n, label) {
  // autoOpenEmbed may be off — open via toggle before waiting
  clickPrPlusToggleIfNeeded();
  const shellLabel = label || `PR #${n} shell mount`;
  try {
    waitFor(
      `
      // Retry toggle each poll if still no overlay
      if (!document.querySelector('.prp-overlay')) {
        const btn =
          document.querySelector('.prp-gh-open-toggle') ||
          document.getElementById('prp-gh-open-toggle');
        if (btn) btn.click();
        // Stale embed host without chrome: drop so re-inject can remount
        const host =
          document.getElementById('prp-page-embed') ||
          document.getElementById('prp-modal-host');
        if (host && !document.querySelector('.prp-header')) {
          try { host.remove(); } catch {}
          document.body?.classList?.remove?.('prp-embed-active');
        }
      }
      const ov = document.querySelector('.prp-overlay');
      if (!ov) return false;
      return !!(
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('.prp-vlist') ||
        document.querySelector('.prp-header')
      );
      `,
      {
        timeoutMs: DETAIL_READY_TIMEOUT_MS,
        intervalMs: DETAIL_READY_INTERVAL_MS,
        label: shellLabel,
      }
    );
  } catch (e) {
    // Extension reload / tab drop: one hard re-open before failing the suite.
    const msg = String(e?.message || e);
    log(`  waitPrShellReady retry after: ${msg.slice(0, 160)}`);
    open(prUrl(n));
    ensureSingleTab();
    waitNetwork();
    waitMs(400);
    waitContentInject({ label: `${shellLabel} inject-retry` });
    clickPrPlusToggleIfNeeded();
    waitFor(
      `
      if (!document.querySelector('.prp-overlay')) {
        const btn =
          document.querySelector('.prp-gh-open-toggle') ||
          document.getElementById('prp-gh-open-toggle');
        if (btn) btn.click();
      }
      const ov = document.querySelector('.prp-overlay');
      if (!ov) return false;
      return !!(
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('.prp-vlist') ||
        document.querySelector('.prp-header')
      );
      `,
      {
        timeoutMs: DETAIL_READY_TIMEOUT_MS,
        intervalMs: DETAIL_READY_INTERVAL_MS,
        label: `${shellLabel} (retry)`,
      }
    );
  }
  // Data: wait for meta/core settle via host e2e load hook (not fixed sleep).
  waitDetailReady({
    number: n,
    meta: true,
    files: false,
    label: label || `PR #${n} detail meta ready`,
  });
}

export function log(msg) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[e2e ${t}] ${msg}`);
}

/**
 * Flush SW GraphQL cost log into page sessionStorage (via content-script event),
 * then return { summary, log } for observation. Safe if extension absent.
 * @param {{ label?: string, logEntries?: boolean }} [opts]
 */
export function dumpGraphqlCostLog(opts = {}) {
  const label = opts.label || 'gql-cost';
  try {
    evalInPage(
      `document.dispatchEvent(new CustomEvent('prp-flush-gql-cost', { bubbles: true })); true`
    );
  } catch {
    /* ignore */
  }
  // Content script async sendMessage + SW — poll until ready (or timeout).
  // Flush is CustomEvent → content-bridge → SW; needs more than one tick after reload.
  let summary = null;
  let logEntries = [];
  let err = null;
  let hook = null;
  try {
    let snap = null;
    const flushDeadline = Date.now() + 2500;
    while (Date.now() < flushDeadline) {
      snap = evalInPage(`(() => {
        try {
          return {
            summary: JSON.parse(sessionStorage.getItem('prp:gql-cost-summary') || 'null'),
            log: JSON.parse(sessionStorage.getItem('prp:gql-cost-log') || '[]'),
            err: sessionStorage.getItem('prp:gql-cost-err'),
            hook: document.documentElement.getAttribute('data-prp-gql-cost-hook'),
            ready: document.documentElement.getAttribute('data-prp-gql-cost-ready'),
          };
        } catch (e) {
          return { summary: null, log: [], err: String(e), hook: null, ready: null };
        }
      })()`);
      const hasOps =
        Array.isArray(snap?.summary?.byOp) && snap.summary.byOp.length > 0;
      if (
        snap?.ready === '1' ||
        snap?.ready === 1 ||
        hasOps ||
        (Array.isArray(snap?.log) && snap.log.length > 0)
      ) {
        break;
      }
      // Re-dispatch flush while waiting (listener may register after first event)
      try {
        evalInPage(
          `document.dispatchEvent(new CustomEvent('prp-flush-gql-cost', { bubbles: true })); true`
        );
      } catch {
        /* ignore */
      }
      waitMs(80);
    }
    summary = snap?.summary ?? null;
    logEntries = Array.isArray(snap?.log) ? snap.log : [];
    err = snap?.err || null;
    hook = snap?.hook || null;
    if (snap?.ready) log(`  [${label}] flush ready=${snap.ready} hook=${hook || '?'}`);
  } catch {
    summary = null;
  }
  if (err) {
    log(`  [${label}] gql-cost err: ${String(err).slice(0, 200)}`);
  }
  if (!hook) {
    log(
      `  [${label}] WARN: data-prp-gql-cost-hook missing — content-bridge may be stale; hard-relaunch browser after rebuild`
    );
  }
  const totalCost = Number(summary?.totalCost) || 0;
  const totalCalls = Number(summary?.totalCalls) || logEntries.length || 0;
  const top = Array.isArray(summary?.byOp) ? summary.byOp.slice(0, 12) : [];
  log(
    `  [${label}] GraphQL primary points: totalCost=${totalCost} calls=${totalCalls}` +
      (summary?.unknownCostCalls
        ? ` unknownCost=${summary.unknownCostCalls}`
        : '')
  );
  for (const row of top) {
    log(
      `  [${label}]   op=${row.op} cost=${row.cost} calls=${row.calls} avg=${row.avgCost} max=${row.maxCost} avgMs=${row.avgMs}`
    );
  }
  if (logEntries.length) {
    // Per-call lines (capped) so suite logs show real burdens
    const sample = logEntries.slice(-40);
    for (const e of sample) {
      log(
        `  [${label}]   · cost=${e.cost ?? '?'} op=${e.op}` +
          (e.ms != null ? ` ${e.ms}ms` : '') +
          (e.remaining != null ? ` rem=${e.remaining}` : '') +
          (e.vars && Object.keys(e.vars).length
            ? ` ${JSON.stringify(e.vars)}`
            : '') +
          (e.ok === false ? ` FAIL` : '')
      );
    }
  }
  return { summary, log: logEntries, totalCost, totalCalls, err, hook };
}

/** Clear SW + page GraphQL cost observation log. */
export function clearGraphqlCostLog() {
  try {
    evalInPage(
      `document.dispatchEvent(new CustomEvent('prp-clear-gql-cost')); true`
    );
  } catch {
    /* ignore */
  }
  try {
    evalInPage(`sessionStorage.removeItem('prp:gql-cost-log');
      sessionStorage.removeItem('prp:gql-cost-summary'); true`);
  } catch {
    /* ignore */
  }
  waitMs(100);
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function assertInRange(n, lo, hi, label) {
  assert(
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi,
    `${label}: expected ${lo}..${hi}, got ${n}`
  );
}

/**
 * @template T
 * @param {string} name
 * @param {() => T | Promise<T>} fn
 */
export async function step(name, fn) {
  log(`→ ${name}`);
  const t0 = Date.now();
  try {
    const out = await fn();
    log(`✓ ${name} (${Date.now() - t0}ms)`);
    return out;
  } catch (e) {
    log(`✗ ${name} (${Date.now() - t0}ms)`);
    throw e;
  }
}

/**
 * Ensure browser for e2e (shared session by default).
 * Reuses Chrome when already open; soft-resets IDB/session + single tab.
 * @param {{ forceRelaunch?: boolean }} [opts]
 */
export function ensureBrowser(opts = {}) {
  if (opts.forceRelaunch) {
    teardownSharedSession();
  }
  ensureSharedSession(opts.forceRelaunch ? 'force-relaunch' : 'ensureBrowser');
}

/**
 * After Diff layout, wait until file tree and/or code rows exist.
 * Prefers host `__prpE2eLoad.filesReady`, then DOM selectable rows.
 */
export function waitDiffFilesReady(label) {
  // First: product load hook (files bodies + meta not busy)
  try {
    waitDetailReady({
      files: true,
      meta: true,
      timeoutMs: 35_000,
      label: label || 'Diff detail+files ready',
    });
  } catch {
    /* fall through to DOM-only wait */
  }
  waitFor(
    `
    const host =
      document.getElementById('prp-page-embed') ||
      document.getElementById('prp-modal-host');
    const filesReady =
      host?.getAttribute('data-prp-files-ready') === '1' ||
      document.documentElement.getAttribute('data-prp-files-ready') === '1';
    const loadBusy =
      host?.getAttribute('data-prp-load-busy') === '1' ||
      document.documentElement.getAttribute('data-prp-load-busy') === '1';
    const selectableHook = document.querySelectorAll(
      '.prp-vline--selectable:not(.prp-vline--header)'
    ).length;
    // Product says files have patch bodies and paint has code rows
    if (filesReady && !loadBusy && selectableHook > 0) {
      return true;
    }
    const tree = document.querySelectorAll(
      '.prp-filetree__row, .prp-filetree__item, .prp-filetree a, .prp-filetree [data-path]'
    ).length;
    const spacer = document.querySelector('.prp-vlist__spacer');
    const spacerH = spacer ? Number(spacer.offsetHeight) || 0 : 0;
    const selectable = document.querySelectorAll(
      '.prp-vline--selectable:not(.prp-vline--header)'
    ).length;
    const bodyText = (document.querySelector('.prp-vlist')?.innerText || '');
    const emptyBinary =
      /this file is empty/i.test(bodyText) ||
      (/\\bbinary\\b/i.test(bodyText) && selectable === 0);
    if (emptyBinary && selectable === 0) return false;
    if (selectable > 0) return true;
    if (tree > 0 && spacerH > 50 && selectable > 0) return true;
    return false;
    `,
    {
      timeoutMs: 25_000,
      label: label || 'Diff files/code ready',
    }
  );
}

export function openPulls() {
  open(PULLS_URL); // open() already collapses to a single tab
  waitNetwork();
  waitMs(500);
  // Profile can restore tabs after first paint — enforce solo tab again.
  const solo = ensureSingleTab();
  if (solo.closed > 0) {
    log(`  closed ${solo.closed} extra tab(s); kept ${solo.kept}`);
  }
  const title = evalInPage(`document.title`);
  assert(/pull/i.test(String(title)) || locationOk(), `expected pulls page, title=${title}`);
}

function locationOk() {
  return evalInPage(`location.pathname.includes('/pulls')`);
}

/** Close pr+ overlay if present (Esc cascade). */
export function closeOverlay() {
  // Prefer product chrome close so host closeModal runs (list resync + session
  // wipe). Escape alone can race GH palette ownership and leave host open.
  // requestClose animates ~280ms before calling onClose — wait past that.
  for (let i = 0; i < 4; i++) {
    const open = evalInPage(`!!document.querySelector('.prp-overlay')`);
    if (!open) return;
    const clicked = evalInPage(`
      (() => {
        // Prefer exact modal Close (not "Close pull request")
        const btn =
          document.querySelector(
            '.prp-overlay button[aria-label="Close"]'
          ) ||
          [...document.querySelectorAll('.prp-overlay button')].find((b) => {
            const lab = (b.getAttribute('aria-label') || '').trim();
            return lab === 'Close';
          });
        if (btn) {
          btn.click();
          return { ok: true, via: 'close-btn' };
        }
        return { ok: false };
      })()
    `);
    if (!clicked?.ok) press('Escape');
    // Allow exit animation + host onClose (sheet 240ms / modal 280ms)
    waitMs(450);
  }
  // Last resort: only force-remove if still open after product close attempts
  const still = evalInPage(`!!document.querySelector('.prp-overlay')`);
  if (still) {
    // One more Escape + longer wait before DOM destroy
    press('Escape');
    waitMs(500);
  }
  const still2 = evalInPage(`!!document.querySelector('.prp-overlay')`);
  if (still2) {
    evalInPage(`document.querySelector('.prp-overlay')?.remove(); document.body.style.overflow=''; true`);
  }
}

/**
 * Open a closed/merged PR by direct GitHub URL (autoOpenEmbed or in-page shell).
 * Use when the PR is not on the default open /pulls list.
 * When autoOpenEmbed is off, clicks `.prp-gh-open-toggle` before waiting.
 * @param {number} n
 */
export function openPrByUrl(n) {
  closeOverlay();
  open(prUrl(n)); // single-tab policy via open()
  ensureSingleTab();
  waitNetwork();
  // After chrome.runtime.reload / soft reset, content inject can lag past load.
  waitContentInject({ label: `PR #${n} inject`, timeoutMs: 12_000 });
  waitMs(200);
  let t = clickPrPlusToggleIfNeeded();
  if (t?.clearedStaleHost) {
    waitMs(300);
    waitContentInject({ label: `PR #${n} inject after stale clear`, timeoutMs: 8_000 });
    t = clickPrPlusToggleIfNeeded();
  }
  if (t && !t.already) {
    log(`  PR #${n} open via URL — pr+ toggle ${JSON.stringify(t)}`);
  }
  waitPrShellReady(n, `PR #${n} via URL shell ready`);
}

/**
 * Open a PR by number.
 * - Default: click titled link on open /pulls (content-script intercept).
 * - `viaUrl: true` or missing list link: navigate to `/pull/{n}` (closed/merged OK).
 * @param {number} n
 * @param {{ viaUrl?: boolean }} [opts]
 */
export function openPr(n, opts = {}) {
  if (opts.viaUrl) {
    openPrByUrl(n);
    return;
  }
  closeOverlay();
  // Ensure on pulls
  if (!evalInPage(`location.pathname.includes('/pulls')`)) {
    openPulls();
  }
  const clicked = evalInPage(`
    (() => {
      const href = '/enif-lee/pr-plus/pull/${n}';
      const a = [...document.querySelectorAll('a[href]')].find((el) => {
        const h = el.getAttribute('href') || '';
        if (!(h === href || h.startsWith(href + '#') || h.startsWith(href + '?'))) return false;
        const t = (el.textContent || '').trim();
        return t.length > 2; // prefer titled link over empty icon
      });
      if (!a) return { ok: false };
      a.click();
      return { ok: true, text: (a.textContent || '').trim().slice(0, 80) };
    })()
  `);
  if (!clicked?.ok) {
    // Closed/merged (or pagination): fall back to PR URL
    log(`  PR #${n} not on open pulls list — opening ${prUrl(n)}`);
    openPrByUrl(n);
    return;
  }
  waitPrShellReady(n, `PR #${n} modal ready`);
}

export function layout() {
  return evalInPage(`document.querySelector('.prp-overlay')?.getAttribute('data-layout') || null`);
}

export function setLayout(target) {
  // target: 'conversation' | 'diff'
  for (let i = 0; i < 3; i++) {
    const cur = layout();
    if (cur === target) break;
    press('Alt+.');
    waitMs(300);
  }
  // Fallback: header layout toggle button (when chord delivery is flaky)
  if (layout() !== target) {
    evalInPage(`document.querySelector('.prp-header__icon-btn--layout')?.click()`);
    waitMs(300);
  }
  assert(layout() === target, `expected layout=${target}, got ${layout()}`);
  // Wait for data required by that layout (hook-driven, not fixed sleep)
  if (target === 'diff') {
    waitDiffFilesReady(`layout=${target} files ready`);
  } else {
    waitDetailReady({
      meta: true,
      files: false,
      label: `layout=${target} meta ready`,
    });
  }
}

export function modalProbe() {
  return evalInPage(`
    (() => {
      const ov = document.querySelector('.prp-overlay');
      if (!ov) return { overlay: false };
      let cssRules = 0;
      let cssHref = null;
      for (const s of document.styleSheets) {
        try {
          if (s.href && s.href.includes('pr-modal.css')) {
            cssRules = s.cssRules?.length || 0;
            cssHref = s.href;
          }
        } catch {}
      }
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          display: s.display,
          visibility: s.visibility,
          bg: s.backgroundColor,
        };
      };
      return {
        overlay: true,
        layout: ov.getAttribute('data-layout'),
        theme: ov.className.includes('prp-theme-dark') ? 'dark' : 'light',
        cssRules,
        cssHref: cssHref ? 'pr-modal.css' : null,
        header: pick('.prp-header'),
        merge: pick('.prp-merge-box'),
        conv: pick('.prp-conversation-virtual'),
        aside: pick('.prp-conversation__aside'),
        filetree: pick('.prp-filetree'),
        vlist: pick('.prp-vlist'),
        toolbar: pick('.prp-diff-toolbar'),
        cards: document.querySelectorAll('.prp-card').length,
        title: document.querySelector('.prp-header h2')?.textContent?.trim()?.slice(0, 100) || null,
      };
    })()
  `);
}

/** Focus ring selector: cards, merge host, and in-group thread rows. */
const CONV_KB_FOCUS_SEL =
  '.prp-card--kb-focus, .prp-merge-box-focus-host--focused, .prp-review-group__row--kb-focus, [class*="kb-focus"]';

export function convFocusPin() {
  return evalInPage(`
    (() => {
      const focused = document.querySelector(${JSON.stringify(CONV_KB_FOCUS_SEL)});
      const scrollEl = document.querySelector('.prp-conversation-virtual');
      if (!focused || !scrollEl) {
        return { hasFocus: !!focused, pin: null, scrollTop: scrollEl?.scrollTop ?? null, cardH: null };
      }
      const fr = focused.getBoundingClientRect();
      const sr = scrollEl.getBoundingClientRect();
      // Prefer inner focus anchor when the card itself is a tall review group.
      const anchor =
        focused.querySelector('[data-thread-focus-anchor], [data-search-anchor]') || focused;
      const ar = anchor.getBoundingClientRect();
      const pin = Math.round(ar.top - sr.top);
      const cardPin = Math.round(fr.top - sr.top);
      const cardH = Math.round(fr.height);
      const viewportH = Math.round(sr.height);
      const topClip = Math.max(0, -cardPin);
      const bottomClip = Math.max(0, cardPin + cardH - viewportH);
      // Matches VirtualConversationList maximize: whole short card preferred.
      // Allow a few px of chrome/subpixel clip before treating as "off-screen".
      const fullyVisible =
        cardH > 0 && topClip <= 8 && bottomClip <= 24;
      return {
        hasFocus: true,
        pin,
        cardPin,
        cardH,
        viewportH,
        topClip,
        bottomClip,
        fullyVisible,
        scrollTop: scrollEl.scrollTop,
        cls: focused.className.slice(0, 120),
      };
    })()
  `);
}

/**
 * Classify the current Conversation ⌥J/K focus stop.
 * @returns {{ hasFocus: boolean, kind: 'description'|'composer'|'merge'|'comment'|null, anchor: string|null, cls: string|null }}
 */
export function convFocusStop() {
  return evalInPage(`
    (() => {
      const f = document.querySelector(${JSON.stringify(CONV_KB_FOCUS_SEL)});
      if (!f) return { hasFocus: false, kind: null, anchor: null, cls: null };
      const a =
        f.getAttribute('data-search-anchor') ||
        f.getAttribute('data-thread-focus-anchor') ||
        f.querySelector?.('[data-search-anchor]')?.getAttribute('data-search-anchor') ||
        '';
      const cls = String(f.className || '').slice(0, 160);
      if (
        a === 'body' ||
        /\\bprp-card--desc\\b/.test(cls) ||
        f.closest?.('.prp-card--desc')
      ) {
        return { hasFocus: true, kind: 'description', anchor: 'body', cls };
      }
      if (
        a === 'composer' ||
        /\\bprp-composer-focus-host\\b/.test(cls) ||
        f.closest?.('.prp-composer-focus-host') ||
        f.closest?.('.prp-card--composer')
      ) {
        return { hasFocus: true, kind: 'composer', anchor: 'composer', cls };
      }
      if (
        a === 'merge' ||
        /\\bprp-merge-box-focus-host\\b/.test(cls) ||
        f.closest?.('.prp-merge-box-focus-host')
      ) {
        return { hasFocus: true, kind: 'merge', anchor: 'merge', cls };
      }
      return { hasFocus: true, kind: 'comment', anchor: a || null, cls };
    })()
  `);
}

/**
 * Infer reverseComments panel layout from DOM section tops.
 * reverse on: description → composer → merge → timeline
 * reverse off: description → timeline → merge → composer
 * @returns {{ reverseComments: boolean, descTop: number|null, composerTop: number|null, mergeTop: number|null, commentTop: number|null, sectionKinds: string[] }}
 */
export function convVisualSectionOrder() {
  return evalInPage(`
    (() => {
      const host = document.querySelector('.prp-conversation-virtual');
      if (!host) {
        return {
          reverseComments: true,
          descTop: null,
          composerTop: null,
          mergeTop: null,
          commentTop: null,
          sectionKinds: [],
        };
      }
      const absTop = (el) => {
        if (!el) return null;
        const hr = host.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        return Math.round(er.top - hr.top + host.scrollTop);
      };
      const desc =
        host.querySelector('[data-search-anchor="body"]') ||
        host.querySelector('.prp-card--desc');
      const composer =
        host.querySelector('[data-search-anchor="composer"]') ||
        host.querySelector('.prp-composer-focus-host') ||
        host.querySelector('.prp-card--composer');
      const merge =
        host.querySelector('[data-search-anchor="merge"]') ||
        host.querySelector('.prp-merge-box-focus-host');
      const comment =
        host.querySelector(
          '[data-search-anchor^="issue-comment:"], [data-search-anchor^="review:"], [data-search-anchor^="review-group:"], [data-search-anchor^="review-comment:"], .prp-card--timeline'
        );
      const descTop = absTop(desc);
      const composerTop = absTop(composer);
      const mergeTop = absTop(merge);
      const commentTop = absTop(comment);
      const parts = [];
      if (descTop != null) parts.push({ kind: 'description', top: descTop });
      if (composerTop != null) parts.push({ kind: 'composer', top: composerTop });
      if (mergeTop != null) parts.push({ kind: 'merge', top: mergeTop });
      if (commentTop != null) parts.push({ kind: 'comment', top: commentTop });
      parts.sort((a, b) => a.top - b.top);
      const sectionKinds = parts.map((p) => p.kind);
      let reverseComments = true;
      if (mergeTop != null && commentTop != null) {
        reverseComments = mergeTop < commentTop;
      } else if (composerTop != null && commentTop != null) {
        reverseComments = composerTop < commentTop;
      } else if (mergeTop != null && descTop != null) {
        // Merge close under description → reverse (composer sits between)
        reverseComments = mergeTop - descTop < 800;
      }
      return {
        reverseComments,
        descTop,
        composerTop,
        mergeTop,
        commentTop,
        sectionKinds,
      };
    })()
  `);
}

export function diffScroll() {
  return evalInPage(`
    (() => {
      const v = document.querySelector('.prp-vlist');
      if (!v) return null;
      return { scrollTop: v.scrollTop, clientHeight: v.clientHeight, scrollHeight: v.scrollHeight };
    })()
  `);
}

export function convScrollTop() {
  return evalInPage(`document.querySelector('.prp-conversation-virtual')?.scrollTop ?? null`);
}

export function activeFileLabel() {
  return evalInPage(`
    (() => {
      const t = [...document.querySelectorAll('.prp-filetree [class*="active"], .prp-filetree [aria-current]')]
        .map((e) => (e.textContent || '').trim())
        .find(Boolean);
      return t ? t.slice(0, 80) : null;
    })()
  `);
}

/** Snapshot of Diff line selection + island dock. */
export function selectionProbe() {
  return evalInPage(`
    (() => {
      // Body selection uses .prp-vline--selected; file-header caret uses
      // --header-selected / data-file-selected (plain ↑ from first body line).
      const selected = [
        ...document.querySelectorAll(
          '.prp-vline--selected, .prp-vline--header-selected, [data-file-selected="1"]'
        ),
      ];
      // De-dupe nodes that carry both selected + header-selected
      const uniq = [...new Set(selected)];
      const roles = {
        start: document.querySelectorAll('.prp-vline--sel-start').length,
        middle: document.querySelectorAll('.prp-vline--sel-middle').length,
        end: document.querySelectorAll('.prp-vline--sel-end').length,
        only: document.querySelectorAll('.prp-vline--sel-only').length,
      };
      const dock = document.querySelector('.prp-selection-dock, .prp-selection-group, .prp-selection-island');
      const commentPhase = !!document.querySelector('.prp-selection-island--comment, .prp-selection-island[data-phase="comment"]');
      const actionsPhase = !!document.querySelector(
        '.prp-selection-group[data-phase="actions"], .prp-selection-dock[data-phase="actions"]'
      );
      const fileTarget =
        dock?.getAttribute('data-file-target') === '1' ||
        !!document.querySelector('.prp-selection-group--file, .prp-selection-island--file');
      const btnLabels = [...(dock?.querySelectorAll('button') || [])]
        .map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      const headerSelected = !!document.querySelector(
        '.prp-vline--header.prp-vline--selected, .prp-vline--header-selected, [data-file-selected="1"]'
      );
      const headRole = document
        .querySelector('.prp-vline[data-sel-head="1"]')
        ?.getAttribute('data-sel-role') || null;
      const dockPlace = dock?.getAttribute('data-dock-place') || null;
      const optHintPlace = dock?.getAttribute('data-opt-hint-place') || null;
      const dockAbove = !!dock?.classList?.contains?.('prp-selection-dock--above');
      const hintPlacements = [...(dock?.querySelectorAll('kbd.prp-opt-btn-hint, .prp-opt-btn-hint') || [])]
        .map((el) => el.getAttribute('data-placement') || null)
        .filter(Boolean);
      return {
        count: uniq.length,
        roles,
        dock: !!dock,
        dockCls: dock?.className?.slice(0, 100) || null,
        dockPlace,
        optHintPlace,
        dockAbove,
        hintPlacements,
        commentPhase,
        actionsPhase,
        fileTarget,
        btnLabels,
        headerSelected,
        headRole,
      };
    })()
  `);
}

/** Fire plain ArrowLeft / ArrowRight (directed fold). */
export function pressArrowFold(dir) {
  const key = dir === 'right' || dir === 'expand' ? 'ArrowRight' : 'ArrowLeft';
  return evalInPage(`
    (() => {
      const t = document.documentElement;
      const opts = {
        key: '${key}',
        code: '${key}',
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      t.dispatchEvent(new KeyboardEvent('keydown', opts));
      t.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    })()
  `);
}

/** Header status badges (Draft / Merged / Closed). */
export function statusBadgeProbe() {
  return evalInPage(`
    (() => {
      const badges = [...document.querySelectorAll('.prp-badge')].map((b) => ({
        text: (b.textContent || '').trim(),
        cls: String(b.className || ''),
      }));
      return {
        badges,
        // Tone class is locale-stable; labels: en Merged / ko 머지됨 / ja マージ / zh 已合并
        hasMerged: badges.some(
          (b) =>
            b.cls.includes('prp-badge--merged') ||
            /merged|머지|マージ|已合并/i.test(b.text)
        ),
        hasClosed: badges.some(
          (b) =>
            (b.cls.includes('prp-badge--closed') || b.cls.includes('closed')) &&
            !b.cls.includes('prp-badge--merged') &&
            !/merged|머지|マージ|已合并/i.test(b.text)
        ),
        hasDraft: badges.some(
          (b) =>
            b.cls.includes('prp-badge--draft') ||
            /draft|초안|下書き|草稿/i.test(b.text)
        ),
      };
    })()
  `);
}

/** Merge box terminal-state chrome (tone class + kind). */
export function mergeBoxProbe() {
  return evalInPage(`
    (() => {
      const box = document.querySelector('.prp-merge-box');
      if (!box) return { ok: false };
      const tone =
        [...box.classList].find((c) => c.startsWith('prp-merge-box--')) || null;
      return {
        ok: true,
        tone,
        kind: box.getAttribute('data-merge-kind'),
        headline: (
          document.querySelector('.prp-merge-box__headline')?.textContent || ''
        )
          .trim()
          .slice(0, 100),
      };
    })()
  `);
}

/** Diff code-line expand affordance snapshot. */
export function lineExpandProbe() {
  return evalInPage(`
    (() => {
      const expandable = [
        ...document.querySelectorAll('.prp-vline--line-expandable'),
      ];
      const expanded = document.querySelector('.prp-vline--line-expanded');
      let maxTextLen = 0;
      for (const r of document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header) .prp-code, .prp-vline--selectable:not(.prp-vline--header) code'
      )) {
        maxTextLen = Math.max(maxTextLen, (r.textContent || '').length);
      }
      return {
        expandableCount: expandable.length,
        expanded: !!expanded,
        expandedH: expanded
          ? Math.round(expanded.getBoundingClientRect().height)
          : 0,
        maxTextLen,
        hasExpandBtn: !!document.querySelector('.prp-line-expand-btn'),
      };
    })()
  `);
}

/**
 * Click first long-line expand (or collapse) button.
 * Caller should waitMs then read {@link lineExpandProbe} — height updates after React paint.
 * @returns {{ ok: boolean, beforeH?: number, reason?: string }}
 */
export function clickFirstLineExpandBtn() {
  return evalInPage(`
    (() => {
      const row =
        document.querySelector('.prp-vline--line-expanded') ||
        document.querySelector('.prp-vline--line-expandable');
      const btn = row?.querySelector('.prp-line-expand-btn');
      if (!row || !btn) return { ok: false, reason: 'no expandable row' };
      // Do NOT scrollIntoView here: Diff virtual list remounts on scroll and
      // can detach the button before click() lands (expand appears to no-op).
      const beforeH = Math.round(row.getBoundingClientRect().height);
      const r = btn.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      };
      try {
        btn.focus({ preventScroll: true });
      } catch {
        try {
          btn.focus();
        } catch {
          /* ignore */
        }
      }
      // Full pointer/mouse sequence — React 19 onClick is more reliable with it
      try {
        btn.dispatchEvent(
          new PointerEvent('pointerdown', {
            ...opts,
            pointerId: 1,
            pointerType: 'mouse',
          })
        );
      } catch {
        /* PointerEvent missing */
      }
      btn.dispatchEvent(new MouseEvent('mousedown', opts));
      try {
        btn.dispatchEvent(
          new PointerEvent('pointerup', {
            ...opts,
            pointerId: 1,
            pointerType: 'mouse',
            buttons: 0,
          })
        );
      } catch {
        /* ignore */
      }
      btn.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      // Single click only. Do not also call btn.click() or row dblclick —
      // those double-toggle expand state (expand then immediately collapse).
      btn.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
      return {
        ok: true,
        beforeH,
        path: row.getAttribute('data-file-path') || null,
        expandedNow: !!document.querySelector('.prp-vline--line-expanded'),
      };
    })()
  `);
}

/**
 * Click file-header collapse chevron (focused header preferred).
 * More reliable than keyboard when Diff still holds thread-nav context (⌥F = thread fold).
 */
export function clickFileHeaderCollapse() {
  return evalInPage(`
    (() => {
      const header =
        document.querySelector('.prp-vline--header-focus') ||
        document.querySelector(
          '.prp-vline--header[data-file-path="' +
            (document
              .querySelector('.prp-vline--selected')
              ?.getAttribute('data-file-path') || '')
              .replace(/"/g, '') +
            '"]'
        ) ||
        document.querySelector('.prp-vline--header');
      const btn = header?.querySelector('.prp-file-header__collapse');
      if (!btn) return { ok: false, reason: 'no collapse button' };
      header.scrollIntoView({ block: 'center' });
      const before = btn.getAttribute('aria-expanded');
      btn.click();
      return {
        ok: true,
        before,
        after: btn.getAttribute('aria-expanded'),
        path: header.getAttribute('data-file-path'),
      };
    })()
  `);
}

/** Diff file collapse chrome for the focused / first header. */
export function fileCollapseProbe() {
  return evalInPage(`
    (() => {
      const header =
        document.querySelector('.prp-vline--header-focus') ||
        document.querySelector('.prp-vline--header');
      const btn =
        header?.querySelector('.prp-file-header__collapse') ||
        document.querySelector('.prp-file-header__collapse');
      const codeRows = document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header)'
      ).length;
      return {
        hasHeader: !!header,
        hasBtn: !!btn,
        ariaExpanded: btn?.getAttribute('aria-expanded') ?? null,
        codeRows,
        activePath:
          document
            .querySelector('.prp-vline--selected')
            ?.getAttribute('data-file-path') ||
          document
            .querySelector('.prp-vline--header-focus')
            ?.getAttribute('data-file-path') ||
          document
            .querySelector('.prp-filetree__item--active')
            ?.getAttribute('data-file-path') ||
          null,
      };
    })()
  `);
}

/** Fire product Alt+F (file fold on Diff / thread fold when context active). */
export function pressOptF() {
  return evalInPage(`
    (() => {
      const t = document.documentElement;
      const opts = {
        key: 'f',
        code: 'KeyF',
        altKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      t.dispatchEvent(new KeyboardEvent('keydown', opts));
      t.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    })()
  `);
}

/**
 * Click a selectable code line (not file header) to seed Diff selection.
 * @param {number} [index]
 */
export function clickSelectableLine(index = 3) {
  // Clear opt-hold latch so line selection is not swallowed by chord mode.
  evalInPage(`
    (() => {
      document.documentElement.removeAttribute('data-prp-opt-held');
      document.documentElement.classList.remove('prp-opt-held');
      const v = document.querySelector('.prp-vlist, .prp-diff-vlist');
      if (v && typeof v.focus === 'function') {
        try { v.focus({ preventScroll: true }); } catch { v.focus(); }
      }
    })()
  `);
  const r = evalInPage(`
    (() => {
      const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
        (e) => !e.classList.contains('prp-vline--header')
      );
      const row = rows[${Number(index)}] || rows[0];
      if (!row) return { ok: false, n: rows.length };
      row.scrollIntoView({ block: 'center' });
      const rect = row.getBoundingClientRect();
      const x = rect.left + Math.min(40, Math.max(12, rect.width * 0.2));
      const y = rect.top + rect.height / 2;
      // Prefer the row itself — elementFromPoint can hit overlays/islands.
      const el = row;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
      // Direct click() as last resort for React synthetic handlers
      try { el.click(); } catch { /* ignore */ }
      const selected = document.querySelectorAll('.prp-vline--selected').length;
      return { ok: true, n: rows.length, selected, cls: row.className.slice(0, 80) };
    })()
  `);
  waitMs(350);
  // Retry once if selection did not paint (focus race / overlay)
  if (!r?.selected) {
    waitMs(200);
    const r2 = evalInPage(`
      (() => {
        const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
          (e) => !e.classList.contains('prp-vline--header')
        );
        const row = rows[${Number(index)}] || rows[Math.min(3, rows.length - 1)] || rows[0];
        if (!row) return { ok: false, n: rows.length, selected: 0 };
        row.scrollIntoView({ block: 'center' });
        row.click();
        return {
          ok: true,
          n: rows.length,
          selected: document.querySelectorAll('.prp-vline--selected').length,
          cls: row.className.slice(0, 80),
          via: 'retry-click',
        };
      })()
    `);
    waitMs(300);
    return r2 || r;
  }
  return r;
}

/** Diff thread / inline-comment focus snapshot. */
export function diffThreadProbe() {
  return evalInPage(`
    (() => {
      const threads = [...document.querySelectorAll('.prp-inline-thread')];
      const active =
        document.querySelector('.prp-inline-thread--active, .prp-inline-thread.prp-kb-focus') ||
        document.querySelector('.prp-vline--comment-active, .prp-card--kb-focus');
      const v = document.querySelector('.prp-vlist');
      const sr = v?.getBoundingClientRect();
      let ratio = null;
      if (active && sr) {
        ratio = (active.getBoundingClientRect().top - sr.top) / (sr.height || 1);
      }
      // Prefer the thread nearest viewport third as "focused" proxy when no active class
      let nearest = null;
      if (v && threads.length) {
        let best = Infinity;
        for (const t of threads) {
          const r = t.getBoundingClientRect();
          const mid = (r.top + r.bottom) / 2;
          const target = sr.top + sr.height / 3;
          const d = Math.abs(mid - target);
          if (d < best) {
            best = d;
            nearest = {
              cls: t.className.slice(0, 80),
              ratio: (r.top - sr.top) / (sr.height || 1),
              top: Math.round(r.top - sr.top),
            };
          }
        }
      }
      return {
        threadCount: threads.length,
        hasActive: !!active,
        activeRatio: ratio,
        nearest,
        scrollTop: v?.scrollTop ?? null,
      };
    })()
  `);
}

/** Blur any focused editable so product chords are not swallowed. */
export function blurEditable() {
  evalInPage(`
    (() => {
      const a = document.activeElement;
      if (a && a !== document.body && typeof a.blur === 'function') a.blur();
      document.querySelector('.prp-overlay')?.focus?.();
      return true;
    })()
  `);
  waitMs(40);
}

/** Physical key → KeyboardEvent.code (+ normalized key). */
const KEY_CODE_MAP = {
  j: 'KeyJ',
  k: 'KeyK',
  f: 'KeyF',
  b: 'KeyB',
  c: 'KeyC',
  u: 'KeyU',
  r: 'KeyR',
  p: 'KeyP',
  e: 'KeyE',
  ArrowDown: 'ArrowDown',
  ArrowUp: 'ArrowUp',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ']': 'BracketRight',
  '[': 'BracketLeft',
  '.': 'Period',
  ',': 'Comma',
  '/': 'Slash',
  '-': 'Minus',
  '=': 'Equal',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
  '7': 'Digit7',
  '8': 'Digit8',
  '9': 'Digit9',
  '0': 'Digit0',
};

/**
 * Parse agent-browser-style chord into KeyboardEvent fields.
 * @param {string} chord e.g. 'Alt+j' | 'Meta+f' | 'Escape' | 'Shift+ArrowDown'
 */
export function parseChord(chord) {
  const parts = String(chord)
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const keyTok = parts[parts.length - 1] || '';
  const altKey = parts.some((p) => /^alt$/i.test(p));
  const shiftKey = parts.some((p) => /^shift$/i.test(p));
  const metaKey = parts.some((p) => /^meta|cmd|command$/i.test(p));
  const ctrlKey = parts.some((p) => /^control|ctrl$/i.test(p));
  const keyNorm =
    {
      down: 'ArrowDown',
      up: 'ArrowUp',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      esc: 'Escape',
      escape: 'Escape',
      enter: 'Enter',
      return: 'Enter',
      space: ' ',
      period: '.',
    }[keyTok.toLowerCase()] || keyTok;
  const code =
    KEY_CODE_MAP[keyNorm] ||
    KEY_CODE_MAP[keyNorm.toLowerCase()] ||
    (keyNorm.length === 1 && /[a-zA-Z]/.test(keyNorm)
      ? `Key${keyNorm.toUpperCase()}`
      : keyNorm.length === 1 && /[0-9]/.test(keyNorm)
        ? `Digit${keyNorm}`
        : keyNorm);
  const key =
    keyNorm === ' '
      ? ' '
      : keyNorm.length === 1
        ? keyNorm.toLowerCase()
        : keyNorm === 'Escape'
          ? 'Escape'
          : keyNorm === 'Enter'
            ? 'Enter'
            : keyNorm;
  return { key, code, altKey, shiftKey, metaKey, ctrlKey };
}

/**
 * Dispatch a single keydown/keyup on documentElement (capture-phase product handlers).
 * Prefer this over agent-browser `press` for Alt/Meta product chords — CDP press often
 * drops altKey / mis-maps Option glyphs in headless Chromium.
 * @param {string} chord
 */
export function press(chord) {
  const spec = parseChord(chord);
  // Plain Escape/Enter still via CDP is fine; product chords always synthetic.
  // Plain ArrowUp/Down/Left/Right also synthetic: Diff reply-step, line
  // selection, and fold are capture-phase handlers on documentElement — CDP
  // press often never reaches them (focus/scroll-target mismatch).
  const isProductArrow = /^arrow(up|down|left|right)$/i.test(
    String(spec.key || '')
  );
  const needsSynthetic =
    spec.altKey ||
    spec.metaKey ||
    spec.ctrlKey ||
    isProductArrow ||
    (spec.shiftKey && /^arrow/i.test(spec.key)) ||
    spec.key === '.' ||
    spec.code === 'Period';
  if (!needsSynthetic) {
    return abPress(chord);
  }
  evalInPage(`
    (() => {
      const spec = ${JSON.stringify(spec)};
      const target = document.documentElement;
      const base = {
        key: spec.key,
        code: spec.code,
        altKey: spec.altKey,
        shiftKey: spec.shiftKey,
        metaKey: spec.metaKey,
        ctrlKey: spec.ctrlKey,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      target.dispatchEvent(new KeyboardEvent('keydown', base));
      target.dispatchEvent(new KeyboardEvent('keyup', { ...base, bubbles: true }));
      return true;
    })()
  `);
  // Product handlers re-render / scroll on next frames — give React a beat.
  waitMs(80);
  return { status: 0, stdout: '', stderr: '' };
}

/**
 * Simulate OS key-hold / key-repeat for a chord (⌥J, ⌥⇧↓, …).
 * Dispatches real KeyboardEvents on document so capture-phase handlers run.
 * Much closer to “꾹 누르기” than discrete agent-browser press loops.
 *
 * @param {string} chord e.g. 'Alt+j' | 'Alt+k' | 'Alt+Shift+ArrowDown' | 'Alt+Shift+]'
 * @param {{ holdMs?: number, repeatMs?: number, sample?: 'conv' | 'diff' | null }} [opts]
 * @returns {{ events: number, holdMs: number, samples: number[], scrollStart: number|null, scrollEnd: number|null }}
 */
export function holdChord(chord, opts = {}) {
  const holdMs = opts.holdMs ?? 450;
  const repeatMs = opts.repeatMs ?? 40;
  /** @type {'conv'|'diff'|'optHints'|null} */
  const sample = opts.sample || null;

  const { key, code, altKey, shiftKey, metaKey, ctrlKey } = parseChord(chord);

  // Kick async hold in page, then wait for completion (no CLI roundtrip per repeat).
  evalInPage(`
    (() => {
      const holdMs = ${holdMs};
      const repeatMs = ${repeatMs};
      const sampleMode = ${JSON.stringify(sample)};
      const spec = ${JSON.stringify({ key, code, altKey, shiftKey, metaKey, ctrlKey })};
      const target = document.documentElement;
      const fire = (type, repeat, forceAlt) => {
        const alt =
          forceAlt != null ? Boolean(forceAlt) : Boolean(spec.altKey);
        const ev = new KeyboardEvent(type, {
          key: spec.key,
          code: spec.code,
          altKey: alt,
          shiftKey: spec.shiftKey,
          metaKey: spec.metaKey,
          ctrlKey: spec.ctrlKey,
          bubbles: true,
          cancelable: true,
          composed: true,
          repeat: Boolean(repeat),
        });
        // Prefer documentElement (product capture). Fan-out only for opt-hold latch.
        target.dispatchEvent(ev);
        if (sampleMode === 'optHints' || pureAlt) {
          window.dispatchEvent(ev);
          document.dispatchEvent(ev);
        }
      };
      const sampleScroll = () => {
        if (sampleMode === 'conv') {
          return document.querySelector('.prp-conversation-virtual')?.scrollTop ?? null;
        }
        if (sampleMode === 'diff') {
          return document.querySelector('.prp-vlist')?.scrollTop ?? null;
        }
        return null;
      };
      /** Mid-hold snapshot of OptBtnHint portals + overlay class. */
      const sampleOptHints = () => {
        const on = !!document.querySelector(
          '.prp-opt-hints-on, .prp-overlay.prp-opt-hints-on'
        );
        const tips = [...document.querySelectorAll('kbd.prp-opt-btn-hint, .prp-opt-btn-hint')]
          .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        const hasEmoji = tips.some((t) => /E/.test(t));
        const hasSubmit = tips.some((t) => /C|↵|Enter/.test(t));
        return {
          on,
          tipCount: tips.length,
          sample: tips.slice(0, 12),
          hasEmoji,
          hasSubmit,
          at: performance.now(),
        };
      };
      window.__prpE2eHold = {
        done: false,
        events: 0,
        samples: [],
        optSamples: [],
        scrollStart: sampleScroll(),
        scrollEnd: null,
        holdMs,
      };
      // Modifier keydown first so altKey-synced UI (opt-hold tips) arms.
      if (spec.altKey || /^alt$/i.test(String(spec.key || ''))) {
        const altDown = new KeyboardEvent('keydown', {
          key: 'Alt',
          code: 'AltLeft',
          altKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        window.dispatchEvent(altDown);
        document.dispatchEvent(altDown);
        target.dispatchEvent(altDown);
      }
      // Pure Alt hold: do not fire a second non-alt key; keep altKey latched
      const pureAlt =
        /^alt$/i.test(String(spec.key || '')) ||
        (spec.altKey &&
          !spec.shiftKey &&
          !spec.metaKey &&
          !spec.ctrlKey &&
          /^alt$/i.test(String(spec.key || '')));
      if (!pureAlt) {
        // Pass real altKey for the chord (do not force Alt on Shift-only holds)
        fire('keydown', false, Boolean(spec.altKey));
        window.__prpE2eHold.events += 1;
      } else {
        window.__prpE2eHold.events += 1;
      }
      // Arm OptBtnHint via shared DOM latch (works across page/content worlds)
      // + CustomEvent for content-script store.
      const setOptHints = (active) => {
        try {
          const root = document.documentElement;
          if (active) {
            root.setAttribute('data-prp-opt-held', '1');
            root.classList.add('prp-opt-held');
            document.body?.classList?.add?.('prp-opt-held');
          } else {
            root.removeAttribute('data-prp-opt-held');
            root.classList.remove('prp-opt-held');
            document.body?.classList?.remove?.('prp-opt-held');
          }
          window.dispatchEvent(
            new CustomEvent('prp-set-opt-hints', {
              detail: { active: Boolean(active) },
              bubbles: true,
              composed: true,
            })
          );
        } catch {
          /* ignore */
        }
      };
      // Only latch DOM for pure-Alt opt-hold sampling (avoid side effects on ⌥J/K holds)
      if (sampleMode === 'optHints' || pureAlt) {
        setOptHints(true);
      }
      // Immediate mid-hold sample after first Alt down (React may paint next frames)
      if (sampleMode === 'optHints') {
        window.__prpE2eHold.optSamples.push(sampleOptHints());
      }
      const t0 = performance.now();
      const tick = () => {
        const st = window.__prpE2eHold;
        if (!st || st.done) return;
        const elapsed = performance.now() - t0;
        // Sample opt hints WHILE Alt is still held (before keyup)
        if (sampleMode === 'optHints') {
          // Re-assert hints each tick so React has frames to portal tips
          setOptHints(true);
          st.optSamples.push(sampleOptHints());
        }
        if (elapsed >= holdMs) {
          // Last sample before releasing Alt / clearing hints
          if (sampleMode === 'optHints') {
            st.optSamples.push(sampleOptHints());
          }
          if (!pureAlt) fire('keyup', false, Boolean(spec.altKey));
          if (spec.altKey || pureAlt) {
            const altUp = new KeyboardEvent('keyup', {
              key: 'Alt',
              code: 'AltLeft',
              altKey: false,
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            window.dispatchEvent(altUp);
            document.dispatchEvent(altUp);
            target.dispatchEvent(altUp);
          }
          setOptHints(false);
          st.scrollEnd = sampleScroll();
          st.done = true;
          return;
        }
        if (!pureAlt) {
          fire('keydown', true, Boolean(spec.altKey));
          st.events += 1;
        } else {
          // Re-assert Alt held so content-script sync stays active
          const altDown = new KeyboardEvent('keydown', {
            key: 'Alt',
            code: 'AltLeft',
            altKey: true,
            bubbles: true,
            cancelable: true,
            composed: true,
            repeat: true,
          });
          window.dispatchEvent(altDown);
          document.dispatchEvent(altDown);
          target.dispatchEvent(altDown);
          st.events += 1;
        }
        const s = sampleScroll();
        if (s != null) st.samples.push(s);
        setTimeout(tick, repeatMs);
      };
      setTimeout(tick, repeatMs);
      return true;
    })()
  `);

  // Poll until page reports done (hold + small slack for last keyup).
  const deadline = Date.now() + holdMs + 800;
  let result = null;
  while (Date.now() < deadline) {
    waitMs(30);
    result = evalInPage(`window.__prpE2eHold || null`);
    if (result?.done) break;
  }
  assert(result?.done, `holdChord(${chord}) did not finish in time`);
  return {
    events: result.events,
    holdMs: result.holdMs,
    samples: result.samples || [],
    /** Mid-hold OptBtnHint snapshots (when sample: 'optHints') */
    optSamples: result.optSamples || [],
    scrollStart: result.scrollStart,
    scrollEnd: result.scrollEnd,
  };
}

export {
  ab,
  clearPrPlusIdb,
  clearPrPlusSessionStorage,
  evalInPage,
  waitMs,
  waitFor,
  open,
  closeAll,
  ensureSingleTab,
  ROOT,
};
