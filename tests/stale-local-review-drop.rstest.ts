/**
 * Local-cache-only review comments with empty body + missing/generic author
 * ("user" / MarkdownView "_No content_") must not survive any merge path when
 * GitHub-shaped data is SoT.
 *
 * Covers:
 * - mergeDetailPreserveOptimistic (App)
 * - mergeProgressiveSidesIntoFlat (detail-store / longer-prev)
 * - mergeReviewThreadsPageIntoDetail (GraphQL page merge)
 * - mergeCoreWithCache shape (open-modal filter predicate via pure helper)
 */
import { describe, expect, test } from '@rstest/core';
import {
  isUnverifiedLocalOnlyReviewComment,
  reconcileReviewCommentsAgainstRemote,
  stripUnverifiedLocalOnlyReviewComments,
  filterCacheReviewCommentsForCore,
  stripOrphanPendingReviewComments,
  detailHasViewerPending,
  mergeDetailPreserveOptimistic,
} from '../src/modal/lib/composer-attach';
import { mergeProgressiveSidesIntoFlat } from '../src/modal/lib/detail-store';
import { mergeReviewThreadsPageIntoDetail } from '../src/fetch/review-threads-bulk';
import { sanitizeDetailForCache } from '../src/modal/lib/detail-idb';

const basePr = { owner: 'enif-lee', repo: 'pr-plus', number: 13 };

function ghost(id: number | string) {
  return {
    id,
    body: '',
    author: '',
    path: 'a.ts',
    line: 1,
    pending: false,
  };
}

function real(id: number | string, author = 'alice') {
  return {
    id,
    body: 'Looks good',
    author,
    path: 'a.ts',
    line: 2,
    pending: false,
  };
}

/** Host open-modal-run cache reinject filter — drive the shipped pure helper. */
function cleanCacheReviewCommentsForCore(
  list: any[],
  networkDetail: any = null
) {
  return filterCacheReviewCommentsForCore(list, networkDetail);
}

describe('isUnverifiedLocalOnlyReviewComment', () => {
  test('empty body + empty author is ghost', () => {
    expect(isUnverifiedLocalOnlyReviewComment(ghost(1))).toBe(true);
  });

  test('empty body + generic "user" author is ghost', () => {
    expect(
      isUnverifiedLocalOnlyReviewComment({ id: 2, body: '  ', author: 'user' })
    ).toBe(true);
  });

  test('real body is not ghost even without author', () => {
    expect(
      isUnverifiedLocalOnlyReviewComment({ id: 3, body: 'hi', author: '' })
    ).toBe(false);
  });

  test('real author is not ghost even with empty body', () => {
    expect(
      isUnverifiedLocalOnlyReviewComment({
        id: 4,
        body: '',
        author: 'bob',
      })
    ).toBe(false);
  });

  test('pending rows are never ghosts (attach race)', () => {
    expect(
      isUnverifiedLocalOnlyReviewComment({
        id: 5,
        body: '',
        author: '',
        pending: true,
      })
    ).toBe(false);
  });

  test('GraphQL shell placeholders are not ghosts', () => {
    expect(
      isUnverifiedLocalOnlyReviewComment({
        id: 'shell:PRRT_x',
        body: '',
        author: '',
        threadNodeId: 'PRRT_x',
        _commentsPending: true,
      })
    ).toBe(false);
  });
});

describe('reconcileReviewCommentsAgainstRemote', () => {
  test('drops local-only ghost absent from remote', () => {
    const out = reconcileReviewCommentsAgainstRemote(
      [ghost(99), real(1)],
      [real(1)],
      { remoteAuthoritative: true }
    );
    expect(out.map((c) => c.id)).toEqual([1]);
    expect(out.some((c) => c.id === 99)).toBe(false);
  });

  test('keeps confirmed remote + local-only with real body', () => {
    const out = reconcileReviewCommentsAgainstRemote(
      [ghost(99), real(7, 'carol'), { id: 8, body: 'optimistic', author: 'me' }],
      [real(7, 'carol')],
      { remoteAuthoritative: true }
    );
    const ids = out.map((c) => Number(c.id)).sort((a, b) => a - b);
    expect(ids).toEqual([7, 8]);
    expect(out.find((c) => c.id === 7)?.body).toBe('Looks good');
    expect(out.find((c) => c.id === 7)?.author).toBe('carol');
  });

  test('strips ghosts from remote list too (host-polluted next)', () => {
    const out = reconcileReviewCommentsAgainstRemote(
      [real(1)],
      [ghost(50), real(1)],
      { remoteAuthoritative: true }
    );
    expect(out.map((c) => Number(c.id))).toEqual([1]);
    expect(out.some((c) => Number(c.id) === 50)).toBe(false);
  });
});

