/**
 * Conversation footer: Comment vs Review composer with pending threads slot.
 * Layout tabs prefer Tailwind; residual tokens stay in ComposerTabs.css.
 */
import React from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { OptBtnHint } from '@common/OptBtnHint';

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

  const submitComment = () => onLeaveReviewAction?.('issue-comment');
  const submitReview = () => onLeaveReviewAction?.('comment');

  return (
    <Card
      className="prp-card--composer"
      title={
        <div
          className="prp-composer-mode inline-flex items-center gap-0 rounded-lg p-0.5"
          role="tablist"
          aria-label="Comment or review"
          data-prp-composer-mode-tabs="1"
        >
          <span className="prp-opt-hint-host inline-flex">
            <OptBtnHint label="⌥T" preferredPlacement="top" />
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'comment'}
              className={`prp-composer-mode__tab inline-flex items-center gap-1.5${
                composerMode === 'comment' ? ' prp-composer-mode__tab--active' : ''
              }`}
              onClick={() => setComposerMode('comment')}
              data-prp-composer-mode="comment"
              title="Comment mode (⌥T toggles)"
            >
              Comment
            </button>
          </span>
          <button
            type="button"
            role="tab"
            aria-selected={composerMode === 'review'}
            className={`prp-composer-mode__tab inline-flex items-center gap-1.5${
              composerMode === 'review' ? ' prp-composer-mode__tab--active' : ''
            }`}
            onClick={() => setComposerMode('review')}
            data-prp-composer-mode="review"
            title="Review mode (⌥T toggles)"
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
      <div
        className="prp-composer prp-composer--review"
        ref={commentBoxRef as any}
        data-prp-composer-root="1"
        data-prp-composer-kind="conversation"
        data-prp-can-toggle-mode="1"
      >
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
        <div className="prp-opt-hint-host prp-composer__field-hint">
          <OptBtnHint label="⌥E" preferredPlacement="top" />
          <OptBtnHint label="⌥I" preferredPlacement="top" />
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
            onSubmitRequest={
              composerMode === 'comment' ? submitComment : submitReview
            }
          />
        </div>
        {composerMode === 'comment' ? (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <span className="prp-opt-hint-host inline-flex">
              <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
              <Button
                variant="primary"
                size="sm"
                loading={Boolean(actionBusy)}
                disabled={!String(commentText || '').trim()}
                onClick={submitComment}
                title="Post conversation comment (⌥C · ⌘↵)"
                data-prp-composer-submit="1"
              >
                {actionBusy ? 'Submitting…' : 'Submit'}
              </Button>
            </span>
            {detail.state === 'open' && !detail.merged ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                loading={Boolean(actionBusy)}
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
                loading={Boolean(actionBusy)}
                onClick={onReopenPr}
                title="Reopen pull request"
              >
                Reopen
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <span className="prp-opt-hint-host inline-flex">
              <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
              <Button
                variant="primary"
                size="sm"
                loading={Boolean(actionBusy)}
                disabled={
                  !String(commentText || '').trim() && !pendingCount
                }
                onClick={submitReview}
                title={
                  pendingCount > 0
                    ? 'Submit pending review as comment (⌥C · ⌘↵)'
                    : 'Submit review as comment (⌥C · ⌘↵)'
                }
                data-prp-composer-submit="1"
              >
                {actionBusy ? 'Submitting…' : 'Submit review'}
              </Button>
            </span>
            {showReviewVerdict ? (
              <>
                <Button
                  size="sm"
                  variant="ok"
                  disabled={actionBusy}
                  loading={Boolean(actionBusy)}
                  onClick={() => onLeaveReviewAction?.('approve')}
                  title="Approve pull request"
                >
                  {actionBusy ? 'Working…' : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="warn"
                  disabled={actionBusy}
                  loading={Boolean(actionBusy)}
                  onClick={() => onLeaveReviewAction?.('request_changes')}
                  title="Request changes"
                >
                  {actionBusy ? 'Working…' : 'Request changes'}
                </Button>
              </>
            ) : null}
            {pendingCount > 0 && typeof onDiscardPending === 'function' ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                loading={Boolean(actionBusy)}
                onClick={() => onDiscardPending?.()}
                title="Discard pending review"
              >
                {actionBusy ? 'Working…' : 'Discard'}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
