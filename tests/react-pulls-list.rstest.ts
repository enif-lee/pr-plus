/**
 * GitHub React pulls dashboard (Preview list): row discovery, tree indent,
 * title anchors, toggle mount. Markup mirrors github.com 2026 list view.
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
  sandbox.PRTree = {
    flattenPrTree(forest: any[]) {
      const out: any[] = [];
      const walk = (nodes: any[], depth: number) => {
        for (const n of nodes || []) {
          out.push({ pr: n.pr || n, depth });
          walk(n.children || [], depth + 1);
        }
      };
      walk(forest, 0);
      return out;
    },
  };
  vm.runInNewContext(code, sandbox, { filename: 'dom.js' });
  return sandbox.module.exports || sandbox.PRTreeDOM || sandbox.globalThis.PRTreeDOM;
}

function reactPullsHtml() {
  return `<!DOCTYPE html><html><body>
    <main>
      <react-app app-name="pull-requests" class="loaded">
        <div class="d-flex flex-items-top gap-2">
          <h1 data-testid="header-title">All pull requests</h1>
        </div>
        <nav>
          <ul>
            <li data-component="ActionList.Item">
              <a href="/o/r/pulls?q=is:pr+state:open">Pull requests</a>
            </li>
          </ul>
        </nav>
        <ul class="ListView-module__ul" role="list">
          <li class="ListItem-module__listItem PullsListItem-module__listItem" tabindex="0">
            <div class="Title-module__container" data-listview-item-title-container="true">
              <h3>
                <a data-testid="listitem-title-link" href="https://github.com/o/r/pull/7">Child PR</a>
              </h3>
            </div>
            <div class="Description-module__container PullsListItem-module__description">
              <span>#7 </span>
              <span data-testid="timestamp-container"></span>
              <a data-testid="author-filter-link" href="/o/r/pulls?q=author:alice">alice</a>
              <relative-time>now</relative-time>
            </div>
          </li>
          <li class="ListItem-module__listItem PullsListItem-module__listItem" tabindex="-1">
            <div class="Title-module__container" data-listview-item-title-container="true">
              <h3>
                <a data-testid="listitem-title-link" href="/o/r/pull/1">Root PR</a>
              </h3>
            </div>
            <div class="Description-module__container PullsListItem-module__description">
              <span>#1 </span>
              <a data-testid="author-filter-link" href="/o/r/pulls?q=author:bob">bob</a>
            </div>
          </li>
        </ul>
      </react-app>
    </main>
  </body></html>`;
}

describe('React pulls dashboard list rows', () => {
  test('finds dashboard rows and ignores sidebar nav', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const rows = api.findOriginalPrRows(doc);
    expect(rows.length).toBe(2);
    expect(api.collectPagePrNumbers(doc)).toEqual([7, 1]);
    expect(api.getPrNumberFromRow(rows[0])).toBe(7);
    expect(api.getPrNumberFromRow(rows[1])).toBe(1);
  });

  test('title anchor prefers listitem-title-link', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const row = api.findListRowByNumber(doc, 7);
    const a = api.findListRowTitleAnchor(row);
    expect(a?.getAttribute('data-testid')).toBe('listitem-title-link');
    expect(a?.getAttribute('href')).toContain('/pull/7');
  });

  test('closestPrListRow matches dashboard li from the title link', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const a = doc.querySelector('[data-testid="listitem-title-link"]');
    const row = api.closestPrListRow(a);
    expect(row?.tagName).toBe('LI');
    expect(api.getPrNumberFromRow(row)).toBe(7);
  });

  test('applyTreeIndents reorders and sets depth', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const forest = [
      {
        pr: { number: 1, title: 'Root PR' },
        children: [{ pr: { number: 7, title: 'Child PR' }, children: [] }],
      },
    ];
    const applied = api.applyTreeIndents(doc, forest);
    expect(applied).toBe(2);
    const rows = api.findOriginalPrRows(doc);
    expect(api.getPrNumberFromRow(rows[0])).toBe(1);
    expect(api.getPrNumberFromRow(rows[1])).toBe(7);
    expect(rows[0].dataset.prTreeDepth).toBe('0');
    expect(rows[1].dataset.prTreeDepth).toBe('1');
    expect(rows[1].classList.contains('pr-tree-indented')).toBe(true);
  });

  test('applyRowMeta hides native description and paints #number', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const row = api.findListRowByNumber(doc, 7);
    const ok = api.applyRowMeta(doc, row, {
      number: 7,
      draft: false,
      baseRef: 'main',
      headRef: 'feat/x',
      author: 'alice',
    });
    expect(ok).toBe(true);
    expect(row.querySelector('.pr-tree-pr-number')?.textContent).toBe('#7');
    const native = row.querySelector('.pr-tree-native-meta');
    expect(native?.hasAttribute('hidden')).toBe(true);
    const title = api.findListRowTitleAnchor(row);
    const meta = row.querySelector('.pr-tree-row-meta');
    expect(title?.contains(meta)).toBe(false);
  });

  test('mountToggleNearHeader uses header-title parent', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const btn = api.createToggleButton(doc, {
      onShowTree() {},
      onShowOriginal() {},
    });
    const host = api.mountToggleNearHeader(doc, btn);
    expect(host.querySelector('#pr-tree-toggle')).toBe(btn);
    expect(host.querySelector('[data-testid="header-title"]')).toBeTruthy();
  });
});

describe('React pulls dashboard wiring (static)', () => {
  const root = path.join(__dirname, '..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  test('dom + click-intercept + onboarding know listitem-title-link', () => {
    const dom = read('src/dom.ts');
    expect(dom).toMatch(/listitem-title-link/);
    expect(dom).toMatch(/PR_REACT_LIST_ROW/);
    expect(dom).toMatch(/closestPrListRow/);

    const click = read('src/host/modules/click-intercept.ts');
    expect(click).toMatch(/listitem-title-link/);
    expect(click).toMatch(/isPullsListChromeClick/);
    expect(click).toMatch(/parsePrFromListRow/);

    const onboard = read('src/onboarding-core.ts');
    expect(onboard).toMatch(/listitem-title-link/);
  });
});
