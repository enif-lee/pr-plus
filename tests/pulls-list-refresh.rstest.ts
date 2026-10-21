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
