/** Leave-review + selection line-comment commands (host-data-first). */
import {
  appendOptimisticReviewComment,
  appendIssueCommentToDetail,
  mapRestReviewComment,
  mapRestIssueComment,
} from '../lib/pr-edit-api';
import { useModalStore } from '../store/modal-store';

/**
 * Install review leave + selection post handlers on a live deps bag.
 * d must provide: detail, detailRef, setActionBusy, setActionMsg, setCommentText,
 * focusCommentBox, commitCommentListPatch, applyDomainDetail (or applyDomainDetailToHost),
 * pendingReviewNodeIdRef, serverPendingReviewId, hasServerPending, serverPendingComments,
 * stripPendingReviewFromDetail, discardPendingReview, onRefresh, layoutMode, collapseDiff,
 * conversationCommentFocusRef, isReviewVerdictKind, isViewerPrAuthor, mapLeaveReviewAction,
 * LAYOUT_DIFF, optimisticConversationAnchorForKind
 */
export function installReviewActions(d: Record<string, any>) {
  async function onLeaveReviewAction(
    kind: any,
    opts?: { body?: string } | null
  ): Promise<boolean> {
    const detail = d.detail;
    if (!detail) return false;
    const fetchApi = globalThis.PRTreeFetch;
    if (!fetchApi) {
      d.setActionMsg?.(
        'Extension bridge unavailable (PRTreeFetch). Refresh this GitHub tab after reloading pr+.'
      );
      return false;
    }
    if (
      typeof d.isReviewVerdictKind === 'function' &&
      d.isReviewVerdictKind(kind) &&
      typeof d.isViewerPrAuthor === 'function' &&
      d.isViewerPrAuthor(detail)
    ) {
      d.setActionMsg?.('Cannot approve or request changes on your own pull request.');
      return false;
    }
    const body =
      opts && opts.body != null
        ? String(opts.body).trim()
        : String(useModalStore.getState().commentText || '').trim();
    const forceIssueComment =
      kind === 'issue-comment' || kind === 'post-comment' || kind === 'comment-only';

    const mapped =
      typeof d.mapLeaveReviewAction === 'function'
        ? d.mapLeaveReviewAction(kind)
        : kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'issue-comment', event: 'COMMENT' };

    if (forceIssueComment) {
      if (!body) {
        d.setActionMsg?.('Write a comment first.');
        d.focusCommentBox?.();
        return false;
      }
      d.setActionBusy?.(true);
      d.setActionMsg?.('');
      try {
        if (!fetchApi.postIssueComment) throw new Error('Comment API unavailable');
        const raw = await fetchApi.postIssueComment(
          detail.owner,
          detail.repo,
          detail.number,
          body
        );
        const ic = mapRestIssueComment(raw, {
          body,
          author: detail.viewerLogin || '',
        });
        if (ic) {
          const next =
            typeof appendIssueCommentToDetail === 'function'
              ? appendIssueCommentToDetail(detail, ic)
              : {
                  ...detail,
                  comments: [...(detail.comments || []), ic],
                };
          d.commitCommentListPatch?.(next);
          const newId = ic.id;
          if (newId != null && String(newId) !== '') {
            const anchor =
              typeof d.optimisticConversationAnchorForKind === 'function'
                ? d.optimisticConversationAnchorForKind(newId, 'issue') ||
                  `issue-comment:${newId}`
                : `issue-comment:${newId}`;
            if (d.conversationCommentFocusRef) {
              d.conversationCommentFocusRef.current = {
                id: String(newId),
                kind: 'issue-comment',
                anchor,
              };
            }
            try {
              const ae =
                typeof document !== 'undefined'
                  ? (document.activeElement as HTMLElement | null)
                  : null;
              if (
                ae &&
                (ae.tagName === 'TEXTAREA' ||
                  ae.isContentEditable ||
                  ae.closest?.('.prp-mdc, .prp-composer-card, .prp-wysi'))
              ) {
                ae.blur?.();
              }
            } catch {
              /* ignore */
            }
            try {
              if (d.layoutMode === d.LAYOUT_DIFF) d.collapseDiff?.();
              useModalStore.getState().requestConversationNav(anchor);
            } catch {
              /* ignore */
            }
          }
        }
        d.setCommentText?.('');
        d.setActionMsg?.('Comment posted.');
        return true;
      } catch (err: any) {
        d.setActionMsg?.(err?.message || String(err));
        return false;
      } finally {
        d.setActionBusy?.(false);
      }
    }

    const event =
      mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
    const hasServerPending = Boolean(d.hasServerPending);
    if (!body && !hasServerPending) {
      d.setActionMsg?.(
        'Write a comment or add pending review comments before submitting.'
      );
      d.focusCommentBox?.();
      return false;
    }

    const pendingReviewId =
      d.serverPendingReviewId ||
      detail?.viewerPendingReview?.id ||
      (Array.isArray(d.serverPendingComments)
        ? d.serverPendingComments.find((c: any) => c?.pendingReviewId != null)
            ?.pendingReviewId
        : null) ||
      null;

    d.setActionBusy?.(true);
    d.setActionMsg?.('');
    try {
      if (hasServerPending || pendingReviewId) {
        if (!pendingReviewId) {
          throw new Error(
            'Pending review comments exist but no review id is available. Refresh and try again.'
          );
        }
        if (!fetchApi.submitPendingPullReview) {
          throw new Error('Submit pending review API unavailable');
        }
        await fetchApi.submitPendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          pendingReviewId,
          { event, body }
        );
      } else if (fetchApi.submitPullReview) {
        await fetchApi.submitPullReview(detail.owner, detail.repo, detail.number, {
          event,
          body,
          commitId: detail.headSha,
          comments: [],
        });
      } else {
        throw new Error('Review API unavailable');
      }
      if (!(opts && opts.body != null)) {
        d.setCommentText?.('');
      }
      d.setPendingReview?.(
        typeof d.discardPendingReview === 'function'
          ? d.discardPendingReview()
          : { comments: [], body: '' }
      );
      if (d.pendingReviewNodeIdRef) d.pendingReviewNodeIdRef.current = null;
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.removeAttribute('data-prp-pending-review-node');
        }
      } catch {
        /* ignore */
      }
      const apply =
        d.applyDomainDetail || d.applyDomainDetailToHost;
      apply?.((prev: any) =>
        typeof d.stripPendingReviewFromDetail === 'function'
          ? d.stripPendingReviewFromDetail(prev)
          : prev
            ? { ...prev, viewerPendingReview: null }
            : prev
      );
      d.setActionMsg?.(
        event === 'APPROVE'
          ? 'Approved.'
          : event === 'REQUEST_CHANGES'
            ? 'Requested changes.'
            : hasServerPending || pendingReviewId
              ? 'Pending review submitted.'
              : 'Review submitted.'
      );
      await d.onRefresh?.();
      return true;
    } catch (err: any) {
      d.setActionMsg?.(err?.message || String(err));
      return false;
    } finally {
      d.setActionBusy?.(false);
    }
  }

  async function postSelectionLineComment(
    payload: any,
    { asPending = false } = {}
  ) {
    const detail = d.detail;
    const api = globalThis.PRTreeFetch;
    if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
    const isFile = payload.subject_type === 'file' || payload.subjectType === 'file';
    let domPendingNode: string | null = null;
    try {
      if (typeof document !== 'undefined') {
        const attr = document.documentElement.getAttribute(
          'data-prp-pending-review-node'
        );
        if (attr && String(attr).trim()) domPendingNode = String(attr).trim();
      }
    } catch {
      /* ignore */
    }
    const livePendingRows = (detail?.reviewComments || []).some(
      (c: any) => c && c.pending
    );
    const knownPendingNode = livePendingRows
      ? d.pendingReviewNodeIdRef?.current ||
        detail?.viewerPendingReview?.nodeId ||
        detail?.viewerPendingReview?.node_id ||
        domPendingNode ||
        null
      : null;
    const knownPendingId = livePendingRows
      ? detail?.viewerPendingReview?.id || d.serverPendingReviewId || null
      : null;
    const raw = await api.postReviewComment(detail.owner, detail.repo, detail.number, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      side: payload.side,
      commitId: payload.commit_id || detail.headSha,
      startLine: isFile ? null : payload.start_line,
      startSide: isFile ? null : payload.start_side,
      asPending: Boolean(asPending),
      subjectType: isFile ? 'file' : 'line',
      pendingReviewNodeId: knownPendingNode,
      pendingReviewId: knownPendingId,
    });
    const isPending = Boolean(raw?.pending || asPending || d.serverPendingReviewId);
    const rawNode = String(
      raw?.pendingReviewNodeId || raw?.pending_review_node_id || ''
    ).trim();
    const maybeReviewNode = String(raw?.node_id || raw?.nodeId || '').trim();
    const latchNode = (
      rawNode ||
      (maybeReviewNode.startsWith('PRR_') ? maybeReviewNode : '') ||
      String(knownPendingNode || '').trim()
    ).trim();
    if (latchNode && d.pendingReviewNodeIdRef) {
      d.pendingReviewNodeIdRef.current = latchNode;
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute(
            'data-prp-pending-review-node',
            latchNode
          );
        }
      } catch {
        /* ignore */
      }
    }
    const mapped = mapRestReviewComment(raw, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      startLine: isFile ? null : payload.start_line,
      side: payload.side,
      author: detail.viewerLogin || '',
      pending: isPending,
      pendingReviewId: raw?.pendingReviewId || d.serverPendingReviewId || null,
      threadNodeId: raw?.threadNodeId || null,
      subjectType: isFile ? 'file' : 'line',
    });
    if (mapped) {
      const base = detail || {};
      const withComment =
        typeof appendOptimisticReviewComment === 'function'
          ? appendOptimisticReviewComment(base, {
              ...mapped,
              pending: isPending,
            })
          : {
              ...base,
              reviewComments: [
                ...(base.reviewComments || []),
                { ...mapped, pending: isPending },
              ],
            };
      let next = withComment;
      if (isPending) {
        const reviewId =
          mapped.pendingReviewId || raw?.pendingReviewId || knownPendingId || null;
        const nodeId =
          raw?.pendingReviewNodeId ||
          raw?.pending_review_node_id ||
          d.pendingReviewNodeIdRef?.current ||
          knownPendingNode ||
          withComment.viewerPendingReview?.nodeId ||
          null;
        if (nodeId && d.pendingReviewNodeIdRef) {
          d.pendingReviewNodeIdRef.current = String(nodeId);
          try {
            if (typeof document !== 'undefined') {
              document.documentElement.setAttribute(
                'data-prp-pending-review-node',
                String(nodeId)
              );
            }
          } catch {
            /* ignore */
          }
        }
        const pendingRows = (withComment.reviewComments || []).filter(
          (c: any) => c?.pending
        );
        next = {
          ...withComment,
          viewerPendingReview: reviewId
            ? {
                id: reviewId,
                nodeId: nodeId ? String(nodeId) : null,
                commentCount: pendingRows.length,
              }
            : withComment.viewerPendingReview || null,
        };
      }
      d.commitCommentListPatch?.(next);
    }
    return { raw, isPending };
  }

  function selectionActionMessage(payload: any, isPending: boolean) {
    if (payload.subject_type === 'file' || payload.subjectType === 'file') {
      return isPending
        ? `Added file comment to pending review on ${payload.path}.`
        : `File comment posted on ${payload.path}.`;
    }
    if (isPending) {
      return payload.start_line != null
        ? `Added to pending review on ${payload.path}:${payload.start_line}–${payload.line}.`
        : `Added to pending review on ${payload.path}:${payload.line}.`;
    }
    return payload.start_line != null
      ? `Comment posted on ${payload.path}:${payload.start_line}–${payload.line}.`
      : `Comment posted on ${payload.path}:${payload.line}.`;
  }

  return {
    onLeaveReviewAction,
    postSelectionLineComment,
    selectionActionMessage,
  };
}
