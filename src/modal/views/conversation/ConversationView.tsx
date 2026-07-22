import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import { PenIcon } from '@common/PenIcon';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import {
  buildConversationTimeline,
  pageTimelineItems,
  partitionTimelineWithThreadGap,
} from '@lib/conversation-timeline';
import { markSearchInText } from '@lib/search-index';
import { snippetForComment } from '@lib/diff-snippet';
import {
  buildMergeBoxStatus,
  mergeMethodButtonLabel,
  MERGE_METHODS,
  normalizeMergeMethod,
  type MergeMethod,
} from '@lib/merge-box-status';
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
    onDiscardPending = null,
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
    onRerequestReviewer = null,
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
    replyDrafts = null,
    onReplyDraft = null,
    onReplyToThread = null,
    onResolveThread = null,
    onLoadMoreReviewThreads = null,
    reviewThreadsMeta = null,
    searchQuery = '',
    searchHits = null,
    searchHitIndex = -1,
    activeSearchHit = null,
  } = props;

  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);
  /** Conversation footer: Comment (issue) vs Review (pending + review events). */
  const [composerMode, setComposerMode] = useState<'comment' | 'review'>(() =>
    Number(pendingCount) > 0 ? 'review' : 'comment'
  );
  // When a pending review appears, surface Review controls
  useEffect(() => {
    if (Number(pendingCount) > 0) setComposerMode('review');
  }, [pendingCount]);

  const allItems = useMemo(() => {
    if (typeof buildConversationTimeline === 'function') {
      return buildConversationTimeline(detail, {
        snippetForComment:
          typeof snippetForComment === 'function' ? snippetForComment : undefined,
      });
    }
    return [];
  }, [detail]);

  const qSearch = String(searchQuery || '').trim();
  const hitAnchorSet = useMemo(() => {
    const s = new Set<string>();
    for (const h of Array.isArray(searchHits) ? searchHits : []) {
      if (h?.anchorId) s.add(String(h.anchorId));
    }
    return s;
  }, [searchHits]);
  const activeAnchor = activeSearchHit?.anchorId
    ? String(activeSearchHit.anchorId)
    : null;

  function isAnchorHit(anchorId: string) {
    return Boolean(qSearch && hitAnchorSet.has(anchorId));
  }
  function isAnchorCurrent(anchorId: string) {
    return Boolean(activeAnchor && activeAnchor === anchorId);
  }

  /** Dual-window fold: newest window | N hidden | oldest window */
  const threadGap: any = useMemo(() => {
    if (typeof partitionTimelineWithThreadGap !== 'function') {
      return {
        top: allItems,
        bottom: [],
        hiddenCount: 0,
        showGap: false,
      };
    }
    return partitionTimelineWithThreadGap(allItems, reviewThreadsMeta);
  }, [allItems, reviewThreadsMeta]);

  // When active hit is off the current timeline page, jump to that page
  useEffect(() => {
    if (!activeAnchor || typeof onTimelinePage !== 'function') return;
    if (threadGap?.showGap) return; // dual window shows all loaded items
    const pageSize = 15;
    let itemIdx = -1;
    for (let i = 0; i < allItems.length; i++) {
      const it = allItems[i];
      if (it.kind === 'issue-comment' && `issue-comment:${it.id}` === activeAnchor) {
        itemIdx = i;
        break;
      }
      if (it.kind === 'review' && `review:${it.id}` === activeAnchor) {
        itemIdx = i;
        break;
      }
      if (
        (it.kind === 'review-thread' || it.kind === 'review-comment') &&
        (`review-comment:${it.id}` === activeAnchor ||
          (it.replies || []).some(
            (r: any) => `review-comment:${r.id}` === activeAnchor
          ))
      ) {
        itemIdx = i;
        break;
      }
    }
    if (itemIdx < 0) return;
    const needPage = Math.floor(itemIdx / pageSize) + 1;
    if (needPage !== timelinePage) onTimelinePage(needPage);
  }, [activeAnchor, allItems, timelinePage, onTimelinePage, threadGap?.showGap]);

  // Scroll active conversation hit into view
  useEffect(() => {
    if (!activeAnchor) return;
    const t = window.setTimeout(() => {
      try {
        const el = document.querySelector(
          `[data-search-anchor="${CSS.escape(activeAnchor)}"]`
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: 'center', inline: 'nearest' });
        const mark = el?.querySelector(
          '.prp-search-mark--current'
        ) as HTMLElement | null;
        mark?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    }, 40);
    return () => clearTimeout(t);
  }, [activeAnchor, timelinePage, allItems.length]);

  const paged: any = useMemo(() => {
    // When a middle gap is active, show full dual windows (no client page slice)
    // so the GitHub-style fold stays between newest and oldest ends.
    if (threadGap.showGap) {
      return {
        items: threadGap.top,
        bottomItems: threadGap.bottom,
        page: 1,
        totalPages: 1,
        total: allItems.length,
        hasMore: false,
        hasPrev: false,
        hasNewer: false,
        hasOlder: false,
        showThreadGap: true,
        hiddenCount: threadGap.hiddenCount,
      };
    }
    if (typeof pageTimelineItems === 'function') {
      const page = pageTimelineItems(allItems, { page: timelinePage, pageSize: 15 });
      return {
        ...page,
        bottomItems: [],
        showThreadGap: Boolean(reviewThreadsMeta?.hasMore && threadGap.hiddenCount > 0),
        hiddenCount: threadGap.hiddenCount,
      };
    }
    return {
      items: allItems,
      bottomItems: [],
      page: 1,
      totalPages: 1,
      total: allItems.length,
      hasMore: false,
      hasPrev: false,
      hasNewer: false,
      hasOlder: false,
      showThreadGap: Boolean(reviewThreadsMeta?.hasMore && threadGap.hiddenCount > 0),
      hiddenCount: threadGap.hiddenCount,
    };
  }, [allItems, timelinePage, threadGap, reviewThreadsMeta]);

  const mergeStatus = useMemo(
    () => (typeof buildMergeBoxStatus === 'function' ? buildMergeBoxStatus(detail) : null),
    [detail]
  );

  useEffect(() => {
    if (!mergeMenuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (mergeMenuRef.current?.contains(t)) return;
      setMergeMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMergeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [mergeMenuOpen]);

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
  // Aside Checks card (not merge-box badge farm)
  const showChecks = hasChecksData(detail.checks);
  const ms = mergeStatus || buildMergeBoxStatus(detail);
  const boxTone =
    ms.tone === 'ok'
      ? 'ok'
      : ms.tone === 'danger'
        ? 'danger'
        : ms.tone === 'warn' || ms.tone === 'draft'
          ? 'warn'
          : 'muted';

  /** Body with search marks when this anchor is a hit. */
  function renderSearchableBody(source: string, anchorId: string, compact = true) {
    const cls = compact ? 'prp-md--compact' : '';
    if (!qSearch || !isAnchorHit(anchorId)) {
      return (
        <MarkdownView
          source={source || ''}
          className={cls}
          linkCtx={linkCtx}
        />
      );
    }
    const currentStart =
      isAnchorCurrent(anchorId) && activeSearchHit?.start != null
        ? Number(activeSearchHit.start)
        : null;
    return (
      <div
        className={`prp-md ${cls} prp-md--search-hit`.trim()}
        dangerouslySetInnerHTML={{
          __html: markSearchInText(source || '', qSearch, { currentStart }),
        }}
      />
    );
  }

  function searchCardClass(anchorId: string, base = '') {
    let c = base;
    if (isAnchorHit(anchorId)) c += ' prp-card--search-match';
    if (isAnchorCurrent(anchorId)) c += ' prp-card--search-current';
    return c.trim();
  }

  function renderTimelineBody(item: any, kind: string, anchorId?: string) {
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
    if (anchorId && qSearch && isAnchorHit(anchorId) && !canApply) {
      return renderSearchableBody(item.body || '', anchorId, true);
    }
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
          <PenIcon size={13} />
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
          className={searchCardClass('body', 'prp-card--desc')}
          data-search-anchor="body"
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
                <PenIcon size={13} />
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
          ) : qSearch && isAnchorHit('body') ? (
            renderSearchableBody(
              detail.body || '_No description provided._',
              'body',
              false
            )
          ) : (
            <MarkdownView
              source={detail.body || '_No description provided._'}
              linkCtx={linkCtx}
            />
          )}
        </Card>

        {/* Timeline: issue/review events as cards; review threads keep replies +
            reply composer inside a single thread box. Dual-window: newest | gap | oldest. */}
        {sectionLoading ? (
          <div className="prp-section-skeleton" />
        ) : paged.items.length === 0 && !(paged.bottomItems || []).length ? (
          <p className="prp-muted prp-conversation-empty">No conversation yet.</p>
        ) : (
          <>
          {paged.items.map((item: any) => {
            const isIssue = item.kind === 'issue-comment';
            const isReviewThread =
              item.kind === 'review-thread' || item.kind === 'review-comment';
            const isReviewEvent = item.kind === 'review';
            const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;
            const reviewReplies = isReviewThread ? item.replies || [] : [];

            function kindLabelFor(kind: string, isReply = false) {
              if (isReply) return 'reply';
              if (kind === 'issue-comment' || isIssue) return 'comment';
              if (kind === 'review-thread' || kind === 'review-comment') return 'review thread';
              if (kind === 'review' || isReviewEvent) return 'review';
              return kind || 'item';
            }

            // Review thread: one box = root + nested replies + reply composer
            if (isReviewThread) {
              const threadId = item.id;
              const rootAnchor = `review-comment:${threadId}`;
              const draft =
                replyDrafts && threadId != null
                  ? replyDrafts[String(threadId)] || ''
                  : '';
              const canReply = typeof onReplyToThread === 'function';
              const threadItems = [
                { row: item, isRoot: true },
                ...reviewReplies.map((r: any) => ({ row: r, isRoot: false })),
              ];
              const filePath = item.path || item.snippet?.path || '';
              const line = item.line != null ? Number(item.line) : null;
              const startLine =
                item.startLine != null && Number.isFinite(Number(item.startLine))
                  ? Number(item.startLine)
                  : null;
              const fileLoc =
                filePath &&
                (startLine != null && line != null && startLine !== line
                  ? `${filePath}:${startLine}–${line}`
                  : line != null
                    ? `${filePath}:${line}`
                    : filePath);
              const threadHit =
                isAnchorHit(rootAnchor) ||
                reviewReplies.some((r: any) => isAnchorHit(`review-comment:${r.id}`));
              const threadCurrent =
                isAnchorCurrent(rootAnchor) ||
                reviewReplies.some((r: any) =>
                  isAnchorCurrent(`review-comment:${r.id}`)
                );

              return (
                <Card
                  key={String(item.id || item.key)}
                  className={`prp-card--timeline prp-card--timeline-review-thread${
                    threadHit ? ' prp-card--search-match' : ''
                  }${threadCurrent ? ' prp-card--search-current' : ''}`}
                  data-search-anchor={rootAnchor}
                >
                  {fileLoc ? (
                    <div className="prp-review-thread__file-header" title={fileLoc}>
                      <span className="prp-mono prp-review-thread__file-loc">{fileLoc}</span>
                      {item.side ? (
                        <span className="prp-muted prp-review-thread__file-side">
                          {String(item.side).toUpperCase()}
                        </span>
                      ) : null}
                      {item.outdated ? (
                        <Badge tone="muted" title="No longer applies to the latest revision">
                          outdated
                        </Badge>
                      ) : null}
                      {item.resolved ? (
                        <Badge tone="ok">resolved</Badge>
                      ) : (
                        <Badge tone="warn">open</Badge>
                      )}
                    </div>
                  ) : null}
                  {item.snippet ? (
                    <DiffSnippetView
                      snippet={item.snippet}
                      filePath={item.snippet.path || item.path}
                    />
                  ) : null}
                  <ul className="prp-review-thread prp-conversation-thread">
                    {threadItems.map(({ row, isRoot }, idx) => {
                      const isLast =
                        idx === threadItems.length - 1 && !canReply;
                      const r = row;
                      const isPending = Boolean(r.pending || (isRoot && item.pending));
                      const replyAnchor = `review-comment:${r.id}`;
                      return (
                        <li
                          key={String(r.id || idx)}
                          className={`prp-review-thread__item${
                            isLast ? ' prp-review-thread__item--last' : ''
                          }${isPending ? ' prp-review-thread__item--pending' : ''}${
                            isAnchorHit(replyAnchor) ? ' prp-review-thread__item--search-match' : ''
                          }${
                            isAnchorCurrent(replyAnchor)
                              ? ' prp-review-thread__item--search-current'
                              : ''
                          }`}
                          data-search-anchor={replyAnchor}
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
                              <Badge tone="muted">
                                {isRoot ? kindLabelFor(item.kind) : 'reply'}
                              </Badge>
                              {isPending ? (
                                <Badge tone="warn" title="Part of an unsubmitted review">
                                  pending
                                </Badge>
                              ) : null}
                              {isRoot && item.outdated ? (
                                <Badge tone="muted" title="No longer applies to the latest revision">
                                  outdated
                                </Badge>
                              ) : null}
                              {r.at || r.createdAt ? (
                                <span className="prp-muted">
                                  {formatWhen(r.at || r.createdAt)}
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
                              {
                                ...r,
                                id: r.id,
                                body: r.body,
                                path: item.path,
                                line: item.line,
                              },
                              editKind || 'review',
                              replyAnchor
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {canReply ? (
                    <div className="prp-conversation-thread__composer">
                      <MarkdownComposer
                        value={draft}
                        onChange={(t: string) => onReplyDraft?.(threadId, t)}
                        placeholder="Reply to thread…"
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
                          disabled={actionBusy || !String(draft || '').trim()}
                          onClick={() =>
                            onReplyToThread?.(
                              {
                                id: threadId,
                                path: item.path,
                                line: item.line,
                                side: item.side || 'RIGHT',
                                threadNodeId: item.threadNodeId || null,
                                root: item,
                              },
                              { mode: 'comment' }
                            )
                          }
                        >
                          Comment
                        </Button>
                        <Button
                          size="sm"
                          disabled={actionBusy || !String(draft || '').trim()}
                          onClick={() =>
                            onReplyToThread?.(
                              {
                                id: threadId,
                                path: item.path,
                                line: item.line,
                                side: item.side || 'RIGHT',
                                threadNodeId: item.threadNodeId || null,
                                root: item,
                              },
                              { mode: 'pending' }
                            )
                          }
                          title={
                            pendingCount > 0
                              ? 'Add this reply to your pending review'
                              : 'Start a pending review with this reply'
                          }
                        >
                          {pendingCount > 0 ? 'Add comment' : 'Start review'}
                        </Button>
                        {item.threadNodeId &&
                        typeof onResolveThread === 'function' &&
                        // Pending (unsubmitted) review threads: delete ok, resolve not
                        !item.pending &&
                        !(item.replies || []).some((r: any) => r?.pending) ? (
                          <Button
                            size="sm"
                            disabled={actionBusy}
                            onClick={() =>
                              onResolveThread?.(item.threadNodeId, !item.resolved)
                            }
                          >
                            {item.resolved ? 'Unresolve' : 'Resolve'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            }

            // Issue comments / review events: standalone cards
            const itemAnchor = isIssue
              ? `issue-comment:${item.id}`
              : isReviewEvent
                ? `review:${item.id}`
                : `item:${item.id}`;
            return (
              <Card
                key={String(item.id || item.key)}
                className={searchCardClass(
                  itemAnchor,
                  `prp-card--timeline prp-card--timeline-${item.kind || 'item'}`
                )}
                data-search-anchor={itemAnchor}
              >
                <div className="prp-conversation-feed__meta">
                  <Avatar login={item.author} avatarUrl={item.avatarUrl} size="sm" />
                  <strong>
                    <UserLink login={item.author || 'user'} />
                  </strong>
                  <Badge tone="muted">{kindLabelFor(item.kind || 'item')}</Badge>
                  {item.state ? (
                    <Badge tone={String(item.state).toLowerCase()}>{item.state}</Badge>
                  ) : null}
                  {item.at ? (
                    <span className="prp-muted">{formatWhen(item.at)}</span>
                  ) : null}
                  {commentActions(editKind, item.id, Boolean(item.canDelete), item.body)}
                </div>
                {editKind ? (
                  renderTimelineBody(item, editKind, itemAnchor)
                ) : (
                  renderSearchableBody(item.body || '', itemAnchor, true)
                )}
              </Card>
            );
          })}
          {/* GitHub-style middle fold between newest and oldest windows */}
          {(paged.showThreadGap ||
            (Boolean(reviewThreadsMeta?.hasMore) &&
              Number(paged.hiddenCount || reviewThreadsMeta?.hiddenCount) > 0)) &&
          typeof onLoadMoreReviewThreads === 'function' ? (
            <div className="prp-timeline-gap" role="region" aria-label="Hidden review threads">
              <div className="prp-timeline-gap__line" aria-hidden="true" />
              <div className="prp-timeline-gap__body">
                <span className="prp-timeline-gap__count">
                  {Number(paged.hiddenCount || reviewThreadsMeta?.hiddenCount) || 0}{' '}
                  hidden items
                </span>
                <button
                  type="button"
                  className="prp-timeline-gap__load"
                  disabled={actionBusy}
                  onClick={() => void onLoadMoreReviewThreads?.()}
                  title="Load more review threads between newest and oldest"
                >
                  Load more…
                </button>
              </div>
              <div className="prp-timeline-gap__line" aria-hidden="true" />
            </div>
          ) : null}
          {(paged.bottomItems || []).map((item: any) => {
            // Reuse same card renderer path via recursive-style inline:
            // oldest-window threads only (partition already filtered).
            const isIssue = item.kind === 'issue-comment';
            const isReviewThread =
              item.kind === 'review-thread' || item.kind === 'review-comment';
            const isReviewEvent = item.kind === 'review';
            const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;
            const reviewReplies = isReviewThread ? item.replies || [] : [];

            function kindLabelFor(kind: string, isReply = false) {
              if (isReply) return 'reply';
              if (kind === 'issue-comment' || isIssue) return 'comment';
              if (kind === 'review-thread' || kind === 'review-comment') return 'review thread';
              if (kind === 'review' || isReviewEvent) return 'review';
              return kind || 'item';
            }

            if (isReviewThread) {
              const threadId = item.id;
              const draft =
                replyDrafts && threadId != null
                  ? replyDrafts[String(threadId)] || ''
                  : '';
              const canReply = typeof onReplyToThread === 'function';
              const threadItems = [
                { row: item, isRoot: true },
                ...reviewReplies.map((r: any) => ({ row: r, isRoot: false })),
              ];
              const filePath = item.path || item.snippet?.path || '';
              const line = item.line != null ? Number(item.line) : null;
              const startLine =
                item.startLine != null && Number.isFinite(Number(item.startLine))
                  ? Number(item.startLine)
                  : null;
              const fileLoc =
                filePath &&
                (startLine != null && line != null && startLine !== line
                  ? `${filePath}:${startLine}–${line}`
                  : line != null
                    ? `${filePath}:${line}`
                    : filePath);

              return (
                <Card
                  key={`old-${String(item.id || item.key)}`}
                  className="prp-card--timeline prp-card--timeline-review-thread"
                >
                  {fileLoc ? (
                    <div className="prp-review-thread__file-header" title={fileLoc}>
                      <span className="prp-mono prp-review-thread__file-loc">{fileLoc}</span>
                      {item.side ? (
                        <span className="prp-muted prp-review-thread__file-side">
                          {String(item.side).toUpperCase()}
                        </span>
                      ) : null}
                      {item.outdated ? (
                        <Badge tone="muted" title="No longer applies to the latest revision">
                          outdated
                        </Badge>
                      ) : null}
                      {item.resolved ? (
                        <Badge tone="ok">resolved</Badge>
                      ) : (
                        <Badge tone="warn">open</Badge>
                      )}
                    </div>
                  ) : null}
                  {item.snippet ? (
                    <DiffSnippetView
                      snippet={item.snippet}
                      filePath={item.snippet.path || item.path}
                    />
                  ) : null}
                  <ul className="prp-review-thread prp-conversation-thread">
                    {threadItems.map(({ row, isRoot }, idx) => {
                      const isLast =
                        idx === threadItems.length - 1 && !canReply;
                      const r = row;
                      const isPending = Boolean(r.pending || (isRoot && item.pending));
                      return (
                        <li
                          key={String(r.id || idx)}
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
                              <Badge tone="muted">
                                {isRoot ? kindLabelFor(item.kind) : 'reply'}
                              </Badge>
                              {isPending ? (
                                <Badge tone="warn" title="Part of an unsubmitted review">
                                  pending
                                </Badge>
                              ) : null}
                              {isRoot && item.outdated ? (
                                <Badge
                                  tone="muted"
                                  title="No longer applies to the latest revision"
                                >
                                  outdated
                                </Badge>
                              ) : null}
                              {r.at || r.createdAt ? (
                                <span className="prp-muted">
                                  {formatWhen(r.at || r.createdAt)}
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
                              {
                                ...r,
                                id: r.id,
                                body: r.body,
                                path: item.path,
                                line: item.line,
                              },
                              editKind || 'review'
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {canReply ? (
                    <div className="prp-conversation-thread__composer">
                      <MarkdownComposer
                        value={draft}
                        onChange={(t: string) => onReplyDraft?.(threadId, t)}
                        placeholder="Reply to thread…"
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
                          disabled={actionBusy || !String(draft || '').trim()}
                          onClick={() =>
                            onReplyToThread?.(
                              {
                                id: threadId,
                                path: item.path,
                                line: item.line,
                                side: item.side || 'RIGHT',
                                threadNodeId: item.threadNodeId || null,
                                root: item,
                              },
                              { mode: 'comment' }
                            )
                          }
                        >
                          Comment
                        </Button>
                        <Button
                          size="sm"
                          disabled={actionBusy || !String(draft || '').trim()}
                          onClick={() =>
                            onReplyToThread?.(
                              {
                                id: threadId,
                                path: item.path,
                                line: item.line,
                                side: item.side || 'RIGHT',
                                threadNodeId: item.threadNodeId || null,
                                root: item,
                              },
                              { mode: 'pending' }
                            )
                          }
                          title={
                            pendingCount > 0
                              ? 'Add this reply to your pending review'
                              : 'Start a pending review with this reply'
                          }
                        >
                          {pendingCount > 0 ? 'Add comment' : 'Start review'}
                        </Button>
                        {item.threadNodeId &&
                        typeof onResolveThread === 'function' &&
                        !item.pending &&
                        !(item.replies || []).some((r: any) => r?.pending) ? (
                          <Button
                            size="sm"
                            disabled={actionBusy}
                            onClick={() =>
                              onResolveThread?.(item.threadNodeId, !item.resolved)
                            }
                          >
                            {item.resolved ? 'Unresolve' : 'Resolve'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            }

            return (
              <Card
                key={`old-${String(item.id || item.key)}`}
                className={`prp-card--timeline prp-card--timeline-${item.kind || 'item'}`}
              >
                <div className="prp-conversation-feed__meta">
                  <Avatar login={item.author} avatarUrl={item.avatarUrl} size="sm" />
                  <strong>
                    <UserLink login={item.author || 'user'} />
                  </strong>
                  <Badge tone="muted">{kindLabelFor(item.kind || 'item')}</Badge>
                  {item.state ? (
                    <Badge tone={String(item.state).toLowerCase()}>{item.state}</Badge>
                  ) : null}
                  {item.at ? (
                    <span className="prp-muted">{formatWhen(item.at)}</span>
                  ) : null}
                  {commentActions(editKind, item.id, Boolean(item.canDelete), item.body)}
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
              </Card>
            );
          })}
          </>
        )}
        {paged.totalPages > 1 ||
        (reviewThreadsMeta?.hasMore && !paged.showThreadGap) ? (
          <div className="prp-pagination">
            {paged.totalPages > 1 ? (
              <>
                <Button
                  size="sm"
                  disabled={!paged.hasNewer && !paged.hasPrev}
                  onClick={() => onTimelinePage?.(paged.page - 1)}
                >
                  Newer
                </Button>
                <span className="prp-muted">
                  Page {paged.page}/{paged.totalPages || 1}
                  {paged.total ? ` · ${paged.total} items` : ''}
                  {reviewThreadsMeta?.loadedThreadCount != null
                    ? ` · ${reviewThreadsMeta.loadedThreadCount} threads loaded`
                    : ''}
                </span>
                <Button
                  size="sm"
                  disabled={!paged.hasOlder && !paged.hasMore}
                  onClick={() => onTimelinePage?.(paged.page + 1)}
                >
                  Older
                </Button>
              </>
            ) : null}
            {reviewThreadsMeta?.hasMore &&
            !paged.showThreadGap &&
            typeof onLoadMoreReviewThreads === 'function' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={actionBusy}
                onClick={() => void onLoadMoreReviewThreads?.()}
                title="Fetch next page of review threads from GitHub"
              >
                {Number(reviewThreadsMeta?.hiddenCount) > 0
                  ? `Load more… (${reviewThreadsMeta.hiddenCount} hidden)`
                  : 'Load more threads'}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div
          className={`prp-merge-box prp-merge-box--${boxTone}`}
          data-merge-kind={ms.kind}
          role="region"
          aria-label="Merge status"
        >
          <div className="prp-merge-box__status-block">
            <span
              className={`prp-merge-box__icon prp-merge-box__icon--${ms.tone}`}
              aria-hidden="true"
            >
              {ms.kind === 'merged' || ms.kind === 'clean'
                ? '✓'
                : ms.kind === 'blocked'
                  ? '✕'
                  : ms.kind === 'draft'
                    ? '◎'
                    : '•'}
            </span>
            <div className="prp-merge-box__copy">
              <h3 className="prp-merge-box__headline">{ms.headline}</h3>
              <p className="prp-merge-box__helper">{ms.helper}</p>
              {ms.checksLine ? (
                <p className="prp-merge-box__checks-line prp-muted">{ms.checksLine}</p>
              ) : null}
            </div>
          </div>

          {detail.state === 'open' && !detail.merged ? (
            <div className="prp-merge-box__actions">
              {ms.showMerge ? (
                <div className="prp-merge-method" ref={mergeMenuRef}>
                  <div className="prp-merge-method__split">
                    <Button
                      className="prp-merge-method__primary"
                      variant="ok"
                      disabled={actionBusy || !ms.canMerge}
                      onClick={() => onMergePr?.(normalizeMergeMethod(mergeMethod))}
                      title={
                        MERGE_METHODS.find((m) => m.id === mergeMethod)?.description ||
                        'Merge pull request'
                      }
                    >
                      {mergeMethodButtonLabel(mergeMethod)}
                    </Button>
                    <button
                      type="button"
                      className="prp-merge-method__caret"
                      disabled={actionBusy || !ms.canMerge}
                      aria-haspopup="menu"
                      aria-expanded={mergeMenuOpen}
                      aria-label="Select merge method"
                      title="Select merge method"
                      onClick={() => setMergeMenuOpen((o) => !o)}
                    >
                      ▾
                    </button>
                  </div>
                  {mergeMenuOpen ? (
                    <ul className="prp-merge-method__menu" role="menu">
                      {MERGE_METHODS.map((m) => (
                        <li key={m.id} role="none">
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={mergeMethod === m.id}
                            className={`prp-merge-method__item${
                              mergeMethod === m.id ? ' prp-merge-method__item--active' : ''
                            }`}
                            onClick={() => {
                              setMergeMethod(m.id);
                              setMergeMenuOpen(false);
                            }}
                          >
                            <span className="prp-merge-method__item-label">{m.label}</span>
                            <span className="prp-merge-method__item-desc prp-muted">
                              {m.description}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {ms.showUpdateBranch ? (
                <Button size="sm" disabled={actionBusy} onClick={onUpdateBranch}>
                  Update branch
                </Button>
              ) : null}

              {ms.draftToggle === 'ready' ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionBusy}
                  onClick={() => onSetDraftStage?.('ready')}
                >
                  Ready for review
                </Button>
              ) : null}
              {ms.draftToggle === 'draft' ? (
                <Button size="sm" disabled={actionBusy} onClick={() => onSetDraftStage?.('draft')}>
                  Convert to draft
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Card
          className="prp-card--composer"
          title={
            <div className="prp-composer-mode" role="tablist" aria-label="Comment or review">
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'comment'}
                className={`prp-composer-mode__tab${
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
                className={`prp-composer-mode__tab${
                  composerMode === 'review' ? ' prp-composer-mode__tab--active' : ''
                }`}
                onClick={() => setComposerMode('review')}
              >
                Review
                {pendingCount > 0 ? (
                  <span className="prp-composer-mode__badge" title="Pending review items">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
            </div>
          }
        >
          <div className="prp-composer prp-composer--review" ref={commentBoxRef}>
            <MarkdownComposer
              value={commentText}
              onChange={setCommentText}
              placeholder={
                composerMode === 'review'
                  ? 'Leave a review comment (optional with pending items)…'
                  : 'Write a comment…'
              }
              compact
              rows={3}
              disabled={actionBusy}
              showTabs
              onUploadFile={onUploadFile}
              linkCtx={linkCtx}
            />
            {composerMode === 'comment' ? (
              <div className="prp-composer__row prp-composer__row--review">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionBusy || !String(commentText || '').trim()}
                  onClick={() => onLeaveReviewAction?.('issue-comment')}
                  title="Post a single conversation comment"
                >
                  Submit
                </Button>
                {detail.state === 'open' && !detail.merged ? (
                  <Button size="sm" disabled={actionBusy} onClick={onClosePr}>
                    Close pull request
                  </Button>
                ) : null}
                {detail.state === 'closed' && !detail.merged ? (
                  <Button size="sm" variant="ok" disabled={actionBusy} onClick={onReopenPr}>
                    Reopen
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="prp-composer__row prp-composer__row--review">
                {pendingCount > 0 ? (
                  <Badge tone="warn" title="Unsubmitted pending review items">
                    {pendingCount} pending
                  </Badge>
                ) : (
                  <span className="prp-muted prp-composer__pending-empty">0 pending</span>
                )}
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
                      : 'Submit a comment review'
                  }
                >
                  Submit review
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
            {actionMsg ? <p className="prp-muted prp-composer-hint">{actionMsg}</p> : null}
          </div>
        </Card>
      </div>

      <aside className="prp-conversation__aside">
        <MetaList
          title="Reviewers"
          rows={
            typeof buildUnifiedReviewerRows === 'function'
              ? buildUnifiedReviewerRows(detail).map((row: any) => ({
                  ...row,
                  // Pending requests are already outstanding; re-request prior reviewers
                  canRerequest:
                    String(row?.status || '').toUpperCase() !== 'PENDING',
                }))
              : (detail.requestedReviewers || []).map((login: string) => ({
                  login,
                  status: 'PENDING',
                  canRerequest: false,
                }))
          }
          emptyLabel="No reviewers yet"
          onAdd={canEditMeta ? onAddReviewer : null}
          onRemove={canEditMeta ? onRemoveReviewer : null}
          onRerequest={
            canEditMeta && typeof onRerequestReviewer === 'function'
              ? (login: string) => onRerequestReviewer(login)
              : null
          }
          addLabel="Add reviewer…"
          actionBusy={actionBusy}
          addButtonRef={reviewerAddRef}
          avatarUrls={detail.avatarUrls}
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
          avatarUrls={detail.avatarUrls}
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
          <div className="prp-milestone">
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
              <span className="prp-muted prp-milestone__empty">No milestone</span>
            )}
            {canEditMeta && (onOpenMilestonePicker || onSetMilestone) ? (
              <button
                type="button"
                className="prp-add-link prp-milestone__action"
                disabled={actionBusy}
                onClick={() =>
                  onOpenMilestonePicker ? onOpenMilestonePicker() : onSetMilestone?.(false)
                }
                ref={milestoneAddRef}
              >
                {detail.milestone ? 'Change milestone…' : 'Set milestone…'}
              </button>
            ) : null}
          </div>
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
          <AsideCommitsTimeline
            commits={detail.commits || []}
            owner={detail.owner}
            repo={detail.repo}
          />
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
