import { describe, expect, test } from '@rstest/core';
import { transformSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** Execute the actual host modules with only their browser dependencies stubbed. */
function host() {
  let finish!: (prs: any[]) => void;
  let signal: AbortSignal;
  const pending = new Promise<any[]>(resolve => { finish = resolve; });
  const sandbox: any = {
    console, AbortController, setTimeout, clearTimeout,
    URLSearchParams, location: { href: 'https://github.com/o/r/pulls', search: '' },
    document: {},
    getPullsListRows: () => [{ isConnected: true }],
    listDomApi: () => ({ getPrNumberFromRow: () => 2, applyListRowSnapshot: () => {} }),
    current: { open: false, owner: 'o', repo: 'r' },
    isPullsListPage: () => false,
    PRTreeFetch: { fetchOpenPulls: (_o: string, _r: string, _f: any, opts: any) => {
      signal = opts.signal;
      return pending;
    }, fetchPullsListSnapshot: async () => ({
      prs: [{ number: 2, baseRef: 'latest-base' }], matchedNumbers: [2], searchComplete: true,
    }) },
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['side-fetch-cache-assets', 'props-render-close']) {
    const src = fs.readFileSync(path.join(__dirname, `../src/host/modules/${name}.ts`), 'utf8');
    vm.runInContext(transformSync(src, { loader: 'ts' }).code, context);
  }
  return {
    start: () => vm.runInContext('ensureOpenPullsForStack("o", "r")', context),
    patch: (fields: any) => {
      sandbox.fields = fields;
      vm.runInContext('applyOpenDetailToListRow({fields, owner:"o", repo:"r"})', context);
    },
    rows: () => vm.runInContext('resolveOpenPulls()', context),
    snapshot: () => vm.runInContext('refreshPullsListRowsInPlace("o", "r")', context),
    finish: (prs: any[]) => finish(prs),
    aborted: () => signal.aborted,
  };
}

describe('host list write-through on direct PR pages', () => {
  test('a newer row snapshot survives the concurrent older REST list response', async () => {
    const h = host();
    const pending = h.start();
    await h.snapshot();
    h.finish([{ number: 1, baseRef: 'main' }, { number: 2, baseRef: 'old-base', headRef: 'child' }]);
    await pending;
    expect(h.rows()[1]).toMatchObject({ baseRef: 'latest-base', headRef: 'child' });
  });

  test('cold core / mutation paint preserves the pending list and overlays only the changed PR', async () => {
    const h = host();
    const pending = h.start();
    h.patch({ number: 2, baseRef: 'main', title: 'Child' });
    h.patch({ number: 2, baseRef: 'new-base' });
    expect(h.aborted()).toBe(false);
    h.finish([{ number: 1, baseRef: 'main' }, { number: 2, baseRef: 'old-base', headRef: 'child' }]);
    await pending;
    expect(h.rows()).toEqual([
      { number: 1, baseRef: 'main' },
      { number: 2, baseRef: 'new-base', headRef: 'child', title: 'Child' },
    ]);
    h.patch({ number: 2, baseRef: 'settled-base' });
    expect(h.rows()[1].baseRef).toBe('settled-base');
  });
});
