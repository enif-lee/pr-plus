/**
 * Thin agent-browser CLI wrapper for local e2e.
 * Uses repo agent-browser.json (extensions + profile) when cwd is project root.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../../..');

const SESSION = process.env.PRP_E2E_SESSION || 'pr-plus-e2e';
const DEFAULT_TIMEOUT_MS = Number(process.env.PRP_E2E_CMD_TIMEOUT_MS || 60_000);
/**
 * E2e defaults to headless (no OS focus issues for chords). Override:
 *   PRP_E2E_HEADED=1 npm run test:e2e
 * Config agent-browser.json may set headed:true; --headed false overrides.
 */
const HEADED =
  process.env.PRP_E2E_HEADED === '1' ||
  process.env.PRP_E2E_HEADED === 'true' ||
  process.env.AGENT_BROWSER_HEADED === '1' ||
  process.env.AGENT_BROWSER_HEADED === 'true';

/**
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number, allowFail?: boolean }} [opts]
 */
export function ab(args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Boolean form overrides agent-browser.json "headed" (see agent-browser README).
  const headedFlag = HEADED ? ['--headed', 'true'] : ['--headed', 'false'];
  const r = spawnSync('agent-browser', [...headedFlag, '--session', SESSION, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    input: opts.input,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      // Mirror CLI so child sessions stay consistent
      AGENT_BROWSER_HEADED: HEADED ? '1' : '0',
    },
  });
  // spawnSync sets r.error on timeout (ETIMEDOUT) even when the CLI may have
  // partially succeeded. allowFail must swallow that too — otherwise waitNetwork
  // / closeAll blow up hardLaunch soft-fail paths.
  if (r.error) {
    if (opts.allowFail) {
      return {
        status: r.status == null ? 1 : r.status,
        stdout: (r.stdout || '').trim(),
        stderr: (r.stderr || String(r.error.message || r.error)).trim(),
        error: r.error,
      };
    }
    throw r.error;
  }
  if (r.status !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`agent-browser ${args.join(' ')} failed: ${err}`);
  }
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

/**
 * List open page tabs for the e2e session.
 * @returns {Array<{ tabId: string, active?: boolean, url?: string, type?: string }>}
 */
export function listTabs() {
  const r = ab(['tab', 'list', '--json'], { allowFail: true });
  if (r.status !== 0 || !r.stdout) return [];
  try {
    const parsed = JSON.parse(r.stdout);
    const tabs = parsed?.data?.tabs || parsed?.tabs || [];
    return Array.isArray(tabs) ? tabs : [];
  } catch {
    return [];
  }
}

/**
 * Keep only the active (or first) page tab; close the rest.
 * Profile / prior runs often leave many GH tabs which steal focus and flake
 * keyboard chords (⌥J, key-hold, Esc). Always collapse to a single test tab.
 *
 * @returns {{ kept: string|null, closed: number }}
 */
export function ensureSingleTab() {
  const tabs = listTabs().filter(
    (t) => t && t.tabId && String(t.type || 'page') !== 'service_worker'
  );
  if (tabs.length <= 1) {
    return { kept: tabs[0]?.tabId || null, closed: 0 };
  }
  const keep = tabs.find((t) => t.active) || tabs[0];
  let closed = 0;
  for (const t of tabs) {
    if (String(t.tabId) === String(keep.tabId)) continue;
    ab(['tab', 'close', String(t.tabId)], { allowFail: true });
    closed += 1;
  }
  if (keep?.tabId) {
    ab(['tab', String(keep.tabId)], { allowFail: true });
  }
  return { kept: keep?.tabId || null, closed };
}

/**
 * Navigate to `url` on the session, then collapse to a single tab.
 * Prefer this over raw `tab new` so tests never accumulate tabs.
 */
export function open(url) {
  // 45s covers cold GH + extension inject; hard launch may pass a higher timeout.
  const r = ab(['open', url], { timeoutMs: 45_000 });
  ensureSingleTab();
  return r;
}

