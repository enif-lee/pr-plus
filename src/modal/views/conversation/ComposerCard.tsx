/**
 * Conversation footer: Comment vs Review composer with pending threads slot.
 * Layout tabs prefer Tailwind; residual tokens stay in ComposerTabs.css.
 */
import React, { useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { OptBtnHint } from '@common/OptBtnHint';
import { useT } from '@lib/locale-context';

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
  /** Conversation kb-focus on the composer host (⌥J/K). */
  showShortcutHint = false,
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
  showShortcutHint?: boolean;
}) {
  const t = useT();
  const pendingThreadCount = Array.isArray(pendingReviewGroup?.threads)
    ? pendingReviewGroup.threads.length
    : pendingCount;
  /** Typing in the composer field counts as focused for Opt badges. */
  const [fieldFocused, setFieldFocused] = useState(false);
  const hintsOn = Boolean(showShortcutHint || fieldFocused);

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
          <span
            className={`inline-flex${hintsOn ? ' prp-opt-hint-host' : ''}`}
          >
            {hintsOn ? (
              <OptBtnHint label="⌥T" preferredPlacement="top" />
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'comment'}
              className={`prp-composer-mode__tab inline-flex items-center gap-1.5${
                composerMode === 'comment' ? ' prp-composer-mode__tab--active' : ''
              }`}
              onClick={() => setComposerMode('comment')}
              data-prp-composer-mode="comment"
              title={`${t('cta_comment')} (⌥T)`}
            >
              {t('cta_comment')}
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
            title={`${t('cta_review')} (⌥T)`}
          >
            {t('cta_review')}
            {pendingCount > 0 ? (
              <span
                className="prp-composer-mode__badge ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                title={t('cta_pending_review')}
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
                {t('cta_pending_review')}
              </span>
              <Badge tone="warn" title={t('cta_pending_review')}>
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
        <div
          className={`prp-composer__field-hint${
            hintsOn ? ' prp-opt-hint-host' : ''
          }`}
        >
          {hintsOn ? (
            <OptBtnHint label="⌥I" preferredPlacement="top" />
          ) : null}
          <MarkdownComposer
            value={commentText}
            onChange={setCommentText}
            placeholder={
              composerMode === 'review'
                ? t('cta_write_comment')
                : t('cta_write_comment')
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
            onComposerFocusChange={(on: boolean) => setFieldFocused(Boolean(on))}
          />
        </div>
        {composerMode === 'comment' ? (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <span
              className={`inline-flex${hintsOn ? ' prp-opt-hint-host' : ''}`}
            >
              {hintsOn ? (
                <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
              ) : null}
              <Button
                variant="primary"
                size="sm"
                loading={Boolean(actionBusy)}
                disabled={!String(commentText || '').trim()}
                onClick={submitComment}
                title={`${t('cta_post_comment')} (⌥C · ⌘↵)`}
                data-prp-composer-submit="1"
              >
                {actionBusy ? t('cta_submitting') : t('cta_submit')}
              </Button>
            </span>
            {detail.state === 'open' && !detail.merged ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                loading={Boolean(actionBusy)}
                onClick={onClosePr}
                title={t('cta_close_pr')}
              >
                {t('cta_close_pr')}
              </Button>
            ) : null}
            {detail.state === 'closed' && !detail.merged ? (
              <Button
                size="sm"
                variant="ok"
                disabled={actionBusy}
                loading={Boolean(actionBusy)}
                onClick={onReopenPr}
                title={t('cta_reopen_pr')}
              >
                {t('cta_reopen_pr')}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="prp-composer__row prp-composer__row--review flex flex-wrap gap-2 items-center mt-2">
            <span
              className={`inline-flex${hintsOn ? ' prp-opt-hint-host' : ''}`}
            >
              {hintsOn ? (
                <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
              ) : null}
              <Button
                variant="primary"
                size="sm"
                loading={Boolean(actionBusy)}
                disabled={
                  !String(commentText || '').trim() && !pendingCount
                }
                onClick={submitReview}
                title={`${t('cta_submit_review_comment')} (⌥C · ⌘↵)`}
                data-prp-composer-submit="1"
              >
                {actionBusy ? t('cta_submitting') : t('cta_submit_review')}
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
                  title={t('cta_approve_pr')}
                >
                  {actionBusy ? t('cta_working') : t('cta_approve')}
                </Button>
                <Button
                  size="sm"
                  variant="warn"
                  disabled={actionBusy}
                  loading={Boolean(actionBusy)}
                  onClick={() => onLeaveReviewAction?.('request_changes')}
                  title={t('cta_request_changes')}
                >
                  {actionBusy ? t('cta_working') : t('cta_request_changes')}
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
                title={t('cta_discard_pending')}
              >
                {actionBusy ? t('cta_working') : t('cta_discard')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
