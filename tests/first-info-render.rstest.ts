/**
 * First-info render optimizations (방안 1 + 방안 2):
 * 1) fetchPrDetail fastIdentityOnly (1 RTT) + coalesceKey Stage-1 sharing +
 *    conditional milestone retry + parallel Stage-2 fetches.
 * 2) scrapeGithubPrPageSeed (0ms SSR DOM seed on /pull/N).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import {
  PAGE_EMBED_HOST_ID,
  scrapeGithubPrPageSeed,
} from '../src/modal/lib/page-embed';

const root = resolve(__dirname, '..');

function loadShippedFetchApi(customFetch: (url: string, init?: any) => Promise<any>) {
  const code = readFileSync(resolve(root, 'src/fetch-pulls.js'), 'utf8');
  const sandbox: any = {
    globalThis: {},
    module: { exports: {} },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    fetch: customFetch,
    performance: { now: () => Date.now() },
    AbortController,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'fetch-pulls.js' });
  return sandbox.globalThis.PRTreeFetch || sandbox.module.exports;
}

function makeFakeDoc(nodesBySelector: Record<string, any[]>) {
  return {
    querySelectorAll(sel: string) {
      return nodesBySelector[sel] || [];
    },
  };
}

function makeFakeNode(opts: {
  textContent?: string;
  innerHTML?: string;
  value?: string;
  attrs?: Record<string, string>;
  inEmbed?: boolean;
  hasItalicChild?: boolean;
}) {
  const attrs = opts.attrs || {};
  return {
    textContent: opts.textContent ?? '',
    innerHTML: opts.innerHTML ?? '',
    value: opts.value,
    getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
    querySelector: (sel: string) =>
      opts.hasItalicChild && sel.includes('em') ? {} : null,
    closest: (sel: string) => {
      if (opts.inEmbed && sel.includes(PAGE_EMBED_HOST_ID)) return {};
      return null;
    },
  };
}

describe('scrapeGithubPrPageSeed (0ms SSR DOM seed on /pull/N)', () => {
  test('scrapes title, raw textarea body, author, avatar, branch refs, and merged state', () => {
    const doc = makeFakeDoc({
      '.js-issue-title': [makeFakeNode({ textContent: '  Fix first info render latency  ' })],
      'textarea[name="pull_request[body]"]': [
        makeFakeNode({ value: '## Summary\nSpeed up first paint.' }),
      ],
      '.gh-header-meta .author': [makeFakeNode({ textContent: 'enif-lee' })],
      '.TimelineItem:first-of-type img.avatar': [
        makeFakeNode({ attrs: { src: 'https://avatars.githubusercontent.com/u/1?v=4' } }),
      ],
      '.commit-ref.base-ref': [makeFakeNode({ textContent: 'main' })],
      '.commit-ref.head-ref': [makeFakeNode({ textContent: 'feat/fast-open' })],
      '.gh-header-meta .State': [
        makeFakeNode({ attrs: { title: 'Status: Merged' }, textContent: 'Merged' }),
      ],
    });

    const seed = scrapeGithubPrPageSeed(doc, 'enif-lee', 'pr-plus', 19);
    expect(seed).not.toBeNull();
    expect(seed?.title).toBe('Fix first info render latency');
    expect(seed?.body).toBe('## Summary\nSpeed up first paint.');
    expect(seed?.author).toBe('enif-lee');
    expect(seed?.authorAvatarUrl).toBe('https://avatars.githubusercontent.com/u/1?v=4');
    expect(seed?.baseRef).toBe('main');
    expect(seed?.headRef).toBe('feat/fast-open');
    expect(seed?.merged).toBe(true);
    expect(seed?.state).toBe('closed');
    expect(seed?.draft).toBe(false);
  });

  test('falls back to rendered .js-comment-body HTML and ignores No description provided placeholder', () => {
    const docWithPlaceholder = makeFakeDoc({
      '.js-issue-title': [makeFakeNode({ textContent: 'Empty body PR' })],
      '.js-discussion .TimelineItem:first-of-type .js-comment-body': [
        makeFakeNode({
          textContent: 'No description provided.',
          innerHTML: '<p class="text-italic">No description provided.</p>',
          hasItalicChild: true,
        }),
      ],
      '.gh-header-meta .State': [
        makeFakeNode({ attrs: { title: 'Status: Draft' }, textContent: 'Draft' }),
      ],
    });
    const seed1 = scrapeGithubPrPageSeed(docWithPlaceholder, 'o', 'r', 1);
    expect(seed1?.title).toBe('Empty body PR');
    expect(seed1?.body).toBe('');
    expect(seed1?.draft).toBe(true);
    expect(seed1?.state).toBe('open');

    const docWithHtml = makeFakeDoc({
      '.js-issue-title': [makeFakeNode({ textContent: 'HTML body PR' })],
      '.js-discussion .TimelineItem:first-of-type .js-comment-body': [
        makeFakeNode({
          textContent: 'Rendered description text',
          innerHTML: '<p>Rendered description text</p>',
        }),
      ],
    });
    const seed2 = scrapeGithubPrPageSeed(docWithHtml, 'o', 'r', 2);
    expect(seed2?.body).toBe('Rendered description text');
  });

  test('ignores nodes inside #prp-page-embed, non-PR paths, and mismatched SSR header PR numbers', () => {
    const doc = makeFakeDoc({
      '.js-issue-title': [
        makeFakeNode({ textContent: 'Inside embed', inEmbed: true }),
      ],
    });
    expect(scrapeGithubPrPageSeed(doc, 'o', 'r', 3)).toBeNull();

    const nonPrDoc = {
      ...makeFakeDoc({
        '.js-issue-title': [makeFakeNode({ textContent: 'Issue 19' })],
      }),
      location: { pathname: '/o/r/issues/19' },
    };
    expect(scrapeGithubPrPageSeed(nonPrDoc, 'o', 'r', 19)).toBeNull();

    const mismatchedNumDoc = makeFakeDoc({
      '.gh-header-title .f1-light': [makeFakeNode({ textContent: '#99' })],
      '.js-issue-title': [makeFakeNode({ textContent: 'PR 99' })],
    });
    expect(scrapeGithubPrPageSeed(mismatchedNumDoc, 'o', 'r', 19)).toBeNull();
  });
});

describe('fetchPrDetail fastIdentityOnly + coalesceKey + parallel Stage 2', () => {
  test('fastIdentityOnly + full fetchPrDetail share Stage-1 requests via coalesceKey and skip redundant milestone retries', async () => {
    const calls: string[] = [];
    const customFetch = async (url: string) => {
      calls.push(url);
      if (url.includes('/pulls/19')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            number: 19,
            title: 'Fast PR #19',
            body: 'PR description body',
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            node_id: 'PR_kwDO19',
            user: { login: 'alice', avatar_url: 'https://example.com/a.png' },
            base: { ref: 'main', sha: 'basesha' },
            head: { ref: 'feat/fast', sha: 'headsha123' },
            labels: [{ name: 'perf', color: '00ff00' }],
            assignees: [],
            requested_reviewers: [],
            requested_teams: [],
            milestone: null,
            reactions: { total_count: 0 },
          }),
        };
      }
      if (url.includes('/issues/19/subscriptions')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ subscribed: true, ignored: false }),
        };
      }
      if (url.includes('/issues/19')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            number: 19,
            labels: [{ name: 'perf', color: '00ff00' }],
            assignees: [],
            milestone: null,
          }),
        };
      }
      if (url.endsWith('/user')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ login: 'viewer1' }),
        };
      }
      if (url.endsWith('/autolinks')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => [],
        };
      }
      if (url.endsWith('/repos/enif-lee/pr-plus')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            allow_merge_commit: true,
            allow_squash_merge: true,
            allow_rebase_merge: true,
          }),
        };
      }
      if (url.includes('/graphql')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            data: { repository: { pullRequest: { reviews: { nodes: [] } } } },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      };
    };
    const api = loadShippedFetchApi(customFetch);

    const coalesceKey = 'enif-lee/pr-plus#19:1';
    const [fastRes, fullRes] = await Promise.all([
      api.fetchPrDetail('enif-lee', 'pr-plus', 19, customFetch, 'ghp_test123', {
        skipReviewThreads: true,
        fastIdentityOnly: true,
        coalesceKey,
      }),
      api.fetchPrDetail('enif-lee', 'pr-plus', 19, customFetch, 'ghp_test123', {
        skipReviewThreads: true,
        coalesceKey,
      }),
    ]);

    expect(fastRes._fastCore).toBe(true);
    expect(fastRes.title).toBe('Fast PR #19');
    expect(fastRes.body).toBe('PR description body');
    expect(fastRes.headSha).toBe('headsha123');
    expect(fastRes.viewerPendingReview).toBeUndefined();
    expect(fastRes.subscribed).toBeUndefined();
    expect(fastRes.mergeStateStatus).toBeUndefined();
    expect(fastRes.allowMergeCommit).toBeUndefined();
    expect(fastRes.behindBy).toBeUndefined();
    expect(fastRes.conflictFiles).toBeUndefined();
    expect(typeof fastRes._fetchTimings?.pull).toBe('number');

    expect(fullRes._fastCore).toBeUndefined();
    expect(fullRes.title).toBe('Fast PR #19');
    expect(fullRes.allowMergeCommit).toBe(true);
    expect(typeof fullRes._fetchTimings?.pull).toBe('number');

    // Stage 1 /pulls/19 and /issues/19 should only be fetched ONCE across both calls
    // (no extra milestone retry calls when Stage-1 issue succeeded)
    const pullCalls = calls.filter(
      (u) => u.includes('/pulls/19') && !u.includes('/reviews')
    );
    const issueCalls = calls.filter(
      (u) => u.includes('/issues/19') && !u.includes('/subscriptions')
    );
    expect(pullCalls.length).toBe(1);
    expect(issueCalls.length).toBe(1);
    // GraphQL called only once (for subscription/pendingReview; reactions skipped because total_count === 0)
    const gqlCalls = calls.filter((u) => u.includes('/graphql'));
    expect(gqlCalls.length).toBe(1);
  });

  test('retryMilestone: true explicitly triggers milestone retry when milestone is null', async () => {
    let issueCallCount = 0;
    const customFetch = async (url: string) => {
      if (url.includes('/issues/19')) {
        issueCallCount += 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            number: 19,
            milestone:
              issueCallCount >= 2
                ? { number: 3, title: 'v1.0', state: 'open' }
                : null,
          }),
        };
      }
      if (url.includes('/pulls/19')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            number: 19,
            title: 'MS PR',
            body: '',
            state: 'open',
            base: { ref: 'main', sha: 'b' },
            head: { ref: 'feat', sha: 'h' },
            milestone: null,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      };
    };
    const api = loadShippedFetchApi(customFetch);

    const res = await api.fetchPrDetail('enif-lee', 'pr-plus', 19, customFetch, 'ghp_test', {
      skipReviewThreads: true,
      fastIdentityOnly: true,
      retryMilestone: true,
    });
    expect(res.milestone?.title).toBe('v1.0');
    expect(issueCallCount).toBe(2);
  });

  test('Stage 2 secondary fetches (mergeSettings, subscription, pendingReview, bodyReactions) execute in parallel', async () => {
    const stage2StartTimes: number[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const customFetch = async (url: string) => {
      if (url.includes('/pulls/19')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            number: 19,
            title: 'Parallel Stage 2 PR',
            body: 'Body',
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            node_id: 'PR_kwDO19',
            user: { login: 'alice', avatar_url: '' },
            base: { ref: 'main', sha: 'b' },
            head: { ref: 'feat', sha: 'h' },
            reactions: { total_count: 2 },
          }),
        };
      }
      if (
        url.endsWith('/repos/enif-lee/pr-plus') ||
        url.includes('/issues/19/subscriptions') ||
        url.includes('/graphql')
      ) {
        stage2StartTimes.push(Date.now());
        await delay(40);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            allow_merge_commit: true,
            allow_squash_merge: true,
            allow_rebase_merge: true,
            subscribed: true,
            ignored: false,
            data: {
              repository: { pullRequest: { reviews: { nodes: [] } } },
              node: { reactionGroups: [] },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      };
    };
    const api = loadShippedFetchApi(customFetch);
    await api.fetchPrDetail('enif-lee', 'pr-plus', 19, customFetch, 'ghp_test', {
      skipReviewThreads: true,
    });
    // At least 3 Stage-2 calls (repoMergeSettings, subscription, pendingReview, bodyReactions)
    expect(stage2StartTimes.length).toBeGreaterThanOrEqual(3);
    const spreadMs = Math.max(...stage2StartTimes) - Math.min(...stage2StartTimes);
    // Started concurrently within a single tick, not sequentially after 40ms each
    expect(spreadMs).toBeLessThan(25);
  });
});
