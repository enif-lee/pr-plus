/**
 * Resolve installed Google Chrome (not Chrome for Testing).
 * Used by npm run browser and e2e so sessions match a real user Chrome.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STABLE_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome-stable',
  '/usr/local/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function isTestingChrome(p) {
  return /chrome for testing|chrome-headless-shell|chromium-for-testing/i.test(
    String(p || '')
  );
}

function firstExisting(paths) {
  for (const p of paths) {
    if (p && existsSync(p) && !isTestingChrome(p)) return p;
  }
  return null;
}

function which(cmd) {
  try {
    const out = execFileSync('which', [cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out && existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveSystemChrome(env = process.env) {
  const forced = env.PRP_CHROME_PATH || env.AGENT_BROWSER_EXECUTABLE_PATH;
  if (forced && existsSync(forced) && !isTestingChrome(forced)) return forced;
  const hit = firstExisting(STABLE_CANDIDATES);
  if (hit) return hit;
  for (const cmd of ['google-chrome-stable', 'google-chrome']) {
    const w = which(cmd);
    if (w && !isTestingChrome(w)) return w;
  }
  throw new Error(
    'Google Chrome (stable) not found. Install it or set PRP_CHROME_PATH. Chrome for Testing is not used.'
  );
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv}
 */
export function systemChromeEnv(env = process.env) {
  const exe = resolveSystemChrome(env);
  return { ...env, AGENT_BROWSER_EXECUTABLE_PATH: exe };
}
