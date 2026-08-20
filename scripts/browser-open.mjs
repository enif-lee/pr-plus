/**
 * Headed manual session: load this unpacked extension via pikabo (Playwright Chromium).
 *
 * Branded Chrome 137+ ignores --load-extension. pikabo uses a Chromium build that still
 * honours it, plus a persistent profile so PAT / cookies survive relaunches.
 *
 * Usage:
 *   npm run browser
 *   npm run browser -- https://github.com/login
 *   npm run browser:linear
 *   npm run browser:close
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from 'pikabo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileDir = path.join(root, '.browser', 'pikabo-profile');
const pidFile = path.join(root, '.browser', 'pikabo.pid');
const DEFAULT_URL = 'https://linear.app/mornica/issue/PRP-2';

const argv = process.argv.slice(2).filter(Boolean);
const closeOnly = argv.includes('--close');
const openPopup = argv.includes('--popup');
const urlArg = argv.find((a) => !a.startsWith('-'));
const url = urlArg || (closeOnly ? '' : DEFAULT_URL);

function livePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number(String(readFileSync(pidFile, 'utf8')).trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function killProfileBrowsers() {
  spawnSync('pkill', ['-f', profileDir], { encoding: 'utf8' });
}

function closeExisting() {
  const pid = readPid();
  if (pid && pid !== process.pid && livePid(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && livePid(pid)) {
      spawnSync('sleep', ['0.15']);
    }
    if (livePid(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
  killProfileBrowsers();
  if (existsSync(pidFile)) unlinkSync(pidFile);
}

if (closeOnly) {
  closeExisting();
  console.log('browser closed (pikabo)');
  process.exit(0);
}

if (!existsSync(path.join(root, 'manifest.json'))) {
  throw new Error(`No manifest.json in ${root}`);
}
if (!existsSync(path.join(root, 'src', 'background.sw.js'))) {
  throw new Error('src/background.sw.js missing. Run `npm run build` first.');
}

closeExisting();
mkdirSync(profileDir, { recursive: true });

const session = await Session.start({
  extensionPath: root,
  profileDir,
  headless: false,
  keepProfile: true,
  debugPort: true,
});

const ext = session.extension;
const popupUrl = ext.popup ? `chrome-extension://${ext.id}/${ext.popup}` : '(no popup)';

mkdirSync(path.dirname(pidFile), { recursive: true });
writeFileSync(pidFile, String(process.pid), 'utf8');

const page = session.page('page');
if (url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((err) => {
    console.error(`navigate failed: ${err instanceof Error ? err.message : err}`);
  });
}
if (openPopup && ext.popup) {
  await session.openPopup().catch((err) => {
    console.error(`openPopup failed: ${err instanceof Error ? err.message : err}`);
  });
}

console.log(`browser chrome pikabo / ${session.browser.version || 'chromium'}`);
console.log(`pr+ loaded id=${ext.id} mv${ext.manifestVersion ?? 3} sw=${ext.hasServiceWorker ? 'yes' : 'no'}`);
console.log(`browser profile ${path.relative(root, profileDir)}`);
console.log(`browser open ${url || 'about:blank'}`);
console.log(`browser popup ${popupUrl}`);
console.log('');
console.log('Manual check:');
console.log('  1. Open the popup (toolbar, or the chrome-extension:// URL above).');
console.log('  2. Save a GitHub PAT if this profile is new.');
console.log('  3. Connected sites → Linear (accept the permission prompt).');
console.log('  4. Reload the Linear issue and click a linked GitHub PR.');
console.log('Close the window, Ctrl+C, or `npm run browser:close` when done.');

function finish() {
  writeFileSync(pidFile, '', 'utf8');
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
  }
}

await new Promise((resolve) => {
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    resolve();
  };
  session.context.on('close', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});

await session.close().catch(() => undefined);
finish();
console.log('browser closed (pikabo)');
