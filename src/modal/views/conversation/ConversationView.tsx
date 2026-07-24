import React, { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { AsideSection } from '@common/AsideSection';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { MarkdownView } from '@common/MarkdownView';
import { TipPopover } from '@common/TipPopover';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDisclosure,
  IconFileDiff,
  IconMergeStatus,
  IconPencil,
  IconTrash,
} from '@common/icons';
import { buildUnifiedReviewerRows, isBotAccount } from '@lib/searchable-select';
import {
  conversationAsideWidthPx,
  loadAsidePref,
  resolveAsideStorage,
  saveAsidePref,
  toggleAsideCollapsed,
} from '@lib/aside-layout';
import { AsideCompactRail } from './AsideCompactRail';
import {
  buildConversationTimeline,
  partitionTimelineWithThreadGap,
} from '@lib/conversation-timeline';
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
import { AsideCommitsTimeline } from './AsideCommitsTimeline';
import { AsideFilesTree } from './AsideFilesTree';
import { ChecksPanel, hasChecksData } from './ChecksPanel';
import { MergeBoxChecks } from './MergeBoxChecks';
import { LoadingSkeleton } from '../chrome/LoadingSkeleton';
import { VirtualConversationList } from './VirtualConversationList';
import { InlineThread } from '../diff/InlineThread';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';

