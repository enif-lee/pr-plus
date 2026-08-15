/**
 * rstest — detail store isolation (ships lib/detail-store.ts).
 */
import { describe, expect, test } from '@rstest/core';
import {
  fromAppDetail,
  toAppDetail,
  applyCorePayload,
  applyFiles,
  applyReviews,
  applyCommits,
  applyComments,
  applyDevelopment,
  applyThreadsFromMergedDetail,
  createEmptyStore,
  applyMeta,
  pickMeta,
  sidePendingFlags,
} from '../src/modal/lib/detail-store';

describe('detail-store isolation', () => {
  test('core network empty labels/assignees overwrite sketch (no resurrection)', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 9,
      title: 'Sketch',
      requestedReviewers: ['alice', 'bob'],
      assignees: ['alice'],
      labels: [{ name: 'bug', color: 'f00' }],
      files: [],
      commits: [],
      reviews: [],
      _sketch: true,
      _source: 'list',
    });

    // REST core always carries people/label arrays — empty means cleared on GH
    applyCorePayload(store, {
      owner: 'o',
      repo: 'r',
      number: 9,
      title: 'Sketch',
      body: 'full body',
      headSha: 'deadbeef',
      requestedReviewers: [],
      assignees: [],
      labels: [],
      files: [],
      commits: [],
      reviews: [],
      _source: 'network',
    });

    const flat = toAppDetail(store)!;
    expect(flat.body).toBe('full body');
    expect(flat.headSha).toBe('deadbeef');
    // Authoritative core must clear sketch chips (label-delete reopen bug)
    expect(flat.requestedReviewers).toEqual([]);
    expect(flat.assignees).toEqual([]);
    expect(flat.labels).toEqual([]);
    expect(store.files.settled).toBe(false);
  });

  test('applyMeta without trustEmpty still protects progressive empty wipe', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      labels: [{ name: 'bug', color: 'f00' }],
      assignees: ['alice'],
    });
    applyMeta(
      store,
      { labels: [], assignees: [] },
      { source: 'progressive', trustEmpty: false }
    );
    const flat = toAppDetail(store)!;
    expect(flat.labels).toEqual([{ name: 'bug', color: 'f00' }]);
    expect(flat.assignees).toEqual(['alice']);
  });

  test('side writes touch only their slices', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 'T',
      requestedReviewers: ['alice'],
      files: [],
    });
    applyFiles(store, [{ filename: 'a.js', patch: '+x' }], {
      settled: true,
      gitattributesText: '*.pb.go linguist-generated=true\n',
    });
    applyReviews(store, [{ id: 1, author: 'alice', state: 'APPROVED' }], {
      settled: true,
    });
    applyCommits(store, [{ sha: 'abc', message: 'm' }], { settled: true });

    const flat = toAppDetail(store)!;
    expect(flat.requestedReviewers).toEqual(['alice']);
    expect(flat.files).toHaveLength(1);
    expect(flat.reviews).toHaveLength(1);
    expect(flat.commits).toHaveLength(1);
    expect(flat._sideSettled.files).toBe(true);
    expect(flat._sideSettled.development).toBe(false);
  });

  test('comments side-write projects timelineEvents', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 'T',
    });
    applyComments(
      store,
      [{ id: 1, author: 'a', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
      {
        settled: true,
        pageMeta: { hasMore: false },
        timelineEvents: [
          {
            id: 9,
            event: 'renamed',
            actor: 'a',
            at: '2026-01-01T00:00:00Z',
            rename: { from: 'x', to: 'y' },
          },
        ],
      }
    );
    const flat = toAppDetail(store)!;
    expect(flat.comments).toHaveLength(1);
    expect(flat.timelineEvents).toHaveLength(1);
    expect(flat.timelineEvents[0].event).toBe('renamed');
    expect(flat._sideSettled.comments).toBe(true);

    // Re-hydrate preserves timelineEvents
    const again = toAppDetail(fromAppDetail(flat))!;
    expect(again.timelineEvents).toHaveLength(1);
  });

  test('timelineMeta survives applyThreadsFromMergedDetail (Diff threads-all path)', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 7,
      title: 'T',
    });
    const timelineMeta = {
      hasMore: true,
      complete: false,
      direction: 'newest',
      startCursor: 'cursor-older-edge',
      endCursor: 'cursor-newer-edge',
      coverageEndAt: '2026-02-01T00:00:00Z',
      loadedCount: 100,
      totalCount: 1200,
      source: 'graphql',
      pagesLoaded: 1,
    };
    applyComments(
      store,
      [
        {
          id: 1,
          author: 'a',
          body: 'hi',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
      {
        settled: true,
        trustEmpty: true,
        pageMeta: {
          hasMore: true,
          startCursor: timelineMeta.startCursor,
          loadedCount: 1,
        },
        timelineEvents: [
          {
            id: 9,
            event: 'labeled',
            actor: 'a',
            at: '2026-02-15T00:00:00Z',
          },
        ],
        timelineMeta,
      }
    );
    // Simulate Diff threads-all: threads merge must not wipe timelineMeta
    applyThreadsFromMergedDetail(store, {
      reviewThreads: [
        {
          threadNodeId: 'PRRT_NEW',
          path: 'a.ts',
          line: 1,
          at: '2026-03-01T00:00:00Z',
        },
        {
          threadNodeId: 'PRRT_OLD',
          path: 'b.ts',
          line: 2,
          at: '2026-01-01T00:00:00Z',
        },
      ],
      reviewComments: [],
      reviewThreadsMeta: {
        hasMore: false,
        hasOlder: false,
        hiddenCount: 0,
        loadedThreadCount: 2,
        totalCount: 2,
      },
      reviewCommentsMeta: { hasMore: false },
    });
    const flat = toAppDetail(store)!;
    expect(flat.timelineMeta).toBeTruthy();
    expect(flat.timelineMeta.hasMore).toBe(true);
    expect(flat.timelineMeta.startCursor).toBe('cursor-older-edge');
    expect(flat.timelineMeta.coverageEndAt).toBe('2026-02-01T00:00:00Z');
    expect(flat.reviewThreadsMeta?.hasMore).toBe(false);
    expect(flat.reviewThreads).toHaveLength(2);

    // Round-trip through fromAppDetail/toAppDetail (publishDetailFromStore shape)
    const again = toAppDetail(fromAppDetail(flat))!;
    expect(again.timelineMeta?.startCursor).toBe('cursor-older-edge');
    expect(again.timelineMeta?.hasMore).toBe(true);
  });

  test('development settle empty is ok', () => {
    const store = createEmptyStore();
    applyMeta(store, { owner: 'o', repo: 'r', number: 2, title: 'x' });
    applyDevelopment(
      store,
      { linkedIssues: [], developmentIssues: [], projects: [] },
      { settled: true }
    );
    const flat = toAppDetail(store)!;
    expect(flat._sideSettled.development).toBe(true);
    expect(sidePendingFlags(store).development).toBe(false);
    expect(sidePendingFlags(store).files).toBe(true);
  });

  test('toAppDetail projects empty store (never null for valid store)', () => {
    const store = createEmptyStore();
    applyFiles(store, [{ filename: 'a.ts', patch: '+x' }], { settled: true });
    const flat = toAppDetail(store);
    expect(flat).not.toBeNull();
    expect(flat!.files).toHaveLength(1);
    expect(flat!._sideSettled.files).toBe(true);
    expect(flat!._incompleteIdentity).toBe(true);
    expect(toAppDetail(null)).toBeNull();
    expect(toAppDetail(undefined)).toBeNull();
  });

  test('pickMeta excludes side arrays', () => {
    const m = pickMeta({
      title: 't',
      owner: 'o',
      repo: 'r',
      number: 1,
      files: [{ x: 1 }],
      reviews: [{ y: 1 }],
      requestedReviewers: ['a'],
    }) as Record<string, unknown>;
    expect(m.title).toBe('t');
    expect(m.requestedReviewers).toEqual(['a']);
    expect(m.files).toBeUndefined();
    expect(m.reviews).toBeUndefined();
  });
});
