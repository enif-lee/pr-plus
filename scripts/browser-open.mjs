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
import { resolveSystemChrome, systemChromeEnv } from './system-chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.slice(2).find((a) => a && !a.startsWith('-')) || '';
const chromeExe = resolveSystemChrome();
const profileDir = path.join(root, '.browser', 'profile');
console.log(`browser chrome ${chromeExe}`);

/**
 * @param {string[]} args
 * @param {{ allowFail?: boolean, launch?: boolean }} [opts]
 */
function ab(args, opts = {}) {
  const launchFlags = opts.launch
    ? [
        '--executable-path',
        chromeExe,
        '--profile',
        profileDir,
        '--extension',
        root,
      ]
    : [];
  const r = spawnSync(
    'agent-browser',
    [...launchFlags, '--session', 'pr-tree', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: systemChromeEnv(),
    }
  );
  if (r.error && !opts.allowFail) throw r.error;
  if ((r.status ?? 1) !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`agent-browser ${args.join(' ')} failed: ${err}`);
  }
  return r;
}

function waitForNoSessions(ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = spawnSync('agent-browser', ['session', 'list'], {
      cwd: root,
      encoding: 'utf8',
      env: systemChromeEnv(),
    });
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (/No active sessions/i.test(out) || (r.status === 0 && !/\bpr-tree\b|\bpr-plus-e2e\b/.test(out))) {
      return;
    }
    spawnSync('sleep', ['0.2']);
  }
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

// Fresh session so executable-path / rebuilt extension are not ignored by a live daemon.
ab(['close', '--all'], { allowFail: true });
waitForNoSessions();

// Launch first (URL on a cold Chrome process is often dropped).
ab(['open'], { launch: true });
spawnSync('sleep', ['0.8']);
if (url) ab(['open', url]);

const solo = ensureSoloTab();
const target = url || 'about:blank';
console.log(
  `browser open ${target}` +
    (solo.closed ? ` (closed ${solo.closed} extra tab${solo.closed === 1 ? '' : 's'})` : '')
);
