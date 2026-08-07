/**
 * Open agent-browser with this repo's agent-browser.json (extension + profile).
 *
 * Usage:
 *   node scripts/browser-open.mjs
 *   node scripts/browser-open.mjs https://github.com/enif-lee/pr-plus/pulls
 *   npm run browser
 *   npm run browser -- https://github.com/login
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.slice(2).find((a) => a && !a.startsWith('-')) || '';

/**
 * @param {string[]} args
 * @param {{ inherit?: boolean, allowFail?: boolean }} [opts]
 */
function ab(args, opts = {}) {
  const r = spawnSync('agent-browser', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (r.error && !opts.allowFail) throw r.error;
  if ((r.status ?? 1) !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`agent-browser ${args.join(' ')} failed: ${err}`);
  }
  return r;
}

function ensureSoloTab() {
  const r = ab(['tab', 'list', '--json'], { allowFail: true });
  if ((r.status ?? 1) !== 0 || !r.stdout) return { kept: null, closed: 0 };
  let tabs = [];
  try {
    const parsed = JSON.parse(r.stdout);
    tabs = parsed?.data?.tabs || parsed?.tabs || [];
  } catch {
    return { kept: null, closed: 0 };
  }
  if (!Array.isArray(tabs)) return { kept: null, closed: 0 };
  const pages = tabs.filter(
    (t) => t && t.tabId && String(t.type || 'page') !== 'service_worker'
  );
  if (pages.length <= 1) {
    return { kept: pages[0]?.tabId || null, closed: 0 };
  }
  const keep = pages.find((t) => t.active) || pages[0];
  let closed = 0;
  for (const t of pages) {
    if (String(t.tabId) === String(keep.tabId)) continue;
    ab(['tab', 'close', String(t.tabId)], { allowFail: true });
    closed += 1;
  }
  if (keep?.tabId) ab(['tab', String(keep.tabId)], { allowFail: true });
  return { kept: keep?.tabId || null, closed };
}

// Fresh session so a just-rebuilt extension is picked up from extensions: ["."]
ab(['close', '--all'], { allowFail: true });

const openArgs = url ? ['open', url] : ['open'];
ab(openArgs, { inherit: true });

const solo = ensureSoloTab();
const target = url || 'about:blank';
console.log(
  `browser open ${target}` +
    (solo.closed ? ` (closed ${solo.closed} extra tab${solo.closed === 1 ? '' : 's'})` : '')
);