export function closeAll() {
  return ab(['close', '--all'], { allowFail: true });
}

/**
 * Drop pr+ session keys that restore layout/collapsed files across navigations.
 * Call on a github.com document (same as IDB clear).
 */
export function clearPrPlusSessionStorage() {
  try {
    return evalInPage(`
      (() => {
        const keys = [];
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith('prp:') || k.startsWith('pr-plus'))) {
            keys.push(k);
            sessionStorage.removeItem(k);
          }
        }
        return { ok: true, removed: keys.length, keys: keys.slice(0, 20) };
      })()
    `);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Wipe page-origin PR detail IndexedDB (`pr-plus-detail-cache`).
 * Must run on a github.com (or GHES) document so the origin matches content scripts.
 * Prefer calling via `ensureBrowser()` / harness — not mid-scenario unless needed.
 *
 * @returns {{ ok: boolean, via?: string, error?: string, host?: string }}
 */
/**
 * Low-level eval with a short CLI timeout (IDB clear must not burn 60s).
 * @param {string} script
 * @param {number} [timeoutMs]
 */
function evalInPageTimed(script, timeoutMs = 8_000) {
  const r = ab(['eval', '--json', '--stdin'], {
    input: script,
    timeoutMs,
    allowFail: true,
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `eval exit ${r.status}`).slice(0, 200));
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`eval JSON parse failed:\n${r.stdout.slice(0, 300)}`);
  }
  if (parsed.success === false || parsed.error) {
    throw new Error(`eval error: ${JSON.stringify(parsed.error || parsed)}`);
  }
  if (parsed.data && 'result' in parsed.data) return parsed.data.result;
  if ('result' in parsed) return parsed.result;
  return parsed;
}

export function clearPrPlusIdb() {
  // Fire-and-poll: do NOT await the async deleteDatabase promise via agent-browser
  // (await can hang until CLI timeout when IDB is blocked). Kick work, poll window.
  try {
    evalInPageTimed(
      `
      (() => {
        window.__prpE2eIdbClear = null;
        const name = 'pr-plus-detail-cache';
        const finish = (out) => {
          window.__prpE2eIdbClear = out;
        };
        const run = async () => {
          const out = { ok: false, via: [], errors: [], host: location.host };
          try {
            const idb = globalThis.PRModalDetailIdb?.createDetailIdb?.();
            if (idb?.clear) {
              await Promise.race([
                idb.clear(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('idb.clear timeout')), 1500)),
              ]);
              out.via.push('PRModalDetailIdb.clear');
            }
          } catch (e) {
            out.errors.push(String(e?.message || e));
          }
          try {
            await new Promise((resolve) => {
              const t = setTimeout(() => resolve(false), 1500);
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => {
                clearTimeout(t);
                resolve(true);
              };
              req.onerror = () => {
                clearTimeout(t);
                resolve(false);
              };
              req.onblocked = () => {
                clearTimeout(t);
                resolve(false);
              };
            });
            out.via.push('deleteDatabase');
            out.ok = true;
          } catch (e) {
            out.errors.push(String(e?.message || e));
          }
          if (!out.ok && out.via.length) out.ok = true;
          out.via = out.via.join('+') || null;
          out.error = out.errors.length ? out.errors.join('; ') : null;
          delete out.errors;
          finish(out);
          return out;
        };
        // Intentionally do not return the promise — avoid agent-browser await hang.
        void run();
        return { kicked: true, host: location.host };
      })()
    `,
      5_000
    );
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  // Poll until result or short deadline (local sleep)
  const deadline = Date.now() + 2_500;
  while (Date.now() < deadline) {
    try {
      const r = evalInPageTimed(`window.__prpE2eIdbClear`, 3_000);
      if (r && typeof r === 'object' && ('ok' in r || r.via)) {
        return r;
      }
    } catch {
      /* retry */
    }
    sleepSync(40);
  }
  return { ok: false, error: 'IDB clear timed out' };
}

export function press(key) {
  // Quote-safe: pass as single argv (spawn does not use shell)
  return ab(['press', key]);
}

/**
 * Sync sleep without spawning agent-browser (CLI spawn overhead dominates short polls).
 * @param {number} ms
 */
export function sleepSync(ms) {
  const n = Math.max(0, Math.min(120_000, Number(ms) || 0));
  if (n <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
  } catch {
    const end = Date.now() + n;
    while (Date.now() < end) {
      /* spin fallback */
    }
  }
}

/**
 * Wait `ms` milliseconds. Short waits use local sleep; long waits may use the
 * browser CLI (keeps the page event loop free for multi-second pauses).
 * @param {number} ms
 */
export function waitMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  // agent-browser spawn ≈ 50–200ms; never worth it under ~1.5s
  if (n <= 1500) {
    sleepSync(n);
    return { status: 0, stdout: '', stderr: '' };
  }
  return ab(['wait', String(n)], { allowFail: true, timeoutMs: n + 5_000 });
}

