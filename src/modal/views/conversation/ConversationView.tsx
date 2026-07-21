import React, { useMemo, memo } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { avatarInitials, formatWhen } from '@common/utils';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import { buildConversationTimeline, pageTimelineItems } from '@lib/conversation-timeline';
import { snippetForComment } from '@lib/diff-snippet';
import { BodyEditor } from '../composers/BodyEditor';
import { MetaList } from './MetaList';
import { DiffSnippetView } from './DiffSnippetView';
import { AsideCommitsTimeline } from './AsideCommitsTimeline';
import { AsideFilesTree } from './AsideFilesTree';
import { ChecksPanel, hasChecksData } from './ChecksPanel';
import { LoadingSkeleton } from '../chrome/LoadingSkeleton';

function ConversationViewImpl(props: any) {
  const {
    detail,
    commentText,
    setCommentText,
    actionBusy,
    actionMsg,
    onLeaveReviewAction,
    timelinePage,
    onTimelinePage,
    sectionLoading,
    onDeleteIssueComment,
    onDeleteReviewComment,
    editingBody,
    onStartEditBody,
    onCancelEditBody,
    onSaveBody,
    editingComment,
    onStartEditComment,
    onCancelEditComment,
    onSaveEditComment,
    pendingCount,
    onAddReviewer,
    onRemoveReviewer,
    onAddAssignee,
    onRemoveAssignee,
    onAddLabel,
    onRemoveLabel,
    onApplySuggestion,
    onRegisterApply,
    onRegisterEditorSave,
    onSetMilestone,
    onOpenMilestonePicker,
    onClearMilestone,
    onRerequestReview,
    onMergePr,
    onUpdateBranch,
    onSetDraftStage,
    onClosePr,
    onReopenPr,
    commentBoxRef,
    onUploadFile,
    reviewerAddRef,
    assigneeAddRef,
    labelAddRef,
    milestoneAddRef,
  } = props;

  const allItems = useMemo(() => {
    if (typeof buildConversationTimeline === 'function') {
      return buildConversationTimeline(detail, {
        snippetForComment:
          typeof snippetForComment === 'function' ? snippetForComment : undefined,
      });
    }
    return [];
  }, [detail]);

  const paged: any = useMemo(() => {
    if (typeof pageTimelineItems === 'function') {
      return pageTimelineItems(allItems, { page: timelinePage, pageSize: 15 });
    }
    return {
      items: allItems,
      page: 1,
      totalPages: 1,
      total: allItems.length,
      hasMore: false,
      hasPrev: false,
      hasNewer: false,
      hasOlder: false,
    };
  }, [allItems, timelinePage]);

  if (!detail && sectionLoading) {
    return <LoadingSkeleton variant="conversation" />;
  }
  if (!detail) return null;

  const canEditMeta = Boolean(detail.viewerLogin);
  const linkCtx = {
    owner: detail.owner,
    repo: detail.repo,
    magicLinks: detail.magicLinks || [],
  };
  const showChecks = hasChecksData(detail.checks);

  function renderTimelineBody(item: any, kind: string) {
    const isEditing =
      editingComment &&
      editingComment.kind === kind &&
      String(editingComment.id) === String(item.id);
    if (isEditing) {
      return (
        <BodyEditor
          value={item.body || ''}
          actionBusy={actionBusy}
          onSave={(body: string) => onSaveEditComment?.(kind, item.id, body)}
          onCancel={onCancelEditComment}
          onRegisterSave={onRegisterEditorSave}
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
        />
      );
    }
    const canApply =
      kind === 'review' &&
      item.path &&
      item.line != null &&
      (item.side || 'RIGHT') === 'RIGHT' &&
      detail.state === 'open';
    return (
      <MarkdownView
        source={item.body || ''}
        className="prp-md--compact"
        canApplySuggestion={canApply}
        actionBusy={actionBusy}
        onRegisterApply={onRegisterApply}
        linkCtx={linkCtx}
        onApplySuggestion={(content: string) =>
          onApplySuggestion?.({
            path: item.path,
            startLine: item.startLine || item.line,
            endLine: item.line,
            suggestion: content,
          })
        }
      />
    );
  }

  function commentActions(kind: string | null, id: any, canDelete: boolean, body?: string) {
    if (!canDelete || !kind) return null;
    return (
      <div className="prp-icon-actions">
        <button
          type="button"
          className="prp-icon-btn"
          disabled={actionBusy}
          title="Edit"
          aria-label="Edit comment"
          onClick={() => onStartEditComment?.(kind, id, body)}
        >
          ✎
        </button>
        <button
          type="button"
          className="prp-icon-btn prp-icon-btn--danger"
          disabled={actionBusy}
          title="Delete"
          aria-label="Delete comment"
          onClick={() =>
            kind === 'issue' ? onDeleteIssueComment?.(id) : onDeleteReviewComment?.(id)
          }
        >
          🗑
        </button>
      </div>
    );
  }

  return (
    <div className="prp-conversation">
      <div className="prp-conversation__main">
        <Card
          title="Description"
          className="prp-card--desc"
          actions={
            !sectionLoading && !editingBody ? (
              <button
                type="button"
                className="prp-icon-btn"
                disabled={actionBusy}
                title="Edit description"
                aria-label="Edit description"
                onClick={onStartEditBody}
              >
                ✎
              </button>
            ) : null
          }
        >
          {sectionLoading ? (
            <div className="prp-section-skeleton prp-section-skeleton--sm" />
          ) : editingBody ? (
            <BodyEditor
              value={detail.body || ''}
              actionBusy={actionBusy}
              onSave={onSaveBody}
              onCancel={onCancelEditBody}
              onRegisterSave={onRegisterEditorSave}
              onUploadFile={onUploadFile}
              linkCtx={linkCtx}
            />
          ) : (
            <MarkdownView
              source={detail.body || '_No description provided._'}
              linkCtx={linkCtx}
            />
          )}
        </Card>

        <Card title={`Conversation${paged.total ? ` (${paged.total})` : ''}`}>
          {sectionLoading ? (
            <div className="prp-section-skeleton" />
          ) : paged.items.length === 0 ? (
            <p className="prp-muted">No conversation yet.</p>
          ) : (
            <ul className="prp-conversation-feed">
              {paged.items.map((item: any) => {
                const isIssue = item.kind === 'issue-comment';
                const isReviewThread =
                  item.kind === 'review-thread' || item.kind === 'review-comment';
                const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;
                const reviewReplies = isReviewThread ? item.replies || [] : [];
                const useReviewReplyTimeline = isReviewThread && reviewReplies.length > 0;

                return (
                  <li
                    key={item.id || item.key}
                    className={`prp-conversation-feed__item prp-conversation-feed__item--${item.kind}`}
                  >
                    <div className="prp-conversation-feed__card">
                      {item.snippet ? (
                        <DiffSnippetView
                          snippet={item.snippet}
                          filePath={item.snippet.path || item.path}
                        />
                      ) : null}
                      {useReviewReplyTimeline ? (
                        <ul className="prp-review-thread">
                          <li className="prp-review-thread__item">
                            <span
                              className="prp-avatar prp-avatar--sm prp-review-thread__avatar"
                              aria-hidden="true"
                            >
                              {avatarInitials(item.author)}
                            </span>
                            <div className="prp-review-thread__content">
                              <div className="prp-review-thread__meta">
                                <strong>
                                  <UserLink login={item.author || 'user'} />
                                </strong>
                                <Badge tone="muted">review thread</Badge>
                                {item.resolved ? <Badge tone="ok">resolved</Badge> : null}
                                {item.at ? (
                                  <span className="prp-muted">{formatWhen(item.at)}</span>
                                ) : null}
                                {commentActions(editKind, item.id, item.canDelete, item.body)}
                              </div>
                              {renderTimelineBody(item, editKind || 'review')}
                            </div>
                          </li>
                          {reviewReplies.map((r: any, idx: number) => (
                            <li
                              key={r.id || idx}
                              className={`prp-review-thread__item${
                                idx === reviewReplies.length - 1
                                  ? ' prp-review-thread__item--last'
                                  : ''
                              }`}
                            >
                              <span
                                className="prp-avatar prp-avatar--sm prp-review-thread__avatar"
                                aria-hidden="true"
                              >
                                {avatarInitials(r.author)}
                              </span>
                              <div className="prp-review-thread__content">
                                <div className="prp-review-thread__meta">
                                  <strong>
                                    <UserLink login={r.author || 'user'} />
                                  </strong>
                                  {r.createdAt || r.at ? (
                                    <span className="prp-muted">
                                      {formatWhen(r.createdAt || r.at)}
                                    </span>
                                  ) : null}
                                  {commentActions(
                                    editKind || 'review',
                                    r.id,
                                    Boolean(r.canDelete),
                                    r.body
                                  )}
                                </div>
                                {renderTimelineBody(
                                  { ...r, id: r.id, body: r.body },
                                  editKind || 'review'
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <div className="prp-conversation-feed__meta">
                            <span className="prp-avatar prp-avatar--sm" aria-hidden="true">
                              {avatarInitials(item.author)}
                            </span>
                            <strong>
                              <UserLink login={item.author || 'user'} />
                            </strong>
                            {item.kind === 'review-thread' ? (
                              <Badge tone="muted">review thread</Badge>
                            ) : null}
                            {item.state ? (
                              <Badge tone={String(item.state).toLowerCase()}>{item.state}</Badge>
                            ) : null}
                            {item.resolved ? <Badge tone="ok">resolved</Badge> : null}
                            {item.path ? (
                              <span className="prp-muted prp-mono">
                                {item.path}
                                {item.line != null ? `:${item.line}` : ''}
                              </span>
                            ) : null}
                            {item.at ? (
                              <span className="prp-muted">{formatWhen(item.at)}</span>
                            ) : null}
                            {commentActions(editKind, item.id, item.canDelete, item.body)}
                          </div>
                          {editKind ? (
                            renderTimelineBody(item, editKind)
                          ) : (
                            <MarkdownView
                              source={item.body || ''}
                              className="prp-md--compact"
                              linkCtx={linkCtx}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {paged.totalPages > 1 ? (
            <div className="prp-pagination">
              <Button
                size="sm"
                disabled={!paged.hasNewer && !paged.hasPrev}
                onClick={() => onTimelinePage?.(paged.page - 1)}
              >
                Newer
              </Button>
              <span className="prp-muted">
                Page {paged.page}/{paged.totalPages}
              </span>
              <Button
                size="sm"
                disabled={!paged.hasOlder && !paged.hasMore}
                onClick={() => onTimelinePage?.(paged.page + 1)}
              >
                Older
              </Button>
            </div>
          ) : null}
        </Card>

        <div
          className={`prp-merge-box${
            detail.merged
              ? ' prp-merge-box--muted'
              : detail.mergeable === false || detail.draft
                ? ' prp-merge-box--warn'
                : ''
          }`}
        >
          <h3 className="prp-merge-box__title">
            {detail.merged ? 'Merged' : detail.draft ? 'Draft pull request' : 'Merge'}
          </h3>
          <p className="prp-merge-box__status">
            {detail.merged
              ? 'This pull request has been merged.'
              : detail.draft
                ? 'Draft — mark ready for review before merging.'
                : detail.mergeable === false
                  ? 'Not mergeable (conflicts or checks).'
                  : `Able to merge · ${detail.mergeableState || 'clean'}`}
          </p>
          {showChecks ? (
            <div className="prp-merge-box__checks">
              <ChecksPanel checks={detail.checks} compact />
            </div>
          ) : null}
          {detail.state === 'open' && !detail.merged ? (
            <div className="prp-merge-box__actions">
              {!detail.draft ? (
                <Button
                  size="sm"
                  variant="ok"
                  disabled={actionBusy || detail.mergeable === false}
                  onClick={() => onMergePr?.('merge')}
                >
                  Merge
                </Button>
              ) : null}
              <Button size="sm" disabled={actionBusy} onClick={onUpdateBranch}>
                Update branch
              </Button>
              {detail.draft ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionBusy}
                  onClick={() => onSetDraftStage?.('ready')}
                >
                  Ready for review
                </Button>
              ) : (
                <Button size="sm" disabled={actionBusy} onClick={() => onSetDraftStage?.('draft')}>
                  Convert to draft
                </Button>
              )}
              {(detail.requestedReviewers || []).length || (detail.reviews || []).length ? (
                <Button size="sm" disabled={actionBusy} onClick={onRerequestReview}>
                  Re-request
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Card title="Comment" className="prp-card--composer">
          <div className="prp-composer prp-composer--review" ref={commentBoxRef}>
            <div className="prp-composer__label">
              Comment or leave a review
              {pendingCount > 0 ? (
                <Badge tone="warn">
                  {pendingCount} pending line comment{pendingCount === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>
            <MarkdownComposer
              value={commentText}
              onChange={setCommentText}
              placeholder="Write a comment…"
              compact
              rows={3}
              disabled={actionBusy}
              showTabs
              onUploadFile={onUploadFile}
              linkCtx={linkCtx}
            />
            <div className="prp-composer__row prp-composer__row--review">
              <Button
                variant="primary"
                size="sm"
                disabled={actionBusy || (!String(commentText || '').trim() && !pendingCount)}
                onClick={() => onLeaveReviewAction?.('comment')}
              >
                Comment
              </Button>
              <Button
                size="sm"
                variant="ok"
                disabled={actionBusy}
                onClick={() => onLeaveReviewAction?.('approve')}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="warn"
                disabled={actionBusy}
                onClick={() => onLeaveReviewAction?.('request_changes')}
              >
                Request changes
              </Button>
              {detail.state === 'open' && !detail.merged ? (
                <Button size="sm" variant="danger" disabled={actionBusy} onClick={onClosePr}>
                  Close
                </Button>
              ) : null}
              {detail.state === 'closed' && !detail.merged ? (
                <Button size="sm" variant="ok" disabled={actionBusy} onClick={onReopenPr}>
                  Reopen
                </Button>
              ) : null}
            </div>
            {actionMsg ? <p className="prp-muted prp-composer-hint">{actionMsg}</p> : null}
          </div>
        </Card>
      </div>

      <aside className="prp-conversation__aside">
        <MetaList
          title="Reviewers"
          rows={
            typeof buildUnifiedReviewerRows === 'function'
              ? buildUnifiedReviewerRows(detail)
              : (detail.requestedReviewers || []).map((login: string) => ({
                  login,
                  status: 'PENDING',
                }))
          }
          emptyLabel="No reviewers yet"
          onAdd={canEditMeta ? onAddReviewer : null}
          onRemove={canEditMeta ? onRemoveReviewer : null}
          addLabel="Add reviewer…"
          actionBusy={actionBusy}
          addButtonRef={reviewerAddRef}
        />
        <MetaList
          title="Assignees"
          rows={(detail.assignees || []).map((login: string) => ({ login }))}
          emptyLabel="No assignees"
          onAdd={canEditMeta ? onAddAssignee : null}
          onRemove={canEditMeta ? onRemoveAssignee : null}
          addLabel="Add assignee…"
          actionBusy={actionBusy}
          addButtonRef={assigneeAddRef}
        />
        <Card title="Labels">
          <div className="prp-label-row">
            {(detail.labels || []).length === 0 ? (
              <span className="prp-muted">No labels</span>
            ) : (
              (detail.labels || []).map((l: any) => (
                <span key={l.name || l} className="prp-label-chip">
                  <LabelLink owner={detail.owner} repo={detail.repo} label={l} />
                  {canEditMeta && onRemoveLabel ? (
                    <button
                      type="button"
                      className="prp-label-chip__remove"
                      disabled={actionBusy}
                      onClick={() => onRemoveLabel(l.name || l)}
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))
            )}
          </div>
          {canEditMeta && onAddLabel ? (
            <button
              type="button"
              className="prp-add-link"
              disabled={actionBusy}
              onClick={onAddLabel}
              ref={labelAddRef}
            >
              Add label…
            </button>
          ) : null}
        </Card>
        <Card title="Milestone">
          {detail.milestone ? (
            <div className="prp-meta-row">
              <strong>{detail.milestone.title}</strong>
              <span className="prp-muted"> #{detail.milestone.number}</span>
              {canEditMeta && onClearMilestone ? (
                <button
                  type="button"
                  className="prp-icon-btn"
                  disabled={actionBusy}
                  title="Clear milestone"
                  aria-label="Clear milestone"
                  onClick={onClearMilestone}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ) : (
            <span className="prp-muted">No milestone</span>
          )}
          {canEditMeta && (onOpenMilestonePicker || onSetMilestone) ? (
            <button
              type="button"
              className="prp-add-link"
              disabled={actionBusy}
              onClick={() =>
                onOpenMilestonePicker ? onOpenMilestonePicker() : onSetMilestone?.(false)
              }
              ref={milestoneAddRef}
            >
              {detail.milestone ? 'Change milestone…' : 'Set milestone…'}
            </button>
          ) : null}
        </Card>
        <Card title="Linked issues">
          {(detail.linkedIssues || []).length ? (
            <ul className="prp-list">
              {detail.linkedIssues.map((n: number) => (
                <li key={n}>
                  <a
                    href={`https://github.com/${detail.owner}/${detail.repo}/issues/${n}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{n}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <span className="prp-muted">None detected in body</span>
          )}
        </Card>
        {showChecks || sectionLoading ? (
          <Card title="Checks">
            {sectionLoading ? (
              <div className="prp-section-skeleton prp-section-skeleton--sm" />
            ) : (
              <ChecksPanel checks={detail.checks} />
            )}
          </Card>
        ) : null}
        <Card title={`Commits${detail.commits?.length ? ` (${detail.commits.length})` : ''}`}>
          <AsideCommitsTimeline commits={detail.commits || []} />
        </Card>
        <Card title={`Files${detail.files?.length ? ` (${detail.files.length})` : ''}`}>
          <AsideFilesTree files={detail.files || []} />
        </Card>
        {actionMsg ? <div className="prp-action-msg">{actionMsg}</div> : null}
      </aside>
    </div>
  );
}

export const ConversationView = memo(ConversationViewImpl);
export default ConversationView;
