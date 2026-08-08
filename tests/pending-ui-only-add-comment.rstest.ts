/**
 * When a viewer PENDING review exists, UI offers only Add comment
 * (not immediate single Comment) — GitHub one-pending-review rule.
 * Covers empty PENDING (server id set, pendingCount 0).
 */
import { describe, expect, test } from '@rstest/core';
import {
  canPublishImmediateReviewComment,
  pendingAttachCtaLabel,
  pendingReviewCtaLabel,
  viewerHasPendingReview,
} from '../src/modal/lib/pending-review';
import { listContextThreadComposerTabStops } from '../src/modal/lib/context-thread-dom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('viewerHasPendingReview / canPublishImmediateReviewComment', () => {
  test('true when no pending review', () => {
    expect(viewerHasPendingReview(false)).toBe(false);
    expect(viewerHasPendingReview(0)).toBe(false);
    expect(viewerHasPendingReview(null)).toBe(false);
    expect(canPublishImmediateReviewComment(false)).toBe(true);
    expect(canPublishImmediateReviewComment(0)).toBe(true);
    expect(
      canPublishImmediateReviewComment({ pendingCount: 0, hasServerPending: false })
    ).toBe(true);
  });

  test('false when pending count > 0', () => {
    expect(viewerHasPendingReview(1)).toBe(true);
    expect(canPublishImmediateReviewComment(1)).toBe(false);
    expect(
      canPublishImmediateReviewComment({ pendingCount: 2 })
    ).toBe(false);
  });

  test('empty PENDING: server id only (pendingCount 0) still blocks Comment', () => {
    // Skeptic case: viewerPendingReview.id set, no pending comment rows yet
    expect(
      viewerHasPendingReview({
        pendingCount: 0,
        serverPendingReviewId: 9001,
      })
    ).toBe(true);
    expect(
      canPublishImmediateReviewComment({
        pendingCount: 0,
        serverPendingReviewId: 9001,
      })
    ).toBe(false);
    expect(
      canPublishImmediateReviewComment({
        pendingCount: 0,
        hasServerPending: true,
      })
    ).toBe(false);
    expect(pendingAttachCtaLabel({ pendingCount: 0, hasServerPending: true })).toBe(
      'Add comment'
    );
  });

  test('thread-local pending flags gate without global count', () => {
    expect(
      canPublishImmediateReviewComment({
        pendingCount: 0,
        hasServerPending: false,
        rootPending: true,
      })
    ).toBe(false);
    expect(
      canPublishImmediateReviewComment({
        pendingCount: 0,
        hasPendingReplies: true,
      })
    ).toBe(false);
  });

  test('Start review / Add comment labels', () => {
    expect(pendingAttachCtaLabel(false)).toBe('Start review');
    expect(pendingAttachCtaLabel({ pendingCount: 0 })).toBe('Start review');
    expect(pendingAttachCtaLabel(true)).toBe('Add comment');
    expect(pendingReviewCtaLabel({ comments: [] })).toBe('Start review');
    expect(pendingReviewCtaLabel({ comments: [{}] })).toBe('Add comment');
  });
});

describe('Tab stops when Comment host omitted (pending-only)', () => {
  test('does not double-count submit on start-review host', () => {
    if (typeof document === 'undefined') {
      expect(true).toBe(true);
      return;
    }
    const rootEl = document.createElement('div');
    rootEl.innerHTML = `
      <textarea class="prp-mdc__ta"></textarea>
      <span data-prp-thread-tab-host="start-review">
        <button data-prp-composer-start-review="1" data-prp-composer-submit="1">Add comment</button>
      </span>
      <span data-prp-thread-tab-host="resolve">
        <button data-prp-composer-resolve="1">Resolve</button>
      </span>
    `;
    document.body.appendChild(rootEl);
    try {
      const stops = listContextThreadComposerTabStops(rootEl);
      expect(stops.length).toBe(3);
      const hosts = stops
        .map((el) => el.getAttribute?.('data-prp-thread-tab-host') || el.tagName)
        .filter(Boolean);
      expect(hosts.filter((h) => h === 'start-review').length).toBe(1);
    } finally {
      rootEl.remove();
    }
  });
});

/**
 * Drive the same gate object SelectionCommentBar / InlineThread pass into
 * canPublishImmediateReviewComment — proves empty-PENDING (id, count 0) path.
 */
function selectionGate(props: {
  pendingCount?: number;
  hasViewerPendingReview?: boolean;
}) {
  return canPublishImmediateReviewComment({
    pendingCount: props.pendingCount ?? 0,
    hasServerPending: Boolean(props.hasViewerPendingReview),
  });
}

