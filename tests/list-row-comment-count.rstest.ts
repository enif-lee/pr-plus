/**
 * Native list-row re-render from open PR detail (PR → list resync).
 */
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadDomApi() {
  const code = fs.readFileSync(
    path.join(__dirname, '../src/dom.js'),
    'utf8'
  );
  const sandbox: any = {
    module: { exports: {} },
    exports: {},
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'dom.js' });
  return sandbox.module.exports || sandbox.PRTreeDOM || sandbox.globalThis.PRTreeDOM;
}

function classicListHtml() {
  return `<!DOCTYPE html><html><body>
    <div class="js-navigation-container">
      <div class="js-issue-row" id="issue_42">
        <div class="flex-auto">
          <a class="js-navigation-open" href="/o/r/pull/42">Old title</a>
          <span class="labels">
            <a class="IssueLabel" data-name="bug" style="background-color:#d73a4a">bug</a>
          </span>
          <div class="d-flex mt-1 text-small color-fg-muted">
            <span class="opened-by">#42 opened by alice</span>
          </div>
        </div>
        <a class="Link--muted" aria-label="2 comments" href="/o/r/pull/42">
          <svg class="octicon octicon-comment"></svg>
          <span>2</span>
        </a>
      </div>
    </div>
  </body></html>`;
}

describe('updateListRowCommentCount', () => {
  test('updates numeric text + aria-label on classic comment control', () => {
    const api = loadDomApi();
    const dom = new JSDOM(classicListHtml());
    const doc = dom.window.document;
    const ok = api.updateListRowCommentCount(doc, 42, 5);
    expect(ok).toBe(true);
    const a = doc.querySelector('a.Link--muted');
    expect(a?.getAttribute('aria-label')).toBe('5 comments');
    expect(a?.querySelector('span')?.textContent).toBe('5');
  });

  test('returns false for unknown PR number', () => {
    const api = loadDomApi();
    const dom = new JSDOM(classicListHtml());
    expect(api.updateListRowCommentCount(dom.window.document, 99, 3)).toBe(
      false
    );
  });
});

describe('applyListRowFromDetail', () => {
  test('updates title, labels, comment count, and draft meta from detail', () => {
    const api = loadDomApi();
    const dom = new JSDOM(classicListHtml());
    const doc = dom.window.document;
    const ok = api.applyListRowFromDetail(doc, 42, {
      number: 42,
      title: 'New title after edit',
      draft: true,
      baseRef: 'main',
      headRef: 'feat/x',
      labels: [
        { name: 'enhancement', color: 'a2eeef', description: 'New feature' },
        { name: 'docs', color: '0075ca' },
      ],
      listCommentCount: 7,
    });
    expect(ok).toBe(true);
    expect(doc.querySelector('a.js-navigation-open')?.textContent).toBe(
      'New title after edit'
    );
    const labels = [...doc.querySelectorAll('.pr-tree-list-label')].map(
      (el) => el.textContent
    );
    expect(labels).toEqual(['enhancement', 'docs']);
    expect(doc.querySelector('a.Link--muted span')?.textContent).toBe('7');
    // Draft badge from applyRowMeta
    expect(doc.querySelector('.pr-tree-badge-draft')?.textContent).toBe('Draft');
  });

  test('clears labels when detail.labels is empty', () => {
    const api = loadDomApi();
    const dom = new JSDOM(classicListHtml());
    const doc = dom.window.document;
    api.applyListRowFromDetail(doc, 42, {
      number: 42,
      title: 'T',
      labels: [],
    });
    expect(doc.querySelectorAll('.pr-tree-list-label').length).toBe(0);
    expect(doc.querySelector('.labels')?.textContent?.trim()).toBe('');
  });
});
