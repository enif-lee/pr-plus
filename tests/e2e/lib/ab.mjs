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
  if (r.error) throw r.error;
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
  const r = ab(['open', url], { timeoutMs: 90_000 });
  ensureSingleTab();
  return r;
}

export function closeAll() {
  return ab(['close', '--all'], { allowFail: true });
}

export function press(key) {
  // Quote-safe: pass as single argv (spawn does not use shell)
  return ab(['press', key]);
}

export function waitMs(ms) {
  return ab(['wait', String(ms)]);
}

export function waitNetwork() {
  return ab(['wait', '--load', 'networkidle'], { timeoutMs: 90_000, allowFail: true });
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

/**
 * Poll until predicate (page function body returning truthy) or timeout.
 * @param {string} predicateBody  expression or block ending with return
 * @param {{ timeoutMs?: number, intervalMs?: number, label?: string }} [opts]
 */
export function waitFor(predicateBody, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 250;
  const label = opts.label || 'condition';
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = evalInPage(`(() => { ${predicateBody} })()`);
    if (last) return last;
    waitMs(intervalMs);
  }
  throw new Error(`waitFor timeout (${timeoutMs}ms): ${label}; last=${JSON.stringify(last)}`);
}

export function screenshot(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  return ab(['screenshot', abs], { allowFail: true });
}
