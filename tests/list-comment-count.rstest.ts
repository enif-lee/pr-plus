/**
 * List-row comment total estimation after progressive load-more.
 */
import { describe, expect, test } from '@rstest/core';
import { estimateListCommentCount } from '../src/modal/lib/list-comment-count.ts';
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

describe('estimateListCommentCount', () => {
  test('prefers explicit listCommentCount / totalCount', () => {
    expect(
      estimateListCommentCount({
        comments: [],
        listCommentCount: 12,
        commentsMeta: { hasMore: false },
      })
    ).toBe(12);
    expect(
      estimateListCommentCount({
        comments: [{ id: 1 }],
        commentsMeta: { totalCount: 40, hasMore: false },
      })
    ).toBe(40);
  });

  test('incomplete pagination returns null (preserve native list)', () => {
    expect(
      estimateListCommentCount({
        comments: [{ id: 1 }],
        commentsMeta: { hasMore: true },
      })
    ).toBe(null);
    expect(
      estimateListCommentCount({
        comments: [{ id: 1 }, { id: 2 }],
        commentsMeta: { hasMore: false },
        timelineMeta: { hasMore: true },
      })
    ).toBe(null);
  });

  test('after load-more: empty comments + complete flags must not publish 0', () => {
    // Regression: timeline exhaustion set commentsMeta.hasMore=false while
    // comments[] was empty → list badge wiped to 0.
    expect(
      estimateListCommentCount({
        comments: [],
        commentsMeta: { hasMore: false, loadedCount: 0 },
        timelineMeta: { hasMore: false, complete: true },
      })
    ).toBe(null);
  });

  test('complete non-empty comments returns length', () => {
    expect(
      estimateListCommentCount({
        comments: [{ id: 1 }, { id: 2 }, { id: 3 }],
        commentsMeta: { hasMore: false, complete: true },
        timelineMeta: { hasMore: false, complete: true },
      })
    ).toBe(3);
  });
});

describe('updateListRowCommentCount refuses downgrade', () => {
  test('does not lower an existing painted count', () => {
    const api = loadDomApi();
    const html = `<!DOCTYPE html><html><body>
      <div class="js-navigation-container">
        <div class="js-issue-row" id="issue_7">
          <a class="Link--muted" aria-label="9 comments" href="/o/r/pull/7">
            <svg class="octicon octicon-comment"></svg>
            <span>9</span>
          </a>
        </div>
      </div>
    </body></html>`;
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const ok = api.updateListRowCommentCount(doc, 7, 0);
    expect(ok).toBe(false);
    expect(doc.querySelector('span')?.textContent).toBe('9');
    expect(doc.querySelector('a')?.getAttribute('aria-label')).toBe(
      '9 comments'
    );
    // Higher counts still apply
    expect(api.updateListRowCommentCount(doc, 7, 11)).toBe(true);
    expect(doc.querySelector('span')?.textContent).toBe('11');
  });
});
