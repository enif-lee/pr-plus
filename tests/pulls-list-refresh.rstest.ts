/**
 * In-place /pulls refresh after leaving the PR shell: list-filter search +
 * per-row snapshot (fetch) and native React row patch / hide (dom).
 */
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  buildPullsListSearchQuery,
  fetchPullsListSnapshot,
  fetchOpenPullsPublic,
  fetchDanglingPulls,
  fetchOpenPulls,
  fetchPullsListExtras,
} from '../src/fetch/pulls';

function loadDomApi() {
  const code = fs.readFileSync(path.join(__dirname, '../src/dom.js'), 'utf8');
  const sandbox: any = { module: { exports: {} }, exports: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'dom.js' });
  return sandbox.module.exports || sandbox.PRTreeDOM;
}

function graphqlFetch(data: any, calls: any[]) {
  return async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data }),
    };
  };
}

describe('buildPullsListSearchQuery', () => {
  test('missing or blank q is the default open PR list', () => {
    expect(buildPullsListSearchQuery('o', 'r', null)).toBe(
      'repo:o/r is:pr is:open'
    );
    expect(buildPullsListSearchQuery('o', 'r', '  ')).toBe(
      'repo:o/r is:pr is:open'
    );
  });

  test('keeps the user filter and scopes it to the repo', () => {
    expect(
      buildPullsListSearchQuery('o', 'r', 'is:pr is:open author:@me label:bug')
    ).toBe('repo:o/r is:pr is:open author:@me label:bug');
  });

  test('adds is:pr when the filter omits it, keeps an explicit repo:', () => {
    expect(buildPullsListSearchQuery('o', 'r', 'is:open review:required')).toBe(
      'repo:o/r is:open review:required is:pr'
    );
    expect(buildPullsListSearchQuery('o', 'r', 'repo:x/y is:pr')).toBe(
      'repo:x/y is:pr'
    );
  });
});

describe('fetchPullsListSnapshot', () => {
  test('one query: filter search + aliased rows, mapped to row fields', async () => {
    const calls: any[] = [];
    const fetchImpl = graphqlFetch(
      {
        search: { issueCount: 2, nodes: [{ number: 7 }, { number: 9 }] },
        repository: {
          p7: {
            number: 7,
            title: 'Renamed',
            state: 'OPEN',
            isDraft: true,
            totalCommentsCount: 12,
            author: { login: 'alice' }, viewerDidAuthor: true,
            additions: 25, deletions: 4, changedFiles: 2,
            statusCheckRollup: { state: 'FAILURE', contexts: { totalCount: 150,
              checkRunCountsByState: [{ state: 'SUCCESS', count: 100 }, { state: 'FAILURE', count: 10 },
                { state: 'SKIPPED', count: 10 }, { state: 'NEUTRAL', count: 10 }],
              statusContextCountsByState: [{ state: 'SUCCESS', count: 15 }, { state: 'PENDING', count: 5 }] } },
            labels: { nodes: [{ name: 'bug', color: 'd73a4a', description: '' }] },
          },
          p8: {
            number: 8,
            title: 'Gone',
            state: 'MERGED',
            isDraft: false,
            totalCommentsCount: 3,
            labels: { nodes: [] },
          },
        },
      },
      calls
    );
    const snap = await fetchPullsListSnapshot(
      'o',
      'r',
      { query: 'is:pr is:open', numbers: [7, 8, 7, 'x'] },
      fetchImpl,
      'token'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].body.variables.q).toBe('repo:o/r is:pr is:open');
    expect(calls[0].body.query).toContain('p7: pullRequest(number:7)');
    expect(calls[0].body.query).toContain('p8: pullRequest(number:8)');
    expect(calls[0].body.query).not.toContain('pullRequest(number:NaN)');
    // rateLimit is injected into the query operation, not the row fragment
    const sent = calls[0].body.query;
    expect(sent.indexOf('rateLimit')).toBeGreaterThan(
      sent.indexOf('query PullsListSnapshot')
    );
    expect(sent.indexOf('query PullsListSnapshot')).toBeGreaterThan(
      sent.indexOf('fragment ListRowPr')
    );
    expect(snap.searchComplete).toBe(true);
    expect(snap.matchedNumbers).toEqual([7, 9]);
    expect(snap.prs).toEqual([
      {
        number: 7,
        title: 'Renamed',
        author: 'alice', viewerDidAuthor: true,
        additions: 25, deletions: 4, changedFiles: 2, listChecksState: 'FAILURE',
        listChecksPassed: 115, listChecksTotal: 150,
        state: 'open',
        merged: false,
        draft: true,
        labels: [{ name: 'bug', color: 'd73a4a', description: '' }],
        listCommentCount: 12,
      },
      {
        number: 8,
        title: 'Gone',
        state: 'closed',
        merged: true,
        draft: false,
        labels: [],
        listCommentCount: 3,
      },
    ]);
  });

  test('truncated search page is not complete', async () => {
    const snap = await fetchPullsListSnapshot(
      'o',
      'r',
      { query: null, numbers: [] },
      graphqlFetch({ search: { issueCount: 250, nodes: [{ number: 1 }] } }, []),
      'token'
    );
    expect(snap.searchComplete).toBe(false);
    expect(snap.prs).toEqual([]);
  });

  test('no visible rows: search only, no repository block', async () => {
    const calls: any[] = [];
    await fetchPullsListSnapshot(
      'o',
      'r',
      { numbers: [] },
      graphqlFetch({ search: { issueCount: 0, nodes: [] } }, calls),
      'token'
    );
    expect(calls[0].body.query).not.toContain('repository(');
    expect(calls[0].body.variables).toEqual({ q: 'repo:o/r is:pr is:open' });
  });
});

