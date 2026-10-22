/**
 * GitHub React pulls dashboard (Preview list): row discovery, tree indent,
 * title anchors, toggle mount. Markup mirrors github.com 2026 list view.
 */
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { formatMessage } from '../src/modal/lib/i18n';

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
  sandbox.PRModalI18n = { formatMessage };
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

  test('selection class repair preserves checkbox focus and does not move ordered rows', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml(), { pretendToBeVisual: true }).window.document;
    const forest = [{ pr: { number: 1 }, children: [{ pr: { number: 7 }, children: [] }] }];
    api.applyTreeIndents(doc, forest);
    api.applyListDecorations(doc, [{ number: 1 }, { number: 7 }]);
    const row = api.findListRowByNumber(doc, 7);
    const input = doc.createElement('input');
    input.type = 'checkbox';
    row.appendChild(input);
    input.focus();
    input.click();
    // GitHub React rewrites className when the checkbox changes.
    row.className = 'ListItem-module__listItem selectedRow';
    const observer = new doc.defaultView!.MutationObserver(() => {});
    observer.observe(row.parentElement, { childList: true, subtree: true });
    api.applyTreeIndents(doc, forest);
    api.applyListDecorations(doc, [{ number: 1 }, { number: 7 }]);
    expect(doc.activeElement).toBe(input);
    expect(input.checked).toBe(true);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  test('Original clears persistent depth after React drops the decoration class', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    api.applyTreeIndents(doc, [{ pr: { number: 1 }, children: [{ pr: { number: 7 }, children: [] }] }]);
    const row = api.findListRowByNumber(doc, 7);
    row.className = 'selectedRow';
    api.clearTreeIndents(doc);
    expect(row.hasAttribute('data-pr-tree-depth')).toBe(false);
    expect(row.style.getPropertyValue('--pr-tree-depth')).toBe('');
    expect(api.collectPagePrNumbers(doc)).toEqual([7, 1]);
  });

  test('row indicators distinguish own PR, zero changes and each check state', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    doc.documentElement.setAttribute('data-prp-app-locale', 'ko');
    const row = api.findListRowByNumber(doc, 7);
    const pr = { number: 7, author: 'alice', viewerDidAuthor: true,
      additions: 0, deletions: 12, changedFiles: 2, listChecksState: 'SUCCESS',
      listChecksPassed: 3, listChecksTotal: 4 };
    api.applyRowMeta(doc, row, pr);
    expect(row.querySelector('.pr-tree-author-self')?.textContent).toBe('alice(me)');
    expect(row.querySelector('.pr-tree-author')?.textContent).toBe('alice(me)');
    expect(row.querySelector('.pr-tree-author-me')?.parentElement).toBe(row.querySelector('.pr-tree-author'));
    expect(row.querySelector('.pr-tree-author-me')?.textContent).toBe('(me)');
    expect(row.querySelector('.pr-tree-badge-self')).toBeNull();
    expect(row.querySelector('.pr-tree-change-stats')?.textContent).toBe('+0−12');
    expect(row.querySelector('.pr-tree-row-meta .pr-tree-change-stats')).not.toBeNull();
    expect(row.querySelector('[data-listview-item-title-container] > .pr-tree-change-stats')).toBeNull();
    expect(row.querySelector('.pr-tree-checks-success')?.getAttribute('aria-label')).toBe('검사 통과 (성공 3 / 전체 4)');
    expect(row.querySelector('.pr-tree-checks-success')?.textContent).toBe('3/4');
    expect(row.querySelector('.pr-tree-checks-success svg')?.getAttribute('width')).toBe('12');
    expect(row.querySelector('.pr-tree-checks-success')?.classList.contains('pr-tree-badge')).toBe(true);
    for (const [state, kind] of [['FAILURE', 'failure'], ['ERROR', 'failure'],
      ['PENDING', 'pending'], ['EXPECTED', 'pending']]) {
      api.refreshReviewBadges(doc, [{ ...pr, listChecksState: state }]);
      expect(row.querySelector(`.pr-tree-checks-${kind}`)).not.toBeNull();
    }
    api.refreshReviewBadges(doc, [{ ...pr, listChecksState: null }]);
    expect(row.querySelector('.pr-tree-checks')).toBeNull();
    api.applyRowMeta(doc, row, { number: 7, additions: null, deletions: null });
    expect(row.querySelector('.pr-tree-change-stats')).toBeNull();
    expect(row.querySelector('.pr-tree-checks')).toBeNull();
    expect(row.querySelector('.pr-tree-badge-self')).toBeNull();
  });

  test('lower-row diff badges abbreviate thousands and retain exact hover counts', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const row = api.findListRowByNumber(doc, 7);
    const labels = doc.createElement('span');
    labels.textContent = 'bug';
    row.querySelector('h3')?.insertAdjacentElement('afterend', labels);
    for (const [value, text] of [[999, '+999'], [1000, '+1k'], [1500, '+1.5k'], [12345, '+12.3k']]) {
      api.applyRowMeta(doc, row, { number: 7, additions: value, deletions: 1500, changedFiles: 20 });
      expect(row.querySelector('.pr-tree-additions')?.textContent).toBe(text);
      expect(row.querySelector('.pr-tree-additions')?.getAttribute('title')).toBe(`+${value}`);
      expect(row.querySelector('.pr-tree-deletions')?.textContent).toBe('−1.5k');
      expect(row.querySelector('.pr-tree-change-stats')?.children.length).toBe(2);
      expect(row.querySelector('h3')?.nextElementSibling).toBe(labels);
      expect(row.querySelector('.pr-tree-change-stats')?.parentElement).toBe(row.querySelector('.pr-tree-row-meta'));
      expect(row.querySelector('.pr-tree-change-stats')?.classList.contains('pr-tree-badge')).toBe(true);
    }
    api.clearListDecorations(doc);
    expect(row.querySelector('.pr-tree-change-stats')).toBeNull();
  });

  test('branch badge preserves full names beyond the old character limit', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const row = api.findListRowByNumber(doc, 7);
    const baseRef = 'release/2026-long-running-integration-branch';
    const headRef = 'feature/CAL-12345-improve-conversation-layout-and-review-experience';
    api.applyRowMeta(doc, row, { number: 7, baseRef, headRef });
    expect(row.querySelector('.pr-tree-badge-branch')?.textContent).toBe(`${baseRef} ← ${headRef}`);
  });

  test('badge updates preserve connected author and relative-time nodes and live time text', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const pr = { number: 7, author: 'alice', viewerDidAuthor: true, baseRef: 'main', headRef: 'feature' };
    api.applyListDecorations(doc, [pr]);
    const row = api.findListRowByNumber(doc, 7);
    const author = row.querySelector('.pr-tree-author');
    const time = row.querySelector('.pr-tree-relative-time');
    time.textContent = 'live relative time';
    author.focus();
    const observer = new doc.defaultView!.MutationObserver(() => {});
    observer.observe(row.querySelector('.pr-tree-row-meta'), { childList: true, subtree: true });
    api.refreshReviewBadges(doc, [{ ...pr, additions: 1500, deletions: 3,
      listChecksState: 'SUCCESS', listChecksPassed: 3, listChecksTotal: 3 }]);
    expect(row.querySelector('.pr-tree-author')).toBe(author);
    expect(row.querySelector('.pr-tree-relative-time')).toBe(time);
    expect(time.textContent).toBe('live relative time');
    expect(doc.activeElement).toBe(author);
    const removed = observer.takeRecords().flatMap(record => [...record.removedNodes]);
    expect(removed.some(node => node === author || node.contains(author) || node === time || node.contains(time))).toBe(false);
    observer.disconnect();
  });

  test('unchanged deferred refresh preserves metadata nodes and reports no updates', () => {
    const api = loadDomApi();
    const doc = new JSDOM(reactPullsHtml()).window.document;
    const pr = { number: 7, author: 'alice' };
    api.applyListDecorations(doc, [pr]);
    const meta = doc.querySelector('.pr-tree-row-meta');
    const author = meta?.querySelector('.pr-tree-author');
    expect(api.refreshReviewBadges(doc, [pr])).toBe(0);
    expect(meta?.querySelector('.pr-tree-author')).toBe(author);
  });

  test('language preference changes refresh existing check descriptions without navigation', async () => {
    const domApi = loadDomApi();
    const page = new JSDOM(reactPullsHtml(), { url: 'https://github.com/o/r/pulls' });
    const sandbox: any = { module: { exports: {} }, globalThis: null, console };
    sandbox.globalThis = sandbox;
    sandbox.PRModalI18n = { formatMessage };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/content-bootstrap.js'), 'utf8'), sandbox);
    let onPrefs: any;
    const prs = [{ number: 7, author: 'alice', viewerDidAuthor: true,
      additions: 3, deletions: 1, changedFiles: 1, listChecksState: 'SUCCESS' }];
    const app = sandbox.module.exports.createPrTreeApp({
      document: page.window.document, window: page.window, PRTreeDOM: domApi,
      PRTree: { buildPrTree: (items: any[]) => items.map(pr => ({ pr, children: [] })) },
      PRTreeFetch: { fetchOpenPulls: async () => prs, findDanglingPrNumbers: () => [] },
      PRTreeStorage: { getExtensionPrefs: async () => ({ treeView: false }),
        watchExtensionPrefs: (cb: any) => { onPrefs = cb; return () => {}; } },
    });
    try {
      expect((await app.bootstrap()).ok).toBe(true);
      const row = domApi.findListRowByNumber(page.window.document, 7);
      expect(row.querySelector('.pr-tree-author')?.textContent).toBe('alice(me)');
      expect(row.querySelector('.pr-tree-author-me')?.parentElement).toBe(row.querySelector('.pr-tree-author'));
      expect(row.querySelector('.pr-tree-author-me')?.textContent).toBe('(me)');
      onPrefs({ uiLanguage: 'ko' });
      expect(row.querySelector('.pr-tree-author')?.textContent).toBe('alice(me)');
      expect(row.querySelector('.pr-tree-author-me')?.parentElement).toBe(row.querySelector('.pr-tree-author'));
      expect(row.querySelector('.pr-tree-author-me')?.textContent).toBe('(me)');
      expect(row.querySelector('.pr-tree-badge-self')).toBeNull();
      expect(row.querySelector('.pr-tree-checks')?.getAttribute('aria-label')).toBe('검사 통과');
      expect(row.querySelector('.pr-tree-change-stats')?.textContent).toBe('+3−1');
    } finally {
      page.window.close();
    }
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

  test('applyRowMeta hides the 2026-10 hashed description line', () => {
    const api = loadDomApi();
    const html = `<!DOCTYPE html><html><body>
      <ul role="list">
        <li class="listItem__X41oTe">
          <div data-listview-item-title-container="true">
            <h3>
              <a data-testid="listitem-title-link" href="/o/r/pull/1922">Proxy</a>
            </h3>
          </div>
          <div class="container__VGL_Vt">
            <div class="container__W45oI6 description__mZjLFE">
              <span><span>#1922</span></span>
              <span data-testid="timestamp-container">
                <a data-testid="author-filter-link" href="/o/r/pulls?q=author:Sungyoun-Kim">Sungyoun-Kim</a>
                <span> opened </span>
                <relative-time>Aug 28</relative-time>
              </span>
              <span>Review required</span>
            </div>
          </div>
        </li>
      </ul>
    </body></html>`;
    const doc = new JSDOM(html).window.document;
    const row = api.findListRowByNumber(doc, 1922);
    const ok = api.applyRowMeta(doc, row, {
      number: 1922,
      draft: false,
      baseRef: 'master',
      headRef: 'fix/pronaia-trusted-proxy',
      author: 'Sungyoun-Kim',
    });
    expect(ok).toBe(true);
    const native = row.querySelector('.description__mZjLFE');
    expect(native?.classList.contains('pr-tree-native-meta')).toBe(true);
    expect(native?.hasAttribute('hidden')).toBe(true);
    const meta = row.querySelector('.pr-tree-row-meta');
    expect(meta?.textContent).toContain('#1922');
    expect(meta?.textContent).toContain('opened');
    expect(meta?.textContent).toContain('Aug 28');
    expect(meta?.textContent).toContain('Sungyoun-Kim');
    expect(row.querySelectorAll('.pr-tree-row-meta').length).toBe(1);
  });

  test('refreshReviewBadges re-hides a replaced description node', () => {
    const api = loadDomApi();
    const html = `<!DOCTYPE html><html><body>
      <ul role="list">
        <li class="listItem__X41oTe">
          <div data-listview-item-title-container="true">
            <h3>
              <a data-testid="listitem-title-link" href="/o/r/pull/1922">Proxy</a>
            </h3>
          </div>
          <div class="container__VGL_Vt">
            <div class="description__mZjLFE">
              <span>#1922</span>
              <span data-testid="timestamp-container">
                <a data-testid="author-filter-link" href="/o/r/pulls?q=author:Sungyoun-Kim">Sungyoun-Kim</a>
                <relative-time>Aug 28</relative-time>
              </span>
            </div>
          </div>
        </li>
      </ul>
    </body></html>`;
    const doc = new JSDOM(html).window.document;
    const row = api.findListRowByNumber(doc, 1922);
    const pr = { number: 1922, author: 'Sungyoun-Kim', baseRef: 'master', headRef: 'fix/x' };
    expect(api.applyRowMeta(doc, row, pr)).toBe(true);
    const slot = row.querySelector('.container__VGL_Vt');
    slot.innerHTML = `<div class="description__mZjLFE"><span>#1922</span><span data-testid="timestamp-container"><a data-testid="author-filter-link">Sungyoun-Kim</a><relative-time>Aug 28</relative-time></span><span>Review required</span></div>`;
    expect(row.querySelector('.pr-tree-native-meta')).toBeNull();
    api.refreshReviewBadges(doc, [pr]);
    const native = row.querySelector('.description__mZjLFE');
    expect(native?.hasAttribute('hidden')).toBe(true);
    expect(row.querySelector('.pr-tree-row-meta')?.textContent).toContain('Review required');
  });

  test('rehideNativeDescriptions hides a replaced node and does not rewrite when already hidden', () => {
    const api = loadDomApi();
    const html = `<!DOCTYPE html><html><body>
      <ul role="list">
        <li>
          <div data-listview-item-title-container="true">
            <h3><a data-testid="listitem-title-link" href="/o/r/pull/1922">Proxy</a></h3>
          </div>
          <div class="description__mZjLFE"><span>#1922</span><span data-testid="timestamp-container"><relative-time>Aug 28</relative-time></span></div>
        </li>
      </ul>
    </body></html>`;
    const doc = new JSDOM(html).window.document;
    const row = api.findListRowByNumber(doc, 1922);
    expect(api.applyRowMeta(doc, row, { number: 1922, author: 'Sungyoun-Kim' })).toBe(true);
    row.querySelector('.description__mZjLFE')?.remove();
    const fresh = doc.createElement('div');
    fresh.className = 'description__mZjLFE';
    fresh.innerHTML = '<span>#1922</span><span data-testid="timestamp-container"><relative-time>Sep 1</relative-time></span>';
    row.appendChild(fresh);
    expect(api.rehideNativeDescriptions(doc)).toBe(1);
    expect(fresh.hasAttribute('hidden')).toBe(true);
    expect(api.rehideNativeDescriptions(doc)).toBe(0);
  });

  test('applyRowMeta hides a description that no longer uses description__', () => {
    const api = loadDomApi();
    const html = `<!DOCTYPE html><html><body>
      <ul role="list">
        <li>
          <div data-listview-item-title-container="true">
            <h3>
              <a data-testid="listitem-title-link" href="/o/r/pull/1838">Recorder</a>
            </h3>
          </div>
          <div class="meta-slot">
            <span><span>#1838</span></span>
            <span data-testid="timestamp-container">
              <a data-testid="author-filter-link" href="/o/r/pulls?q=author:rtzr-jelly">rtzr-jelly</a>
              <relative-time>Apr 27</relative-time>
            </span>
          </div>
        </li>
      </ul>
    </body></html>`;
    const doc = new JSDOM(html).window.document;
    const row = api.findListRowByNumber(doc, 1838);
    expect(api.applyRowMeta(doc, row, { number: 1838, author: 'rtzr-jelly' })).toBe(true);
    const native = row.querySelector('.meta-slot');
    expect(native?.classList.contains('pr-tree-native-meta')).toBe(true);
    expect(native?.hasAttribute('hidden')).toBe(true);
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
    // Row checkbox / label / menu clicks are native chrome, never a PR open.
    expect(click).toMatch(/input, select, textarea, label/);
    expect(click).toMatch(/role="checkbox"/);

    const onboard = read('src/onboarding-core.ts');
    expect(onboard).toMatch(/listitem-title-link/);

    const boot = read('src/content-bootstrap.ts');
    expect(boot).toMatch(/rehideNativeDescriptions\(document\)/);
  });
});
