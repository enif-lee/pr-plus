import React, { memo, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import { BodyEditor } from '../composers/BodyEditor';

function InlineThreadImpl(props: any) {
  const {
    row,
    thread,
    replyText,
    onReplyText,
    onReply,
    onResolve,
    onDelete,
    onEdit,
    onSaveEdit,
    onCancelEdit,
    editingCommentId,
    onRegisterEditorSave,
    onApplySuggestion,
    onRegisterApply,
    actionBusy,
    viewerLogin,
    prOpen,
    linkCtx,
    onUploadFile,
    collapsed: collapsedProp,
    onToggleCollapse,
    pendingCount = 0,
  } = props;

  const [localCollapsed, setLocalCollapsed] = useState(false);
  const controlled = typeof collapsedProp === 'boolean';
  const collapsed = controlled ? collapsedProp : localCollapsed;

  function toggleCollapse() {
    if (controlled) {
      onToggleCollapse?.();
    } else {
      setLocalCollapsed((c) => !c);
    }
  }

  const author = row?.author || thread?.root?.author || 'user';
  const body = row?.body || thread?.root?.body || '';
  const path = row?.filePath || thread?.root?.path || '';
  const line = row?.newLine ?? thread?.root?.line ?? null;
  const startLine = thread?.root?.startLine ?? row?.startLine ?? line;
  const side = thread?.root?.side || row?.side || 'RIGHT';
  const rootAt = row?.createdAt || thread?.root?.createdAt || null;
  const canOwn =
    viewerLogin &&
    author &&
    String(author).toLowerCase() === String(viewerLogin).toLowerCase();
  const canApply =
    prOpen &&
    path &&
    line != null &&
    String(side).toUpperCase() === 'RIGHT' &&
    Boolean(onApplySuggestion);
  const replies = thread?.replies || [];
  const useTimeline = replies.length > 0;
  const replyCount = replies.length;
  const pendingReplyCount = replies.filter((r: any) => r?.pending).length;
  const hasPendingReplies = pendingReplyCount > 0;
  // Pending (unsubmitted) threads can be deleted but not resolved on GitHub
  const rootPending = Boolean(
    thread?.root?.pending || row?.pending || thread?.pending
  );
  const canResolveThread =
    Boolean(thread?.threadNodeId || row?.threadNodeId) &&
    !rootPending &&
    !hasPendingReplies;

  const locLabel = `${path}${
    startLine != null && line != null && startLine !== line
      ? `:${startLine}–${line}`
      : line != null
        ? `:${line}`
        : ''
  }${side ? ` · ${side}` : ''}`;

  function isEditingId(id: any) {
    return editingCommentId != null && String(editingCommentId) === String(id);
  }

  function renderCommentActions(id: any, commentBody: any, own: boolean) {
    if (!own || isEditingId(id)) return null;
    return (
      <div className="prp-icon-actions">
        <button
          type="button"
          className="prp-icon-btn"
          disabled={actionBusy}
          title="Edit"
          aria-label="Edit comment"
          onClick={() => onEdit?.(id, commentBody)}
        >
          ✎
        </button>
        <button
          type="button"
          className="prp-icon-btn prp-icon-btn--danger"
          disabled={actionBusy}
          title="Delete"
          aria-label="Delete comment"
          onClick={() => onDelete?.(id)}
        >
          🗑
        </button>
      </div>
    );
  }

  function renderCommentBody(
    id: any,
    commentBody: any,
    { canApplySuggestion = false } = {}
  ) {
    if (isEditingId(id)) {
      return (
        <BodyEditor
          value={commentBody || ''}
          actionBusy={actionBusy}
          rows={4}
          compact
          placeholder="Edit comment…"
          onSave={(body: string) => onSaveEdit?.(id, body)}
          onCancel={onCancelEdit}
          onRegisterSave={onRegisterEditorSave}
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
        />
      );
    }
    return (
      <MarkdownView
        source={commentBody || ''}
        className="prp-md--compact"
        canApplySuggestion={canApplySuggestion}
        actionBusy={actionBusy}
        onRegisterApply={onRegisterApply}
        linkCtx={linkCtx}
        onApplySuggestion={
          canApplySuggestion
            ? (content: string) =>
                onApplySuggestion?.({
                  path,
                  startLine: startLine || line,
                  endLine: line,
                  suggestion: content,
                })
            : undefined
        }
      />
    );
  }

  return (
    <div
      className={`prp-inline-thread${
        useTimeline ? ' prp-inline-thread--threaded' : ' prp-inline-thread--single'
      }${collapsed ? ' prp-inline-thread--collapsed' : ''}`}
    >
      <div className="prp-inline-thread__card">
        <div className="prp-inline-thread__filebar">
          <button
            type="button"
            className="prp-thread-toggle"
            onClick={toggleCollapse}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand thread' : 'Collapse thread'}
          >
            <span className="prp-thread-toggle__icon" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
            <span className="prp-mono prp-inline-thread__loc">{locLabel}</span>
            {replyCount > 0 ? (
              <span className="prp-muted prp-thread-toggle__count">
                {replyCount + 1} comment{replyCount + 1 === 1 ? '' : 's'}
              </span>
            ) : null}
          </button>
          {thread?.root?.outdated || row?.outdated || thread?.outdated ? (
            <Badge tone="muted" title="No longer applies to the latest revision">
              outdated
            </Badge>
          ) : null}
          {thread?.resolved || row?.resolved ? (
            <Badge tone="ok">resolved</Badge>
          ) : (
            <Badge tone="warn">open</Badge>
          )}
        </div>

        {!collapsed ? (
          <>
            {useTimeline ? (
              <ul className="prp-review-thread">
                <li className="prp-review-thread__item">
                  <Avatar
                    login={author}
                    avatarUrl={row?.avatarUrl || thread?.root?.avatarUrl}
                    size="md"
                    className="prp-review-thread__avatar"
                  />
                  <div className="prp-review-thread__content">
                    <div className="prp-review-thread__meta">
                      <strong>
                        <UserLink login={author} />
                      </strong>
                      {rootAt ? <span className="prp-muted">{formatWhen(rootAt)}</span> : null}
                      {canOwn ? <Badge tone="muted">you</Badge> : null}
                      {renderCommentActions(row?.commentId || thread?.id, body, canOwn)}
                    </div>
                    {renderCommentBody(row?.commentId || thread?.id, body, {
                      canApplySuggestion: canApply,
                    })}
                  </div>
                </li>
                {replies.map((r: any, idx: number) => {
                  const ownReply =
                    viewerLogin &&
                    r.author &&
                    String(r.author).toLowerCase() === String(viewerLogin).toLowerCase();
                  const isLast = idx === replies.length - 1;
                  const isPending = Boolean(r.pending);
                  return (
                    <li
                      key={r.id}
                      className={`prp-review-thread__item${
                        isLast ? ' prp-review-thread__item--last' : ''
                      }${isPending ? ' prp-review-thread__item--pending' : ''}`}
                    >
                      <Avatar
                        login={r.author}
                        avatarUrl={r.avatarUrl}
                        size="sm"
                        className="prp-review-thread__avatar"
                      />
                      <div className="prp-review-thread__content">
                        <div className="prp-review-thread__meta">
                          <strong>
                            <UserLink login={r.author || 'user'} />
                          </strong>
                          {isPending ? (
                            <Badge tone="warn" title="Part of an unsubmitted review">
                              pending
                            </Badge>
                          ) : null}
                          {r.outdated ? (
                            <Badge tone="muted" title="No longer applies to the latest revision">
                              outdated
                            </Badge>
                          ) : null}
                          {r.createdAt ? (
                            <span className="prp-muted">{formatWhen(r.createdAt)}</span>
                          ) : null}
                          {!isPending ? renderCommentActions(r.id, r.body, ownReply) : null}
                        </div>
                        {renderCommentBody(r.id, r.body)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="prp-inline-thread__single">
                <div className="prp-inline-thread__head prp-inline-thread__head--flat">
                  <Avatar
                    login={author}
                    avatarUrl={row?.avatarUrl || thread?.root?.avatarUrl}
                    size="md"
                  />
                  <div className="prp-inline-thread__head-text">
                    <div className="prp-inline-thread__title-row">
                      <strong>
                        <UserLink login={author} />
                      </strong>
                      {rootAt ? <span className="prp-muted">{formatWhen(rootAt)}</span> : null}
                      {canOwn ? <Badge tone="muted">you</Badge> : null}
                    </div>
                  </div>
                  {renderCommentActions(row?.commentId || thread?.id, body, canOwn)}
                </div>
                <div className="prp-inline-thread__body">
                  {renderCommentBody(row?.commentId || thread?.id, body, {
                    canApplySuggestion: canApply,
                  })}
                </div>
              </div>
            )}

            <div className="prp-inline-thread__composer">
              <MarkdownComposer
                value={replyText || ''}
                onChange={onReplyText}
                placeholder="Reply"
                compact
                rows={2}
                disabled={actionBusy}
                showTabs
                onUploadFile={onUploadFile}
                linkCtx={linkCtx}
              />
              <div className="prp-composer__row">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionBusy || !String(replyText || '').trim()}
                  onClick={() =>
                    onReply?.(thread || { id: row?.commentId, root: row }, {
                      mode: 'comment',
                    })
                  }
                >
                  Comment
                </Button>
                <Button
                  size="sm"
                  disabled={actionBusy || !String(replyText || '').trim()}
                  onClick={() =>
                    onReply?.(thread || { id: row?.commentId, root: row }, {
                      mode: 'pending',
                    })
                  }
                  title={
                    pendingCount > 0 || hasPendingReplies
                      ? 'Add this reply to your pending review'
                      : 'Start a pending review with this reply'
                  }
                >
                  {pendingCount > 0 || hasPendingReplies ? 'Add comment' : 'Start review'}
                </Button>
                {canResolveThread ? (
                  <Button
                    size="sm"
                    disabled={actionBusy}
                    onClick={() =>
                      onResolve?.(
                        thread?.threadNodeId || row?.threadNodeId,
                        !(thread?.resolved || row?.resolved)
                      )
                    }
                  >
                    {thread?.resolved || row?.resolved
                      ? 'Unresolve conversation'
                      : 'Resolve conversation'}
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="prp-inline-thread__collapsed-preview prp-muted">
            {String(body || '').slice(0, 120)}
            {String(body || '').length > 120 ? '…' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export const InlineThread = memo(InlineThreadImpl);
export default InlineThread;