function reactListHtml() {
  return `<!DOCTYPE html><html><body><ul>
    <li id="row-8">
      <a data-testid="listitem-title-link" href="/o/r/pull/8">Old title</a>
      <span class="trailingBadgesContainer">
        <button type="button" aria-label="Filter by label bug"><span class="prc-Token-IssueLabel-x"><span>bug</span></span></button>
        <button type="button" aria-label="Filter by label documentation"><span class="prc-Token-IssueLabel-x"><span>documentation</span></span></button>
      </span>
      <div class="metadata"><svg class="octicon octicon-comment"></svg> <!-- -->4</div>
    </li>
    <li id="row-9">
      <a data-testid="listitem-title-link" href="/o/r/pull/9">Other</a>
    </li>
  </ul></body></html>`;
}

describe('applyListRowSnapshot / hideStaleListRow (React list rows)', () => {
  test('reads all label chips across per-label filter buttons', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 8);
    expect(api.readListRowLabelNames(row)).toEqual(['bug', 'documentation']);
  });

  test('patches title + comment count, keeps native chips when labels match', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 8);
    const changed = api.applyListRowSnapshot(doc, row, {
      number: 8,
      title: 'New title',
      labels: [{ name: 'documentation' }, { name: 'bug' }],
      listCommentCount: 6,
    });
    expect(changed).toBe(true);
    expect(row.querySelector('[data-testid="listitem-title-link"]').textContent).toBe(
      'New title'
    );
    expect(row.querySelectorAll('button[aria-label^="Filter by label"]')).toHaveLength(2);
    expect(row.querySelector('.metadata').textContent.trim()).toBe('6');
  });

  test('never lowers the React text-node comment count', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 8);
    api.applyListRowSnapshot(doc, row, { number: 8, listCommentCount: 2 });
    expect(row.querySelector('.metadata').textContent.trim()).toBe('4');
  });

  test('rebuilds chips in the badges container when labels changed', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 8);
    api.applyListRowSnapshot(doc, row, {
      number: 8,
      labels: [{ name: 'enhancement', color: 'a2eeef' }, { name: 'bug' }],
    });
    const host = row.querySelector('.trailingBadgesContainer');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(api.readListRowLabelNames(row)).toEqual(['bug', 'enhancement']);
  });

  test('unchanged row reports no change', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 9);
    expect(
      api.applyListRowSnapshot(doc, row, { number: 9, title: 'Other', labels: [] })
    ).toBe(false);
  });

  test('hides a row that left the filter (once)', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactListHtml()).window.document;
    const row = api.findListRowByNumber(doc, 9);
    expect(api.hideStaleListRow(row)).toBe(true);
    expect(row.hidden).toBe(true);
    expect(row.classList.contains('pr-tree-stale-row')).toBe(true);
    expect(api.hideStaleListRow(row)).toBe(false);
  });
});

