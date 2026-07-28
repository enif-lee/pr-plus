/**
 * Conversation footer: Comment vs Review composer with pending threads slot.
 * Layout tabs prefer Tailwind; residual tokens stay in ComposerTabs.css.
 */
import React from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { MarkdownComposer } from '@common/MarkdownComposer';

export function ComposerCard({
  composerMode,
  setComposerMode,
  pendingCount,
  pendingReviewGroup,
  commentText,
  setCommentText,
  actionBusy,
  detail,
  commentBoxRef,
  onUploadFile,
  linkCtx,
  mentionCandidates,
  onLeaveReviewAction,
  onDiscardPending,
  onClosePr,
  onReopenPr,
  showReviewVerdict,
  renderSearchableBody,
  renderPendingThreadList,
}: {
  composerMode: 'comment' | 'review';
  setComposerMode: (m: 'comment' | 'review') => void;
  pendingCount: number;
  pendingReviewGroup: any;
  commentText: string;
  setCommentText: (v: string) => void;
  actionBusy?: boolean;
  detail: any;
  commentBoxRef?: React.RefObject<HTMLDivElement | null>;
  onUploadFile?: any;
  linkCtx?: any;
  mentionCandidates?: any[];
  onLeaveReviewAction?: (action: string) => void;
  onDiscardPending?: (() => void) | null;
  onClosePr?: () => void;
  onReopenPr?: () => void;
  showReviewVerdict?: boolean;
  renderSearchableBody: (body: string, anchor: string, mark: boolean) => React.ReactNode;
  renderPendingThreadList: (item: any, keyPrefix: string, opts: { compact?: boolean }) => React.ReactNode;
}) {
  const pendingThreadCount = Array.isArray(pendingReviewGroup?.threads)
    ? pendingReviewGroup.threads.length
    : pendingCount;

  return (
    <Card
      className="prp-card--composer"
      title={
        <div
          className="prp-composer-mode inline-flex items-center gap-0 rounded-lg p-0.5"
          role="tablist"
          aria-label="Comment or review"
        >
          <button
            type="button"
            role="tab"
            aria-selected={composerMode === 'comment'}
            className={`prp-composer-mode__tab inline-flex items-center gap-1.5${
              composerMode === 'comment' ? ' prp-composer-mode__tab--active' : ''
            }`}
            onClick={() => setComposerMode('comment')}
          >
            Comment
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={composerMode === 'review'}
            className={`prp-composer-mode__tab inline-flex items-center gap-1.5${
              composerMode === 'review' ? ' prp-composer-mode__tab--active' : ''
            }`}
            onClick={() => setComposerMode('review')}
          >
            Review
            {pendingCount > 0 ? (
              <span
                className="prp-composer-mode__badge ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                title="Pending review items"
              >
                {pendingCount}
              </span>
            ) : null}
          </button>
        </div>
      }
    >
      <div className="prp-composer prp-composer--review" ref={commentBoxRef as any}>
        {composerMode === 'review' && pendingReviewGroup ? (
          <div
            className="prp-composer__pending-threads"
            data-pending-threads={pendingThreadCount}
          >
            <div className="prp-composer__pending-head flex items-center gap-2">
              <span className="prp-composer__pending-title font-semibold text-sm">
                Pending review
              </span>
              <Badge tone="warn" title="Not yet submitted">
                {pendingThreadCount} thread{pendingThreadCount === 1 ? '' : 's'}
              </Badge>
            </div>
            {pendingReviewGroup.body ? (
              <div className="prp-review-group__body prp-composer__pending-body">
                {renderSearchableBody(
                  pendingReviewGroup.body,
                  `review:${pendingReviewGroup.id}`,
                  true
                )}
              </div>
            ) : null}
            {renderPendingThreadList(pendingReviewGroup, 'composer-', {
              compact: true,
            })}
          </div>
        ) : null}
        <MarkdownComposer
          value={commentText}
          onChange={setCommentText}
          placeholder={
            composerMode === 'review'
              ? 'Leave a review summary (optional with pending threads)…'
              : 'Write a comment…'
          }
          compact
          rows={3}
          disabled={actionBusy}
          showTabs
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
          mentionCandidates={mentionCandidates}
        />
        {composerMode === 'comment' ? (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <Button
              variant="primary"
              size="sm"
              disabled={actionBusy || !String(commentText || '').trim()}
              onClick={() => onLeaveReviewAction?.('issue-comment')}
              title="Post conversation comment"
            >
              Submit
            </Button>
            {detail.state === 'open' && !detail.merged ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                onClick={onClosePr}
                title="Close pull request"
              >
                Close pull request
              </Button>
            ) : null}
            {detail.state === 'closed' && !detail.merged ? (
              <Button
                size="sm"
                variant="ok"
                disabled={actionBusy}
                onClick={onReopenPr}
                title="Reopen pull request"
              >
                Reopen
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <Button
              variant="primary"
              size="sm"
              disabled={
                actionBusy || (!String(commentText || '').trim() && !pendingCount)
              }
              onClick={() => onLeaveReviewAction?.('comment')}
              title={
                pendingCount > 0
                  ? 'Submit pending review as comment'
                  : 'Submit review as comment'
              }
            >
              Submit review
            </Button>
            {showReviewVerdict ? (
              <>
                <Button
                  size="sm"
                  variant="ok"
                  disabled={actionBusy}
                  onClick={() => onLeaveReviewAction?.('approve')}
                  title="Approve pull request"
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="warn"
                  disabled={actionBusy}
                  onClick={() => onLeaveReviewAction?.('request_changes')}
                  title="Request changes"
                >
                  Request changes
                </Button>
              </>
            ) : null}
            {pendingCount > 0 && typeof onDiscardPending === 'function' ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                onClick={() => onDiscardPending?.()}
                title="Discard pending review"
              >
                Discard
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