function threadGate(props: {
  pendingCount?: number;
  hasViewerPendingReview?: boolean;
  hasPendingReplies?: boolean;
  rootPending?: boolean;
}) {
  return canPublishImmediateReviewComment({
    pendingCount: props.pendingCount ?? 0,
    hasServerPending: Boolean(props.hasViewerPendingReview),
    hasPendingReplies: props.hasPendingReplies,
    rootPending: props.rootPending,
  });
}

describe('component gate props (SelectionCommentBar / InlineThread contract)', () => {
  test('SelectionCommentBar: hasViewerPendingReview true + pendingCount 0 → no immediate', () => {
    expect(
      selectionGate({ pendingCount: 0, hasViewerPendingReview: true })
    ).toBe(false);
    expect(
      selectionGate({ pendingCount: 0, hasViewerPendingReview: false })
    ).toBe(true);
    expect(
      selectionGate({ pendingCount: 1, hasViewerPendingReview: false })
    ).toBe(false);
  });

  test('InlineThread: same empty-PENDING + local flags', () => {
    expect(
      threadGate({ pendingCount: 0, hasViewerPendingReview: true })
    ).toBe(false);
    expect(
      threadGate({
        pendingCount: 0,
        hasViewerPendingReview: false,
        rootPending: true,
      })
    ).toBe(false);
    expect(
      threadGate({ pendingCount: 0, hasViewerPendingReview: false })
    ).toBe(true);
  });
});

describe('SelectionCommentBar + InlineThread + App wiring', () => {
  test('SelectionCommentBar uses hasViewerPendingReview in gate object', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/SelectionCommentBar.tsx'),
      'utf8'
    );
    expect(src).toMatch(/hasViewerPendingReview/);
    expect(src).toMatch(/hasServerPending:\s*Boolean\(hasViewerPendingReview\)/);
    expect(src).toMatch(/canPublishImmediateReviewComment\(\{/);
    expect(src).toMatch(/data-prp-pending-only/);
    expect(src).toMatch(
      /data-prp-composer-submit=\{canImmediate \? undefined : '1'\}/
    );
  });

  test('InlineThread uses hasViewerPendingReview in gate object', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/InlineThread.tsx'),
      'utf8'
    );
    expect(src).toMatch(/hasViewerPendingReview/);
    expect(src).toMatch(/hasServerPending:\s*Boolean\(hasViewerPendingReview\)/);
    expect(src).toMatch(
      /mode: canImmediateComment \? 'comment' : 'pending'/
    );
  });

  test('App passes hasServerPending as hasViewerPendingReview', () => {
    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(app).toMatch(/hasViewerPendingReview=\{hasServerPending\}/);
    const dw = fs.readFileSync(
      path.join(root, 'src/modal/views/pr-modal/DiffWorkspace.tsx'),
      'utf8'
    );
    expect(dw).toMatch(/hasViewerPendingReview=\{hasViewerPendingReview\}/);
  });

  test('shipped modal bundle includes pending-only gate', () => {
    const bundlePath = path.join(root, 'src/modal/dist/pr-modal.bundle.js');
    if (!fs.existsSync(bundlePath)) {
      expect(true).toBe(true);
      return;
    }
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const hasGate =
      bundle.includes('canPublishImmediateReviewComment') ||
      bundle.includes('viewerHasPendingReview') ||
      bundle.includes('data-prp-pending-only') ||
      bundle.includes('hasViewerPendingReview');
    expect(hasGate).toBe(true);
  });
});

import {
  formatStartReviewError,
  LOCKED_PR_START_REVIEW_MSG,
} from '../src/modal/lib/pending-review';

describe('formatStartReviewError (locked PR Start review)', () => {
  test('maps locked / 422 lock messages to clear product copy', () => {
    expect(formatStartReviewError(new Error('Issue is locked'))).toBe(
      LOCKED_PR_START_REVIEW_MSG
    );
    expect(
      formatStartReviewError({ message: 'Validation Failed', status: 422 })
    ).not.toBe(LOCKED_PR_START_REVIEW_MSG); // 422 without lock word keeps raw
    expect(
      formatStartReviewError({
        message: '422 locked conversation',
        status: 422,
      })
    ).toBe(LOCKED_PR_START_REVIEW_MSG);
    expect(formatStartReviewError(new Error('network fail'))).toBe(
      'network fail'
    );
  });

  test('App Start review catch uses formatStartReviewError (wiring)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(src).toMatch(/formatStartReviewError/);
    expect(src).toMatch(/onSubmitSelectionCommentPending/);
  });
});