describe('progressive list metadata fetch', () => {
  test('known author flags are omitted from revalidation, including false', async () => {
    let query = '';
    const patches = await fetchPullsListExtras('o', 'r', [
      { number: 1, viewerDidAuthor: true }, { number: 2, viewerDidAuthor: false },
    ], async (_url: string, init: any) => {
      if (!init.body) return { ok: true, json: async () => [] };
      query = JSON.parse(init.body).query;
      return { ok: true, headers: new Headers(), json: async () => ({ data: { repository: {
        p1: { additions: 2, deletions: 1, statusCheckRollup: null },
        p2: { additions: 3, deletions: 2, statusCheckRollup: null },
      } } }) };
    }, 'token');
    expect(query).not.toContain('viewerDidAuthor');
    expect(patches[0].viewerDidAuthor).toBe(true);
    expect(patches[1].viewerDidAuthor).toBe(false);
  });

  test('essential open and page-only PRs use REST without waiting for GraphQL/autolinks', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init: any) => {
      calls.push(url);
      expect(init.body).toBeUndefined();
      expect(url).not.toContain('/autolinks');
      return { ok: true, json: async () => url.includes('state=open')
        ? [{ number: 1, user: { login: 'alice' }, head: { ref: 'feature', sha: 'head1' }, base: { ref: 'main', sha: 'base1' } }]
        : { number: 7, user: { login: 'bob' }, head: { ref: 'closed-feature' }, base: { ref: 'feature' } } };
    };
    const prs = await fetchOpenPulls('o', 'r', fetchImpl, {
      token: 'token', pagePrNumbers: [1, 7], includeAutolinks: false,
    });
    expect(calls).toHaveLength(2);
    expect(prs.map((pr: any) => pr.number)).toEqual([1, 7]);
    expect(prs[0]).toMatchObject({ headRef: 'feature', baseRef: 'main', headSha: 'head1', baseSha: 'base1' });
    expect(prs[0]).not.toHaveProperty('viewerDidAuthor');
  });

  test('follow-up batches indicators and runs autolinks concurrently, returning only metadata patches', async () => {
    const calls: any[] = [];
    let release: (value: any) => void;
    const gate = new Promise(resolve => { release = resolve; });
    const fetchImpl = async (url: string, init: any) => {
      calls.push({ url, init });
      if (!init.body) return { ok: true, json: async () => [
        { key_prefix: 'DEMO-', url_template: 'https://issues.example/<num>' },
      ] };
      await gate;
      return { ok: true, headers: new Headers(), json: async () => ({ data: { repository: {
        p1: { viewerDidAuthor: true, additions: 0, deletions: 0, changedFiles: 0, statusCheckRollup: null },
        p7: { viewerDidAuthor: false, additions: 20, deletions: 3, changedFiles: 1, statusCheckRollup: {
          state: 'PENDING', contexts: { totalCount: 4, checkRunCountsByState: [{ state: 'SUCCESS', count: 3 }] },
        } },
      } } }) };
    };
    const pending = fetchPullsListExtras('o', 'r', [
      { number: 1, title: 'DEMO-300', headRef: 'feature', baseRef: 'main' },
      { number: 7, title: 'Closed PR' },
    ], fetchImpl, 'token');
    expect(calls).toHaveLength(2);
    const query = JSON.parse(calls[0].init.body).query;
    expect(query).toContain('p1:pullRequest(number:1)');
    expect(query).toContain('p7:pullRequest(number:7)');
    expect(query.match(/viewerDidAuthor/g)).toHaveLength(2);
    expect(query).toContain('checkRunCountsByState { state count }');
    expect(query).not.toContain('nodes');
    release(null);
    const patches = await pending;
    expect(patches[0]).toMatchObject({ number: 1, viewerDidAuthor: true, additions: 0, deletions: 0,
      listChecksState: null, magicLinks: [{ key: 'DEMO-300', url: 'https://issues.example/300' }] });
    expect(patches[0]).not.toHaveProperty('title');
    expect(patches[0]).not.toHaveProperty('headRef');
    expect(patches[1]).toMatchObject({ number: 7, listChecksState: 'PENDING', listChecksPassed: 3, listChecksTotal: 4 });
  });

  test('unavailable indicators/autolinks do not invent status or fail the follow-up', async () => {
    for (const token of [null, 'token']) {
      const patches = await fetchPullsListExtras('o', 'r', [{ number: 1 }], async () => {
        throw new Error('offline');
      }, token);
      expect(patches).toEqual([{ number: 1, magicLinks: [] }]);
    }
  });

  test('optional autolink failure preserves links already present in a refreshed snapshot', async () => {
    const links = [{ key: 'ENG-7', url: 'https://issues.example/7' }];
    const patches = await fetchPullsListExtras('o', 'r', [{ number: 1, magicLinks: links }],
      async () => { throw new Error('offline'); }, 'token');
    expect(patches).toEqual([{ number: 1, magicLinks: links }]);
  });

  test('standalone REST helpers never query indicators', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => url.includes('state=open') ? [{ number: 1 }] : { number: 7 } };
    };
    await fetchOpenPullsPublic('o', 'r', fetchImpl, 'token');
    await fetchDanglingPulls('o', 'r', [7], fetchImpl, 'token');
    expect(calls).toHaveLength(2);
    expect(calls.every(url => !url.endsWith('/graphql'))).toBe(true);
  });
});
