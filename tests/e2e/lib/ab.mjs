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
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number, allowFail?: boolean }} [opts]
 */
export function ab(args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const r = spawnSync('agent-browser', ['--session', SESSION, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    input: opts.input,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
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

export function open(url) {
  return ab(['open', url], { timeoutMs: 90_000 });
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
