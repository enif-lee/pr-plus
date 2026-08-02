/**
 * Shared agent-browser session for the whole e2e run.
 *
 * - Launch Chrome once; reuse across suites/files (detect open tabs).
 * - Between suites: soft reset (single tab + clear IDB/sessionStorage).
 * - Soft-reset happy path: **at most one** intentional github.com navigation
 *   (clear IDB/session in place when already on github.com).
 * - Do NOT closeAll between features — only teardown ends the session.
 *
 * Depends only on ab.mjs (no harness import — avoids circular deps).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  ab,
  clearPrPlusIdb,
  clearPrPlusSessionStorage,
  closeAll,
  ensureSingleTab,
  evalInPage,
  listTabs,
  open,
  sleepSync,
  waitMs,
  waitNetwork,
} from './ab.mjs';

function slog(msg) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[e2e ${t}] ${msg}`);
}

function clearProfileSingletonLocks() {
  try {
    const dir = path.join(ROOT, '.browser/profile');
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* missing ok */
      }
    }
  } catch {
    /* ignore */
  }
}

function sessionHasPage() {
  try {
    const tabs = listTabs().filter(
      (t) => t && t.tabId && String(t.type || 'page') !== 'service_worker'
    );
    return tabs.length > 0;
  } catch {
    return false;
  }
}

/**
 * Pure: whether soft-reset must navigate to github.com before clearing caches.
 * @param {string|null|undefined} hostname location.hostname (or full host)
 * @returns {boolean}
 */
export function softResetNeedsGithubOpen(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  if (!h) return true;
  return !(h === 'github.com' || h.endsWith('.github.com'));
}

function pageHostname() {
  try {
    return evalInPage(`location.hostname || ''`);
  } catch {
    return null;
  }
}

function dismissOverlayIfAny() {
  try {
    for (let i = 0; i < 4; i++) {
      const openOv = evalInPage(`!!document.querySelector('.prp-overlay')`);
      if (!openOv) return;
      ab(['press', 'Escape'], { allowFail: true });
      sleepSync(80);
    }
    evalInPage(
      `document.querySelector('.prp-overlay')?.remove(); document.body.style.overflow=''; true`
    );
  } catch {
    /* page may not be ready */
  }
}

/**
 * Wipe pr+ IDB + sessionStorage on a github.com origin.
 * Happy path: **exactly one** intentional `open('https://github.com/')`, then
 * clear caches **in place** — never open→clear→open again.
 *
 * Always navigating once is intentional: a fresh document unblocks IDB
 * (deleteDatabase can hang for 60s when the prior PR page still holds the DB)
 * while still cutting the old double-navigation soft-reset cost in half.
 *
 * @param {string} [label]
 * @returns {{ mode: 'open', opens: number, idbOk: boolean, sessRemoved: number }}
 */
export function softResetBrowser(label = 'soft-reset') {
  slog(`  session ${label}: soft reset (single tab + clear caches)`);
  dismissOverlayIfAny();

  // Single land on github.com (not conditional skip — avoids blocked IDB hangs).
  let opens = 0;
  try {
    open('https://github.com/');
    opens = 1;
  } catch (e) {
    slog(`  soft reset open failed (${e.message || e}); will hard relaunch`);
    throw e;
  }
  ensureSingleTab();
  waitNetwork();
  sleepSync(80);

  const idb = clearPrPlusIdb();
  if (idb?.ok) {
    slog(
      `  cleared PR detail IDB (via ${idb.via || 'idb'} on ${idb.host || 'github'})` +
        ` opens=${opens}`
    );
  } else {
    slog(`  WARN: IDB clear failed (${idb?.error || 'unknown'}) opens=${opens}`);
  }
  const sess = clearPrPlusSessionStorage();
  if (sess?.ok) {
    slog(`  cleared prp: sessionStorage keys=${sess.removed || 0}`);
  }

  // Stay on github.com after clear — no second open.
  ensureSingleTab();
  return {
    mode: 'open',
    opens,
    idbOk: Boolean(idb?.ok),
    sessRemoved: Number(sess?.removed) || 0,
  };
}

function hardLaunch() {
  slog('  session: hard launch (no live tab)');
  closeAll();
  sleepSync(400);
  clearProfileSingletonLocks();
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      ab(['open', 'https://github.com/'], { timeoutMs: 45_000 });
      ensureSingleTab();
      waitNetwork();
      sleepSync(200);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      slog(`  hard launch attempt ${attempt}/5 failed: ${e.message || e}`);
      closeAll();
      clearProfileSingletonLocks();
      sleepSync(Math.min(4000, 800 * attempt));
    }
  }
  if (lastErr) throw lastErr;
  // Already on github.com from launch open — soft reset clears in place (0 extra opens).
  softResetBrowser('post-launch');
}

/**
 * Ensure one shared browser for the e2e run.
 * Reuses open session when possible; soft-resets caches between suites.
 */
export function ensureSharedSession(label = 'suite') {
  slog(`=== session ensure (${label}) ===`);
  if (sessionHasPage()) {
    try {
      softResetBrowser(label);
      return { mode: 'reuse' };
    } catch {
      /* fall through */
    }
  }
  hardLaunch();
  return { mode: 'launch' };
}

/** End shared session (global teardown only). */
export function teardownSharedSession() {
  slog('=== session teardown (close all) ===');
  try {
    closeAll();
  } catch {
    /* ignore */
  }
  clearProfileSingletonLocks();
}
