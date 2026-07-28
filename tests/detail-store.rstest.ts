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
  createEmptyStore,
  applyMeta,
  pickMeta,
  sidePendingFlags,
} from '../src/modal/lib/detail-store';

describe('detail-store isolation', () => {
  test('core does not wipe sketch reviewers or settle files', () => {
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
    expect(flat.requestedReviewers).toEqual(['alice', 'bob']);
    expect(flat.assignees).toEqual(['alice']);
    expect(store.files.settled).toBe(false);
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
