import React, { memo, useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { OptBtnHint } from '@common/OptBtnHint';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import {
  IconCopy,
  IconDisclosure,
  IconEye,
  IconEyeClosed,
  IconLink,
  IconPencil,
  IconQuote,
  IconSync,
  IconTrash,
} from '@common/icons';
import { CommentReactions } from '@common/CommentReactions';
import { BodyEditor } from '../composers/BodyEditor';
import { DiffSnippetView } from '../conversation/DiffSnippetView';
import { useModalStore } from '../../store/modal-store';
import {
  dispatchContextThreadTabLeave,
  isContextThreadCommentActive,
  stepContextThreadComposerTab,
} from '@lib/context-thread-dom';
import { useT } from '@lib/locale-context';
import {
  copyTextToClipboard,
  stampCommentCopyResult,
} from '@lib/copy-to-clipboard';
import {
  buildCommentShareUrl,
  buildPositionFromComment,
  commentBodyForCopy,
} from '@lib/uri-route';
import {
  DEFAULT_HIDE_REASON,
  focusComposerRoot,
  hideReasonLabel,
  insertQuoteIntoDraft,
  isCommentMinimized,
  quoteReplyMarkdown,
  stampQuoteReplyResult,
  viewerCanMinimizeComment,
} from '@lib/comment-quote-hide';
import { CommentActionIconBtn } from '@common/CommentActionIconBtn';
import { CONTEXT_COMMENT_ACTION_SHORTCUT } from '@lib/shortcut-policy';

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
  const t = useT();
  const {
    row,
    thread,
    /** Optional override (tests). Default: leaf-subscribe store draft by comment id. */
    replyText: replyTextProp,
    onReplyText,
    onReply,
    onResolve,
    onDelete,
    onHide = null,
    onUnhide = null,
    onEdit,
    onSaveEdit,
    onCancelEdit,
    editingCommentId,
    onRegisterEditorSave,
    onApplySuggestion,
    onRegisterApply,
    onToggleReaction,
    onLoadReactors = null,
    actionBusy,
    viewerLogin,
    prOpen,
    linkCtx,
    onUploadFile,
    mentionCandidates = [],
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
    /** Lazy by-ids comments in flight (expand shell/resolved threads). */
    commentsLoading = false,
    /**
     * Deep-link page stamp for copy-link (`conversation` | `diff`).
     * Conversation embeds pass `conversation`; Diff defaults to `diff`.
     */
    sharePage = null as 'conversation' | 'diff' | null,
  } = props;

  const linkPage: 'conversation' | 'diff' =
    sharePage === 'conversation' || sharePage === 'diff'
      ? sharePage
      : showHunk
        ? 'conversation'
        : 'diff';

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

  // Prefer live thread group over virtual-row snapshot so resolve write-through
  // is not stuck on a stale row.resolved after stampThreadResolved.
  const isThreadResolved = Boolean(
    thread != null
      ? thread.resolved || thread.root?.resolved
      : row?.resolved
  );
  const defaultCollapsed = isThreadResolved;
  /** null = follow default (resolved → collapsed) */
  const [localCollapsed, setLocalCollapsed] = useState<boolean | null>(null);
  const controlled = typeof collapsedProp === 'boolean';
  const collapsed = controlled
    ? collapsedProp
    : localCollapsed != null
      ? localCollapsed
      : defaultCollapsed;

  const rootCommentId = row?.commentId ?? thread?.id ?? thread?.root?.id;
  const draftKey =
    rootCommentId == null || rootCommentId === ''
      ? ''
      : String(rootCommentId);
  /**
   * Per-thread draft from store — only this leaf re-renders on typing.
   * Do not pass replyDrafts through App → Conversation/Diff (full-tree lag).
   */
  const storeDraft = useModalStore((s) =>
    draftKey ? s.replyDrafts[draftKey] || '' : ''
  );
  const setReplyDraft = useModalStore((s) => s.setReplyDraft);
  const replyText =
    replyTextProp !== undefined && replyTextProp !== null
      ? String(replyTextProp)
      : storeDraft;
  /** Context tips only on the active keyboard / Diff-nav thread */
  const contextActive = useModalStore((s) =>
    isContextThreadCommentActive(rootCommentId, s)
  );
  /** ↑/↓ unit within this thread (root or a reply id) */
  const focusedThreadUnitId = useModalStore((s) => s.focusedThreadUnitId);
  const replyList = Array.isArray(thread?.replies) ? thread.replies : [];
  /** Resolve tip only while reply input is focused (not on idle threads) */
  const [replyFocused, setReplyFocused] = useState(false);
  const composerRootRef = useRef<HTMLDivElement | null>(null);
  const threadRootRef = useRef<HTMLDivElement | null>(null);
  /** Local expand of still-minimized comments (Show without Unhide). */
  const [expandedMinimized, setExpandedMinimized] = useState<
    Record<string, boolean>
  >({});

  /**
   * Thread focus: Tab cycles input → Comment → Start review → Resolve → next
   * comment; Shift+Tab reverse (prev comment before input).
   */
  useEffect(() => {
    if (!contextActive) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.altKey || e.metaKey || e.ctrlKey) return;
      const root = composerRootRef.current;
      if (!root) return;
      const ae = document.activeElement as HTMLElement | null;
      // Only trap when focus is inside this thread (or nothing focused / body)
      const threadHost =
        (root.closest?.('.prp-inline-thread') as HTMLElement | null) || root;
      if (
        ae &&
        ae !== document.body &&
        ae !== document.documentElement &&
        !threadHost.contains(ae)
      ) {
        return;
      }
      const dir = e.shiftKey ? -1 : 1;
      const result = stepContextThreadComposerTab(root, dir, ae);
      if (result === 'ignore') return;
      e.preventDefault();
      e.stopPropagation();
      if (result === 'leave-next' || result === 'leave-prev') {
        dispatchContextThreadTabLeave(
          result === 'leave-next' ? 1 : -1,
          rootCommentId
        );
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [contextActive, rootCommentId]);

  function onReplyTextChange(t: string) {
    if (draftKey) setReplyDraft(draftKey, t);
    onReplyText?.(t);
  }

  function toggleCollapse(e?: { preventDefault?: () => void; stopPropagation?: () => void }) {
    try {
      e?.preventDefault?.();
      e?.stopPropagation?.();
    } catch {
      /* ignore */
    }
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
  // GraphQL resolveReviewThread requires PRRT_… (not REST rest-thread-*)
  const resolveThreadNodeId = (() => {
    const raw = thread?.threadNodeId || row?.threadNodeId || null;
    const s = raw != null ? String(raw).trim() : '';
    return /^PRRT_/i.test(s) ? s : null;
  })();
  const canResolveThread =
    Boolean(resolveThreadNodeId) && !rootPending && !hasPendingReplies;

  const isFileComment =
    row?.subjectType === 'file' ||
    thread?.root?.subjectType === 'file' ||
    thread?.root?.subject_type === 'file' ||
    (path && line == null && !thread?.root?.originalLine);
  const fileLoc =
    path &&
    (isFileComment
      ? path
      : startLine != null && line != null && startLine !== line
        ? `${path}:${startLine}–${line}`
        : line != null
          ? `${path}:${line}`
          : path);
  const locLabel = fileLoc
    ? isFileComment
      ? `${fileLoc} · file`
      : `${fileLoc}${side ? ` · ${String(side).toUpperCase()}` : ''}`
    : 'Review thread';
  const commentCount = 1 + replyCount;
  const rootId = row?.commentId ?? thread?.id ?? thread?.root?.id;

  function isEditingId(id: any) {
    return editingCommentId != null && String(editingCommentId) === String(id);
  }

  function flashCopy(msg: string) {
    try {
      useModalStore.getState().setActionMsg?.(msg);
    } catch {
      /* ignore */
    }
  }

  async function copyCommentBody(body: unknown, commentId?: unknown) {
    const text = commentBodyForCopy(body);
    if (!text) {
      flashCopy('No comment text');
      stampCommentCopyResult({
        kind: 'body',
        ok: false,
        text: '',
        commentId,
      });
      return;
    }
    const ok = await copyTextToClipboard(text);
    stampCommentCopyResult({ kind: 'body', ok, text, commentId });
    flashCopy(ok ? 'Comment copied' : 'Copy failed');
  }

  async function copyCommentLink(id: unknown) {
    const position = buildPositionFromComment({ id });
    if (!position) {
      flashCopy('Link unavailable');
      stampCommentCopyResult({ kind: 'link', ok: false, url: '', commentId: id });
      return;
    }
    const prHtmlUrl =
      linkCtx?.htmlUrl ||
      linkCtx?.html_url ||
      (linkCtx?.owner && linkCtx?.repo && linkCtx?.number
        ? `https://github.com/${linkCtx.owner}/${linkCtx.repo}/pull/${linkCtx.number}`
        : null);
    // Diff inline threads are review comments → official #discussion_r{id}
    const url = buildCommentShareUrl({
      prHtmlUrl,
      page: 'diff',
      kind: 'review',
      position,
      number: linkCtx?.number,
    });
    if (!url) {
      flashCopy('Link unavailable');
      stampCommentCopyResult({ kind: 'link', ok: false, url: '', commentId: id });
      return;
    }
    const ok = await copyTextToClipboard(url);
    stampCommentCopyResult({ kind: 'link', ok, url, commentId: id });
    flashCopy(ok ? 'Link copied' : 'Copy failed');
  }

  function quoteReplyIntoThread(
    body: unknown,
    author?: string | null,
    commentId?: unknown
  ) {
    const quote = quoteReplyMarkdown(body, author);
    const draftKey = rootId != null ? String(rootId) : '';
    const cur =
      draftKey && useModalStore.getState().replyDrafts?.[draftKey] != null
        ? String(useModalStore.getState().replyDrafts[draftKey])
        : String(replyText || '');
    const next = insertQuoteIntoDraft(cur, quote);
    if (draftKey) {
      useModalStore.getState().setReplyDraft?.(draftKey, next);
    }
    onReplyText?.(next);
    stampQuoteReplyResult({
      ok: true,
      text: quote,
      commentId,
      target: 'thread',
    });
    // Expand thread + focus reply composer
    if (collapsed) {
      try {
        onToggleCollapse?.();
      } catch {
        /* ignore */
      }
    }
    queueMicrotask(() => {
      const host =
        threadRootRef.current?.querySelector?.(
          '[data-prp-composer-root="1"]'
        ) ||
        threadRootRef.current?.querySelector?.('.prp-inline-thread__reply') ||
        null;
      focusComposerRoot(host as Element | null);
    });
    setTimeout(() => {
      const host =
        threadRootRef.current?.querySelector?.(
          '[data-prp-composer-root="1"]'
        ) || null;
      focusComposerRoot(host as Element | null);
    }, 80);
    flashCopy('Quoted into reply');
  }

  /**
   * Copy body/link + quote + hide for any reader; edit/delete only when own.
   * TipPopover always; OptBtnHint only on the **root** when the thread is
   * context-focused (replies never get Option digit badges).
   */
  function renderCommentActions(
    id: any,
    commentBody: any,
    own: boolean,
    meta: {
      author?: string | null;
      nodeId?: string | null;
      isMinimized?: boolean;
      minimizedReason?: string | null;
      viewerCanMinimize?: boolean | null;
      /** When false, suppress OptBtnHint even if thread is context-active */
      isRoot?: boolean;
    } = {}
  ) {
    if (isEditingId(id)) return null;
    const canLink = Boolean(buildPositionFromComment({ id }));
    const minimized = Boolean(meta.isMinimized);
    const canHide = viewerCanMinimizeComment({
      viewerCanMinimize: meta.viewerCanMinimize,
      nodeId: meta.nodeId,
      isMinimized: minimized,
    });
    if (!own && !canLink && !commentBody && !canHide) return null;
    // Root-only Opt badges when thread is keyboard-focused
    const sc = Boolean(contextActive) && meta.isRoot !== false;
    const S = CONTEXT_COMMENT_ACTION_SHORTCUT;
    return (
      <div className="prp-icon-actions">
        <CommentActionIconBtn
          tipTitle={S.copyBody.title}
          shortcut={S.copyBody.labelMac}
          showShortcutHint={sc}
          disabled={actionBusy}
          aria-label="Copy comment text"
          data-prp-copy-comment="1"
          data-prp-comment-id={id != null ? String(id) : undefined}
          onClick={() => void copyCommentBody(commentBody, id)}
        >
          <IconCopy size={13} />
        </CommentActionIconBtn>
        {canLink ? (
          <CommentActionIconBtn
            tipTitle={S.copyLink.title}
            shortcut={S.copyLink.labelMac}
            showShortcutHint={sc}
            disabled={actionBusy}
            aria-label="Copy link to comment"
            data-prp-copy-comment-link="1"
            data-prp-comment-id={id != null ? String(id) : undefined}
            onClick={() => void copyCommentLink(id)}
          >
            <IconLink size={13} />
          </CommentActionIconBtn>
        ) : null}
        {commentBody != null ? (
          <CommentActionIconBtn
            tipTitle={S.quote.title}
            shortcut={S.quote.labelMac}
            showShortcutHint={sc}
            disabled={actionBusy}
            aria-label="Quote reply"
            data-prp-quote-reply="1"
            data-prp-comment-id={id != null ? String(id) : undefined}
            onClick={() => quoteReplyIntoThread(commentBody, meta.author, id)}
          >
            <IconQuote size={13} />
          </CommentActionIconBtn>
        ) : null}
        {canHide && meta.nodeId ? (
          minimized ? (
            <CommentActionIconBtn
              tipTitle="Unhide comment"
              shortcut={S.hide.labelMac}
              showShortcutHint={sc}
              disabled={actionBusy}
              aria-label="Unhide comment"
              data-prp-unhide-comment="1"
              data-prp-comment-id={id != null ? String(id) : undefined}
              onClick={() =>
                onUnhide?.({
                  commentId: id,
                  nodeId: meta.nodeId,
                })
              }
            >
              <IconEye size={13} />
            </CommentActionIconBtn>
          ) : (
            <CommentActionIconBtn
              tipTitle={S.hide.title}
              shortcut={S.hide.labelMac}
              showShortcutHint={sc}
              disabled={actionBusy}
              aria-label="Hide comment"
              data-prp-hide-comment="1"
              data-prp-comment-id={id != null ? String(id) : undefined}
              onClick={() =>
                onHide?.({
                  commentId: id,
                  nodeId: meta.nodeId,
                  reason: DEFAULT_HIDE_REASON,
                })
              }
            >
              <IconEyeClosed size={13} />
            </CommentActionIconBtn>
          )
        ) : null}
        {own ? (
          <>
            <CommentActionIconBtn
              tipTitle={S.edit.title}
              shortcut={S.edit.labelMac}
              showShortcutHint={sc}
              disabled={actionBusy}
              aria-label={t('cta_edit_comment')}
              data-prp-edit-comment="1"
              data-prp-comment-id={id != null ? String(id) : undefined}
              onClick={() => onEdit?.(id, commentBody)}
            >
              <IconPencil size={13} />
            </CommentActionIconBtn>
            <CommentActionIconBtn
              tipTitle={S.delete.title}
              shortcut={S.delete.labelMac}
              showShortcutHint={sc}
              className="prp-icon-btn--danger"
              disabled={actionBusy}
              aria-label="Delete comment"
              data-prp-delete-comment="1"
              data-prp-comment-id={id != null ? String(id) : undefined}
              onClick={() => onDelete?.(id)}
            >
              <IconTrash size={13} />
            </CommentActionIconBtn>
          </>
        ) : null}
      </div>
    );
  }

  function renderMinimizedBanner(
    id: any,
    comment: any,
    opts: { compact?: boolean } = {}
  ) {
    const reason = hideReasonLabel(
      comment?.minimizedReason || DEFAULT_HIDE_REASON
    );
    const idKey = String(id);
    const shown = Boolean(expandedMinimized[idKey]);
    return (
      <div
        className={`prp-comment-minimized${
          opts.compact !== false ? ' prp-comment-minimized--compact' : ''
        }`}
        data-prp-comment-minimized="1"
        data-prp-comment-id={idKey}
        data-prp-minimized-reason={
          comment?.minimizedReason || DEFAULT_HIDE_REASON
        }
      >
        <span className="prp-muted">This comment was marked as {reason}.</span>
        <button
          type="button"
          className="prp-link-btn"
          data-prp-toggle-minimized-body="1"
          data-prp-comment-id={idKey}
          onClick={() =>
            setExpandedMinimized((prev) => ({
              ...prev,
              [idKey]: !prev[idKey],
            }))
          }
        >
          {shown ? 'Hide' : 'Show'}
        </button>
        {viewerCanMinimizeComment(comment) && comment?.nodeId ? (
          <button
            type="button"
            className="prp-link-btn"
            data-prp-unhide-comment="1"
            data-prp-comment-id={idKey}
            disabled={actionBusy}
            onClick={() =>
              onUnhide?.({
                commentId: id,
                nodeId: comment.nodeId,
              })
            }
          >
            Unhide
          </button>
        ) : null}
      </div>
    );
  }

  function renderCommentReactions(
    id: any,
    comment: {
      reactions?: any[];
      nodeId?: string | null;
      pending?: boolean;
    } | null
  ) {
    if (isEditingId(id)) return null;
    if (comment?.pending) return null;
    if (typeof onToggleReaction !== 'function') return null;
    return (
      <CommentReactions
        reactions={comment?.reactions || []}
        target={{
          kind: 'review',
          commentId: id,
          nodeId: comment?.nodeId || null,
        }}
        viewerLogin={viewerLogin}
        busy={actionBusy}
        onToggle={onToggleReaction}
        onLoadReactors={onLoadReactors}
        showShortcutHint={Boolean(contextActive)}
        reactionShortcut={CONTEXT_COMMENT_ACTION_SHORTCUT.react.labelMac}
      />
    );
  }

  function renderCommentBody(
    id: any,
    commentBody: any,
    {
      canApplySuggestion = false,
      reactions = null,
      nodeId = null,
      pending = false,
    }: {
      canApplySuggestion?: boolean;
      reactions?: any[] | null;
      nodeId?: string | null;
      pending?: boolean;
    } = {}
  ) {
    if (isEditingId(id)) {
      return (
        <BodyEditor
          value={commentBody || ''}
          actionBusy={actionBusy}
          rows={4}
          compact
          placeholder={t('cta_edit_comment')}
          onSave={(body: string) => onSaveEdit?.(id, body)}
          onCancel={onCancelEdit}
          onRegisterSave={onRegisterEditorSave}
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
          mentionCandidates={mentionCandidates}
        />
      );
    }
    return (
      <>
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
        {renderCommentReactions(id, {
          reactions: reactions || [],
          nodeId,
          pending,
        })}
      </>
    );
  }

  const rootMinimizeMeta = {
    author,
    nodeId:
      row?.nodeId || thread?.root?.nodeId || thread?.nodeId || null,
    isMinimized: Boolean(
      row?.isMinimized ??
        thread?.root?.isMinimized ??
        thread?.isMinimized ??
        false
    ),
    minimizedReason:
      row?.minimizedReason ??
      thread?.root?.minimizedReason ??
      thread?.minimizedReason ??
      null,
    viewerCanMinimize:
      row?.viewerCanMinimize ??
      thread?.root?.viewerCanMinimize ??
      thread?.viewerCanMinimize ??
      null,
  };

  return (
    <div
      ref={threadRootRef}
      className={`prp-inline-thread${
        useTimeline ? ' prp-inline-thread--threaded' : ' prp-inline-thread--single'
      }${collapsed ? ' prp-inline-thread--collapsed' : ''}${
        rootPending ? ' prp-inline-thread--pending' : ''
      }${contextActive ? ' prp-inline-thread--context-active' : ''}${
        props.className ? ` ${props.className}` : ''
      }`}
      data-search-anchor={
        rootId != null ? `review-comment:${rootId}` : undefined
      }
      data-pending={rootPending ? '1' : undefined}
      data-context-active={contextActive ? '1' : undefined}
      data-prp-multi-reply={replyCount > 0 ? '1' : undefined}
      data-prp-reply-count={replyCount > 0 ? String(replyCount) : undefined}
      data-comments-loading={commentsLoading ? '1' : undefined}
      aria-busy={commentsLoading ? true : undefined}
    >
      <div className="prp-inline-thread__card">
        {showFileHeader ? (
          <div className="prp-inline-thread__filebar prp-review-thread__file-header">
            <div className="prp-review-thread__file-header-main">
              <button
                type="button"
                className={`prp-thread-toggle prp-thread-toggle--icon-only${
                  contextActive ? ' prp-opt-hint-host' : ''
                }`}
                onClick={toggleCollapse}
                aria-expanded={!collapsed}
                title={
                  commentsLoading
                    ? 'Loading comments…'
                    : contextActive
                      ? collapsed
                        ? 'Expand thread (⌥F)'
                        : 'Collapse thread (⌥F)'
                      : collapsed
                        ? 'Expand thread'
                        : 'Collapse thread'
                }
                aria-label={
                  commentsLoading
                    ? 'Loading comments'
                    : collapsed
                      ? 'Expand thread'
                      : 'Collapse thread'
                }
              >
                {contextActive ? (
                  <OptBtnHint label="⌥F" preferredPlacement="top" />
                ) : null}
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
              {commentsLoading ? (
                <span
                  className="prp-inline-thread__loading"
                  title="Loading comments…"
                  data-prp-thread-loading="1"
                  aria-label="Loading comments"
                >
                  <IconSync
                    className="prp-inline-thread__loading-icon"
                    size={12}
                    aria-hidden="true"
                  />
                </span>
              ) : null}
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
              {isThreadResolved ? (
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
                {(() => {
                  const rootIdKey = String(row?.commentId || thread?.id || '');
                  const rootMin = isCommentMinimized(rootMinimizeMeta);
                  const rootShown = Boolean(expandedMinimized[rootIdKey]);
                  if (rootMin && !rootShown) {
                    return (
                      <li className="prp-review-thread__item prp-review-thread__item--minimized">
                        {renderMinimizedBanner(
                          row?.commentId || thread?.id,
                          rootMinimizeMeta,
                          { compact: true }
                        )}
                      </li>
                    );
                  }
                  const rootUnitActive =
                    contextActive &&
                    (!focusedThreadUnitId ||
                      String(focusedThreadUnitId) === rootIdKey);
                  return (
                <li
                  className={`prp-review-thread__item${
                    rootUnitActive ? ' prp-review-thread__item--unit-focus' : ''
                  }`}
                  data-prp-thread-unit="root"
                  data-prp-thread-unit-id={rootIdKey}
                  data-prp-thread-unit-active={rootUnitActive ? '1' : undefined}
                >
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
                      {renderCommentActions(
                        row?.commentId || thread?.id,
                        body,
                        canOwn,
                        { ...rootMinimizeMeta, isRoot: true }
                      )}
                    </div>
                    {rootMin ? (
                      <>
                        {renderMinimizedBanner(
                          row?.commentId || thread?.id,
                          rootMinimizeMeta,
                          { compact: false }
                        )}
                        {renderCommentBody(row?.commentId || thread?.id, body, {
                          canApplySuggestion: canApply,
                          reactions:
                            row?.reactions ||
                            thread?.root?.reactions ||
                            thread?.reactions ||
                            [],
                          nodeId: rootMinimizeMeta.nodeId,
                          pending: rootPending,
                        })}
                      </>
                    ) : (
                      renderCommentBody(row?.commentId || thread?.id, body, {
                        canApplySuggestion: canApply,
                        reactions:
                          row?.reactions ||
                          thread?.root?.reactions ||
                          thread?.reactions ||
                          [],
                        nodeId: rootMinimizeMeta.nodeId,
                        pending: rootPending,
                      })
                    )}
                  </div>
                </li>
                  );
                })()}
                {replies.map((r: any, idx: number) => {
                  const ownReply =
                    viewerLogin &&
                    r.author &&
                    String(r.author).toLowerCase() === String(viewerLogin).toLowerCase();
                  const isLast = idx === replies.length - 1;
                  const isPending = Boolean(r.pending);
                  const replyMeta = {
                    author: r.author,
                    nodeId: r.nodeId || null,
                    isMinimized:
                      r.isMinimized != null ? Boolean(r.isMinimized) : null,
                    minimizedReason: r.minimizedReason ?? null,
                    viewerCanMinimize: r.viewerCanMinimize ?? null,
                  };
                  const replyMin = isCommentMinimized(replyMeta);
                  const replyShown = Boolean(expandedMinimized[String(r.id)]);
                  if (replyMin && !replyShown) {
                    return (
                      <li
                        key={r.id}
                        className={`prp-review-thread__item prp-review-thread__item--minimized${
                          isLast ? ' prp-review-thread__item--last' : ''
                        }`}
                      >
                        {renderMinimizedBanner(r.id, replyMeta, {
                          compact: true,
                        })}
                      </li>
                    );
                  }
                  const replyUnitActive =
                    contextActive &&
                    focusedThreadUnitId != null &&
                    String(focusedThreadUnitId) === String(r.id);
                  return (
                    <li
                      key={r.id}
                      className={`prp-review-thread__item${
                        isLast ? ' prp-review-thread__item--last' : ''
                      }${isPending ? ' prp-review-thread__item--pending' : ''}${
                        replyUnitActive
                          ? ' prp-review-thread__item--unit-focus'
                          : ''
                      }`}
                      data-prp-thread-unit="reply"
                      data-prp-thread-unit-id={String(r.id)}
                      data-prp-thread-unit-active={
                        replyUnitActive ? '1' : undefined
                      }
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
                          {!isPending
                            ? renderCommentActions(r.id, r.body, ownReply, {
                                ...replyMeta,
                                isRoot: false,
                              })
                            : null}
                        </div>
                        {replyMin ? (
                          <>
                            {renderMinimizedBanner(r.id, replyMeta, {
                              compact: false,
                            })}
                            {renderCommentBody(r.id, r.body, {
                              reactions: r.reactions || [],
                              nodeId: r.nodeId || null,
                              pending: isPending,
                            })}
                          </>
                        ) : (
                          renderCommentBody(r.id, r.body, {
                            reactions: r.reactions || [],
                            nodeId: r.nodeId || null,
                            pending: isPending,
                          })
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : isCommentMinimized(rootMinimizeMeta) &&
              !expandedMinimized[String(row?.commentId || thread?.id)] ? (
              <div className="prp-inline-thread__single prp-inline-thread__single--minimized">
                {renderMinimizedBanner(
                  row?.commentId || thread?.id,
                  rootMinimizeMeta,
                  { compact: true }
                )}
              </div>
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
                  {renderCommentActions(
                    row?.commentId || thread?.id,
                    body,
                    canOwn,
                    { ...rootMinimizeMeta, isRoot: true }
                  )}
                </div>
                <div className="prp-inline-thread__body">
                  {isCommentMinimized(rootMinimizeMeta) ? (
                    <>
                      {renderMinimizedBanner(
                        row?.commentId || thread?.id,
                        rootMinimizeMeta,
                        { compact: false }
                      )}
                      {renderCommentBody(row?.commentId || thread?.id, body, {
                            canApplySuggestion: canApply,
                            reactions:
                              row?.reactions ||
                              thread?.root?.reactions ||
                              thread?.reactions ||
                              [],
                            nodeId: rootMinimizeMeta.nodeId,
                            pending: rootPending,
                          })}
                    </>
                  ) : (
                    renderCommentBody(row?.commentId || thread?.id, body, {
                      canApplySuggestion: canApply,
                      reactions:
                        row?.reactions ||
                        thread?.root?.reactions ||
                        thread?.reactions ||
                        [],
                      nodeId: rootMinimizeMeta.nodeId,
                      pending: rootPending,
                    })
                  )}
                </div>
              </div>
            )}

            <div
              ref={composerRootRef}
              className="prp-inline-thread__composer"
              data-context-reply="1"
              data-context-active={contextActive ? '1' : undefined}
              data-prp-composer-root="1"
              data-prp-composer-kind="reply"
              data-prp-can-resolve={canResolveThread ? '1' : undefined}
              onFocusCapture={() => setReplyFocused(true)}
              onBlurCapture={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setReplyFocused(false);
              }}
            >
              <div className="prp-inline-thread__composer-field">
                <div
                  className={
                    contextActive || replyFocused ? 'prp-opt-hint-host' : undefined
                  }
                >
                  {replyFocused ? (
                    <OptBtnHint label="⌥I" preferredPlacement="top" />
                  ) : null}
                  {/* 1st ⌥I: focus reply when thread focused but input not yet */}
                  {contextActive && !replyFocused ? (
                    <OptBtnHint label="⌥I" preferredPlacement="top" />
                  ) : null}
                  <MarkdownComposer
                    value={replyText || ''}
                    onChange={onReplyTextChange}
                    placeholder="Reply"
                    compact
                    rows={2}
                    disabled={actionBusy}
                    showTabs
                    onUploadFile={onUploadFile}
                    linkCtx={linkCtx}
                    mentionCandidates={mentionCandidates}
                    onComposerFocusChange={setReplyFocused}
                    onSubmitRequest={() =>
                      onReply?.(thread || { id: row?.commentId, root: row }, {
                        mode: 'comment',
                      })
                    }
                  />
                </div>
              </div>
              {/* Actions: open when focused/draft OR resolvable (Resolve must stay
                  clickable without typing — empty reply blur used to hide this row
                  before click landed). Also open when context-focused so Tab
                  stops stay mounted. */}
              <div
                className={`prp-composer__row prp-inline-thread__composer-actions${
                  String(replyText || '').trim() ||
                  replyFocused ||
                  contextActive ||
                  canResolveThread
                    ? ' prp-inline-thread__composer-actions--open'
                    : ''
                }`}
              >
                <span
                  className={
                    replyFocused || contextActive
                      ? 'prp-opt-hint-host'
                      : undefined
                  }
                  data-prp-thread-tab-host="comment"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    if (!String(replyText || '').trim() || actionBusy) return;
                    e.preventDefault();
                    onReply?.(thread || { id: row?.commentId, root: row }, {
                      mode: 'comment',
                    });
                  }}
                >
                  {replyFocused || contextActive ? (
                    <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
                  ) : null}
                  <Button
                    size="sm"
                    variant="primary"
                    loading={Boolean(actionBusy)}
                    disabled={!String(replyText || '').trim()}
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      // Keep composer focus so actions row does not unmount mid-click
                      e.preventDefault();
                    }}
                    onClick={() =>
                      onReply?.(thread || { id: row?.commentId, root: row }, {
                        mode: 'comment',
                      })
                    }
                    title="Comment (⌥C · ⌘↵ when typing · ⌥I to focus)"
                    data-prp-composer-submit="1"
                  >
                    {actionBusy ? 'Submitting…' : 'Comment'}
                  </Button>
                </span>
                <span
                  data-prp-thread-tab-host="start-review"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    if (!String(replyText || '').trim() || actionBusy) return;
                    e.preventDefault();
                    onReply?.(thread || { id: row?.commentId, root: row }, {
                      mode: 'pending',
                    });
                  }}
                >
                  <Button
                    size="sm"
                    loading={Boolean(actionBusy)}
                    disabled={!String(replyText || '').trim()}
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
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
                    data-prp-composer-start-review="1"
                  >
                    {actionBusy
                      ? 'Working…'
                      : pendingCount > 0 || hasPendingReplies
                        ? 'Add comment'
                        : 'Start review'}
                  </Button>
                </span>
                {canResolveThread ? (
                  <span
                    className={
                      contextActive || replyFocused
                        ? 'prp-opt-hint-host'
                        : undefined
                    }
                    data-prp-thread-tab-host="resolve"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      if (actionBusy || !resolveThreadNodeId) return;
                      e.preventDefault();
                      onResolve?.(resolveThreadNodeId, !isThreadResolved);
                    }}
                  >
                    {/* Thread/comment focus (not only reply input) — ⌥⌃R only
                        while the unit is the context target. */}
                    {contextActive || replyFocused ? (
                      <OptBtnHint label="⌥⌃R" preferredPlacement="top" />
                    ) : null}
                    <Button
                      size="sm"
                      disabled={actionBusy || !resolveThreadNodeId}
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        // Prevent reply textarea blur → actions hide before click
                        e.preventDefault();
                      }}
                      onClick={() =>
                        onResolve?.(
                          resolveThreadNodeId,
                          !isThreadResolved
                        )
                      }
                      title={
                        isThreadResolved
                          ? t('unresolve_conversation')
                          : t('resolve_conversation')
                      }
                      shortcut="⌥⌃R"
                      tipPlacement="top"
                      data-prp-composer-resolve="1"
                      data-prp-thread-node-id={resolveThreadNodeId || undefined}
                    >
                      {isThreadResolved
                        ? t('unresolve_conversation')
                        : t('resolve_conversation')}
                    </Button>
                  </span>
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
              searchQuery={qSearch}
              searchCurrentStart={commentCurrentStart(rootId)}
              searchOccurrenceIndex={commentOcc(rootId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const InlineThread = memo(InlineThreadImpl);
export default InlineThread;
