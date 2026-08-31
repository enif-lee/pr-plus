/**
 * GitHub allows empty-body APPROVE. COMMENT / REQUEST_CHANGES still need a
 * summary unless pending review comments exist.
 * Drives shipped canSubmitLeaveReview + installReviewActions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test, beforeEach, afterEach } from '@rstest/core';
import { canSubmitLeaveReview } from '../src/modal/lib/pr-edit-api';
import { installReviewActions } from '../src/modal/commands/review-actions';
import {
  stripPendingReviewFromDetail,
} from '../src/modal/lib/composer-attach';
import { discardPendingReview } from '../src/modal/lib/pending-review';

const root = path.resolve(__dirname, '..');

describe('canSubmitLeaveReview (shipped)', () => {
  test('APPROVE with empty body and no pending is allowed', () => {
    expect(
      canSubmitLeaveReview({ kind: 'approve', body: '', hasPending: false })
    ).toBe(true);
    expect(
      canSubmitLeaveReview({ event: 'APPROVE', body: '   ', hasPending: false })
    ).toBe(true);
  });

  test('COMMENT and REQUEST_CHANGES without body need pending comments', () => {
    expect(
      canSubmitLeaveReview({ kind: 'comment', body: '', hasPending: false })
    ).toBe(false);
    expect(
      canSubmitLeaveReview({
        event: 'REQUEST_CHANGES',
        body: '',
        hasPending: false,
      })
    ).toBe(false);
    expect(
      canSubmitLeaveReview({ kind: 'comment', body: '', hasPending: true })
    ).toBe(true);
    expect(
      canSubmitLeaveReview({
        kind: 'request_changes',
        body: 'nits',
        hasPending: false,
      })
    ).toBe(true);
  });
});

describe('onLeaveReviewAction empty APPROVE (shipped)', () => {
  const prevFetch = (globalThis as any).PRTreeFetch;
  let actionMsgs: string[];
  let submitCalls: any[];

  beforeEach(() => {
    actionMsgs = [];
    submitCalls = [];
  });

  afterEach(() => {
    (globalThis as any).PRTreeFetch = prevFetch;
  });

  function installEmptyBag() {
    let detail: any = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 19,
      headSha: 'deadbeef',
      viewerLogin: 'reviewer',
      author: 'enif-lee',
      viewerPendingReview: null,
      reviewComments: [],
      reviews: [],
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
      commitCommentListPatch: () => {},
      applyDomainDetail: (updater: any) => {
        detail = typeof updater === 'function' ? updater(detail) : updater;
        bag.detail = detail;
        bag.detailRef.current = detail;
      },
      pendingReviewNodeIdRef: { current: null },
      serverPendingReviewId: null,
      hasServerPending: false,
      serverPendingComments: [],
      stripPendingReviewFromDetail,
      discardPendingReview,
      setPendingReview: () => {},
      onRefresh: async () => {},
      layoutMode: 'conversation',
      collapseDiff: () => {},
      conversationCommentFocusRef: { current: null },
      isReviewVerdictKind: (k: string) => k === 'approve' || k === 'request_changes',
      isViewerPrAuthor: () => false,
      mapLeaveReviewAction: (kind: string) =>
        kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'review', event: 'COMMENT' },
      LAYOUT_DIFF: 'diff',
    };
    return { bag, act: installReviewActions(bag) };
  }

  test('empty approve submits APPROVE with empty body', async () => {
    (globalThis as any).PRTreeFetch = {
      submitPullReview: async (
        owner: string,
        repo: string,
        number: number,
        payload: any
      ) => {
        submitCalls.push({ owner, repo, number, payload });
        return { id: 11, state: 'APPROVED' };
      },
    };
    const { act } = installEmptyBag();
    const ok = await act.onLeaveReviewAction('approve', { body: '' });
    expect(ok).toBe(true);
    expect(submitCalls).toEqual([
      {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 19,
        payload: {
          event: 'APPROVE',
          body: '',
          commitId: 'deadbeef',
          comments: [],
        },
      },
    ]);
    expect(actionMsgs).toContain('Approved.');
  });

  test('empty comment without pending does not call the API', async () => {
    (globalThis as any).PRTreeFetch = {
      submitPullReview: async () => {
        submitCalls.push('hit');
        return {};
      },
    };
    const { act } = installEmptyBag();
    const ok = await act.onLeaveReviewAction('comment', { body: '' });
    expect(ok).toBe(false);
    expect(submitCalls).toEqual([]);
    expect(
      actionMsgs.some((m) => /write a comment or add pending/i.test(m))
    ).toBe(true);
  });
});

describe('Finish review approve wiring', () => {
  test('Approve is not gated on body-or-pending; Comment still is', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/FinishReviewModal.tsx'),
      'utf8'
    );
    expect(src).toMatch(/canSubmitLeaveReview/);
    expect(src).toMatch(/kind:\s*'approve'/);
    expect(src).toMatch(/disabled=\{!canSubmitApprove\}/);
    expect(src).toMatch(/disabled=\{!canSubmitComment\}/);
    expect(src).not.toMatch(
      /No pending threads and empty body → nothing to submit/
    );
    const actions = fs.readFileSync(
      path.join(root, 'src/modal/commands/review-actions.ts'),
      'utf8'
    );
    expect(actions).toMatch(/canSubmitLeaveReview/);
  });
});
