import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const prs = [
  { number: 1, title: 'Root', baseRef: 'main', headRef: 'root', author: 'alice' },
  { number: 2, title: 'Child', baseRef: 'root', headRef: 'child', author: 'bob' },
];
function setup(options: { tree?: boolean; rest?: Promise<any[]>; fetch?: () => Promise<any[]> } = {}) {
  const page = new JSDOM(`<main><header><h1 data-testid="header-title">Pull requests</h1></header><ul>${[2, 1].map(n =>
    `<li class="PullsListItem-module__listItem"><input type="checkbox"><div data-listview-item-title-container="true"><h3><a data-testid="listitem-title-link" href="/o/r/pull/${n}">PR ${n}</a></h3></div><div class="Description-module__container"><span>#${n}</span><a data-testid="author-filter-link">alice</a></div></li>`).join('')}</ul></main>`,
  { url: 'https://github.com/o/r/pulls' });
  const sandbox: any = { module: { exports: {} }, console,
    MutationObserver: page.window.MutationObserver, Event: page.window.Event,
    clearTimeout: page.window.clearTimeout.bind(page.window) };
  sandbox.globalThis = sandbox;
  for (const name of ['tree', 'dom', 'content-bootstrap']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../src/${name}.js`), 'utf8'), sandbox);
  }
  const requests: any[] = [];
  const restOptions: any[] = [];
  let reorders = 0;
  const dom = sandbox.PRTreeDOM;
  const app = sandbox.PRTreeBootstrap.createPrTreeApp({
    document: page.window.document, window: page.window, PRTree: sandbox.PRTree,
    PRTreeDOM: { ...dom, applyTreeIndents(...args: any[]) { reorders++; return dom.applyTreeIndents(...args); } },
    PRTreeStorage: { getExtensionPrefs: async () => ({ treeView: options.tree !== false }), watchGithubToken: () => {} },
    PRTreeFetch: {
      fetchOpenPulls: async (_o: any, _r: any, _fetch: any, opts: any) => {
        restOptions.push(opts); return options.fetch?.() || options.rest || prs.map(pr => ({ ...pr }));
      },
      findDanglingPrNumbers: (numbers: number[], rows: any[]) => numbers.filter(n => !rows.some(pr => pr.number === n)),
      fetchPullsListExtras: (owner: string, repo: string, rows: any[], opts: any) => {
        const pending = deferred<any[]>();
        requests.push({ owner, repo, rows, opts, pending, treeWasActive: app.isActive() });
        return pending.promise;
      },
    },
  });
  const tick = () => new Promise(resolve => page.window.setTimeout(resolve, 0));
  return { page, doc: page.window.document, app, requests, restOptions, dom, tick, reorders: () => reorders };
}
const patch = { number: 2, viewerDidAuthor: true, additions: 1500, deletions: 3,
  listChecksState: 'SUCCESS', listChecksPassed: 4, listChecksTotal: 4 };

describe('progressive pulls list', () => {
  for (const event of ['focus', 'turbo:load']) {
    test(`${event} revalidates branch metadata even with unchanged PR numbers`, async () => {
      let latest = prs.map(pr => ({ ...pr }));
      const h = setup({ fetch: async () => latest });
      let watch: any;
      try {
        await h.app.bootstrap();
        await h.tick();
        h.requests[0].pending.resolve([patch]);
        await h.tick();
        watch = h.app.watchPullsPage();
        latest = prs.map(pr => ({ ...pr, baseRef: 'main' }));
        h.page.window.dispatchEvent(new h.page.window.Event(event));
        const deadline = Date.now() + 2000;
        while (h.requests.length < 2 && Date.now() < deadline) {
          await new Promise(resolve => h.page.window.setTimeout(resolve, 5));
        }
        expect(h.restOptions.length).toBeGreaterThan(1);
        expect(h.requests.length).toBeGreaterThan(1);
        h.requests.at(-1).pending.resolve([{ ...patch, additions: 22 }]);
        await h.tick();
        expect(h.app.getCachedPrs()[1].additions).toBe(22);
        expect(h.app.getCachedPrs()[1].baseRef).toBe('main');
        expect(h.dom.findListRowByNumber(h.doc, 2).dataset.prTreeDepth).toBe('0');
        expect(h.dom.findListRowByNumber(h.doc, 2).querySelector('.pr-tree-badge-branch').textContent).toContain('main');
      } finally { watch?.disconnect(); h.page.window.close(); }
    });
  }

  test('filter navigation revalidates existing PRs, not just missing rows', async () => {
    let latest = prs.map(pr => ({ ...pr }));
    const h = setup({ fetch: async () => latest });
    try {
      await h.app.bootstrap();
      latest = prs.map(pr => ({ ...pr, baseRef: 'main' }));
      h.page.window.history.replaceState(null, '', '/o/r/pulls?q=base:main');
      await h.app.handlePageChange();
      expect(h.restOptions).toHaveLength(2);
      expect(h.app.getCachedPrs()[1].baseRef).toBe('main');
    } finally { h.page.window.close(); }
  });

  test('returning to the same list revalidates even when SPA navigation emits no Turbo event', async () => {
    let latest = prs.map(pr => ({ ...pr }));
    const h = setup({ fetch: async () => latest });
    try {
      await h.app.bootstrap();
      h.page.window.history.replaceState(null, '', '/o/r/pull/2');
      await h.app.handlePageChange();
      latest = prs.map(pr => ({ ...pr, baseRef: 'main' }));
      h.page.window.history.replaceState(null, '', '/o/r/pulls');
      await h.app.handlePageChange();
      expect(h.restOptions).toHaveLength(2);
      expect(h.app.getCachedPrs()[1].baseRef).toBe('main');
    } finally { h.page.window.close(); }
  });

  for (const mutation of ['patch', 'remove', 'replace']) {
    test(`a delayed list response cannot undo a newer ${mutation}`, async () => {
      const pending = deferred<any[]>();
      let calls = 0;
      const h = setup({ fetch: async () => ++calls === 1 ? prs.map(pr => ({ ...pr })) : pending.promise });
      try {
        await h.app.bootstrap();
        h.page.window.history.replaceState(null, '', '/o/r/pulls?q=is:open');
        const refresh = h.app.handlePageChange();
        await h.tick();
        if (mutation === 'patch') h.app.patchCachedPr(2, { baseRef: 'new-base' });
        if (mutation === 'remove') h.app.removeCachedPr(2);
        if (mutation === 'replace') h.app.replaceCachedPrs([{ ...prs[1], baseRef: 'new-base' }]);
        pending.resolve(prs.map(pr => ({ ...pr })));
        await refresh;
        const child = h.app.getCachedPrs().find((pr: any) => pr.number === 2);
        if (mutation === 'remove') expect(child).toBeUndefined();
        else expect(child.baseRef).toBe('new-base');
      } finally { h.page.window.close(); }
    });
  }

  test('a response from a departed repo cannot become the active list cache', async () => {
    const rest = deferred<any[]>();
    const h = setup({ rest: rest.promise });
    try {
      const pending = h.app.bootstrap();
      await h.tick();
      h.page.window.history.replaceState(null, '', '/other/repo/pulls');
      rest.resolve(prs);
      expect((await pending).reason).toBe('stale-data');
      expect(h.app.getCachedPrs()).toBeNull();
      expect(h.app.replaceCachedPrs(prs, { owner: 'o', repo: 'r' })).toBe(false);
    } finally { h.page.window.close(); }
  });

  test('direct PR write-through cannot patch the same number in another repo cache', async () => {
    const h = setup();
    try {
      await h.app.bootstrap();
      h.page.window.history.replaceState(null, '', '/other/repo/pull/2');
      expect(h.app.patchCachedPr(2, { baseRef: 'wrong-repo' }, { owner: 'other', repo: 'repo' })).toBe(false);
      expect(h.app.getCachedPrs()[1].baseRef).toBe('root');
    } finally { h.page.window.close(); }
  });

  test('clearing account data rejects a delayed REST response with the previous viewer flag', async () => {
    const rest = deferred<any[]>();
    const h = setup({ rest: rest.promise });
    try {
      const pending = h.app.bootstrap();
      await h.tick();
      h.app.clearCache();
      rest.resolve(prs.map(pr => ({ ...pr, viewerDidAuthor: true })));
      expect((await pending).reason).toBe('stale-data');
      expect(h.app.getCachedPrs()).toBeNull();
      expect(h.app.isActive()).toBe(false);
      expect(h.doc.querySelector('.pr-tree-author-me')).toBeNull();
    } finally { h.page.window.close(); }
  });
  test('cached REST badges are present on the first tree render, before revalidation starts', async () => {
    const h = setup({ rest: Promise.resolve(prs.map(pr => pr.number === 2 ? { ...pr, ...patch } : { ...pr })) });
    try {
      await h.app.bootstrap();
      expect(h.requests).toHaveLength(0);
      expect(h.doc.querySelector('.pr-tree-checks').textContent).toBe('4/4');
      expect(h.doc.querySelector('.pr-tree-change-stats').textContent).toBe('+1.5k−3');
      expect(h.doc.querySelector('.pr-tree-author-me')).not.toBeNull();
      await h.tick();
      h.requests[0].pending.resolve([{ ...patch, additions: 2, listChecksState: 'FAILURE', listChecksPassed: 3 }]);
      await h.tick();
      expect(h.doc.querySelector('.pr-tree-checks').textContent).toBe('3/4');
      expect(h.doc.querySelector('.pr-tree-change-stats').textContent).toBe('+2−3');
      expect(h.reorders()).toBe(1);
    } finally { h.page.window.close(); }
  });
  test('REST commits the tree before optional data; metadata does not reorder rows or lose checkbox focus', async () => {
    const rest = deferred<any[]>();
    const h = setup({ rest: rest.promise });
    try {
      const pending = h.app.bootstrap();
      await h.tick();
      expect(h.app.isActive()).toBe(false);
      expect(h.requests).toHaveLength(0);
      rest.resolve(prs.map(pr => ({ ...pr })));
      expect((await pending).ok).toBe(true);
      expect(h.app.isActive()).toBe(true);
      expect(h.restOptions[0].includeAutolinks).toBe(false);
      const rows = h.dom.findOriginalPrRows(h.doc);
      expect(rows.map((row: any) => h.dom.getPrNumberFromRow(row))).toEqual([1, 2]);
      expect(rows[1].dataset.prTreeDepth).toBe('1');
      await h.tick();
      expect(h.requests).toHaveLength(1);
      expect(h.requests[0].treeWasActive).toBe(true);
      const checkbox = rows[1].querySelector('input');
      checkbox.checked = true;
      checkbox.focus();
      h.requests[0].pending.resolve([{ ...patch, title: 'stale title', headRef: 'wrong', baseRef: 'wrong' }, { number: 999, additions: 1 }]);
      await h.tick();
      expect(h.reorders()).toBe(1);
      expect(h.dom.findOriginalPrRows(h.doc)).toEqual(rows);
      expect(h.doc.activeElement).toBe(checkbox);
      expect(checkbox.checked).toBe(true);
      expect(rows[1].querySelector('.pr-tree-checks').textContent).toBe('4/4');
      expect(rows[1].querySelector('.pr-tree-change-stats').textContent).toBe('+1.5k−3');
      expect(h.app.getCachedPrs().find((pr: any) => pr.number === 2)).toMatchObject({ title: 'Child', headRef: 'child', baseRef: 'root' });
      expect(h.app.getCachedPrs()).toHaveLength(2);
    } finally { h.page.window.close(); }
  });

  test('failed extras leave the REST tree usable without repeated background queries', async () => {
    const h = setup();
    try {
      expect((await h.app.bootstrap()).ok).toBe(true);
      await h.tick();
      h.requests[0].pending.reject(new Error('offline'));
      await h.tick();
      await h.app.handlePageChange();
      await h.tick();
      expect(h.requests).toHaveLength(1);
      expect(h.app.isActive()).toBe(true);
      expect(h.doc.querySelector('.pr-tree-checks')).toBeNull();
    } finally { h.page.window.close(); }
  });

  for (const nextPath of ['/other/repo/pulls', '/o/r/pulls?q=is:closed', '/o/r/pull/2']) {
    test(`ignores delayed metadata after navigating to ${nextPath}`, async () => {
      const h = setup();
      try {
        await h.app.bootstrap(); await h.tick();
        h.page.window.history.replaceState(null, '', nextPath);
        h.requests[0].pending.resolve([patch]);
        await h.tick();
        expect(h.doc.querySelector('.pr-tree-checks')).toBeNull();
        expect(h.app.getCachedPrs().find((pr: any) => pr.number === 2).additions).toBeUndefined();
      } finally { h.page.window.close(); }
    });
  }

  test('new REST snapshot invalidates older metadata even for the same repo and PR numbers', async () => {
    const h = setup();
    try {
      await h.app.bootstrap(); await h.tick();
      h.app.replaceCachedPrs(prs.map(pr => ({ ...pr, title: 'New snapshot' })), { owner: 'o', repo: 'r' });
      expect(h.requests[0].opts.signal.aborted).toBe(true);
      await h.tick();
      h.requests[0].pending.resolve([patch]); await h.tick();
      expect(h.doc.querySelector('.pr-tree-checks')).toBeNull();
      h.requests[1].pending.resolve([{ ...patch, additions: 2 }]); await h.tick();
      expect(h.app.getCachedPrs()[1]).toMatchObject({ title: 'New snapshot', additions: 2 });
    } finally { h.page.window.close(); }
  });

  test('does not overwrite newer modal acknowledgements or title-derived links', async () => {
    const h = setup();
    try {
      await h.app.bootstrap(); await h.tick();
      h.app.patchCachedPr(2, { title: 'Renamed', additions: 9, listChecksState: 'FAILURE' });
      h.requests[0].pending.resolve([{ ...patch, magicLinks: [{ key: 'OLD' }] }]); await h.tick();
      const pr = h.app.getCachedPrs().find((pr: any) => pr.number === 2);
      expect(pr).toMatchObject({ title: 'Renamed', additions: 9, listChecksState: 'FAILURE', viewerDidAuthor: true });
      expect(pr.listChecksPassed).toBeUndefined();
      expect(pr.listChecksTotal).toBeUndefined();
      expect(pr.magicLinks).toBeUndefined();
    } finally { h.page.window.close(); }
  });

  test('original mode also receives metadata without enabling tree mode', async () => {
    const h = setup({ tree: false });
    try {
      await h.app.bootstrap(); await h.tick();
      h.requests[0].pending.resolve([patch]); await h.tick();
      expect(h.reorders()).toBe(0);
      expect(h.app.isTreeModeEnabled()).toBe(false);
      expect(h.doc.querySelector('.pr-tree-checks').textContent).toBe('4/4');
    } finally { h.page.window.close(); }
  });
});
