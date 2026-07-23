import React, { memo, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import { IconDisclosure, IconPencil, IconTrash } from '@common/icons';
import { BodyEditor } from '../composers/BodyEditor';
import { DiffSnippetView } from '../conversation/DiffSnippetView';

/**
 * Inline review thread card (Diff + Conversation).
 *
 * @param {boolean} [showHunk=false] When true, render code context under the
 *   file header (Conversation). Diff view keeps this off — lines already live
 *   in the virtual diff.
 * @param {object|null} [snippet] Diff snippet from buildConversationTimeline
 *   (lines + path). Only used when showHunk is true.
 */
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
    searchQuery = '',
    activeSearchHit = null,
    searchHits = null,
    searchHitIndex = -1,
    /** Conversation: embed code hunk under file header. Diff: leave false. */
    showHunk = false,
    snippet = null,
    /**
     * Diff: show path filebar. Conversation uses its own 1-level path header
     * (review-group row or conversation thread header) — hide duplicate bar.
     */
    showFileHeader = true,
  } = props;

  const qSearch = String(searchQuery || '').trim();
  function commentOcc(commentId: any) {
    if (!qSearch || !Array.isArray(searchHits) || commentId == null) return null;
    const anchor = `review-comment:${commentId}`;
    let n = 0;
    for (let i = 0; i <= (searchHitIndex ?? 0); i++) {
      const h = searchHits[i];
      if (String(h?.anchorId || '') === anchor || Number(h?.commentId) === Number(commentId)) {
        if (i === searchHitIndex) return n;
        n += 1;
      }
    }
    return null;
  }
  function commentCurrentStart(commentId: any) {
    if (
      activeSearchHit &&
      (String(activeSearchHit.anchorId || '') === `review-comment:${commentId}` ||
        Number(activeSearchHit.commentId) === Number(commentId)) &&
      activeSearchHit.start != null
    ) {
      return Number(activeSearchHit.start);
    }
    return null;
  }

  const defaultCollapsed = Boolean(
    thread?.resolved || row?.resolved || thread?.root?.resolved
  );
  /** null = follow default (resolved → collapsed) */
  const [localCollapsed, setLocalCollapsed] = useState<boolean | null>(null);
  const controlled = typeof collapsedProp === 'boolean';
  const collapsed = controlled
    ? collapsedProp
    : localCollapsed != null
      ? localCollapsed
      : defaultCollapsed;

  function toggleCollapse() {
    if (controlled) {
      onToggleCollapse?.();
    } else {
      setLocalCollapsed((c) => {
        const currently = c != null ? c : defaultCollapsed;
        return !currently;
      });
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

  const fileLoc =
    path &&
    (startLine != null && line != null && startLine !== line
      ? `${path}:${startLine}–${line}`
      : line != null
        ? `${path}:${line}`
        : path);
  const locLabel = fileLoc
    ? `${fileLoc}${side ? ` · ${String(side).toUpperCase()}` : ''}`
    : 'Review thread';
  const commentCount = 1 + replyCount;
  const rootId = row?.commentId ?? thread?.id ?? thread?.root?.id;

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
          <IconPencil size={13} />
        </button>
        <button
          type="button"
          className="prp-icon-btn prp-icon-btn--danger"
          disabled={actionBusy}
          title="Delete"
          aria-label="Delete comment"
          onClick={() => onDelete?.(id)}
        >
          <IconTrash size={13} />
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
        searchQuery={qSearch}
        searchCurrentStart={commentCurrentStart(id)}
        searchOccurrenceIndex={commentOcc(id)}
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
      }${collapsed ? ' prp-inline-thread--collapsed' : ''}${
        rootPending ? ' prp-inline-thread--pending' : ''
      }${props.className ? ` ${props.className}` : ''}`}
      data-search-anchor={
        rootId != null ? `review-comment:${rootId}` : undefined
      }
      data-pending={rootPending ? '1' : undefined}
    >
      <div className="prp-inline-thread__card">
        {showFileHeader ? (
          <div className="prp-inline-thread__filebar prp-review-thread__file-header">
            <div className="prp-review-thread__file-header-main">
              <button
                type="button"
                className="prp-thread-toggle prp-thread-toggle--icon-only"
                onClick={toggleCollapse}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand thread' : 'Collapse thread'}
                aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
              >
                <span className="prp-thread-toggle__icon" aria-hidden="true">
                  <IconDisclosure open={!collapsed} size={16} />
                </span>
              </button>
              {typeof props.onJumpToFile === 'function' && fileLoc ? (
                <button
                  type="button"
                  className="prp-mono prp-inline-thread__loc prp-review-thread__file-loc prp-review-thread__file-loc--link"
                  title={`View in Diff · ${fileLoc}`}
                  onClick={() =>
                    props.onJumpToFile({
                      id: rootId,
                      path,
                      line,
                      startLine,
                      side,
                      outdated: Boolean(
                        thread?.root?.outdated || row?.outdated || thread?.outdated
                      ),
                    })
                  }
                >
                  {fileLoc}
                </button>
              ) : (
                <span className="prp-mono prp-inline-thread__loc prp-review-thread__file-loc">
                  {locLabel}
                </span>
              )}
            </div>
            <div className="prp-review-thread__file-header-meta">
              <span className="prp-muted prp-thread-toggle__count">{commentCount}</span>
              {side && fileLoc ? (
                <span className="prp-muted prp-review-thread__file-side">
                  {String(side).toUpperCase()}
                </span>
              ) : null}
              {rootPending ? (
                <Badge tone="warn" title="Part of an unsubmitted pending review">
                  Pending
                </Badge>
              ) : null}
              {thread?.root?.outdated || row?.outdated || thread?.outdated ? (
                <Badge tone="muted" title="No longer applies to the latest revision">
                  outdated
                </Badge>
              ) : null}
              {thread?.resolved || row?.resolved ? (
                <Badge tone="ok">resolved</Badge>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Code context under header (Conversation only — Diff already has lines) */}
        {showHunk && !collapsed && snippet?.lines?.length ? (
          <div className="prp-inline-thread__hunk">
            <DiffSnippetView
              snippet={snippet}
              filePath={snippet.path || path}
            />
          </div>
        ) : null}

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
                        size="md"
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
                      {rootPending ? (
                        <Badge tone="warn" title="Part of an unsubmitted pending review">
                          Pending
                        </Badge>
                      ) : null}
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
          <div
            className="prp-inline-thread__collapsed-preview"
            title="Expand to read full thread"
            onClick={toggleCollapse}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCollapse();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <MarkdownView
              source={String(body || '') || '_No description_'}
              className="prp-md--compact prp-md--collapsed-preview"
              linkCtx={linkCtx}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const InlineThread = memo(InlineThreadImpl);
export default InlineThread;
