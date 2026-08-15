/** Conversation comment chrome: copy / quote / hide / edit / delete. */
import React from 'react';
import { CommentActionIconBtn } from '@common/CommentActionIconBtn';
import { IconCopy, IconLink, IconQuote, IconEye, IconEyeClosed, IconPencil, IconTrash } from '@common/icons';
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
  focusMainConversationComposer,
  insertQuoteIntoDraft,
  quoteReplyMarkdown,
  stampQuoteReplyResult,
  viewerCanMinimizeComment,
} from '@lib/comment-quote-hide';
import { useModalStore } from '../../store/modal-store';
import { CONTEXT_COMMENT_ACTION_SHORTCUT } from '@lib/shortcut-policy';

export function createCommentChrome(cv: any) {
  const {
    detail,
    actionBusy,
    commentText,
    setCommentText,
    onUnhideComment,
    onHideComment,
    onStartEditComment,
    onDeleteIssueComment,
    onDeleteReviewComment,
    t,
  } = cv;

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

  async function copyCommentLink(
    id: unknown,
    /** issue → #issuecomment-…; review → #discussion_r… */
    shareKind: 'issue' | 'review' | null = 'issue'
  ) {
    const position = buildPositionFromComment({ id });
    if (!position) {
      flashCopy('Link unavailable');
      stampCommentCopyResult({ kind: 'link', ok: false, url: '', commentId: id });
      return;
    }
    const url = buildCommentShareUrl({
      prHtmlUrl: detail?.htmlUrl || detail?.html_url,
      page: shareKind === 'review' ? 'diff' : 'conversation',
      kind: shareKind === 'review' ? 'review' : 'issue',
      position,
      number: detail?.number,
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

  function quoteReplyToMainComposer(
    body: unknown,
    author?: string | null,
    commentId?: unknown
  ) {
    const quote = quoteReplyMarkdown(body, author);
    const cur = String(
      useModalStore.getState().commentText ?? commentText ?? ''
    );
    const next = insertQuoteIntoDraft(cur, quote);
    setCommentText(next);
    stampQuoteReplyResult({
      ok: true,
      text: quote,
      commentId,
      target: 'main',
    });
    // Open + focus main composer after paint
    queueMicrotask(() => focusMainConversationComposer());
    setTimeout(() => focusMainConversationComposer(), 50);
    flashCopy('Quoted into reply');
  }

  /**
   * Comment chrome actions: copy body + copy link + quote + hide;
   * edit/delete only when owner (canDelete).
   * TipPopover always; ShortcutHint when this card is kb-focused.
   */
  function commentActions(
    kind: string | null,
    id: any,
    canDelete: boolean,
    body?: string,
    meta: {
      author?: string | null;
      nodeId?: string | null;
      isMinimized?: boolean;
      minimizedReason?: string | null;
      viewerCanMinimize?: boolean | null;
      focused?: boolean;
    } = {}
  ) {
    if (!kind && !id) return null;
    const canLink = Boolean(buildPositionFromComment({ id }));
    const shareKind: 'issue' | 'review' =
      kind === 'review' ? 'review' : 'issue';
    const minimized = Boolean(meta.isMinimized);
    const canHide = viewerCanMinimizeComment({
      viewerCanMinimize: meta.viewerCanMinimize,
      nodeId: meta.nodeId,
      isMinimized: minimized,
    });
    const sc = Boolean(meta.focused);
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
          onClick={(): any => void copyCommentBody(body, id)}
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
            onClick={(): any => void copyCommentLink(id, shareKind)}
          >
            <IconLink size={13} />
          </CommentActionIconBtn>
        ) : null}
        {body != null && String(body).length >= 0 ? (
          <CommentActionIconBtn
            tipTitle={S.quote.title}
            shortcut={S.quote.labelMac}
            showShortcutHint={sc}
            disabled={actionBusy}
            aria-label="Quote reply"
            data-prp-quote-reply="1"
            data-prp-comment-id={id != null ? String(id) : undefined}
            onClick={() => quoteReplyToMainComposer(body, meta.author, id)}
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
                onUnhideComment?.({
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
                onHideComment?.({
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
        {canDelete && kind ? (
          <>
            <CommentActionIconBtn
              tipTitle={S.edit.title}
              shortcut={S.edit.labelMac}
              showShortcutHint={sc}
              disabled={actionBusy}
              aria-label={t('cta_edit_comment')}
              data-prp-edit-comment="1"
              data-prp-comment-id={id != null ? String(id) : undefined}
              onClick={() => onStartEditComment?.(kind, id, body)}
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
              onClick={() =>
                kind === 'issue'
                  ? onDeleteIssueComment?.(id)
                  : onDeleteReviewComment?.(id)
              }
            >
              <IconTrash size={13} />
            </CommentActionIconBtn>
          </>
        ) : null}
      </div>
    );
  }

  return { commentActions, copyCommentBody, copyCommentLink, quoteReplyToMainComposer };
}
