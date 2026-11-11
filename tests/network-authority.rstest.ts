import { describe, expect, test } from '@rstest/core';
import { transformSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as store from '../src/modal/lib/detail-store';
import { createPersistedDetailCache } from '../src/modal/lib/detail-cache';
import { apiJson, apiJsonWithLink } from '../src/fetch/http';
import { fetchPrDetail, mergeIssueIdentityIntoPull } from '../src/fetch/pr-detail';
import { mergeReviewThreadsPageIntoDetail } from '../src/fetch/review-threads-bulk';
import { prProbeIndicatesStale } from '../src/modal/lib/auto-refresh';
import { createApplyDomainDetailToHost } from '../src/modal/hooks/useDomainDetailHost';
import { replaceNewestTimelineWindow } from '../src/modal/lib/timeline-pagination';
import { fetchPrTimelineItemsPage } from '../src/fetch/timeline-items';
import * as timeline from '../src/modal/lib/conversation-timeline';

function hostCore(initial: any) {
  const sandbox: any = {
    console, PRModalDetailStore: store, PRModalConversationTimeline: timeline,
    metaRefreshGen: 0, detailFetchGen: 1, openFetchAbort: null,
    current: { open: true, owner: 'o', repo: 'r', number: 1, detail: initial,
      detailStore: store.fromAppDetail(initial), _sideKickStarted: new Set(['files', 'commits']) },
    emptySideFlags: () => ({}), setSideFlag: () => false,
    prefs: {}, getFetchTimeline: () => null, markSideProgress: () => {},
    detailKey: () => 'o/r#1', detailCache: { set: () => {} }, render: () => {},
    resolveOpenPulls: () => [], isEmbedPresentation: () => false,
    persistRouteState: () => {}, closeModal: () => {},
    clearLoadStage: () => {}, setLoadStage: () => {}, loadStageLabel: () => '',
    sessionStorage: { setItem: () => {} },
    document: { getElementById: () => null },
    embedHostId: () => 'embed', HOST_ID: 'modal',
    // Legacy persisted writes must have no authority over a current GET.
    lastPeopleMetaAuthority: { number: 1, at: Date.now(), fields: { milestone: { title: 'Old' }, labels: ['old'] } },
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['host-core-store', 'side-fetch-kick', 'detail-on-patch', 'props-build']) {
    vm.runInContext(transformSync(fs.readFileSync(path.join(__dirname, `../src/host/modules/${name}.ts`), 'utf8'), { loader: 'ts' }).code, context);
  }
  return { sandbox, apply: (raw: any, startedAt = 0) => {
    sandbox.raw = raw; sandbox.startedAt = startedAt;
    return vm.runInContext('applyCoreToStore(raw, {metaGenAtStart: startedAt})', context);
  }, props: () => vm.runInContext('buildProps()', context), comments: (api: any) => {
    sandbox.PRTreeFetch = api;
    return vm.runInContext('kickIndependentSideFetches({owner:"o",repo:"r",number:1,gen:1,replaceNewestTimeline:true}).commentsP', context);
  }, patch: (patch: any) => {
    sandbox.patch = patch;
    return vm.runInContext('runOnPatchDetail(patch,"o","r",1)', context);
  } };
}

describe('network state is authoritative across PR surfaces', () => {
  test('open core renders cleared metadata over both cached and persisted values', () => {
    const h = hostCore({ owner: 'o', repo: 'r', number: 1, title: 'Cached', body: 'Old',
      labels: ['cached'], milestone: { title: 'Cached' }, assignees: ['old'], requestedReviewers: ['old'] });
    expect(h.apply({ title: 'Current', body: '', labels: [], milestone: null, assignees: [], requestedReviewers: [] }))
      .toMatchObject({ title: 'Current', body: '', labels: [], milestone: null, assignees: [], requestedReviewers: [] });
  });

  test('same-head base change clears files and commits for both open and refresh core', () => {
    const h = hostCore({ headSha: 'head', baseSha: 'old', baseRef: 'main',
      files: [{ filename: 'cached.ts', patch: 'old' }], commits: [{ sha: 'cached' }] });
    expect(h.apply({ headSha: 'head', baseSha: 'new', baseRef: 'release' }))
      .toMatchObject({ files: [], commits: [], baseRef: 'release' });
    expect(h.sandbox.current._sideKickStarted.size).toBe(0);
  });

  test('a GET started before a mutation cannot overwrite its confirmed base or metadata', () => {
    const h = hostCore({ title: 'Just edited', baseRef: 'release', baseSha: 'new', headSha: 'head', labels: ['new'] });
    h.sandbox.metaRefreshGen = 1;
    expect(h.apply({ title: 'Old', labels: ['old'], baseRef: 'main', baseSha: 'old', headSha: 'head' }))
      .toMatchObject({ title: 'Just edited', labels: ['new'], baseRef: 'release', baseSha: 'new' });
  });

  test('issue milestone null clears a previously assigned milestone', () => {
    expect(mergeIssueIdentityIntoPull({ milestone: { title: 'Old' } }, { milestone: null })).toEqual({ milestone: null });
  });

  for (const action of ['set', 'invalidate', 'clear'] as const) {
    test(`delayed IDB read cannot undo ${action}`, async () => {
      let release!: (row: any) => void;
      const cache = createPersistedDetailCache({ idb: {
        get: () => new Promise(resolve => { release = resolve; }),
        set: async () => {}, delete: async () => {}, clear: async () => {},
      } });
      const pending = cache.peekAsync('o/r#1');
      if (action === 'set') cache.set('o/r#1', { title: 'Current' });
      else if (action === 'clear') await cache.clear();
      else cache.invalidate('o/r#1');
      release({ value: { title: 'Old' }, updatedAt: Date.now() });
      const result = await pending;
      expect(result.value).toEqual(action === 'set' ? { title: 'Current' } : null);
      expect(cache.peek('o/r#1').value).toEqual(result.value);
    });
  }

  test('REST helpers bypass HTTP cache including paginated side data', async () => {
    const calls: any[] = [];
    const fetchImpl = async (_url: string, init: any) => {
      calls.push(init); return { ok: true, json: async () => [], headers: new Headers() };
    };
    await apiJson('https://api.github.com/x', fetchImpl, 't');
    await apiJsonWithLink('https://api.github.com/x', fetchImpl, 't');
    expect(calls.map(c => c.cache)).toEqual(['no-store', 'no-store']);
  });

  test('completed coalesced core requests are never reused by a later open', async () => {
    let title = 'Old';
    let pulls = 0;
    const fetchImpl = async (url: string) => {
      if (url.includes('/pulls/1?')) pulls++;
      const data = url.includes('/autolinks') ? [] : { number: 1, title, body: '', user: { login: 'alice' },
        head: { ref: 'feature', sha: 'head' }, base: { ref: 'main', sha: 'base' }, labels: [], assignees: [] };
      return { ok: true, headers: new Headers(), json: async () => data };
    };
    const opts = { fastIdentityOnly: true, coalesceKey: 'same-open-key' };
    expect((await fetchPrDetail('o', 'r', 1, fetchImpl, null, opts)).title).toBe('Old');
    title = 'Current';
    expect((await fetchPrDetail('o', 'r', 1, fetchImpl, null, opts)).title).toBe('Current');
    expect(pulls).toBe(2);
  });

  test('complete newest thread snapshots drop remote deletions; partial pages keep unknown older rows', () => {
    const previous = { reviewThreads: [{ threadNodeId: 'PRRT_old' }], reviewComments: [
      { id: 1, threadNodeId: 'PRRT_old', body: 'Old', author: 'alice' },
    ] };
    const empty = { source: 'graphql', totalCount: 0, threads: [], comments: [], hasMore: false };
    expect(mergeReviewThreadsPageIntoDetail(previous, empty, 'newest')).toMatchObject({ reviewThreads: [], reviewComments: [] });
    expect(mergeReviewThreadsPageIntoDetail(previous, { ...empty, totalCount: 10, hasMore: true }, 'newest').reviewThreads).toHaveLength(1);
  });

  test('base-only drift triggers auto refresh even without a timestamp or head change', () => {
    expect(prProbeIndicatesStale({ headSha: 'head', baseSha: 'old', baseRef: 'main' },
      { headSha: 'head', baseSha: 'new', baseRef: 'main' })).toBe(true);
  });

  test('complete timeline windows remove deleted old rows and accept empty categories', () => {
    const prior = [{ id: 1, createdAt: '2026-01-01T00:00:00Z' }];
    expect(replaceNewestTimelineWindow(prior, [], { complete: true })).toEqual([]);
    expect(replaceNewestTimelineWindow(prior, [{ id: 2, createdAt: '2026-02-01T00:00:00Z' }], { complete: true })).toEqual([
      { id: 2, createdAt: '2026-02-01T00:00:00Z' },
    ]);
  });

  test('a missing GraphQL timeline connection is a failure, not a confirmed empty list', async () => {
    const page = await fetchPrTimelineItemsPage('o', 'r', 1, {}, async () => ({
      ok: true, headers: new Headers(), json: async () => ({ data: { repository: { pullRequest: null } } }),
    }), 'token');
    expect(page.error).toContain('unavailable');
  });

  test('lazy data acknowledgement does not resend unchanged cached domain fields', () => {
    const detailRef = { current: { title: 'Title', labels: ['cached'], files: [] } };
    const patches: any[] = [];
    const apply = createApplyDomainDetailToHost({ detailRef, getDetailProp: () => detailRef.current,
      onPatchDetail: patch => { patches.push(patch); return { status: 'applied' }; } });
    apply((prev: any) => ({ ...prev, files: [{ filename: 'current' }] }));
    expect(patches).toEqual([{ files: [{ filename: 'current' }] }]);
  });

  test('an older comments GET cannot erase a later successful comment acknowledgement', async () => {
    const h = hostCore({ owner: 'o', repo: 'r', number: 1, comments: [] });
    let release!: (page: any) => void;
    const pending = h.comments({
      fetchPrTimelineItemsPage: () => new Promise(resolve => { release = resolve; }),
      fetchPrIssueComments: async () => ({ items: [], meta: { hasMore: false } }),
    });
    expect(h.patch({ comments: [{ id: 99, body: 'Just posted', author: 'alice' }] }).status).toBe('applied');
    release({ comments: [], timelineEvents: [], source: 'graphql', hasMore: false, totalCount: 0, pageInfo: {} });
    await pending;
    expect(h.sandbox.current.detail.comments.map((c: any) => c.id)).toEqual([99]);
  });

  test('timeline load-more cannot overwrite a comment acknowledged while its page was loading', async () => {
    const h = hostCore({ owner: 'o', repo: 'r', number: 1, comments: [{ id: 1, body: 'Old' }],
      timelineMeta: { hasMore: true, startCursor: 'cursor', direction: 'newest' } });
    let release!: (page: any) => void;
    h.sandbox.PRTreeFetch = { fetchPrTimelineItemsPage: () => new Promise(resolve => { release = resolve; }) };
    const pending = h.props().onLoadMoreReviewThreads('timeline');
    expect(h.patch({ comments: [{ id: 99, body: 'Just posted', author: 'alice' }] }).status).toBe('applied');
    release({ comments: [], timelineEvents: [], hasMore: false, pageInfo: {}, totalCount: 0 });
    await pending;
    expect(h.sandbox.current.detail.comments.map((c: any) => c.id)).toEqual([99]);
  });

  test('complete empty timeline clears cached rows, hasMore and cursors', async () => {
    const h = hostCore({ comments: [{ id: 1, body: 'Deleted', createdAt: '2026-01-01' }],
      timelineEvents: [{ id: 2, at: '2026-01-01' }], timelineMeta: { hasMore: true, startCursor: 'old' } });
    await h.comments({
      fetchPrTimelineItemsPage: async () => ({ comments: [], timelineEvents: [], source: 'graphql', hasMore: false, totalCount: 0, pageInfo: {} }),
      fetchPrIssueComments: async () => ({ items: [], meta: { hasMore: false } }),
    });
    expect(h.sandbox.current.detail).toMatchObject({ comments: [], timelineEvents: [], timelineMeta: { hasMore: false, startCursor: null, complete: true } });
  });

  test('REST comment coverage cannot delete events outside the partial GraphQL window', async () => {
    const h = hostCore({ comments: [], timelineEvents: [{ id: 1, at: '2026-01-15T00:00:00Z' }] });
    await h.comments({
      fetchPrTimelineItemsPage: async () => ({ comments: [], timelineEvents: [{ id: 2, at: '2026-02-01T00:00:00Z' }],
        source: 'graphql', hasMore: true, totalCount: 100, pageInfo: { hasPreviousPage: true } }),
      fetchPrIssueComments: async () => ({ items: [{ id: 10, createdAt: '2026-01-01T00:00:00Z' }], meta: { hasMore: false } }),
    });
    expect(h.sandbox.current.detail.timelineEvents.map((e: any) => e.id).sort()).toEqual([1, 2]);
  });

  test('complete empty REST comments clear deleted comments even with a partial GraphQL events window', async () => {
    const h = hostCore({ comments: [{ id: 1, body: 'Deleted', createdAt: '2026-01-01' }] });
    await h.comments({
      fetchPrTimelineItemsPage: async () => ({ comments: [], timelineEvents: [{ id: 2, at: '2026-02-01T00:00:00Z' }],
        source: 'graphql', hasMore: true, totalCount: 100, pageInfo: { hasPreviousPage: true } }),
      fetchPrIssueComments: async () => ({ items: [], meta: { hasMore: false } }),
    });
    expect(h.sandbox.current.detail.comments).toEqual([]);
  });
});
