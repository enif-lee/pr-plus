/**
 * Pending-review SUBMIT must refresh Diff/Conversation from server truth.
 * No optimistic paint of published reviews — strip(submit) + onRefresh(full-threads).
 */
import { describe, expect, test, beforeEach, afterEach } from '@rstest/core';
import { installReviewActions } from '../src/modal/commands/review-actions';
import {
  stripPendingReviewFromDetail,
  mergeDetailPreserveOptimistic,
} from '../src/modal/lib/composer-attach';
import { discardPendingReview } from '../src/modal/lib/pending-review';

describe('pending review submit → refresh contract (shipped)', () => {
  const prevFetch = (globalThis as any).PRTreeFetch;
  let refreshCalls: any[];
  let applySnapshots: any[];
  let actionMsgs: string[];
  let pendingUi: any;

  beforeEach(() => {
    refreshCalls = [];
    applySnapshots = [];
    actionMsgs = [];
    pendingUi = { comments: [{ id: 1 }], body: 'draft' };
  });

  afterEach(() => {
    (globalThis as any).PRTreeFetch = prevFetch;
  });

  function installBag(overrides: Record<string, any> = {}) {
    let detail: any = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 14,
      headSha: 'abc123',
      viewerLogin: 'enif-lee',
      viewerPendingReview: { id: 555, nodeId: 'PRR_pending', commentCount: 1 },
      reviewComments: [
        {
          id: 7001,
          body: 'pending line note',
          author: 'enif-lee',
          pending: true,
          pendingReviewId: 555,
          path: 'src/a.ts',
          line: 10,
        },
        {
          id: 42,
          body: 'older published',
          author: 'other',
          pending: false,
          path: 'src/b.ts',
          line: 2,
        },
      ],
      reviews: [],
      ...overrides.detail,
    };
    const bag: Record<string, any> = {
      detail,
      detailRef: { current: detail },
      setActionBusy: () => {},
      setActionMsg: (m: string) => {
        actionMsgs.push(String(m || ''));
      },
      setCommentText: () => {},
      focusCommentBox: () => {},
      commitCommentListPatch: (next: any) => {
        detail = next;
        bag.detail = next;
        bag.detailRef.current = next;
      },
      applyDomainDetail: (updater: any) => {
        detail = typeof updater === 'function' ? updater(detail) : updater;
        bag.detail = detail;
        bag.detailRef.current = detail;
        applySnapshots.push(JSON.parse(JSON.stringify(detail)));
      },
      applyDomainDetailToHost: null,
      pendingReviewNodeIdRef: { current: 'PRR_pending' },
      serverPendingReviewId: 555,
      hasServerPending: true,
      serverPendingComments: [
        {
          id: 7001,
          pending: true,
          pendingReviewId: 555,
        },
      ],
      stripPendingReviewFromDetail,
      discardPendingReview,
      setPendingReview: (v: any) => {
        pendingUi = v;
      },
      onRefresh: async (opts?: any) => {
        refreshCalls.push(opts || {});
        // Simulate host full-threads returning published comments (same ids)
        const host = {
          owner: 'enif-lee',
          repo: 'pr-plus',
          number: 14,
          viewerPendingReview: null,
          _sideSettled: { reviews: true, comments: true },
          reviewComments: [
            {
              id: 7001,
              body: 'pending line note',
              author: 'enif-lee',
              pending: false,
              path: 'src/a.ts',
              line: 10,
            },
            {
              id: 42,
              body: 'older published',
              author: 'other',
              pending: false,
              path: 'src/b.ts',
              line: 2,
            },
          ],
          reviews: [
            {
              id: 999,
              state: 'COMMENTED',
              author: 'enif-lee',
              body: 'ship it',
            },
          ],
        };
        const merged = mergeDetailPreserveOptimistic(detail, host);
        detail = merged;
        bag.detail = detail;
        bag.detailRef.current = detail;
        applySnapshots.push(JSON.parse(JSON.stringify(detail)));
      },
      layoutMode: 'diff',
      collapseDiff: () => {},
      conversationCommentFocusRef: { current: null },
      isReviewVerdictKind: () => false,
      isViewerPrAuthor: () => false,
      mapLeaveReviewAction: (kind: string) =>
        kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'review', event: 'COMMENT' },
      LAYOUT_DIFF: 'diff',
      optimisticConversationAnchorForKind: null,
      ...overrides,
    };
    // Keep bag.detail in sync when apply mutates
    const apply = bag.applyDomainDetail;
    bag.applyDomainDetail = (u: any) => {
      apply(u);
      bag.detail = detail;
    };
    return { bag, act: installReviewActions(bag), getDetail: () => detail };
  }

  test('successful submit awaits API then full-threads refresh; paints published (no optimistic)', async () => {
    let submitted: any = null;
    (globalThis as any).PRTreeFetch = {
      submitPendingPullReview: async (
        owner: string,
        repo: string,
        number: number,
        reviewId: number,
        payload: any
      ) => {
        submitted = { owner, repo, number, reviewId, payload };
        // Network success only — do not touch UI (no optimistic published paint)
        return { id: reviewId, state: 'COMMENTED' };
      },
    };
    const { bag, act, getDetail } = installBag();
    const ok = await act.onLeaveReviewAction('comment', { body: 'ship it' });
    expect(ok).toBe(true);
    expect(submitted).toEqual({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 14,
      reviewId: 555,
      payload: { event: 'COMMENT', body: 'ship it' },
    });
    // Refresh must be full-threads (Diff + Conversation coverage)
    expect(refreshCalls.length).toBe(1);
    expect(refreshCalls[0]).toEqual(
      expect.objectContaining({ mode: 'full-threads' })
    );
    // After strip(submit) intermediate snapshot: pending chrome gone, no id tombs
    const mid = applySnapshots[0];
    expect(mid.viewerPendingReview).toBeNull();
    expect((mid._deletedReviewCommentIds || []).includes('7001')).toBe(false);
    expect((mid.reviewComments || []).some((c: any) => c.pending)).toBe(false);
    // After refresh: published comment 7001 present
    const final = getDetail();
    const ids = (final.reviewComments || []).map((c: any) => Number(c.id)).sort();
    expect(ids).toEqual([42, 7001]);
    const pub = (final.reviewComments || []).find((c: any) => Number(c.id) === 7001);
    expect(pub?.pending).toBeFalsy();
    expect(pub?.body).toBe('pending line note');
    // Conversation review list from host refresh
    expect((final.reviews || []).some((r: any) => Number(r.id) === 999)).toBe(
      true
    );
    // Local pending UI cleared
    expect(pendingUi?.comments?.length ?? 0).toBe(0);
    expect(bag.pendingReviewNodeIdRef.current).toBeNull();
  });

  test('failed submit does not strip pending or refresh-paint published', async () => {
    (globalThis as any).PRTreeFetch = {
      submitPendingPullReview: async () => {
        throw new Error('HTTP 422: Review is not pending');
      },
    };
    const { act, getDetail } = installBag();
    const before = JSON.parse(JSON.stringify(getDetail()));
    const ok = await act.onLeaveReviewAction('comment', { body: 'nope' });
    expect(ok).toBe(false);
    expect(refreshCalls.length).toBe(0);
    expect(applySnapshots.length).toBe(0);
    const after = getDetail();
    expect(after.viewerPendingReview?.id).toBe(555);
    expect((after.reviewComments || []).some((c: any) => c.pending)).toBe(true);
    expect(after.reviewComments).toEqual(before.reviewComments);
    expect(actionMsgs.some((m) => /422|not pending/i.test(m))).toBe(true);
  });

  test('shipped strip(submit) is used by review-actions (structural)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/commands/review-actions.ts'),
      'utf8'
    );
    expect(src).toMatch(/stripPendingReviewFromDetail\(\s*prev\s*,\s*\{\s*mode:\s*['"]submit['"]/);
    expect(src).toMatch(/onRefresh\(\s*\{\s*mode:\s*['"]full-threads['"]/);
    // Must not optimistically invent published reviews
    expect(src).not.toMatch(/appendOptimisticPublishedReview|optimisticPublish/);
  });

  test('host detail-store: submit strip + threads apply must not tombstone published ids', () => {
    const {
      fromAppDetail,
      toAppDetail,
      applyThreadsFromMergedDetail,
      applyPendingReview,
      applyDiscardTombstones,
    } = require('../src/modal/lib/detail-store') as typeof import('../src/modal/lib/detail-store');

    // Start with pending review in store
    const store = fromAppDetail({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 14,
      viewerPendingReview: { id: 555 },
      reviewComments: [
        {
          id: 7001,
          body: 'pending line note',
          author: 'enif-lee',
          pending: true,
          pendingReviewId: 555,
          path: 'src/a.ts',
          line: 10,
        },
        {
          id: 42,
          body: 'older published',
          author: 'other',
          pending: false,
          path: 'src/b.ts',
          line: 2,
        },
      ],
      reviews: [],
    });
    expect(store).toBeTruthy();

    // Simulate strip(submit) patch path used by onPatchDetail
    const stripped = stripPendingReviewFromDetail(toAppDetail(store), {
      mode: 'submit',
    });
    applyThreadsFromMergedDetail(store, stripped);
    applyPendingReview(store, null);
    applyDiscardTombstones(store, stripped);

    const mid = toAppDetail(store)!;
    expect(mid.viewerPendingReview).toBeNull();
    expect((mid._deletedReviewCommentIds || []).includes('7001')).toBe(false);
    expect((mid.reviewComments || []).some((c: any) => c.pending)).toBe(false);
    expect(
      (mid.reviewComments || []).some((c: any) => Number(c.id) === 7001)
    ).toBe(false);

    // Post-submit full-threads host refresh: same id as published
    applyThreadsFromMergedDetail(store, {
      ...stripped,
      viewerPendingReview: null,
      reviewComments: [
        {
          id: 7001,
          body: 'pending line note',
          author: 'enif-lee',
          pending: false,
          path: 'src/a.ts',
          line: 10,
        },
        {
          id: 42,
          body: 'older published',
          author: 'other',
          pending: false,
          path: 'src/b.ts',
          line: 2,
        },
      ],
      reviewThreads: [
        {
          threadNodeId: 'PRRT_7001',
          path: 'src/a.ts',
          line: 10,
          comments: [{ id: 7001, body: 'pending line note' }],
        },
      ],
    });
    const final = toAppDetail(store)!;
    const ids = (final.reviewComments || []).map((c: any) => Number(c.id)).sort();
    expect(ids).toEqual([42, 7001]);
    const pub = (final.reviewComments || []).find(
      (c: any) => Number(c.id) === 7001
    );
    expect(pub?.pending).toBeFalsy();
    expect(pub?.body).toBe('pending line note');
    expect((final._deletedReviewCommentIds || []).includes('7001')).toBe(false);
  });
});
