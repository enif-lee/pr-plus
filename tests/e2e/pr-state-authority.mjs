/** Real MV3/React with deterministic API responses: node tests/e2e/pr-state-authority.mjs */
import assert from 'node:assert/strict';
import { Session } from 'pikabo';

const session = await Session.start({ extensionPath: process.cwd(), headless: true });
try {
  const worker = await session.worker();
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ githubToken: 'fixture-token', extensionPrefs: {
      pluginEnabled: true, autoOpenEmbed: false, onboardingCompleted: true, treeView: true,
    } });
    await chrome.storage.session.set({ 'prp:peopleMetaAuthority': {
      owner: 'o', repo: 'r', number: 1, at: Date.now(), fields: { milestone: { title: 'Stale board' }, labels: [{ name: 'stale' }] },
    } });
    globalThis.fixtureTitle = 'Current PR';
    globalThis.fixtureRequests = [];
    globalThis.fetch = async (url, init = {}) => {
      globalThis.fixtureRequests.push({ url: String(url), cache: init.cache });
      const pathname = new URL(String(url)).pathname;
      const pr = { number: 1, node_id: 'PR_fixture', title: globalThis.fixtureTitle, body: '',
        state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
        user: { login: 'alice', id: 1 }, labels: [], assignees: [], requested_reviewers: [],
        milestone: null, changed_files: 0, comments: 0, review_comments: 0, commits: 0,
        reactions: { total_count: 0 }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-11-10T00:00:00Z',
        head: { ref: 'feature', sha: 'head', repo: { name: 'r', owner: { login: 'o' } } },
        base: { ref: 'release', sha: 'new-base', repo: { name: 'r', owner: { login: 'o' } } },
      };
      let data = [];
      if (pathname === '/user') data = { login: 'alice', id: 1 };
      else if (pathname === '/repos/o/r/pulls/1' || pathname === '/repos/o/r/issues/1') data = pr;
      else if (pathname === '/repos/o/r/pulls') data = [pr];
      else if (pathname === '/repos/o/r') data = { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true, permissions: { admin: false } };
      else if (pathname.endsWith('/check-runs')) data = { check_runs: [], total_count: 0 };
      else if (pathname.endsWith('/status')) data = { state: 'success', statuses: [] };
      else if (pathname.includes('/contents/')) return new Response('{}', { status: 404 });
      else if (pathname === '/graphql') {
        const pageInfo = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };
        const pullRequest = { id: 'PR_fixture', viewerSubscription: 'UNSUBSCRIBED', mergeStateStatus: 'CLEAN',
          reviewThreads: { nodes: [], totalCount: 0, pageInfo },
          timelineItems: { nodes: [], totalCount: 0, pageInfo }, files: { nodes: [], pageInfo },
          closingIssuesReferences: { nodes: [] }, projectItems: { nodes: [] }, reactionGroups: [],
        };
        data = { data: { repository: { pullRequest }, node: pullRequest, viewer: { login: 'alice' }, nodes: [] } };
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
  await session.context.route('https://github.com/o/r/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html lang="en"><body><main><h1>Native fixture</h1></main></body></html>',
  }));
  const page = session.page('page');
  for (const presentation of ['modal', 'embed']) {
    await page.goto(`https://github.com/o/r/${presentation === 'embed' ? 'pull/1' : 'pulls'}`);
    await page.waitForSelector('[data-prp-content="1"]', { state: 'attached' });
    const result = await worker.evaluate(async presentation => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/o/r/*' });
      const [execution] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [presentation],
        func: async presentation => {
          const host = globalThis.PRModalHost;
          host.setEnabled(true);
          host._detailCache.set('o/r#1', { owner: 'o', repo: 'r', number: 1, title: 'Cached PR', body: 'Stale body',
            labels: [{ name: 'cached' }], assignees: ['old'], requestedReviewers: ['old'], milestone: { title: 'Cached board' },
            baseRef: 'main', baseSha: 'old-base', headRef: 'feature', headSha: 'head', changedFiles: 1,
            files: [{ filename: 'stale.ts', patch: '@@ -1 +1 @@\n-old\n+cached' }], commits: [{ sha: 'stale' }],
            comments: [{ id: 1, body: 'Deleted remotely', author: 'alice', createdAt: '2026-01-01T00:00:00Z' }],
            timelineMeta: { hasMore: true, startCursor: 'old-cursor' },
            reviewComments: [], reviewThreads: [],
          });
          await host.openModal({ owner: 'o', repo: 'r', number: 1, presentation });
          // Let independently fetched comments/reviews publish their final slices.
          const deadline = Date.now() + 5000;
          while ((!host._getState().sideSettled?.comments || host._getState().loadStage?.busy) && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          const detail = host._getState().detail;
          return { title: detail.title, body: detail.body, milestone: detail.milestone, labels: detail.labels,
            assignees: detail.assignees, baseRef: detail.baseRef, files: detail.files, commits: detail.commits,
            comments: detail.comments, timelineMeta: detail.timelineMeta };
        },
      });
      return execution.result;
    }, presentation);
    assert.equal(result.title, 'Current PR');
    assert.equal(result.body, '');
    assert.equal(result.milestone, null);
    assert.deepEqual(result.labels, []);
    assert.deepEqual(result.assignees, []);
    assert.equal(result.baseRef, 'release');
    assert.deepEqual(result.files, []);
    assert.deepEqual(result.commits, []);
    assert.deepEqual(result.comments, []);
    assert.equal(result.timelineMeta.hasMore, false);
    assert.equal(result.timelineMeta.startCursor, null);
    await page.getByText('Current PR', { exact: true }).first().waitFor();
    assert.equal(await page.locator('html').innerText().then(text => text.includes('Cached board')), false);
    console.log(`PASS: ${presentation} replaces stale memory/session values with current empty metadata, diff and timeline`);
    const focusedTitle = `Focused ${presentation}`;
    await worker.evaluate(title => { globalThis.fixtureTitle = title; }, focusedTitle);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText(focusedTitle, { exact: true }).first().waitFor();
    console.log(`PASS: ${presentation} focus fetches current metadata even with unchanged head and updatedAt`);
    await worker.evaluate(() => { globalThis.fixtureTitle = 'Current PR'; });
  }
  const requests = await worker.evaluate(() => globalThis.fixtureRequests);
  assert.ok(requests.length > 5);
  assert.ok(requests.every(request => request.cache === 'no-store'));
  console.log(`PASS: ${requests.length} API requests bypass HTTP cache`);
} finally {
  await session.close();
}