/**
 * Wait for document load. Prefer `load` over `networkidle` — GitHub keeps
 * long-lived sockets/polls so networkidle often burns the full timeout and
 * makes the suite look hung (90s × every navigation).
 *
 * If the document is already complete/interactive, return immediately — a CLI
 * `wait --load load` after load has already fired often burns the full timeout
 * (~12–20s × every soft-reset), which dominated suite wall time.
 */
export function waitNetwork() {
  try {
    const ready = evalInPage(`document.readyState || ''`);
    if (ready === 'complete' || ready === 'interactive') {
      return { status: 0, stdout: String(ready), stderr: '' };
    }
  } catch {
    /* fall through to CLI wait */
  }
  // Short budget: allowFail + ab() timeout soft-return (never throw).
  const r = ab(['wait', '--load', 'load'], { timeoutMs: 5_000, allowFail: true });
  if (r.status !== 0 || r.error) {
    sleepSync(200);
  }
  return r;
}

/**
 * Run JS in page; returns deserialized `result` from --json envelope.
 * @param {string} script
 */
export function evalInPage(script) {
  const r = ab(['eval', '--json', '--stdin'], { input: script });
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`eval JSON parse failed:\n${r.stdout.slice(0, 500)}`);
  }
  if (parsed.success === false || parsed.error) {
    throw new Error(`eval error: ${JSON.stringify(parsed.error || parsed)}`);
  }
  // envelope: { success, data: { origin, result }, error }
  if (parsed.data && 'result' in parsed.data) return parsed.data.result;
  if ('result' in parsed) return parsed.result;
  return parsed;
}

/** Default poll interval for waitFor (local sleep; no agent-browser spawn). */
export const WAIT_FOR_DEFAULT_INTERVAL_MS = 100;
/** Default failure ceiling for waitFor (cold GH still allowed). */
export const WAIT_FOR_DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Poll until predicate (page function body returning truthy) or timeout.
 * Success path exits as soon as the predicate is truthy (interval is poll
 * granularity only — not a fixed multi-second sleep stack).
 * @param {string} predicateBody  expression or block ending with return
 * @param {{ timeoutMs?: number, intervalMs?: number, label?: string }} [opts]
 */
export function waitFor(predicateBody, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? WAIT_FOR_DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? WAIT_FOR_DEFAULT_INTERVAL_MS;
  const label = opts.label || 'condition';
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = evalInPage(`(() => { ${predicateBody} })()`);
    if (last) return last;
    sleepSync(intervalMs);
  }
  throw new Error(`waitFor timeout (${timeoutMs}ms): ${label}; last=${JSON.stringify(last)}`);
}

export function screenshot(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  return ab(['screenshot', abs], { allowFail: true });
}