describe('mergeDetailPreserveOptimistic drops unverified local-only reviews', () => {
  test('local-only ghost dropped when host has real comments', () => {
    const prev = {
      ...basePr,
      reviewComments: [ghost(9001), real(10, 'dave')],
    };
    const next = {
      ...basePr,
      reviewComments: [real(10, 'dave')],
      reviewThreadsMeta: { totalCount: 1, loadedThreadCount: 1 },
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    const ids = (m.reviewComments || []).map((c: any) => Number(c.id));
    expect(ids).toContain(10);
    expect(ids).not.toContain(9001);
  });

  test('ghost present only in next/detailProp is also dropped', () => {
    // Host polluted with IDB ghost — must not treat as GitHub SoT
    const prev = { ...basePr, reviewComments: [] };
    const next = {
      ...basePr,
      reviewComments: [ghost(77), real(11, 'fay')],
      reviewThreadsMeta: { totalCount: 1, loadedThreadCount: 1 },
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    const ids = (m.reviewComments || []).map((c: any) => Number(c.id));
    expect(ids).toEqual([11]);
    expect(ids).not.toContain(77);
  });

  test('mixed: ghost gone, confirmed remains (body/author intact)', () => {
    const prev = {
      ...basePr,
      reviewComments: [
        ghost('ghost-a'),
        {
          id: 42,
          body: 'Ship it',
          author: 'erin',
          path: 'b.ts',
          line: 9,
        },
      ],
    };
    const next = {
      ...basePr,
      reviewComments: [
        {
          id: 42,
          body: 'Ship it',
          author: 'erin',
          path: 'b.ts',
          line: 9,
        },
      ],
      reviewThreads: [{ threadNodeId: 'PRRT_1', id: 42 }],
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect((m.reviewComments || []).length).toBe(1);
    expect(m.reviewComments[0].id).toBe(42);
    expect(m.reviewComments[0].body).toBe('Ship it');
    expect(m.reviewComments[0].author).toBe('erin');
  });

  test('pending empty local-only kept when host lag', () => {
    const prev = {
      ...basePr,
      viewerPendingReview: { id: 1, nodeId: 'PRR_x' },
      reviewComments: [
        {
          id: 'tmp-1',
          body: '',
          author: '',
          pending: true,
        },
      ],
    };
    const next = {
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [],
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect((m.reviewComments || []).some((c: any) => c.pending)).toBe(true);
  });
});

describe('mergeProgressiveSidesIntoFlat does not re-win longer ghost prev', () => {
  test('longer prev with ghosts loses to cleaner shorter next', () => {
    const prevFlat = {
      ...basePr,
      reviewComments: [ghost(1), ghost(2), real(3, 'gina')],
      reviewThreads: [],
      _sideSettled: {},
    };
    const nextFlat = {
      ...basePr,
      reviewComments: [real(3, 'gina')],
      reviewThreads: [{ threadNodeId: 'PRRT_1' }],
      reviewThreadsMeta: { totalCount: 1, loadedThreadCount: 1 },
      _sideSettled: { comments: true },
    };
    const out = mergeProgressiveSidesIntoFlat(prevFlat, nextFlat);
    const ids = (out.reviewComments || []).map((c: any) => Number(c.id));
    expect(ids).toContain(3);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(out.reviewComments.some((c: any) => isUnverifiedLocalOnlyReviewComment(c))).toBe(
      false
    );
  });

  test('post-Discard next with no PENDING does not re-seed longer prev pending', () => {
    // Live/IDB still holds discarded pending rows; network next is clean.
    const prevFlat = {
      ...basePr,
      viewerPendingReview: { id: 99, nodeId: 'PRR_dead' },
      reviewComments: [
        {
          id: 9001,
          body: 'e2e-sr start pending',
          author: 'me',
          path: 'a.ts',
          line: 2,
          pending: true,
          pendingReviewId: 99,
        },
        {
          id: 9002,
          body: 'e2e-sr add pending',
          author: 'me',
          path: 'a.ts',
          line: 6,
          pending: true,
          pendingReviewId: 99,
        },
        real(42, 'erin'),
      ],
      reviewThreads: [
        { threadNodeId: 'PRRT_p1', id: 9001 },
        { threadNodeId: 'PRRT_p2', id: 9002 },
        { threadNodeId: 'PRRT_1', id: 42 },
      ],
    };
    const nextFlat = {
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [real(42, 'erin')],
      reviewThreads: [{ threadNodeId: 'PRRT_1', id: 42 }],
      reviewThreadsMeta: { totalCount: 1, loadedThreadCount: 1 },
      _sideSettled: { comments: true, reviews: true },
    };
    const out = mergeProgressiveSidesIntoFlat(prevFlat, nextFlat);
    expect(out.viewerPendingReview).toBeNull();
    expect((out.reviewComments || []).some((c: any) => c.pending)).toBe(false);
    expect((out.reviewComments || []).map((c: any) => Number(c.id))).toEqual([42]);
  });
});

describe('mergeReviewThreadsPageIntoDetail drops no-threadNodeId ghosts', () => {
  test('GraphQL page merge strips prev ghosts without threadNodeId', () => {
    const detail = {
      ...basePr,
      reviewComments: [
        ghost(500), // no threadNodeId — classic IDB ghost
        {
          id: 501,
          body: 'real on thread',
          author: 'hal',
          threadNodeId: 'PRRT_keep',
        },
      ],
      reviewThreads: [],
    };
    const page = {
      source: 'graphql',
      threads: [
        {
          threadNodeId: 'PRRT_keep',
          path: 'a.ts',
          line: 1,
          commentsLoaded: true,
          resolved: false,
        },
      ],
      comments: [
        {
          id: 501,
          body: 'real on thread',
          author: 'hal',
          threadNodeId: 'PRRT_keep',
        },
      ],
      direction: 'older',
    };
    const next = mergeReviewThreadsPageIntoDetail(detail, page, 'older');
    const ids = (next.reviewComments || []).map((c: any) =>
      c?.id != null ? String(c.id) : ''
    );
    expect(ids).toContain('501');
    expect(ids).not.toContain('500');
    expect(
      (next.reviewComments || []).some((c: any) =>
        isUnverifiedLocalOnlyReviewComment(c)
      )
    ).toBe(false);
  });
});

describe('mergeCoreWithCache cache reinject filter', () => {
  test('empty network does not reinject cache-only ghosts', () => {
    const cacheSnap = {
      reviewComments: [ghost(9), real(10, 'ivy')],
    };
    // Product: only reinject cleaned cache when network empty
    const cleaned = cleanCacheReviewCommentsForCore(cacheSnap.reviewComments, {
      viewerPendingReview: null,
      reviewComments: [],
    });
    expect(cleaned.map((c) => Number(c.id))).toEqual([10]);
    expect(cleaned.some((c) => isUnverifiedLocalOnlyReviewComment(c))).toBe(
      false
    );
    // Structural: open-modal-run uses the same filter shape
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    expect(src).toMatch(/cleanedCacheRc/);
    expect(src).toMatch(/filterCacheReviewCommentsForCore|netHasPending/);
  });

  test('network without PENDING does not reinject discarded pending rows', () => {
    const cacheSnap = {
      reviewComments: [
        {
          id: 9001,
          body: 'e2e discarded pending',
          author: 'me',
          pending: true,
          pendingReviewId: 99,
        },
        real(42, 'erin'),
      ],
    };
    const network = {
      viewerPendingReview: null,
      reviewComments: [],
    };
    const cleaned = filterCacheReviewCommentsForCore(
      cacheSnap.reviewComments,
      network
    );
    expect(cleaned.map((c: any) => Number(c.id))).toEqual([42]);
    expect(cleaned.some((c: any) => c.pending)).toBe(false);
    expect(detailHasViewerPending(network)).toBe(false);
  });

  test('network with PENDING keeps cache pending rows', () => {
    const cacheSnap = {
      reviewComments: [
        {
          id: 1,
          body: 'still pending',
          author: 'me',
          pending: true,
        },
        real(2),
      ],
    };
    const network = {
      viewerPendingReview: { id: 55, nodeId: 'PRR_x' },
      reviewComments: [],
    };
    const cleaned = filterCacheReviewCommentsForCore(
      cacheSnap.reviewComments,
      network
    );
    expect(cleaned.some((c: any) => c.pending && Number(c.id) === 1)).toBe(
      true
    );
    expect(cleaned.map((c: any) => Number(c.id)).sort()).toEqual([1, 2]);
  });
});

describe('sanitizeDetailForCache drops orphan pending', () => {
  test('vpr null strips pending reviewComments from durable cache', () => {
    const out = sanitizeDetailForCache({
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [
        {
          id: 1,
          body: 'ghost pending',
          author: 'me',
          pending: true,
        },
        real(2, 'erin'),
      ],
      files: [],
      commits: [],
    });
    expect(out.viewerPendingReview).toBeNull();
    expect((out.reviewComments || []).some((c: any) => c.pending)).toBe(false);
    expect((out.reviewComments || []).map((c: any) => Number(c.id))).toEqual([
      2,
    ]);
  });

  test('vpr null strips demoted pending:false rows with pendingReviewId', () => {
    const out = sanitizeDetailForCache({
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [
        {
          id: 501,
          body: 'e2e demoted start',
          author: 'me',
          pending: false,
          pendingReviewId: 99,
        },
        {
          id: 502,
          body: 'e2e demoted add',
          author: 'me',
          pending: false,
          pendingReviewId: 99,
        },
        real(42, 'erin'),
      ],
      files: [],
      commits: [],
    });
    expect((out.reviewComments || []).map((c: any) => Number(c.id))).toEqual([
      42,
    ]);
    // Drop only — do not persist discard tombs on the cache snapshot.
    expect(out._deletedReviewCommentIds).toBeUndefined();
    expect(out._deletedReviewBodies).toBeUndefined();
  });

  test('vpr null applies tombstones to demoted bodies without pendingReviewId', () => {
    const out = sanitizeDetailForCache({
      ...basePr,
      viewerPendingReview: null,
      _deletedReviewCommentIds: ['9001', '9002'],
      reviewComments: [
        {
          id: 9001,
          body: 'tombstoned demoted',
          author: 'me',
          pending: false,
        },
        real(3, 'bob'),
      ],
      files: [],
      commits: [],
    });
    expect((out.reviewComments || []).map((c: any) => Number(c.id))).toEqual([
      3,
    ]);
  });

  test('stripOrphanPendingReviewComments pure helper', () => {
    const out = stripOrphanPendingReviewComments({
      viewerPendingReview: null,
      reviewComments: [
        { id: 1, body: 'p', pending: true },
        { id: 2, body: 'ok', pending: false },
      ],
    });
    expect(out.reviewComments.map((c: any) => c.id)).toEqual([2]);
  });

  test('PRModalDetailStore ships filterCacheReviewCommentsForCore (host path)', () => {
    // Structural: pure detail-store re-exports filter for globalThis host lookup
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/lib/detail-store.ts'),
      'utf8'
    );
    expect(src).toMatch(/export \{\s*[\s\S]*filterCacheReviewCommentsForCore/);
    const pure = fs.readFileSync(
      path.join(__dirname, '../src/modal/pure/detail-store.js'),
      'utf8'
    );
    // After rebuild pure must export the filter name
    expect(pure).toMatch(/filterCacheReviewCommentsForCore/);
    const open = fs.readFileSync(
      path.join(__dirname, '../src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    expect(open).toMatch(/PRModalDetailStore/);
    expect(open).toMatch(/filterCacheReviewCommentsForCore/);
    expect(open).not.toMatch(/PRModalStaleLocalReview/);
  });
});

describe('stripUnverifiedLocalOnlyReviewComments', () => {
  test('removes ghosts keeps shells and reals', () => {
    const out = stripUnverifiedLocalOnlyReviewComments([
      ghost(1),
      real(2),
      {
        id: 'shell:PRRT_z',
        body: '',
        author: '',
        _commentsPending: true,
        threadNodeId: 'PRRT_z',
      },
    ]);
    expect(out.map((c) => String(c.id)).sort()).toEqual([
      '2',
      'shell:PRRT_z',
    ]);
  });
});

describe('stripPendingReviewFromDetail tombstones pending ids', () => {
  test('discarded pending ids cannot reinject via merge', () => {
    const { stripPendingReviewFromDetail, mergeDetailPreserveOptimistic } =
      require('../src/modal/lib/composer-attach') as typeof import('../src/modal/lib/composer-attach');
    const prev = {
      ...basePr,
      viewerPendingReview: { id: 77, nodeId: 'PRR_x' },
      reviewComments: [
        {
          id: 501,
          body: 'start pending',
          author: 'me',
          pending: true,
          pendingReviewId: 77,
        },
        {
          id: 502,
          body: 'add pending',
          author: 'me',
          pending: true,
          pendingReviewId: 77,
        },
        real(42, 'erin'),
      ],
    };
    const stripped = stripPendingReviewFromDetail(prev);
    expect(stripped.viewerPendingReview).toBeNull();
    expect(stripped._dropPending).toBeFalsy();
    expect(stripped._deletedReviewCommentIds).toEqual(
      expect.arrayContaining(['501', '502'])
    );
    expect((stripped.reviewComments || []).map((c: any) => c.id)).toEqual([42]);

    // Host race reinjects demoted (pending:false) rows with same ids
    const host = {
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [
        {
          id: 501,
          body: 'start pending',
          author: 'me',
          pending: false,
          pendingReviewId: 77,
        },
        {
          id: 502,
          body: 'add pending',
          author: 'me',
          pending: false,
        },
        real(42, 'erin'),
      ],
    };
    const m = mergeDetailPreserveOptimistic(stripped, host);
    expect((m.reviewComments || []).map((c: any) => Number(c.id))).toEqual([42]);
    expect((m.reviewComments || []).some((c: any) => Number(c.id) === 501)).toBe(
      false
    );
  });

  test('submit mode strips pending without tombstones; refresh paints published', () => {
    const { stripPendingReviewFromDetail, mergeDetailPreserveOptimistic } =
      require('../src/modal/lib/composer-attach') as typeof import('../src/modal/lib/composer-attach');
    const prev = {
      ...basePr,
      viewerPendingReview: { id: 88, nodeId: 'PRR_submit' },
      reviewComments: [
        {
          id: 601,
          body: 'pending then submit',
          author: 'me',
          pending: true,
          pendingReviewId: 88,
          path: 'a.ts',
          line: 3,
        },
        real(42, 'erin'),
      ],
    };
    const stripped = stripPendingReviewFromDetail(prev, { mode: 'submit' });
    expect(stripped.viewerPendingReview).toBeNull();
    // Must NOT tombstone submitted ids — same REST ids become published
    expect(stripped._deletedReviewCommentIds || []).not.toEqual(
      expect.arrayContaining(['601'])
    );
    expect(
      (stripped.reviewComments || []).some((c: any) => Number(c.id) === 601)
    ).toBe(false);
    expect((stripped.reviewComments || []).map((c: any) => Number(c.id))).toEqual(
      [42]
    );
    expect(stripped._deletedReviewBodies || []).not.toEqual(
      expect.arrayContaining(['pending then submit'])
    );

    // Post-submit full-threads refresh: host returns same ids as published
    const host = {
      ...basePr,
      viewerPendingReview: null,
      _sideSettled: { reviews: true, comments: true },
      reviewComments: [
        {
          id: 601,
          body: 'pending then submit',
          author: 'me',
          pending: false,
          path: 'a.ts',
          line: 3,
        },
        real(42, 'erin'),
      ],
      reviews: [{ id: 9001, state: 'COMMENTED', author: 'me' }],
    };
    const m = mergeDetailPreserveOptimistic(stripped, host);
    const ids = (m.reviewComments || []).map((c: any) => Number(c.id)).sort();
    expect(ids).toEqual([42, 601]);
    const published = (m.reviewComments || []).find(
      (c: any) => Number(c.id) === 601
    );
    expect(published?.pending).toBeFalsy();
    expect(m.viewerPendingReview).toBeNull();
  });
});

import { fromAppDetail, toAppDetail } from '../src/modal/lib/detail-store';
import { noteDiscardedPendingBodies } from '../src/modal/lib/stale-local-review';

describe('fromAppDetail host-data-first for PENDING', () => {
  test('live VPR+pending wins over stale tombs (GitHub SoT)', () => {
    // Stale id/body tombs must not hide live host PENDING.
    const live = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 13,
      _deletedReviewCommentIds: ['1001'],
      _deletedReviewBodies: ['test'],
      viewerPendingReview: { id: 99, nodeId: 'PRR_live', commentCount: 1 },
      reviewComments: [
        {
          id: 1001,
          body: 'test',
          author: 'me',
          pending: true,
          pendingReviewId: 99,
          path: 'a.ts',
          line: 1,
        },
        real(42, 'erin'),
      ],
    };
    const store = fromAppDetail(live);
    const flat = toAppDetail(store);
    expect(store.dropPending).toBe(false);
    expect(flat?._dropPending).toBeFalsy();
    expect(flat?.viewerPendingReview?.id).toBe(99);
    expect((flat?.reviewComments || []).some((c: any) => c.pending)).toBe(true);
    expect(
      (flat?.reviewComments || [])
        .map((c: any) => Number(c.id))
        .sort((a: number, b: number) => a - b)
    ).toEqual([42, 1001]);
  });

  test('null VPR set-authority strips orphan pending rows (no latch)', () => {
    const orphan = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 13,
      viewerPendingReview: null,
      reviewComments: [
        {
          id: 1001,
          body: 'gone',
          author: 'me',
          pending: true,
          pendingReviewId: 99,
        },
        real(42, 'erin'),
      ],
    };
    const store = fromAppDetail(orphan);
    expect(store.dropPending).toBe(false);
    expect(toAppDetail(store)?.viewerPendingReview).toBeNull();
    expect(toAppDetail(store)?._dropPending).toBeFalsy();
    expect(
      (toAppDetail(store)?.reviewComments || []).some((c: any) => c.pending)
    ).toBe(false);
    expect((toAppDetail(store)?.reviewComments || []).map((c: any) => Number(c.id))).toEqual([
      42,
    ]);
  });
});

describe('mergeCommentsHostFirst set authority', () => {
  test('host authoritative drops cache-only ids', () => {
    const {
      mergeCommentsHostFirst,
    } = require('../src/modal/lib/stale-local-review') as typeof import('../src/modal/lib/stale-local-review');
    const host = [real(1, 'a'), real(2, 'b')];
    const cache = [
      real(1, 'a'),
      real(2, 'b'),
      { id: 999, body: 'ghost', author: 'x', pending: false },
    ];
    const out = mergeCommentsHostFirst(host, cache, { hostAuthoritative: true });
    expect(out.map((c: any) => Number(c.id)).sort()).toEqual([1, 2]);
  });

  test('mergeDetail host PENDING wins after local discard strip', () => {
    const { mergeDetailPreserveOptimistic } =
      require('../src/modal/lib/composer-attach') as typeof import('../src/modal/lib/composer-attach');
    const prev = {
      ...basePr,
      viewerPendingReview: null,
      reviewComments: [real(42, 'erin')],
    };
    const host = {
      ...basePr,
      viewerPendingReview: { id: 77, nodeId: 'PRR_x' },
      reviewComments: [
        real(42, 'erin'),
        {
          id: 501,
          body: 'test',
          author: 'me',
          pending: true,
          pendingReviewId: 77,
        },
      ],
    };
    const m = mergeDetailPreserveOptimistic(prev, host);
    expect(m._dropPending).toBeFalsy();
    expect(m.viewerPendingReview?.id).toBe(77);
    expect((m.reviewComments || []).some((c: any) => c.pending)).toBe(true);
  });
});
