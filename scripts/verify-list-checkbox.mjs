/**
 * One-off verification: /pulls row checkbox must toggle natively (no pr+ modal).
 * Uses pikabo (Playwright Chromium) since branded Chrome ignores --load-extension.
 *
 *   node scripts/verify-list-checkbox.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from 'pikabo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PULLS = 'https://github.com/enif-lee/pr-plus/pulls';

const session = await Session.start({
  extensionPath: root,
  profileDir: path.join(root, '.browser', 'profile'),
  headless: true,
  keepProfile: true,
});

try {
  const page = session.page('page');
  await page.goto(PULLS, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const probe = await page.evaluate(`(() => {
    const r = document.documentElement;
    return {
      url: location.pathname,
      title: document.title,
      bridge: r.getAttribute('data-prp-bridge'),
      hook: r.getAttribute('data-prp-gql-cost-hook'),
      toggle: !!document.getElementById('pr-tree-toggle'),
      indented: document.querySelectorAll('.pr-tree-indented').length,
      rowCbs: document.querySelectorAll('li input[type="checkbox"]').length,
    };
  })()`);
  console.log('probe:', JSON.stringify(probe));
  if (!probe.bridge) throw new Error('extension content bridge did not inject');
  if (!probe.rowCbs) throw new Error('no row checkboxes found (logged out?)');

  // Click the row checkbox for the first row that has one
  const r1 = await page.evaluate(`(() => {
    const cb = document.querySelector('li input[type="checkbox"]');
    if (!cb) return { found: false };
    cb.scrollIntoView({ block: 'center' });
    const before = cb.checked;
    cb.click();
    return {
      found: true, before, after: cb.checked,
      overlay: !!document.querySelector('.prp-overlay'),
      path: location.pathname,
    };
  })()`);
  console.log('click1:', JSON.stringify(r1));
  if (!r1.found) throw new Error('checkbox missing');
  if (r1.overlay) throw new Error('pr+ overlay opened on checkbox click');
  if (!/\/pulls/.test(r1.path)) throw new Error(`navigated away: ${r1.path}`);
  if (r1.after === r1.before) throw new Error('checkbox did not toggle');

  await page.waitForTimeout(700);
  const r2 = await page.evaluate(`(() => {
    const cb = document.querySelector('li input[type="checkbox"]');
    const before = cb.checked;
    cb.click();
    return {
      before, after: cb.checked,
      overlay: !!document.querySelector('.prp-overlay'),
      path: location.pathname,
    };
  })()`);
  console.log('click2:', JSON.stringify(r2));
  if (r2.overlay) throw new Error('pr+ overlay opened on second click');
  if (r2.after !== false) throw new Error('checkbox did not toggle off');

  console.log('PASS: checkbox toggles natively, no pr+ modal');
} finally {
  await session.close().catch(() => undefined);
}
