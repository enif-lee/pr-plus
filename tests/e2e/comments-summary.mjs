/** Built MV3 UI fixture: node tests/e2e/comments-summary.mjs */
import assert from 'node:assert/strict';
import { Session } from 'pikabo';

const session = await Session.start({ extensionPath: process.cwd(), headless: true, viewport: { width: 1440, height: 1000 } });
try {
  await session.context.route('https://github.com/o/r/pull/1', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html lang="en"><body><main>PR fixture</main></body></html>',
  }));
  const page = session.page('page');
  await page.goto('https://github.com/o/r/pull/1');
  await page.waitForSelector('[data-prp-content="1"]', { state: 'attached' });
  const worker = await session.worker();
  async function fixture(action) {
    return worker.evaluate(async action => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/o/r/*' });
      const [execution] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [action],
        func: action => {
          if (action === 'mount') {
            const host = document.createElement('div');
            document.documentElement.append(host);
            const props = { open: true, loading: false, initialRoute: { page: 'conversation' }, prefs: { uiLanguage: 'en' },
              detail: { owner: 'o', repo: 'r', number: 1, title: 'Show comment resolution in the sidebar', body: 'Comment summary fixture',
                author: 'alice', state: 'open', files: [], commits: [], comments: [], reviews: [], reviewComments: [],
                reviewThreads: Array.from({ length: 12 }, (_, i) => ({ threadNodeId: `PRRT_${i}`, resolved: i < 9, commentIds: [], commentsLoaded: false })),
                reviewThreadsMeta: { source: 'graphql', totalCount: 12, hasMore: false },
                checks: { state: 'success', checkRuns: [{ id: 1, name: 'Tests', status: 'completed', conclusion: 'success' }] },
              } };
            globalThis.__commentsFixture = { props, view: globalThis.mountPrModal(host, props) };
          } else {
            const f = globalThis.__commentsFixture;
            const detail = action === 'resolve'
              ? { ...f.props.detail, reviewThreads: f.props.detail.reviewThreads.map(thread => ({ ...thread, resolved: true })) }
              : action === 'partial'
                ? { ...f.props.detail, reviewThreadsMeta: { source: 'graphql', totalCount: 15, hasMore: true } }
                : action === 'empty' ? { ...f.props.detail, reviewThreads: [], reviewThreadsMeta: { source: 'graphql', totalCount: 0, hasMore: false } }
                  : f.props.detail;
            f.props = { ...f.props, detail };
            f.view.render(f.props);
          }
        },
      });
      return execution.result;
    }, action);
  }
  await fixture('mount');
  const summary = page.locator('.prp-conversation__aside .prp-comment-summary');
  await summary.getByText('3 unresolved', { exact: true }).first().waitFor();
  const sections = await page.locator('.prp-conversation__aside .prp-aside-section').evaluateAll(nodes => nodes.map(node => node.querySelector('h3')?.textContent));
  assert.equal(sections.indexOf('Comments') + 1, sections.indexOf('Checks'));
  assert.equal(await summary.locator('.prp-comment-summary__bar .prp-comment-summary__segment--resolved').getAttribute('style'), 'width: 75%;');
  await page.locator('.prp-conversation__aside').screenshot({ path: '/tmp/pr-plus-comments-sidebar.png' });
  // Exercise the same theme classes/tokens used by the host's initial theme.
  await page.evaluate(() => document.querySelectorAll('.prp-overlay').forEach(el => {
    el.classList.replace('prp-theme-light', 'prp-theme-dark');
    el.setAttribute('data-color-mode', 'dark');
  }));
  await page.locator('.prp-overlay.prp-theme-dark').waitFor();
  await page.locator('.prp-conversation__aside').screenshot({ path: '/tmp/pr-plus-comments-sidebar-dark.png' });
  await page.evaluate(() => document.querySelectorAll('.prp-overlay').forEach(el => {
    el.classList.replace('prp-theme-dark', 'prp-theme-light');
    el.setAttribute('data-color-mode', 'light');
  }));
  await page.locator('.prp-overlay.prp-theme-light').waitFor();
  await fixture('resolve');
  await summary.getByText('0 unresolved', { exact: true }).first().waitFor();
  assert.equal(await summary.locator('.prp-comment-summary__bar .prp-comment-summary__segment--unresolved').count(), 0);
  await fixture('partial');
  await summary.getByText('3 not loaded', { exact: true }).waitFor();
  assert.equal(await summary.locator('.prp-comment-summary__segment--unknown').getAttribute('style'), 'width: 20%;');
  await page.getByRole('button', { name: 'Collapse metadata panel', exact: true }).click();
  await page.locator('.prp-comment-summary--compact').getByText('3 not loaded').waitFor();
  await page.locator('.prp-conversation__aside').screenshot({ path: '/tmp/pr-plus-comments-sidebar-compact.png' });
  await fixture('empty');
  await page.locator('.prp-comment-summary--compact').getByText('No review conversations').waitFor();
  console.log('PASS: sidebar placement, resolve updates, partial coverage, compact rail, and empty state');
} finally {
  await session.close();
}
