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
  mergeDetailPreserveOptimistic,
} from '../src/modal/lib/composer-attach';
import { mergeProgressiveSidesIntoFlat } from '../src/modal/lib/detail-store';
import { mergeReviewThreadsPageIntoDetail } from '../src/fetch/review-threads-bulk';

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

/** Host open-modal-run cache reinject filter (same predicate as product). */
function cleanCacheReviewCommentsForCore(list: any[]) {
  return (Array.isArray(list) ? list : []).filter((c) => {
    if (!c || c.id == null) return false;
    if (c.pending) return true;
    if (c._commentsPending || c.commentsLoaded === false) return true;
    if (String(c.id).startsWith('shell:')) return true;
    const body = String(c.body ?? c.bodyText ?? '').trim();
    if (body) return true;
    const author = String(
      c.author || c.user?.login || c.user?.name || ''
    ).trim();
    return Boolean(author && author.toLowerCase() !== 'user');
  });
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
    const cleaned = cleanCacheReviewCommentsForCore(cacheSnap.reviewComments);
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
    expect(src).toMatch(/toLowerCase\(\) !== 'user'/);
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