function ConversationViewImpl(props: any) {
  const {
    detail,
    commentText,
    setCommentText,
    actionBusy,
    actionMsg,
    onLeaveReviewAction,
    onDiscardPending = null,
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
    /** Open Diff and scroll to this review thread (file:line / comment id). */
    onJumpToReviewThread = null,
    /** Visible review-thread GraphQL ids (PRRT_…) for targeted refresh */
    onVisibleThreadNodeIds = null,
    /** When true: composer → merge box → conversation (latest first). */
    reverseComments = true,
    reviewThreadsMeta = null,
    searchQuery = '',
    searchHits = null,
    searchHitIndex = -1,
    activeSearchHit = null,
    mentionCandidates = [],
    /** Keyboard-focus anchor (⌘⇧C) for a conversation comment/review row */
    focusedConversationAnchor = null,
  } = props;

  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);
  const asideScrollRef = useRef<HTMLAsideElement | null>(null);
  /** Conversation footer: Comment (issue) vs Review (pending + review events). */
  const [composerMode, setComposerMode] = useState<'comment' | 'review'>(() =>
    Number(pendingCount) > 0 ? 'review' : 'comment'
  );
  /**
   * Collapse overrides for review threads (id → collapsed).
   * Default: resolved threads start collapsed; open threads start expanded.
   * Any thread can be toggled.
   */
  const [threadCollapseOverrides, setThreadCollapseOverrides] = useState(
    () => new Map<string, boolean>()
  );
  /**
   * Open-state overrides for path rows inside a review-group
   * (key: `${reviewId}:${threadId}` → open).
   * Default when missing: pending closed, resolved closed, unresolved open.
   */
  const [groupThreadOpenOverrides, setGroupThreadOpenOverrides] = useState(
    () => new Map<string, boolean>()
  );
  /** Right metadata rail collapse (compact avatars / checks). */
  const [asideCollapsed, setAsideCollapsed] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return loadAsidePref(resolveAsideStorage(window)).collapsed;
    } catch {
      return false;
    }
  });

  const onToggleAside = useCallback(() => {
    setAsideCollapsed((prev) => {
      const next = toggleAsideCollapsed(prev);
      try {
        if (typeof window !== 'undefined') {
          saveAsidePref(resolveAsideStorage(window), { collapsed: next });
        }
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // When a pending review appears, surface Review controls
  useEffect(() => {
    if (Number(pendingCount) > 0) setComposerMode('review');
  }, [pendingCount]);

  // Fresh PR → reset collapse overrides (resolved again start collapsed)
  useEffect(() => {
    setThreadCollapseOverrides(new Map());
    setGroupThreadOpenOverrides(new Map());
  }, [detail?.owner, detail?.repo, detail?.number]);

  const allItems = useMemo(() => {
    if (typeof buildConversationTimeline === 'function') {
      return buildConversationTimeline(detail, {
        snippetForComment:
          typeof snippetForComment === 'function' ? snippetForComment : undefined,
      });
    }
    return [];
  }, [detail]);

  /** Pending review-group is embedded in the Review submit form (not the timeline). */
  const pendingReviewGroup = useMemo(() => {
    return (
      allItems.find(
        (i: any) => i && i.kind === 'review-group' && i.pending
      ) || null
    );
  }, [allItems]);

  const timelineItems = useMemo(() => {
    return allItems.filter(
      (i: any) => !(i && i.kind === 'review-group' && i.pending)
    );
  }, [allItems]);

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
        top: timelineItems,
        bottom: [],
        hiddenCount: 0,
        showGap: false,
      };
    }
    return partitionTimelineWithThreadGap(timelineItems, reviewThreadsMeta);
  }, [timelineItems, reviewThreadsMeta]);

  // Search jump is handled inside VirtualConversationList (scrollToAnchor).
  // No client-side pagination — virtual list shows all loaded items; remaining
  // review threads use the dual-window gap (Load more / Load all).

  const paged: any = useMemo(() => {
    const hidden = Math.max(
      0,
      Number(reviewThreadsMeta?.hiddenCount ?? threadGap.hiddenCount) || 0
    );
    const hasMore = Boolean(reviewThreadsMeta?.hasMore);
    // Prefer dual-window split when partition produced a bottom (oldest) slice
    if (threadGap.showGap && (threadGap.bottom || []).length > 0) {
      return {
        items: threadGap.top,
        bottomItems: threadGap.bottom,
        total: timelineItems.length,
        showThreadGap: true,
        hiddenCount: hidden || threadGap.hiddenCount,
      };
    }
    // Single window (or dual without matched oldest): fold after all loaded items
    return {
      items: timelineItems,
      bottomItems: [],
      total: timelineItems.length,
      showThreadGap: hasMore && hidden > 0,
      hiddenCount: hidden,
    };
  }, [timelineItems, threadGap, reviewThreadsMeta]);

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

  /** Markdown body with search marks injected into rendered HTML (structure preserved). */
  function renderSearchableBody(
    source: string,
    anchorId: string,
    compact = true,
    extra: any = {}
  ) {
    const cls = compact ? 'prp-md--compact' : '';
    const hit = qSearch && isAnchorHit(anchorId);
    const currentStart =
      hit && isAnchorCurrent(anchorId) && activeSearchHit?.start != null
        ? Number(activeSearchHit.start)
        : null;
    // Count occurrence among hits on this anchor for multi-match navigation
    let occ: number | null = null;
    if (hit && isAnchorCurrent(anchorId) && Array.isArray(searchHits)) {
      let n = 0;
      for (let i = 0; i <= (searchHitIndex ?? 0); i++) {
        if (String(searchHits[i]?.anchorId || '') === anchorId) {
          if (i === searchHitIndex) {
            occ = n;
            break;
          }
          n += 1;
        }
      }
    }
    return (
      <MarkdownView
        source={source || ''}
        className={cls}
        linkCtx={linkCtx}
        searchQuery={hit ? qSearch : ''}
        searchCurrentStart={currentStart}
        searchOccurrenceIndex={occ}
        {...extra}
      />
    );
  }

  function searchCardClass(anchorId: string, base = '') {
    let c = base;
    if (isAnchorHit(anchorId)) c += ' prp-card--search-match';
    if (isAnchorCurrent(anchorId)) c += ' prp-card--search-current';
    if (
      focusedConversationAnchor &&
      String(focusedConversationAnchor) === String(anchorId)
    ) {
      c += ' prp-card--kb-focus';
    }
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
          mentionCandidates={mentionCandidates}
        />
      );
    }
    const canApply =
      kind === 'review' &&
      item.path &&
      item.line != null &&
      (item.side || 'RIGHT') === 'RIGHT' &&
      detail.state === 'open';
    return renderSearchableBody(item.body || '', anchorId || `item:${item.id}`, true, {
      canApplySuggestion: canApply,
      actionBusy,
      onRegisterApply,
      onApplySuggestion: (content: string) =>
        onApplySuggestion?.({
          path: item.path,
          startLine: item.startLine || item.line,
          endLine: item.line,
          suggestion: content,
        }),
    });
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
          <IconPencil size={13} />
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
          <IconTrash size={13} />
        </button>
      </div>
    );
  }

  function kindLabelFor(kind: string, isReply = false) {
    if (isReply) return 'reply';
    if (kind === 'issue-comment') return 'comment';
    if (kind === 'review-thread' || kind === 'review-comment') return 'review thread';
    if (kind === 'review') return 'review';
    return kind || 'item';
  }

  function defaultThreadCollapsed(item: any) {
    return Boolean(item?.resolved);
  }

  function isReviewThreadCollapsed(item: any) {
    const key = String(item?.id);
    if (threadCollapseOverrides.has(key)) {
      return Boolean(threadCollapseOverrides.get(key));
    }
    return defaultThreadCollapsed(item);
  }

  function toggleThreadCollapse(item: any) {
    if (item?.id == null) return;
    const key = String(item.id);
    setThreadCollapseOverrides((prev) => {
      const currently = prev.has(key)
        ? Boolean(prev.get(key))
        : defaultThreadCollapsed(item);
      const next = new Map(prev);
      next.set(key, !currently);
      return next;
    });
  }

  function groupThreadKey(reviewId: any, threadId: any) {
    return `${reviewId}:${threadId}`;
  }

  /**
   * Default open state for path rows inside a review-group:
   * - pending (unsubmitted) → closed
   * - resolved → closed
   * - otherwise unresolved → open
   * User toggles win via groupThreadOpenOverrides.
   */
  function defaultGroupThreadOpen(thread: any) {
    if (thread?.pending) return false;
    return !Boolean(thread?.resolved);
  }

  function isGroupThreadOpen(reviewId: any, thread: any) {
    const k = groupThreadKey(reviewId, thread?.id);
    if (groupThreadOpenOverrides.has(k)) {
      return Boolean(groupThreadOpenOverrides.get(k));
    }
    return defaultGroupThreadOpen(thread);
  }

  function toggleGroupThread(reviewId: any, thread: any) {
    const k = groupThreadKey(reviewId, thread?.id);
    setGroupThreadOpenOverrides((prev) => {
      const currently = prev.has(k)
        ? Boolean(prev.get(k))
        : defaultGroupThreadOpen(thread);
      const next = new Map(prev);
      next.set(k, !currently);
      return next;
    });
  }

  /** Shared pending/submitted thread list rows (file:line + expand). */
  function renderReviewGroupThreadList(
    item: any,
    keyPrefix = '',
    opts: { compact?: boolean } = {}
  ) {
    const reviewId = item.id;
    const allThreads = Array.isArray(item.threads) ? item.threads : [];
    if (!allThreads.length) {
      return opts.compact ? (
        <p className="prp-muted prp-review-group__empty prp-composer__pending-empty">
          No pending file comments yet.
        </p>
      ) : null;
    }
    return (
      <ul
        className={`prp-review-group__list${
          opts.compact ? ' prp-review-group__list--in-composer' : ''
        }`}
      >
        {allThreads.map((t: any) => {
          const open = isGroupThreadOpen(reviewId, t);
          const fileLoc = formatThreadFileLoc(t);
          return (
            <li
              key={String(t.id)}
              className={`prp-review-group__row${
                open ? ' prp-review-group__row--open' : ''
              }${t.resolved ? ' prp-review-group__row--resolved' : ''}${
                t.pending ? ' prp-review-group__row--pending' : ''
              }`}
            >
              <div className="prp-review-group__row-head">
                <button
                  type="button"
                  className="prp-review-group__row-btn"
                  onClick={() => toggleGroupThread(reviewId, t)}
                  aria-expanded={open}
                >
                  <span className="prp-review-group__chev" aria-hidden="true">
                    <IconDisclosure open={open} size={16} />
                  </span>
                  <span
                    className="prp-mono prp-review-group__path"
                    title={fileLoc || ''}
                  >
                    {fileLoc || t.path || 'thread'}
                  </span>
                  {/* In composer: pending is shown via row header tint, not a badge */}
                  {t.pending && !opts.compact ? (
                    <Badge tone="warn" className="prp-review-group__badge">
                      Pending
                    </Badge>
                  ) : null}
                  {t.outdated ? (
                    <Badge tone="muted" className="prp-review-group__badge">
                      Outdated
                    </Badge>
                  ) : null}
                  {t.resolved && !t.pending ? (
                    <Badge tone="ok" className="prp-review-group__badge">
                      Resolved
                    </Badge>
                  ) : null}
                </button>
                {typeof onJumpToReviewThread === 'function' && t.path ? (
                  <button
                    type="button"
                    className="prp-icon-btn prp-review-group__jump"
                    title={`View in Diff · ${fileLoc || t.path}`}
                    aria-label={`View ${fileLoc || t.path} in Diff`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onJumpToReviewThread({
                        id: t.id,
                        path: t.path,
                        line: t.line,
                        startLine: t.startLine ?? t.line,
                        side: t.side || 'RIGHT',
                        outdated: Boolean(t.outdated),
                      });
                    }}
                  >
                    <IconFileDiff size={16} />
                  </button>
                ) : null}
              </div>
              {open ? (
                <div className="prp-review-group__thread">
                  {renderReviewThreadCard(t, `${keyPrefix}g${reviewId}-`, {
                    forceExpanded: true,
                    hideOuterHeader: true,
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderReviewGroupCard(item: any, keyPrefix = '') {
    const reviewId = item.id;
    const allThreads = Array.isArray(item.threads) ? item.threads : [];
    const state = String(item.state || 'COMMENTED').toUpperCase();
    const isPending =
      Boolean(item.pending) ||
      state === 'PENDING' ||
      allThreads.some((t: any) => t.pending);
    // Pending groups are shown inside the Review composer — never the timeline
    if (isPending) return null;
    const stateLabel =
      state === 'APPROVED'
        ? 'approved'
        : state === 'CHANGES_REQUESTED'
          ? 'requested changes'
          : 'left a comment';
    const groupAnchor = `review-group:${reviewId}`;

    return (
      <Card
        key={`${keyPrefix}${String(item.key || item.id)}`}
        className={searchCardClass(
          groupAnchor,
          'prp-card--timeline prp-card--timeline-review-group'
        )}
        data-search-anchor={groupAnchor}
        tabIndex={
          focusedConversationAnchor &&
          String(focusedConversationAnchor) === groupAnchor
            ? -1
            : undefined
        }
      >
        <div className="prp-conversation-feed__meta">
          <Avatar login={item.author} avatarUrl={item.avatarUrl} size="md" />
          <strong>
            <UserLink login={item.author || 'user'} />
          </strong>
          {item.isBot ? <Badge tone="muted">Bot</Badge> : null}
          <span className="prp-muted prp-review-group__action">{stateLabel}</span>
          {item.at ? (
            <span className="prp-muted">{formatWhen(item.at)}</span>
          ) : null}
        </div>
        {item.body ? (
          <div className="prp-review-group__body">
            {renderSearchableBody(item.body, `review:${reviewId}`, true)}
          </div>
        ) : null}
        {renderReviewGroupThreadList(item, keyPrefix)}
      </Card>
    );
  }

  function renderTimelineItemCard(item: any, keyPrefix = '') {
    const isIssue = item.kind === 'issue-comment';
    const isReviewThread =
      item.kind === 'review-thread' || item.kind === 'review-comment';
    const isReviewGroup = item.kind === 'review-group';
    const isReviewEvent = item.kind === 'review';
    const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;

    if (isReviewGroup) {
      return renderReviewGroupCard(item, keyPrefix);
    }
    if (isReviewThread) {
      return renderReviewThreadCard(item, keyPrefix);
    }

    const itemAnchor = isIssue
      ? `issue-comment:${item.id}`
      : isReviewEvent
        ? `review:${item.id}`
        : `item:${item.id}`;
    return (
      <Card
        key={`${keyPrefix}${String(item.id || item.key)}`}
        className={searchCardClass(
          itemAnchor,
          `prp-card--timeline prp-card--timeline-${item.kind || 'item'}`
        )}
        data-search-anchor={itemAnchor}
        tabIndex={
          focusedConversationAnchor &&
          String(focusedConversationAnchor) === itemAnchor
            ? -1
            : undefined
        }
      >
        <div className="prp-conversation-feed__meta">
          <Avatar login={item.author} avatarUrl={item.avatarUrl} size="md" />
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
  }

  /**
   * Classic dual-window fold: "N hidden items · Load more… · Load all"
   * (same chrome for mid-list dual-window and end-of-list single window).
   */
  function renderThreadGap(hiddenCount: number) {
    if (typeof onLoadMoreReviewThreads !== 'function') return null;
    const n = Number(hiddenCount) || 0;
    return (
      <div className="prp-timeline-gap" role="region" aria-label="Hidden review threads">
        <div className="prp-timeline-gap__line" aria-hidden="true" />
        <div className="prp-timeline-gap__body">
          <span className="prp-timeline-gap__count">
            {n > 0 ? `${n} hidden items` : 'More review threads'}
          </span>
          <div className="prp-timeline-gap__actions">
            <button
              type="button"
              className="prp-timeline-gap__load"
              disabled={actionBusy}
              onClick={() => void onLoadMoreReviewThreads?.()}
              title="Load more review threads between newest and oldest"
            >
              Load more…
            </button>
            <button
              type="button"
              className="prp-timeline-gap__load"
              disabled={actionBusy}
              onClick={() => void onLoadMoreReviewThreads?.('all')}
              title="Load every remaining review thread"
            >
              Load all
            </button>
          </div>
        </div>
        <div className="prp-timeline-gap__line" aria-hidden="true" />
      </div>
    );
  }

  function formatThreadFileLoc(t: any) {
    if (!t?.path) return '';
    if (
      t.startLine != null &&
      t.line != null &&
      t.startLine !== t.line
    ) {
      return `${t.path}:${t.startLine}–${t.line}`;
    }
    if (t.line != null) return `${t.path}:${t.line}`;
    return t.path;
  }

  function renderReviewThreadCard(
    item: any,
    keyPrefix = '',
    opts: { forceExpanded?: boolean; hideOuterHeader?: boolean } = {}
  ) {
    const threadId = item.id;
    const rootAnchor = `review-comment:${threadId}`;
    const draft =
      replyDrafts && threadId != null ? replyDrafts[String(threadId)] || '' : '';
    const reviewReplies = (item.replies || []).map((r: any) => ({
      ...r,
      createdAt: r.createdAt || r.at || null,
    }));
    const threadHit =
      isAnchorHit(rootAnchor) ||
      reviewReplies.some((r: any) => isAnchorHit(`review-comment:${r.id}`));
    const threadCurrent =
      isAnchorCurrent(rootAnchor) ||
      reviewReplies.some((r: any) => isAnchorCurrent(`review-comment:${r.id}`));
    // Inside a review-group path row, expand always (row chevron is the control)
    const collapsed = opts.forceExpanded
      ? false
      : isReviewThreadCollapsed(item);
    const fileLoc = formatThreadFileLoc(item);
    // Group already has path row; standalone needs conversation-level header
    const showOuterHeader = !opts.hideOuterHeader && !opts.forceExpanded;

    // Same shape Diff VirtualDiff passes into InlineThread
    const row = {
      commentId: item.id,
      author: item.author,
      avatarUrl: item.avatarUrl,
      body: item.body,
      filePath: item.path,
      newLine: item.line,
      startLine: item.startLine ?? item.line,
      side: item.side || 'RIGHT',
      threadNodeId: item.threadNodeId || null,
      resolved: Boolean(item.resolved),
      outdated: Boolean(item.outdated),
      pending: Boolean(item.pending),
      createdAt: item.at || item.createdAt || null,
    };
    const thread = {
      id: item.id,
      root: {
        id: item.id,
        author: item.author,
        avatarUrl: item.avatarUrl,
        body: item.body,
        path: item.path,
        line: item.line,
        startLine: item.startLine ?? item.line,
        side: item.side || 'RIGHT',
        createdAt: item.at || item.createdAt || null,
        pending: Boolean(item.pending),
        outdated: Boolean(item.outdated),
        resolved: Boolean(item.resolved),
        threadNodeId: item.threadNodeId || null,
      },
      replies: reviewReplies,
      threadNodeId: item.threadNodeId || null,
      resolved: Boolean(item.resolved),
      outdated: Boolean(item.outdated),
      pending: Boolean(item.pending),
    };

    return (
      <div
        key={`${keyPrefix}${String(item.id || item.key)}`}
        className={`prp-card prp-card--timeline prp-card--timeline-review-thread prp-conversation-inline-thread${
          collapsed ? ' prp-card--timeline-review-thread--collapsed' : ''
        }${threadHit ? ' prp-card--search-match' : ''}${
          threadCurrent ? ' prp-card--search-current' : ''
        }${
          focusedConversationAnchor &&
          String(focusedConversationAnchor) === rootAnchor
            ? ' prp-card--kb-focus'
            : ''
        }`}
        data-search-anchor={rootAnchor}
        tabIndex={
          focusedConversationAnchor &&
          String(focusedConversationAnchor) === rootAnchor
            ? -1
            : undefined
        }
      >
        {showOuterHeader ? (
          <div className="prp-conversation-thread-header">
            <button
              type="button"
              className="prp-conversation-thread-header__toggle"
              onClick={() => toggleThreadCollapse(item)}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand thread' : 'Collapse thread'}
              aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
            >
              <span className="prp-conversation-thread-header__chev" aria-hidden="true">
                <IconDisclosure open={!collapsed} size={16} />
              </span>
              <span
                className="prp-mono prp-conversation-thread-header__path"
                title={fileLoc || item.path || ''}
              >
                {fileLoc || item.path || 'thread'}
              </span>
              {item.pending ? (
                <Badge tone="warn">Pending</Badge>
              ) : null}
              {item.outdated ? (
                <Badge tone="muted">Outdated</Badge>
              ) : null}
              {item.resolved ? <Badge tone="ok">Resolved</Badge> : null}
            </button>
            {typeof onJumpToReviewThread === 'function' && item.path ? (
              <button
                type="button"
                className="prp-icon-btn prp-conversation-thread-header__jump"
                title={`View in Diff · ${fileLoc || item.path}`}
                aria-label={`View ${fileLoc || item.path} in Diff`}
                onClick={() =>
                  onJumpToReviewThread({
                    id: item.id,
                    path: item.path,
                    line: item.line,
                    startLine: item.startLine ?? item.line,
                    side: item.side || 'RIGHT',
                    outdated: Boolean(item.outdated),
                  })
                }
              >
                <IconFileDiff size={16} />
              </button>
            ) : null}
          </div>
        ) : null}
        <InlineThread
          className="prp-inline-thread--conversation"
          row={row}
          thread={thread}
          replyText={draft}
          onReplyText={(t: string) => onReplyDraft?.(threadId, t)}
          onReply={(th: any, opts: any) =>
            onReplyToThread?.(
              {
                id: threadId,
                path: item.path,
                line: item.line,
                side: item.side || 'RIGHT',
                threadNodeId: item.threadNodeId || null,
                root: item,
              },
              opts
            )
          }
          onResolve={onResolveThread}
          onDelete={(id: any) => onDeleteReviewComment?.(id)}
          onEdit={(id: any, body: string) =>
            onStartEditComment?.('review', id, body)
          }
          onSaveEdit={(id: any, body: string) =>
            onSaveEditComment?.('review', id, body)
          }
          onCancelEdit={onCancelEditComment}
          editingCommentId={
            editingComment?.kind === 'review' ? editingComment.id : null
          }
          onRegisterEditorSave={onRegisterEditorSave}
          onApplySuggestion={onApplySuggestion}
          onRegisterApply={onRegisterApply}
          actionBusy={actionBusy}
          viewerLogin={detail.viewerLogin}
          prOpen={detail.state === 'open'}
          linkCtx={linkCtx}
          onUploadFile={onUploadFile}
          mentionCandidates={mentionCandidates}
          collapsed={collapsed}
          onToggleCollapse={() => toggleThreadCollapse(item)}
          pendingCount={pendingCount}
          searchQuery={qSearch}
          activeSearchHit={activeSearchHit}
          searchHits={searchHits}
          searchHitIndex={searchHitIndex}
          showFileHeader={false}
          showHunk
          snippet={item.snippet || null}
        />
      </div>
    );
  }

  function renderDescriptionCard() {
    return (
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
              <IconPencil size={13} />
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
            mentionCandidates={mentionCandidates}
          />
        ) : (
          renderSearchableBody(
            detail.body || '_No description provided._',
            'body',
            false
          )
        )}
      </Card>
    );
  }

  function renderMergeBox() {
    return (
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
            <IconMergeStatus kind={ms.kind} size={16} />
          </span>
          <div className="prp-merge-box__copy">
            <h3 className="prp-merge-box__headline">{ms.headline}</h3>
            <p className="prp-merge-box__helper">{ms.helper}</p>
          </div>
        </div>

        {hasChecksData(detail.checks) ? (
          <MergeBoxChecks checks={detail.checks} />
        ) : ms.checksLine ? (
          <p className="prp-merge-box__checks-line prp-muted">{ms.checksLine}</p>
        ) : null}

        {detail.state === 'open' && !detail.merged ? (
          <div className="prp-merge-box__actions">
            {ms.showMerge ? (
              <div
                className={`prp-merge-method prp-merge-method--${ms.ctaVariant || 'default'}${
                  ms.forceMerge ? ' prp-merge-method--force' : ''
                }`}
                ref={mergeMenuRef}
                data-cta-variant={ms.ctaVariant || 'default'}
                data-force-merge={ms.forceMerge ? '1' : '0'}
                data-can-merge={ms.canMerge ? '1' : '0'}
              >
                <div className="prp-merge-method__split">
                  <Button
                    className={`prp-merge-method__primary prp-merge-method__primary--${
                      ms.ctaVariant || 'default'
                    }`}
                    variant={ms.ctaVariant || (ms.canMerge ? 'ok' : 'default')}
                    disabled={actionBusy || !ms.canMerge}
                    onClick={() => onMergePr?.(normalizeMergeMethod(mergeMethod))}
                    title={
                      ms.forceMerge
                        ? 'Force merge — bypasses failing checks / branch protection if your token has permission'
                        : MERGE_METHODS.find((m) => m.id === mergeMethod)?.description ||
                          'Merge pull request'
                    }
                  >
                    {mergeMethodButtonLabel(mergeMethod, {
                      force: Boolean(ms.forceMerge),
                    })}
                  </Button>
                  <button
                    type="button"
                    className={`prp-merge-method__caret prp-merge-method__caret--${
                      ms.ctaVariant || 'default'
                    }`}
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
    );
  }

  function renderComposerCard() {
    return (
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
          {/* Pending file threads live at the top of the Review form (not timeline) */}
          {composerMode === 'review' && pendingReviewGroup ? (
            <div
              className="prp-composer__pending-threads"
              data-pending-threads={
                Array.isArray(pendingReviewGroup.threads)
                  ? pendingReviewGroup.threads.length
                  : 0
              }
            >
              <div className="prp-composer__pending-head">
                <span className="prp-composer__pending-title">
                  Pending review
                </span>
                <Badge tone="warn" title="Not yet submitted">
                  {Array.isArray(pendingReviewGroup.threads)
                    ? pendingReviewGroup.threads.length
                    : pendingCount}{' '}
                  thread
                  {(Array.isArray(pendingReviewGroup.threads)
                    ? pendingReviewGroup.threads.length
                    : pendingCount) === 1
                    ? ''
                    : 's'}
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
              {renderReviewGroupThreadList(pendingReviewGroup, 'composer-', {
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
            <div className="prp-composer__row prp-composer__row--review">
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
            <div className="prp-composer__row prp-composer__row--review">
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

  function renderPanelRow(row: any) {
    switch (row?.type) {
      case 'description':
        return renderDescriptionCard();
      case 'composer':
        return renderComposerCard();
      case 'merge':
        return renderMergeBox();
      case 'gap':
        return renderThreadGap(
          Number(row.hiddenCount ?? paged.hiddenCount ?? reviewThreadsMeta?.hiddenCount) ||
            0
        );
      case 'empty':
        return null;
      case 'item':
        return renderTimelineItemCard(row.item, row.keyPrefix || '');
      default:
        return null;
    }
  }

  return (
    <div
      className={`prp-conversation${asideCollapsed ? ' prp-conversation--aside-collapsed' : ''}`}
      style={
        {
          ['--prp-aside-w' as string]: `${conversationAsideWidthPx(asideCollapsed)}px`,
        } as React.CSSProperties
      }
      data-aside-collapsed={asideCollapsed ? '1' : '0'}
    >
      <div className="prp-conversation__main">
        {sectionLoading && !detail ? (
          <div className="prp-section-skeleton" />
        ) : (
          <VirtualConversationList
            paged={paged}
            reviewThreadsMeta={reviewThreadsMeta}
            canLoadMore={typeof onLoadMoreReviewThreads === 'function'}
            reverseComments={Boolean(reverseComments)}
            descriptionBody={detail.body || ''}
            isThreadCollapsed={isReviewThreadCollapsed}
            isGroupThreadExpanded={(groupItem: any, thread: any) =>
              isGroupThreadOpen(groupItem?.id, thread)
            }
            // Keyboard focus (⌘⇧C) takes priority over search current hit;
            // VCL scrolls via indexForConversationAnchor + scroller.scrollTop
            // so off-window virtualized rows still land correctly.
            scrollToAnchor={focusedConversationAnchor || activeAnchor}
            renderRow={renderPanelRow}
            onVisibleThreadNodeIds={onVisibleThreadNodeIds}
          />
        )}
      </div>

      {/* Vertical splitter between main and meta; hosts compact toggle */}
      <div
        className="prp-conversation__splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel splitter"
      >
        <button
          type="button"
          className="prp-aside-collapse-btn prp-has-tip"
          onClick={onToggleAside}
          aria-label={
            asideCollapsed ? 'Expand metadata panel' : 'Collapse metadata panel'
          }
          aria-expanded={!asideCollapsed}
        >
          {asideCollapsed ? (
            <IconChevronLeft size={14} aria-hidden="true" />
          ) : (
            <IconChevronRight size={14} aria-hidden="true" />
          )}
          <TipPopover
            title={
              asideCollapsed
                ? 'Expand metadata panel'
                : 'Collapse metadata panel'
            }
          />
        </button>
      </div>
      <div
        className={`prp-scroll-float-host prp-edge-fade prp-conversation__aside-host${
          asideCollapsed ? ' prp-conversation__aside-host--collapsed' : ''
        }`}
      >
      <aside
        ref={asideScrollRef}
        className={`prp-conversation__aside prp-scroll-float${
          asideCollapsed ? ' prp-conversation__aside--collapsed' : ''
        }`}
        aria-label={
          asideCollapsed
            ? 'Pull request metadata (collapsed)'
            : 'Pull request metadata'
        }
        onScroll={(e) => {
          const el = e.currentTarget;
          el.classList.add('prp-is-scrolling');
          const t = (el as any).__prpScrollHide;
          if (t) clearTimeout(t);
          (el as any).__prpScrollHide = setTimeout(() => {
            el.classList.remove('prp-is-scrolling');
          }, 700);
        }}
      >
        {asideCollapsed ? (
          <AsideCompactRail detail={detail} />
        ) : (
          <>
        <MetaList
          title="Reviewers"
          rows={
            typeof buildUnifiedReviewerRows === 'function'
              ? buildUnifiedReviewerRows(detail).map((row: any) => {
                  const bot =
                    Boolean(row?.isBot) ||
                    (typeof isBotAccount === 'function'
                      ? isBotAccount(row, detail) || isBotAccount(row?.login, detail)
                      : false);
                  return {
                    ...row,
                    isBot: bot,
                    // Pending requests are already outstanding; bots never re-requestable
                    canRerequest:
                      !bot &&
                      String(row?.status || '').toUpperCase() !== 'PENDING',
                    canRemove: !bot,
                  };
                })
              : (detail.requestedReviewers || []).map((login: string) => {
                  const bot =
                    typeof isBotAccount === 'function'
                      ? isBotAccount(login, detail)
                      : /\[bot\]$/i.test(login);
                  return {
                    login,
                    status: 'PENDING',
                    isBot: bot,
                    canRerequest: false,
                    canRemove: !bot,
                  };
                })
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
          rows={(detail.assignees || []).map((login: string) => {
            const bot =
              typeof isBotAccount === 'function'
                ? isBotAccount(login, detail)
                : /\[bot\]$/i.test(String(login || ''));
            return { login, isBot: bot, canRemove: !bot };
          })}
          emptyLabel="No assignees"
          onAdd={canEditMeta ? onAddAssignee : null}
          onRemove={canEditMeta ? onRemoveAssignee : null}
          addLabel="Add assignee…"
          actionBusy={actionBusy}
          addButtonRef={assigneeAddRef}
          avatarUrls={detail.avatarUrls}
        />
        <AsideSection title="Labels">
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
        </AsideSection>
        <AsideSection title="Milestone">
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
        </AsideSection>
        <AsideSection title="Linked issues">
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
        </AsideSection>
        {showChecks || sectionLoading ? (
          <AsideSection title="Checks">
            {sectionLoading ? (
              <div className="prp-section-skeleton prp-section-skeleton--sm" />
            ) : (
              <ChecksPanel checks={detail.checks} />
            )}
          </AsideSection>
        ) : null}
        <AsideSection
          title={`Commits${detail.commits?.length ? ` (${detail.commits.length})` : ''}`}
          collapsible
          defaultOpen={false}
        >
          <AsideCommitsTimeline
            commits={detail.commits || []}
            owner={detail.owner}
            repo={detail.repo}
          />
        </AsideSection>
        <AsideSection
          title={`Files${detail.files?.length ? ` (${detail.files.length})` : ''}`}
          collapsible
          defaultOpen={false}
        >
          <AsideFilesTree files={detail.files || []} />
        </AsideSection>

          </>
        )}
      </aside>
      {/* Compact rail is too narrow for a scrollbar chrome; hide entirely. */}
      {!asideCollapsed ? (
        <FloatingScrollbar
          scrollerRef={asideScrollRef}
          contentKey="expanded"
        />
      ) : null}
      </div>
    </div>
  );
}

export const ConversationView = memo(ConversationViewImpl);
export default ConversationView;
