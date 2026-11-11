/** Deterministic MV3 integration: node tests/e2e/pulls-list-sync.mjs */
import assert from 'node:assert/strict';
import { Session } from 'pikabo';

const session = await Session.start({ extensionPath: process.cwd(), headless: true });
try {
  const worker = await session.worker();
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ githubToken: 'fixture-token', extensionPrefs: {
      pluginEnabled: true, treeView: true, onboardingCompleted: true,
    } });
    globalThis.fixtureBase = 'root';
    globalThis.fixtureListCalls = 0;
    globalThis.fetch = async (url, init = {}) => {
      let data = [];
      if (String(url).includes('/user')) data = { login: 'alice', id: 1 };
      if (String(url).includes('/pulls?')) {
        globalThis.fixtureListCalls++;
        data = [1, 2].map(n => ({ number: n, title: n === 1 ? 'Root' : 'Child',
          state: 'open', user: { login: 'alice' }, labels: [],
          head: { ref: n === 1 ? 'root' : 'child', sha: `head${n}` },
          base: { ref: n === 1 ? 'main' : globalThis.fixtureBase, sha: `base-${globalThis.fixtureBase}` },
        }));
      }
      if (String(url).endsWith('/graphql')) {
        const query = JSON.parse(init.body).query;
        data = { data: { repository: Object.fromEntries([1, 2].map(n => [`p${n}`, {
          viewerDidAuthor: true, additions: 3, deletions: 1, changedFiles: 1, statusCheckRollup: null,
        }])) } };
        assertQuery(query);
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    function assertQuery(query) {
      if (!query.includes('PullsListIndicators')) throw new Error(`Unexpected fixture query: ${query}`);
    }
  });
  await session.context.route('https://github.com/o/r/pulls*', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html lang="en"><body><main>
      <header><h1 data-testid="header-title">Pull requests</h1></header><ul>${[2, 1].map(n => `
      <li><input type="checkbox"><div data-listview-item-title-container="true"><h3>
      <a data-testid="listitem-title-link" href="/o/r/pull/${n}">PR ${n}</a></h3></div>
      <div class="Description-module__container"><span>#${n}</span><a data-testid="author-filter-link">alice</a></div></li>`).join('')}
      </ul></main></body></html>`,
  }));
  const page = session.page('page');
  await page.goto('https://github.com/o/r/pulls');
  const child = page.locator('li:has(a[href="/o/r/pull/2"])');
  await page.waitForFunction(() => document.querySelector('li:has(a[href="/o/r/pull/2"])')?.dataset.prTreeDepth === '1');
  assert.match(await child.locator('.pr-tree-badge-branch').innerText(), /root ← child/);
  await worker.evaluate(() => { globalThis.fixtureBase = 'main'; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('li:has(a[href="/o/r/pull/2"])')?.dataset.prTreeDepth === '0');
  assert.match(await child.locator('.pr-tree-badge-branch').innerText(), /main ← child/);
  await page.waitForFunction(() => document.querySelector('li:has(a[href="/o/r/pull/2"]) .pr-tree-change-stats')?.textContent === '+3−1');
  const calls = await worker.evaluate(() => globalThis.fixtureListCalls);
  assert.ok(calls >= 2);
  console.log(`PASS: MV3 REST/bridge → focus refresh → base badge + tree depth + extras (${calls} list requests)`);
} finally {
  await session.close();
}
