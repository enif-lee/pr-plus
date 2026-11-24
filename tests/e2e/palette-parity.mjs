/** Built MV3 UI fixture: node tests/e2e/palette-parity.mjs */
import assert from 'node:assert/strict';
import { Session } from 'pikabo';

const session = await Session.start({ extensionPath: process.cwd(), headless: true, viewport: { width: 1440, height: 1000 } });
try {
  const url = 'https://github.com/o/r/pull/1';
  await session.context.route('https://github.com/o/r/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html lang="en"><body><main>PR fixture</main></body></html>',
  }));
  const page = session.page('page');
  page.setDefaultTimeout(5000);
  await page.goto(url);
  await page.waitForSelector('[data-prp-content="1"]', { state: 'attached' });
  const worker = await session.worker();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://github.com/o/r/*' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (s) => document.documentElement.setAttribute('data-fixture-clipboard', s) } });
      const host = document.createElement('div');
      document.documentElement.append(host);
      const props = { open: true, loading: false, initialRoute: { page: 'conversation' }, prefs: { uiLanguage: 'en' },
        detail: { owner: 'o', repo: 'r', number: 1, title: 'Keyboard fixture', body: 'Keyboard fixture description',
          author: 'alice', viewerLogin: 'bob', state: 'open', baseRef: 'main', headRef: 'feature',
          commits: [{ sha: '1234567890abcdef', message: 'Update fixture' }], commitsCount: 2,
          comments: [{ id: 42, author: 'bob', body: 'My fixture comment', createdAt: '2026-11-24T02:00:00Z' }], reviews: [], reviewComments: [], reviewThreads: [],
          reviewThreadsMeta: { hasMore: true, totalCount: 3, loadedCount: 0 },
          developmentIssues: [{ number: 9, title: 'Fixture issue', url: 'https://github.com/o/r/issues/9' }],
          checks: { checkRuns: [{ id: 1, name: 'Fixture CI', html_url: 'https://github.com/o/r/actions/runs/1', status: 'completed', conclusion: 'success' }] },
          files: ['a.txt', 'b.txt'].map(filename => ({ filename, status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' })),
        },
        openPulls: [
          { number: 2, title: 'Another PR', headRef: 'release-candidate', baseRef: 'feature' },
          { number: 3, title: 'Alternate PR', headRef: 'z-alternate', baseRef: 'feature' },
        ],
        onFetchCompareFiles: async () => [{ filename: 'after.js', additions: 1, deletions: 0, patch: '@@ -1 +1,2 @@\n old\n+new' }],
        onOpenStackPr: (number) => host.setAttribute('data-fixture-stack-pr', String(number)),
        onLoadMoreReviewThreads: (mode) => host.setAttribute('data-fixture-pagination', mode),
        onClose: () => view.unmount(),
      };
      const view = globalThis.mountPrModal(host, props);
      window.addEventListener('fixture-mark-merged', () => {
        view.render({ ...props, detail: { ...props.detail, state: 'closed', merged: true } });
      }, { once: true });
    } });
  });
  const palette = page.locator('.prp-pp-layer--modal');
  const input = palette.locator('input');
  const select = page.locator('.prp-sselect-panel');
  const options = () => palette.locator('.prp-pp-item__title').allTextContents();
  const open = async (query) => {
    await page.keyboard.press('Alt+Shift+k');
    await input.waitFor();
    await input.fill(query);
  };
  const run = async (query, title) => {
    await open(query);
    await palette.getByRole('option').filter({ hasText: title }).first().click();
    await palette.waitFor({ state: 'hidden' });
    console.log('PASS command', title);
  };
  await page.getByRole('button', { name: /^Copy base branch / }).waitFor();
  await run('copy branch', 'Copy base branch name');
  assert.equal(await page.locator('html').getAttribute('data-fixture-clipboard'), 'main');
  await run('copy branch', 'Copy head branch name');
  assert.equal(await page.locator('html').getAttribute('data-fixture-clipboard'), 'feature');
  await page.locator('.prp-branch-tag--base a').evaluate(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      document.documentElement.dataset.fixtureBranchUrl = event.currentTarget.href;
    }, { capture: true, once: true });
  });
  await run('open base branch', 'Open base branch on GitHub');
  assert.equal(await page.locator('html').getAttribute('data-fixture-branch-url'), 'https://github.com/o/r/tree/main');
  await run('alternative stack path', 'Choose an alternative stack path');
  const pathOption = select.getByText(/^#[23] · (Another|Alternate) PR$/);
  const branchNumber = (await pathOption.textContent()).match(/^#(\d+)/)[1];
  await pathOption.click();
  await page.locator(`[data-fixture-stack-pr="${branchNumber}"]`).waitFor({ state: 'attached' });
  await run('timeline comments', 'Toggle timeline: comments');
  await page.locator('[data-prp-timeline-tip="comments"][aria-pressed="false"]').waitFor();
  await run('timeline all', 'Toggle timeline: All');
  await page.locator('[data-prp-timeline-tip="comments"][aria-pressed="true"]').waitFor();
  await page.keyboard.press('Alt+Shift+c');
  await page.locator('html[data-prp-focused-conv-anchor="body"]').waitFor({ state: 'attached' });
  for (const anchor of ['composer', 'merge', 'issue-comment:42']) {
    await page.keyboard.press('Alt+j');
    await page.locator(`html[data-prp-focused-conv-anchor="${anchor}"]`).waitFor({ state: 'attached' });
  }
  await run('focused comment text', 'Copy focused comment text');
  assert.equal(await page.locator('html').getAttribute('data-fixture-clipboard'), 'My fixture comment');
  await run('load more threads', 'Load more review threads');
  await page.locator('[data-fixture-pagination="more"]').waitFor({ state: 'attached' });
  await run('load all threads', 'Load all remaining comments and threads');
  await page.locator('[data-fixture-pagination="all"]').waitFor({ state: 'attached' });
  await page.keyboard.press('Control+f');
  await page.locator('.prp-search__input:visible').fill('fixture');
  await page.locator('.prp-search__load-comments:visible').waitFor();
  await run('load comments search', 'Load comments for search');
  await page.locator('[data-fixture-pagination="threads-all"]').waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  await run('search commits', 'Open and search commits');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search commits');
  await page.keyboard.press('Escape');
  await run('open linked issue', 'Open linked issue or PR');
  await select.getByText(/Fixture issue/).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Collapse metadata panel', exact: true }).click();
  await run('open ci check', 'Open CI check details');
  await select.getByText('Fixture CI').waitFor();
  await page.keyboard.press('Escape');
  await run('modal sheet', 'Switch between modal and side sheet');
  await page.locator('.prp-overlay[data-shell="sheet"]').waitFor();
  await run('modal sheet', 'Switch between modal and side sheet');
  await page.keyboard.press('Alt+.');
  await page.locator('.prp-body-panel--diff.prp-body-panel--active').waitFor();
  await run('copy branch', 'Copy head branch name');
  assert.equal(await page.locator('html').getAttribute('data-fixture-clipboard'), 'feature');
  await open('add reviewer');
  assert.deepEqual(await options(), []);
  await page.keyboard.press('Escape');
  await run('search file tree', 'Search the file tree');
  await page.waitForFunction(() => document.activeElement?.classList.contains('prp-filetree__search-input'));
  await page.keyboard.press('Escape');
  await run('unread', 'Toggle unread files filter');
  assert.equal(await page.getByRole('button', { name: 'Unread', exact: true }).getAttribute('aria-pressed'), 'true');
  await run('unread', 'Toggle unread files filter');
  await run('filter extension', 'Filter files by extension');
  await select.getByText('.txt', { exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '.txt', exact: true }).getAttribute('aria-pressed'), 'true');
  await run('commit range', 'Select a commit or range');
  await select.getByText(/Update fixture/).click();
  await select.getByRole('button', {name:'Apply selection'}).click();
  await run('all commits diff', 'Show all commits in Diff');
  await run('highlight word', 'Highlight changed words');
  await page.locator('[data-prp-review-filter-gear]').click();
  assert.equal(await page.locator('input[data-prp-word-highlight]').isChecked(), false);
  await page.keyboard.press('Escape');
  await page.locator('.prp-filetree__item[data-file-path="a.txt"]').click();
  await run('comment active file', 'Comment on the active file');
  await page.locator('[data-prp-composer-kind="selection"]:visible').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+.');
  await page.locator('.prp-body-panel--conversation.prp-body-panel--active').waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('fixture-mark-merged')));
  await page.locator('[data-prp-delete-head-branch="1"]').waitFor();
  await run('delete head branch', 'Delete the pull request head branch');
  const confirm = page.locator('[data-prp-confirm="1"]');
  await confirm.getByText('Delete branch?', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'hidden' });
  await run('close pr panel', 'Close PR panel');
  await page.locator('.prp-overlay').waitFor({state:'hidden'});
} finally { await session.close(); }
