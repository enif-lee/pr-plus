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
 *
 * Prefer in-place clear after dismissing the modal (no navigation). Only open
 * github.com when off-origin, or when the first IDB clear fails (PR document
 * can block deleteDatabase — then one land + retry). Never open→clear→open.
 *
 * @param {string} [label]
 * @returns {{ mode: string, opens: number, idbOk: boolean, sessRemoved: number }}
 */
export function softResetBrowser(label = 'soft-reset') {
  slog(`  session ${label}: soft reset (single tab + clear caches)`);
  dismissOverlayIfAny();

  let opens = 0;
  const host = pageHostname();
  if (softResetNeedsGithubOpen(host)) {
    try {
      open('https://github.com/');
      opens = 1;
    } catch (e) {
      slog(`  soft reset open failed (${e.message || e}); will hard relaunch`);
      throw e;
    }
    ensureSingleTab();
    waitNetwork();
    sleepSync(40);
  } else {
    ensureSingleTab();
    // readyState-complete → waitNetwork is immediate (no CLI load burn).
    waitNetwork();
  }

  let idb = clearPrPlusIdb();
  // PR page can leave IDB blocked — one recovery navigation, then re-clear.
  if (!idb?.ok && opens === 0) {
    slog(`  IDB clear failed in-place (${idb?.error || 'unknown'}); recover via github.com`);
    try {
      open('https://github.com/');
      opens = 1;
      ensureSingleTab();
      waitNetwork();
      sleepSync(40);
      idb = clearPrPlusIdb();
    } catch (e) {
      slog(`  soft reset recover open failed (${e.message || e})`);
    }
  }
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

  // Pin e2e-stable prefs so prior suites cannot leave:
  // - uiLanguage=ko (or auto→page-ko) → Korean chrome breaks EN selectors
  // - timelineVisibility all-off (timeline-tips toggles) → empty conversation feed
  // Page world has no PRTreeStorage — content-bridge listens for prp-set-prefs.
  try {
    evalInPage(`
      (() => {
        const r = document.documentElement;
        const patch = {
          uiLanguage: 'en',
          timelineVisibility: {
            events: true,
            participants: true,
            comments: true,
            'review-threads': true,
          },
        };
        r.removeAttribute('data-prp-prefs-ok');
        r.removeAttribute('data-prp-prefs-err');
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
    const t0 = Date.now();
    let prefsOk = false;
    while (Date.now() - t0 < 4_000) {
      try {
        const snap = evalInPage(`
          (() => ({
            ok: document.documentElement.getAttribute('data-prp-prefs-ok'),
            ui: document.documentElement.getAttribute('data-prp-ui-language'),
          }))()
        `);
        if (snap?.ok === '1' && snap?.ui === 'en') {
          prefsOk = true;
          break;
        }
      } catch {
        /* inject lag */
      }
      sleepSync(120);
    }
    slog(
      `  soft reset prefs en+timeline tips via prp-set-prefs ${prefsOk ? 'ok' : 'timeout (best-effort)'}`
    );
  } catch (e) {
    slog(`  soft reset prefs pin skipped (${e?.message || e})`);
  }

  ensureSingleTab();
  return {
    mode: opens ? 'open' : 'in-place',
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
      // Cold Chrome + extension inject can be slow; only hard-launch uses 90s.
      ab(['open', 'https://github.com/'], { timeoutMs: 90_000 });
      ensureSingleTab();
      waitNetwork();
      sleepSync(100);
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
