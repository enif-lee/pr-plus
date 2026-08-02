/**
 * SOURCE OF TRUTH — Conversation surface.
 * Complete TypeScript module (no mid-IIFE parts assembly).
 * Domain tsc typechecks this file. Size exception: undivided React root.
 */
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
import { CommentReactions } from '@common/CommentReactions';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDisclosure,
  IconFileDiff,
  IconLinkExternal,
  IconPencil,
  IconSync,
  IconTrash,
} from '@common/icons';
import {
  GroupThreadFoldBtn,
  GroupThreadJumpBtn,
} from './GroupThreadControls';
import { ThreadGapBanner } from './ThreadGapBanner';
import { MergeBox } from './MergeBox';
import { DescriptionCard } from './DescriptionCard';
import { ComposerCard } from './ComposerCard';
import { buildUnifiedReviewerRows, isBotAccount } from '@lib/searchable-select';
import {
  conversationAsideWidthPx,
  loadAsidePref,
  resolveAsideStorage,
  saveAsidePref,
  toggleAsideCollapsed,
} from '@lib/aside-layout';
import { sidePanelShortcutLabel } from '@lib/shortcut-policy';
import { AsideCompactRail } from './AsideCompactRail';
import {
  buildConversationTimeline,
  partitionTimelineWithThreadGap,
  filterTimelineItemsByVisibility,
  normalizeTimelineVisibility,
  toggleTimelineTip,
  isTimelineVisibilityAllOn,
  TIMELINE_TIP_IDS,
  TIMELINE_TIP_LABELS,
  type TimelineTipId,
} from '@lib/conversation-timeline';
import { snippetForComment } from '@lib/diff-snippet';
import { buildMergeBoxStatus } from '@lib/merge-box-status';
import { BodyEditor } from '../composers/BodyEditor';
import { MetaList } from './MetaList';
import { AsideCommitsTimeline } from './AsideCommitsTimeline';
import { AsideTagsList } from './AsideTagsList';
import {
  mayHaveMoreCommits,
  mayHaveMoreFiles,
} from '@lib/aside-lists';
import { AsideFilesTree } from './AsideFilesTree';
import { ChecksPanel, hasChecksData } from './ChecksPanel';
import { MergeBoxChecks } from './MergeBoxChecks';
import { LoadingSkeleton } from '../chrome/LoadingSkeleton';
import { VirtualConversationList } from './VirtualConversationList';
import { InlineThread } from '../diff/InlineThread';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import {
  applyEmbedWheelScroll,
  isEmbedPresentation,
} from '@lib/page-embed';
import { resolveDevelopmentMainOpen } from '@lib/command-palette';
import { canSubmitReviewVerdict } from '@lib/pr-edit-api';
import { OptBtnHint } from '@common/OptBtnHint';
import { useModalStore } from '../../store/modal-store';
import {
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
  queryContextThreadHost,
} from '@lib/context-thread-dom';
import './ConversationShell.css';
import './ConversationThread.css';
import './AsideRail.css';
import './ComposerTabs.css';
import './PeopleChips.css';
import './PendingThreads.css';
import './ThreadFold.css';
import './CommentNavigator.css';
import './ChecksTips.css';
import {
  ConversationKbFocusClassName,
  ConversationKbEnterExpand,
  ConversationKbFocusHost,
  ConversationKbFocusScroller,
  useIsConversationKbFocused,
} from '@common/ConversationKbFocus';

function ConversationViewImpl(props: any) {
  // Leaf: composer text — typing must not re-render PrModalApp.
  const storeCommentText = useModalStore((s) => s.commentText);
  const storeSetCommentText = useModalStore((s) => s.setCommentText);
  const {
    detail,
    commentText: commentTextProp,
    setCommentText: setCommentTextProp,
    actionBusy,
    actionMsg,
    onLeaveReviewAction,
    onDiscardPending = null,
    sectionLoading,
    /** 'embed' enables global-then-panel wheel chaining */
    presentation = 'modal',
    onDeleteIssueComment,
    onDeleteReviewComment,
    onToggleReaction = null,
    onLoadReactors = null,
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
    onEnsureAllCommits = null,
    onEnsureAllFiles = null,
    /** First open of Tags section — not on conversation mount. */
    onEnsurePrTags = null,
    commitsLoading = false,
    filesLoading = false,
    /** Side panels loading without cache: { commits, checks, development } */
    sidePending = null,
    prTags = null,
    prTagsLoading = false,
    prTagsError = null,
    onRerequestReviewer = null,
    onMergePr,
    onUpdateBranch,
    onDeleteHeadBranch = null,
    onSetDraftStage,
    onClosePr,
    onReopenPr,
    /** Open another PR in-modal/sheet (Development links). */
    onOpenLinkedPr = null,
    /** Known open PR numbers (same repo) for Development in-modal routing. */
    knownPullNumbers = null,
    /** App registers toggle so ⌥B can collapse the metadata rail */
    onRegisterAsideToggle = null,
    /**
     * Context-thread shortcuts (⌥F/D/C · ⌥⌃R). Conversation registers
     * fold/goto/comment/resolve for the focused review thread unit.
     */
    onRegisterContextThreadActions = null,
    commentBoxRef,
    onUploadFile,
    reviewerAddRef,
    assigneeAddRef,
    labelAddRef,
    milestoneAddRef,
    onReplyToThread = null,
    onResolveThread = null,
    onLoadMoreReviewThreads = null,
    /**
     * Lazy-load GraphQL comments when expanding a shell/resolved thread.
     * Receives threadNodeId (PRRT_…) or shell comment id.
     */
    onEnsureThreadComments = null,
    /**
     * (threadNodeId | commentId) => boolean — by-ids comments in flight.
     * Drives header loading spinner on expand.
     */
    isThreadCommentsLoading = null,
    /** Open Diff and scroll to this review thread (file:line / comment id). */
    onJumpToReviewThread = null,
    /** Visible review-thread GraphQL ids (PRRT_…) for targeted refresh */
    onVisibleThreadNodeIds = null,
    /** When true: composer → merge box → conversation (latest first). */
    reverseComments = true,
    /**
     * Global timeline category visibility (labels/title/milestone/comments).
     * Synced with extensionPrefs.timelineVisibility.
     */
    timelineVisibility = null,
    /** (nextMap) => void — patch global prefs when a tip is toggled */
    onTimelineVisibilityChange = null,
    reviewThreadsMeta = null,
    searchQuery = '',
    searchHits = null,
    searchHitIndex = -1,
    activeSearchHit = null,
    mentionCandidates = [],
  } = props;

  const commentText =
    commentTextProp !== undefined ? commentTextProp : storeCommentText;
  const setCommentText = setCommentTextProp || storeSetCommentText;

  const embedScrollChain = isEmbedPresentation(presentation);
  const convRootRef = useRef<HTMLDivElement | null>(null);
  // @ts-expect-error modal dynamic action/picker shapes
  const asideScrollRef = useRef<HTMLAsideElement | null>(null);

  /**
   * Embed only: wheel over conversation main → document scroll first (so GH
   * header can collapse), then remaining delta into the panel scroller.
   */
  useEffect(() => {
    if (!embedScrollChain) return undefined;
    const root = convRootRef.current;
    if (!root) return undefined;
    const main =
      (root.querySelector('.prp-conversation__main') as HTMLElement | null) ||
      root;

    const onWheel = (e: WheelEvent) => {
      // Don't steal from nested form fields / aside
      const t = e.target as Node | null;
      if (t && (t as HTMLElement).closest?.('textarea, input, select, [contenteditable="true"]')) {
        return;
      }
      const panel = root.querySelector(
        '.prp-conversation-virtual'
      ) as HTMLElement | null;
      if (!panel) return;
      // Only when pointer is over the main conversation column
      if (!main.contains(t as Node)) return;

      const globalEl =
        (typeof document !== 'undefined' &&
          (document.scrollingElement ||
            document.documentElement ||
            document.body)) ||
        null;
      if (!globalEl) return;

      const routed = applyEmbedWheelScroll({
        deltaY: e.deltaY,
        globalEl: globalEl as HTMLElement,
        panelEl: panel,
      });
      if (routed.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    main.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      main.removeEventListener('wheel', onWheel, true);
    };
  }, [embedScrollChain, detail?.number]);
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

  useEffect(() => {
    if (typeof onRegisterAsideToggle !== 'function') return undefined;
    onRegisterAsideToggle(onToggleAside);
    return () => {
      onRegisterAsideToggle(null);
    };
  }, [onRegisterAsideToggle, onToggleAside]);

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const sidePanelKbd =
    typeof sidePanelShortcutLabel === 'function'
      ? sidePanelShortcutLabel(isMac)
      : isMac
        ? '⌥B'
        : 'Alt+B';

  // When a pending review appears, surface Review controls
  useEffect(() => {
    if (Number(pendingCount) > 0) setComposerMode('review');
  }, [pendingCount]);

  // Fresh PR → reset collapse overrides (resolved again start collapsed)
  useEffect(() => {
    setThreadCollapseOverrides(new Map());
    setGroupThreadOpenOverrides(new Map());
  }, [detail?.owner, detail?.repo, detail?.number]);

  // Fingerprint timelineEvents so optimistic labeled/milestoned rows after a
  // meta write always rebuild the virtual conversation list (not just labels).
  const timelineEventsKey = useMemo(() => {
    const te = Array.isArray(detail?.timelineEvents) ? detail.timelineEvents : [];
    if (!te.length) return '0';
    let maxAt = '';
    const ids: string[] = [];
    for (const e of te) {
      if (e?.id != null) ids.push(String(e.id));
      const at = String(e?.at || '');
      if (at > maxAt) maxAt = at;
    }
    return `${te.length}:${ids.length}:${maxAt}:${ids[ids.length - 1] || ''}`;
  }, [detail?.timelineEvents]);

  const allItems = useMemo(() => {
    if (typeof buildConversationTimeline === 'function') {
      return buildConversationTimeline(detail, {
        snippetForComment:
          typeof snippetForComment === 'function' ? snippetForComment : undefined,
      });
    }
    return [];
    // timelineEventsKey forces recompute when only system events change
    // (host may reuse a detail object shell with a new timelineEvents array).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, timelineEventsKey]);

  /** Pending review-group is embedded in the Review submit form (not the timeline). */
  const pendingReviewGroup = useMemo(() => {
    return (
      allItems.find(
        (i: any) => i && i.kind === 'review-group' && i.pending
      ) || null
    );
  }, [allItems]);

  // Local optimistic visibility so tip chips flip immediately; host prefs
  // remain source of truth. Track last emitted map so lagging props / storage
  // round-trips cannot re-enable a tip the user just turned off.
  const [localTimelineVis, setLocalTimelineVis] = useState(() =>
    normalizeTimelineVisibility(timelineVisibility)
  );
  const lastEmittedVisRef = useRef<string>(
    JSON.stringify(normalizeTimelineVisibility(timelineVisibility))
  );
  useEffect(() => {
    const incoming = normalizeTimelineVisibility(timelineVisibility);
    const incomingJson = JSON.stringify(incoming);
    // Host caught up to our last tip click
    if (incomingJson === lastEmittedVisRef.current) {
      setLocalTimelineVis(incoming);
      return;
    }
    // Ignore lagging all-on props while a partial tip-off emit is in flight
    try {
      const emitted = JSON.parse(lastEmittedVisRef.current || '{}');
      if (
        isTimelineVisibilityAllOn(incoming) &&
        emitted &&
        !isTimelineVisibilityAllOn(emitted)
      ) {
        return;
      }
    } catch {
      /* ignore */
    }
    // External change (popup / storage) — take props
    setLocalTimelineVis(incoming);
    lastEmittedVisRef.current = incomingJson;
  }, [timelineVisibility]);

  const timelineVisibilityNorm = localTimelineVis;

  const timelineItems = useMemo(() => {
    const base = allItems.filter(
      (i: any) => !(i && i.kind === 'review-group' && i.pending)
    );
    return filterTimelineItemsByVisibility(base, timelineVisibilityNorm);
  }, [allItems, timelineVisibilityNorm]);

  function onTipClick(tipId: TimelineTipId | string) {
    const next = toggleTimelineTip(timelineVisibilityNorm, tipId);
    const nextJson = JSON.stringify(next);
    lastEmittedVisRef.current = nextJson;
    setLocalTimelineVis(next);
    // Debug/e2e observability
    try {
      document.documentElement?.setAttribute?.(
        'data-prp-timeline-vis',
        nextJson
      );
    } catch {
      /* ignore */
    }
    if (typeof onTimelineVisibilityChange === 'function') {
      try {
        onTimelineVisibilityChange(next);
      } catch {
        /* soft — local filter still applies */
      }
    }
  }

  const allTipOn = isTimelineVisibilityAllOn(timelineVisibilityNorm);

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


  if (!detail && sectionLoading) {
    return <LoadingSkeleton variant="conversation" />;
  }
  if (!detail) return null;

  const canEditMeta = Boolean(detail.viewerLogin);
  // GitHub rejects APPROVE / REQUEST_CHANGES on your own PR
  const showReviewVerdict =
    typeof canSubmitReviewVerdict === 'function'
      ? canSubmitReviewVerdict(detail)
      : true;
  const linkCtx = {
    owner: detail.owner,
    repo: detail.repo,
    magicLinks: detail.magicLinks || [],
  };
  // Aside Checks card (not merge-box badge farm)
  const showChecks = hasChecksData(detail.checks);
  // Skeletons only when that panel is still loading *and* has no settled cache
  // Title-spinner only (no body skeletons). Cache-settled panels skip pending.
  const pendingCommits = Boolean(sidePending?.commits);
  const pendingChecks = Boolean(sidePending?.checks);
  const pendingDevelopment = Boolean(sidePending?.development);
  const pendingFiles = Boolean(sidePending?.files);
  const ms = mergeStatus || buildMergeBoxStatus(detail);
  const boxTone =
    ms.tone === 'merged'
      ? 'merged'
      : ms.tone === 'closed'
        ? 'closed'
        : ms.tone === 'danger'
          ? 'danger'
          : ms.tone === 'ok'
            ? 'ok'
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
    // kb-focus via ConversationKbFocusHost / useIsConversationKbFocused (leaf)
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
    const body = renderSearchableBody(
      item.body || '',
      anchorId || `item:${item.id}`,
      true,
      {
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
      }
    );
    // Issue comments: GitHub-style reaction row under body
    if (kind === 'issue' && typeof onToggleReaction === 'function') {
      return (
        <>
          {body}
          <CommentReactions
            reactions={item.reactions || []}
            target={{
              kind: 'issue',
              commentId: item.id,
              nodeId: item.nodeId || null,
            }}
            viewerLogin={detail?.viewerLogin}
            busy={actionBusy}
            onToggle={onToggleReaction}
            onLoadReactors={onLoadReactors}
          />
        </>
      );
    }
    return body;
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
    if (kind === 'timeline-event') return 'event';
    return kind || 'item';
  }

  /**
   * Map event status tones → Badge tones.
   * Status chips use bordered badges; titles use soft (non-bordered).
   */
  function timelineStatusBadgeTone(tone: string) {
    switch (String(tone || '').toLowerCase()) {
      case 'ready':
        return 'ready';
      case 'closed':
        return 'closed';
      case 'reopened':
        return 'reopened';
      case 'merged':
        return 'merged';
      case 'locked':
        return 'locked';
      case 'draft':
        return 'draft';
      default:
        return 'muted';
    }
  }

  /**
   * Render structured narrative parts for a system timeline event
   * (title rename, draft/ready, labels, assignees, …).
   * Value params use Badge (soft or bordered) rather than raw tinted text.
   */
  function renderTimelineEventParts(parts: any[], owner: string, repo: string) {
    if (!Array.isArray(parts) || !parts.length) return null;
    return parts.map((p, i) => {
      if (!p || typeof p !== 'object') return null;
      const key = `p-${i}`;
      switch (p.type) {
        case 'user':
          return p.login ? (
            <Badge
              key={key}
              tone="accent"
              variant="soft"
              className="prp-timeline-event__param"
              title={p.login}
            >
              <UserLink login={p.login} />
            </Badge>
          ) : null;
        case 'label':
          return p.name ? (
            <LabelLink
              key={key}
              owner={owner}
              repo={repo}
              label={{ name: p.name, color: p.color || '' }}
            />
          ) : null;
        case 'milestone':
          return p.title ? (
            <Badge
              key={key}
              tone="accent"
              className="prp-timeline-event__param prp-timeline-event__param--wide"
              title={p.title}
            >
              {p.title}
            </Badge>
          ) : null;
        case 'title': {
          // Soft badge: CSS ellipsis at max-width; full string on hover target.
          const fullTitle = String(p.text || '');
          return (
            <Badge
              key={key}
              tone="muted"
              variant="soft"
              className="prp-timeline-event__param prp-timeline-event__param--title"
              title={fullTitle}
              data-prp-full-title={fullTitle}
            >
              {p.text}
            </Badge>
          );
        }
        case 'status': {
          const tone = timelineStatusBadgeTone(p.tone || 'default');
          return (
            <Badge
              key={key}
              tone={tone}
              className="prp-timeline-event__param"
              title={p.text}
            >
              {p.text}
            </Badge>
          );
        }
        case 'strong':
          return (
            <Badge
              key={key}
              tone="muted"
              variant="soft"
              className="prp-timeline-event__param prp-timeline-event__param--wide"
              title={p.text}
            >
              {p.text}
            </Badge>
          );
        case 'commit':
          return (
            <Badge
              key={key}
              tone="accent"
              className="prp-timeline-event__param prp-timeline-event__param--mono"
              title={p.text}
            >
              <code className="prp-mono">{p.text}</code>
            </Badge>
          );
        case 'branch':
          return (
            <Badge
              key={key}
              tone="accent"
              variant="soft"
              className="prp-timeline-event__param prp-timeline-event__param--mono prp-timeline-event__param--wide"
              title={p.text}
            >
              <code className="prp-mono">{p.text}</code>
            </Badge>
          );
        case 'code':
          return (
            <Badge
              key={key}
              tone="muted"
              variant="soft"
              className="prp-timeline-event__param prp-timeline-event__param--mono"
              title={p.text}
            >
              <code className="prp-mono">{p.text}</code>
            </Badge>
          );
        case 'text':
        default:
          return (
            <span key={key} className="prp-timeline-event__text">
              {p.text || ''}
            </span>
          );
      }
    });
  }

  function renderTimelineEventRow(item: any, keyPrefix = '') {
    const owner = detail?.owner || '';
    const repo = detail?.repo || '';
    const itemAnchor = `timeline-event:${item.id}`;
    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={itemAnchor}
        baseClass="prp-timeline-event"
      >
        {(className, focused) => (
          <div
            className={className}
            data-search-anchor={itemAnchor}
            data-timeline-event={item.event || ''}
            tabIndex={focused ? -1 : undefined}
          >
            <div className="prp-timeline-event__rail" aria-hidden="true">
              <span className="prp-timeline-event__rail-line" />
              <span className="prp-timeline-event__rail-avatar">
                <Avatar
                  login={item.author}
                  avatarUrl={item.avatarUrl}
                  size="sm"
                />
              </span>
            </div>
            <div className="prp-timeline-event__body">
              <span className="prp-timeline-event__narrative">
                {item.author ? (
                  <strong className="prp-timeline-event__actor">
                    <UserLink login={item.author} />
                  </strong>
                ) : (
                  <strong className="prp-timeline-event__actor">someone</strong>
                )}{' '}
                {renderTimelineEventParts(item.parts, owner, repo)}
              </span>
              {item.at ? (
                <span className="prp-muted prp-timeline-event__when">
                  {formatWhen(item.at)}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </ConversationKbFocusClassName>
    );
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

  function requestThreadCommentsOnExpand(item: any) {
    if (typeof onEnsureThreadComments !== 'function' || !item) return;
    const tid =
      item.threadNodeId ||
      item.root?.threadNodeId ||
      (String(item.id || '').startsWith('shell:')
        ? String(item.id).slice(6)
        : null);
    if (tid) void onEnsureThreadComments(tid);
  }

  function toggleThreadCollapse(item: any) {
    if (item?.id == null) return;
    const key = String(item.id);
    const currently = threadCollapseOverrides.has(key)
      ? Boolean(threadCollapseOverrides.get(key))
      : defaultThreadCollapsed(item);
    const nextCollapsed = !currently;
    setThreadCollapseOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, nextCollapsed);
      return next;
    });
    if (!nextCollapsed) requestThreadCommentsOnExpand(item);
  }

  /** Directed fold: set collapsed state only when it differs (←/→). */
  function setThreadCollapsed(item: any, wantCollapsed: boolean) {
    if (item?.id == null) return false;
    const key = String(item.id);
    const currently = threadCollapseOverrides.has(key)
      ? Boolean(threadCollapseOverrides.get(key))
      : defaultThreadCollapsed(item);
    if (currently === wantCollapsed) return false;
    setThreadCollapseOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, wantCollapsed);
      return next;
    });
    if (!wantCollapsed) requestThreadCommentsOnExpand(item);
    return true;
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
    const currently = groupThreadOpenOverrides.has(k)
      ? Boolean(groupThreadOpenOverrides.get(k))
      : defaultGroupThreadOpen(thread);
    const nextOpen = !currently;
    setGroupThreadOpenOverrides((prev) => {
      const next = new Map(prev);
      next.set(k, nextOpen);
      return next;
    });
    if (nextOpen) requestThreadCommentsOnExpand(thread);
  }

  /** Directed group-thread open (wantOpen=true expands; false collapses). */
  function setGroupThreadOpen(
    reviewId: any,
    thread: any,
    wantOpen: boolean
  ): boolean {
    if (thread?.id == null) return false;
    const k = groupThreadKey(reviewId, thread.id);
    const currently = groupThreadOpenOverrides.has(k)
      ? Boolean(groupThreadOpenOverrides.get(k))
      : defaultGroupThreadOpen(thread);
    if (currently === wantOpen) return false;
    setGroupThreadOpenOverrides((prev) => {
      const next = new Map(prev);
      next.set(k, wantOpen);
      return next;
    });
    if (wantOpen) requestThreadCommentsOnExpand(thread);
    return true;
  }

  /**
   * Find a timeline thread (standalone or inside a review-group) by root id.
   */
  function findTimelineThreadById(commentId: string): {
    thread: any;
    reviewGroupId: any | null;
  } | null {
    for (const item of timelineItems) {
      if (item?.kind === 'review-thread' || item?.kind === 'review-comment') {
        if (String(item.id) === commentId) {
          return { thread: item, reviewGroupId: null };
        }
      }
      if (item?.kind === 'review-group') {
        for (const t of item.threads || []) {
          if (String(t?.id) === commentId) {
            return { thread: t, reviewGroupId: item.id };
          }
        }
      }
    }
    return null;
  }

  /** Expand a focused thread unit (standalone or group path row). */
  function expandFocusedThread(commentId: string) {
    const found = findTimelineThreadById(commentId);
    if (!found?.thread) return;
    const { thread, reviewGroupId } = found;
    if (reviewGroupId != null) {
      const k = groupThreadKey(reviewGroupId, thread.id);
      setGroupThreadOpenOverrides((prev) => {
        const next = new Map(prev);
        next.set(k, true);
        return next;
      });
      return;
    }
    const key = String(thread.id);
    setThreadCollapseOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, false); // false = expanded
      return next;
    });
  }

  /**
   * Leaf-only side effects for keyboard focus (store subscribe).
   * Parent ConversationView does not re-render on ⌥J/K.
   */
  const onKbFocusThread = useCallback(
    (commentId: string) => {
      const found = findTimelineThreadById(commentId);
      if (!found?.thread) return;
      // Resolved / pending: header-only focus — do not expand
      if (found.thread.resolved || found.thread.pending) return;
      if (found.reviewGroupId == null) return;
      // Unresolved group path row: open so thread body is visible
      const k = groupThreadKey(found.reviewGroupId, found.thread.id);
      setGroupThreadOpenOverrides((prev) => {
        const open = prev.has(k)
          ? Boolean(prev.get(k))
          : defaultGroupThreadOpen(found.thread);
        if (open) return prev;
        const next = new Map(prev);
        next.set(k, true);
        return next;
      });
    },
    // findTimelineThreadById closes over timelineItems
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineItems]
  );

  /**
   * Context-thread shortcuts for Conversation (registered with App).
   * Unregister while Diff is active — keep-alive mount must not own handlers.
   */
  const layoutModeLive = useModalStore((s) => s.layoutMode);
  useEffect(() => {
    if (typeof onRegisterContextThreadActions !== 'function') return undefined;
    if (layoutModeLive === 'diff') {
      onRegisterContextThreadActions(null);
      return undefined;
    }

    function currentAnchor(): string {
      const st = useModalStore.getState();
      return String(
        st.focusedConversationAnchor || st.pendingConversationNavAnchor || ''
      ).trim();
    }

    function threadFromAnchor(anchor: string): {
      thread: any;
      reviewGroupId: any | null;
    } | null {
      if (!anchor.startsWith('review-comment:')) return null;
      const id = anchor.slice('review-comment:'.length);
      if (!id) return null;
      return findTimelineThreadById(id);
    }

    const applyDirectedFold = (wantCollapsed: boolean): boolean => {
      const a = currentAnchor();
      const found = threadFromAnchor(a);
      if (!found?.thread) return false;
      if (found.reviewGroupId != null) {
        // Group path rows: open = expanded (not collapsed)
        return setGroupThreadOpen(
          found.reviewGroupId,
          found.thread,
          !wantCollapsed
        );
      }
      return setThreadCollapsed(found.thread, wantCollapsed);
    };

    const api = {
      fold: () => {
        const a = currentAnchor();
        const found = threadFromAnchor(a);
        if (!found?.thread) return false;
        if (found.reviewGroupId != null) {
          toggleGroupThread(found.reviewGroupId, found.thread);
          return true;
        }
        toggleThreadCollapse(found.thread);
        return true;
      },
      foldCollapse: () => applyDirectedFold(true),
      foldExpand: () => applyDirectedFold(false),
      gotoDiff: () => {
        const a = currentAnchor();
        const found = threadFromAnchor(a);
        if (!found?.thread || typeof onJumpToReviewThread !== 'function') {
          return false;
        }
        const t = found.thread;
        if (!t.path) return false;
        onJumpToReviewThread({
          id: t.id,
          path: t.path,
          line: t.line,
          startLine: t.startLine ?? t.line,
          side: t.side || 'RIGHT',
          outdated: Boolean(t.outdated),
        });
        return true;
      },
      comment: () => {
        const a = currentAnchor();
        const found = threadFromAnchor(a);
        if (!found?.thread) return false;
        const t = found.thread;
        const draftKey = t.id;
        // Second stage: reply focused → submit Comment
        if (isContextThreadReplyFocused(a)) {
          const drafts = useModalStore.getState().replyDrafts || {};
          const body = String(
            (draftKey != null ? drafts[String(draftKey)] || '' : '') || ''
          ).trim();
          if (!body || typeof onReplyToThread !== 'function') return false;
          onReplyToThread(
            {
              id: draftKey,
              path: t.path,
              line: t.line,
              side: t.side || 'RIGHT',
              threadNodeId: t.threadNodeId || null,
              root: t,
            },
            { mode: 'comment' }
          );
          return true;
        }
        // First stage: expand if needed, then focus reply input
        expandFocusedThread(String(t.id));
        // Host may be group row — ensure open so InlineThread mounts
        if (found.reviewGroupId != null) {
          const k = groupThreadKey(found.reviewGroupId, t.id);
          setGroupThreadOpenOverrides((prev) => {
            const next = new Map(prev);
            next.set(k, true);
            return next;
          });
        }
        // If host exists but collapsed standalone, expand already queued
        if (!queryContextThreadHost(a)) {
          /* virtual list may mount after expand; still retry focus */
        }
        focusContextThreadReplyAfterPaint(a);
        return true;
      },
      resolve: () => {
        const a = currentAnchor();
        const found = threadFromAnchor(a);
        if (!found?.thread || typeof onResolveThread !== 'function') return false;
        const t = found.thread;
        const nodeId = t.threadNodeId || null;
        if (!nodeId) return false;
        if (t.pending) return false;
        onResolveThread(nodeId, !Boolean(t.resolved));
        return true;
      },
    };

    onRegisterContextThreadActions(api);
    return () => {
      onRegisterContextThreadActions(null);
    };
    // Closures use latest timeline / handlers; drafts read via getState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onRegisterContextThreadActions,
    layoutModeLive,
    timelineItems,
    threadCollapseOverrides,
    groupThreadOpenOverrides,
    onJumpToReviewThread,
    onReplyToThread,
    onResolveThread,
  ]);

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
          const threadAnchor =
            t?.id != null ? `review-comment:${t.id}` : '';
          const baseRowClass = `prp-review-group__row${
            open ? ' prp-review-group__row--open' : ''
          }${t.resolved ? ' prp-review-group__row--resolved' : ''}${
            t.pending ? ' prp-review-group__row--pending' : ''
          }`;
          return (
            <ConversationKbFocusHost
              key={String(t.id)}
              as="li"
              anchor={threadAnchor}
              className={baseRowClass}
              focusClassName="prp-review-group__row--kb-focus"
              data-thread-focus-anchor={threadAnchor || undefined}
              data-search-anchor={threadAnchor || undefined}
            >
              <div className="prp-review-group__row-head">
                <GroupThreadFoldBtn
                  anchor={threadAnchor}
                  open={open}
                  onToggle={() => toggleGroupThread(reviewId, t)}
                  fileLoc={fileLoc || ''}
                  path={t.path}
                  pendingBadge={
                    t.pending && !opts.compact ? (
                      <Badge tone="warn" className="prp-review-group__badge">
                        Pending
                      </Badge>
                    ) : null
                  }
                  outdatedBadge={
                    t.outdated ? (
                      <Badge tone="muted" className="prp-review-group__badge">
                        Outdated
                      </Badge>
                    ) : null
                  }
                  resolvedBadge={
                    t.resolved && !t.pending ? (
                      <Badge tone="ok" className="prp-review-group__badge">
                        Resolved
                      </Badge>
                    ) : null
                  }
                />
                {typeof onJumpToReviewThread === 'function' && t.path ? (
                  <GroupThreadJumpBtn
                    anchor={threadAnchor}
                    fileLoc={fileLoc || t.path}
                    onJump={() =>
                      onJumpToReviewThread({
                        id: t.id,
                        path: t.path,
                        line: t.line,
                        startLine: t.startLine ?? t.line,
                        side: t.side || 'RIGHT',
                        outdated: Boolean(t.outdated),
                      })
                    }
                  />
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
            </ConversationKbFocusHost>
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
    const baseClass = searchCardClass(
      groupAnchor,
      'prp-card--timeline prp-card--timeline-review-group'
    );

    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.key || item.id)}`}
        anchor={groupAnchor}
        baseClass={baseClass}
      >
        {(className, focused) => (
          <Card
            className={className}
            data-search-anchor={groupAnchor}
            tabIndex={focused ? -1 : undefined}
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
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderTimelineItemCard(item: any, keyPrefix = '') {
    const isIssue = item.kind === 'issue-comment';
    const isReviewThread =
      item.kind === 'review-thread' || item.kind === 'review-comment';
    const isReviewGroup = item.kind === 'review-group';
    const isReviewEvent = item.kind === 'review';
    const isTimelineEvent = item.kind === 'timeline-event';
    const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;

    if (isTimelineEvent) {
      return renderTimelineEventRow(item, keyPrefix);
    }
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
    const baseClass = searchCardClass(
      itemAnchor,
      `prp-card--timeline prp-card--timeline-${item.kind || 'item'}`
    );
    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={itemAnchor}
        baseClass={baseClass}
      >
        {(className, focused) => (
          <Card
            className={className}
            data-search-anchor={itemAnchor}
            tabIndex={focused ? -1 : undefined}
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
        )}
      </ConversationKbFocusClassName>
    );
  }

  /**
   * Classic dual-window fold: "N hidden items · Load more… · Load all"
   * (same chrome for mid-list dual-window and end-of-list single window).
   */
  function renderThreadGap(hiddenCount: number) {
    return (
      <ThreadGapBanner
        hiddenCount={hiddenCount}
        actionBusy={actionBusy}
        onLoadMore={onLoadMoreReviewThreads}
      />
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
    const loadingTid =
      item.threadNodeId ||
      (item.id != null && String(item.id).startsWith('shell:')
        ? String(item.id).slice(6)
        : item.id);
    const commentsLoading = Boolean(
      typeof isThreadCommentsLoading === 'function' &&
        isThreadCommentsLoading(loadingTid || item.id)
    );

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
      nodeId: item.nodeId || null,
      reactions: Array.isArray(item.reactions) ? item.reactions : [],
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
        nodeId: item.nodeId || null,
        reactions: Array.isArray(item.reactions) ? item.reactions : [],
      },
      replies: reviewReplies,
      threadNodeId: item.threadNodeId || null,
      resolved: Boolean(item.resolved),
      outdated: Boolean(item.outdated),
      pending: Boolean(item.pending),
    };

    const threadBaseClass = `prp-card prp-card--timeline prp-card--timeline-review-thread prp-conversation-inline-thread${
      collapsed ? ' prp-card--timeline-review-thread--collapsed' : ''
    }${threadHit ? ' prp-card--search-match' : ''}${
      threadCurrent ? ' prp-card--search-current' : ''
    }`;

    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={rootAnchor}
        baseClass={threadBaseClass}
      >
        {(className, focused) => (
      <div
        className={className}
        data-search-anchor={rootAnchor}
        data-thread-focus-anchor={rootAnchor}
        tabIndex={focused ? -1 : undefined}
      >
        {showOuterHeader ? (
          <div className="prp-conversation-thread-header">
            <button
              type="button"
              className={`prp-conversation-thread-header__toggle${
                focused ? ' prp-opt-hint-host' : ''
              }`}
              onClick={() => toggleThreadCollapse(item)}
              aria-expanded={!collapsed}
              title={
                focused
                  ? collapsed
                    ? 'Expand thread (⌥F)'
                    : 'Collapse thread (⌥F)'
                  : collapsed
                    ? 'Expand thread'
                    : 'Collapse thread'
              }
              aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
            >
              {focused ? (
                <OptBtnHint label="⌥F" preferredPlacement="top" />
              ) : null}
              <span className="prp-conversation-thread-header__chev" aria-hidden="true">
                <IconDisclosure open={!collapsed} size={16} />
              </span>
              <span
                className="prp-mono prp-conversation-thread-header__path"
                title={fileLoc || item.path || ''}
              >
                {fileLoc || item.path || 'thread'}
              </span>
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
                className={`prp-icon-btn prp-conversation-thread-header__jump${
                  focused ? ' prp-opt-hint-host' : ''
                }`}
                title={
                  focused
                    ? `View in Diff · ${fileLoc || item.path} (⌥D)`
                    : `View in Diff · ${fileLoc || item.path}`
                }
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
                {focused ? (
                  <OptBtnHint label="⌥D" preferredPlacement="top" />
                ) : null}
                <IconFileDiff size={16} />
              </button>
            ) : null}
          </div>
        ) : null}
        <InlineThread
          className="prp-inline-thread--conversation"
          row={row}
          thread={thread}
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
          onToggleReaction={onToggleReaction}
          onLoadReactors={onLoadReactors}
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
          commentsLoading={commentsLoading}
        />
      </div>
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderDescriptionCard() {
    const baseClass = searchCardClass('body', 'prp-card--desc');
    return (
      <ConversationKbFocusClassName
        anchor="body"
        baseClass={baseClass}
      >
        {(className) => (
          <DescriptionCard
            detail={detail}
            sectionLoading={sectionLoading}
            editingBody={editingBody}
            actionBusy={actionBusy}
            searchClassName={className}
            onStartEditBody={onStartEditBody}
            onCancelEditBody={onCancelEditBody}
            onSaveBody={onSaveBody}
            onRegisterEditorSave={onRegisterEditorSave}
            onUploadFile={onUploadFile}
            linkCtx={linkCtx}
            mentionCandidates={mentionCandidates}
            onToggleReaction={onToggleReaction}
            onLoadReactors={onLoadReactors}
            renderBody={(body, anchor, mark) =>
              renderSearchableBody(body, anchor, mark)
            }
          />
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderMergeBox() {
    return (
      <ConversationKbFocusClassName
        anchor="merge"
        baseClass="prp-merge-box-focus-host"
      >
        {(className, focused) => (
          <div
            className={`${className}${focused ? ' prp-merge-box-focus-host--focused' : ''}`.trim()}
            data-search-anchor="merge"
            tabIndex={focused ? -1 : undefined}
          >
            <MergeBox
              detail={detail}
              ms={ms}
              boxTone={boxTone}
              actionBusy={actionBusy}
              onMergePr={onMergePr}
              onUpdateBranch={onUpdateBranch}
              onDeleteHeadBranch={onDeleteHeadBranch}
              onSetDraftStage={onSetDraftStage}
            />
          </div>
        )}
      </ConversationKbFocusClassName>
    );
  }

  /** Category tip chips — placed as a virtual row between merge and timeline. */
  function renderTimelineTips() {
    return (
      <div
        className="prp-timeline-tips"
        role="toolbar"
        aria-label="Timeline event filters"
        data-prp-timeline-tips="1"
      >
        {TIMELINE_TIP_IDS.map((tipId) => {
          const selected =
            tipId === 'all'
              ? allTipOn
              : timelineVisibilityNorm[
                  tipId as keyof typeof timelineVisibilityNorm
                ] !== false;
          const label = TIMELINE_TIP_LABELS[tipId] || tipId;
          return (
            <button
              key={tipId}
              type="button"
              className={`prp-timeline-tips__chip${
                selected ? ' is-selected' : ''
              }`}
              data-prp-timeline-tip={tipId}
              data-selected={selected ? '1' : '0'}
              aria-pressed={selected}
              title={
                tipId === 'all'
                  ? 'Show all timeline categories'
                  : selected
                    ? `Hide ${label} from the timeline`
                    : `Show ${label} on the timeline`
              }
              onClick={() => onTipClick(tipId)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderComposerCard() {
    return (
      <ConversationKbFocusClassName
        anchor="composer"
        baseClass="prp-composer-focus-host"
      >
        {(className, focused) => (
          <div
            className={`${className}${focused ? ' prp-composer-focus-host--focused' : ''}`.trim()}
            data-search-anchor="composer"
            tabIndex={focused ? -1 : undefined}
          >
            <ComposerCard
              composerMode={composerMode}
              setComposerMode={setComposerMode}
              pendingCount={Number(pendingCount) || 0}
              pendingReviewGroup={pendingReviewGroup}
              commentText={commentText}
              setCommentText={setCommentText}
              actionBusy={actionBusy}
              detail={detail}
              commentBoxRef={commentBoxRef}
              onUploadFile={onUploadFile}
              linkCtx={linkCtx}
              mentionCandidates={mentionCandidates}
              onLeaveReviewAction={onLeaveReviewAction}
              onDiscardPending={onDiscardPending}
              onClosePr={onClosePr}
              onReopenPr={onReopenPr}
              showReviewVerdict={showReviewVerdict}
              renderSearchableBody={(body, anchor, mark) =>
                renderSearchableBody(body, anchor, mark)
              }
              renderPendingThreadList={renderReviewGroupThreadList}
            />
          </div>
        )}
      </ConversationKbFocusClassName>
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
      case 'timeline-tips':
        return renderTimelineTips();
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

  const isFocusedThreadCollapsed = useCallback(
    (commentId: string) => {
      const found = findTimelineThreadById(commentId);
      if (!found?.thread) return false;
      if (found.reviewGroupId != null) {
        return !isGroupThreadOpen(found.reviewGroupId, found.thread);
      }
      return isReviewThreadCollapsed(found.thread);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineItems, groupThreadOpenOverrides, threadCollapseOverrides]
  );

  return (
    <div
      ref={convRootRef}
      className={`prp-conversation${asideCollapsed ? ' prp-conversation--aside-collapsed' : ''}${
        embedScrollChain ? ' prp-conversation--embed-scroll' : ''
      }`}
      style={
        {
          ['--prp-aside-w' as string]: `${conversationAsideWidthPx(asideCollapsed)}px`,
        } as React.CSSProperties
      }
      data-aside-collapsed={asideCollapsed ? '1' : '0'}
      data-embed-scroll={embedScrollChain ? '1' : undefined}
    >
      {/* Leaf store subscribers — do not re-render this tree on ⌥J/K or Opt-hold */}
      <ConversationKbFocusScroller onFocusThread={onKbFocusThread} />
      <ConversationKbEnterExpand
        onExpand={expandFocusedThread}
        isCollapsed={isFocusedThreadCollapsed}
      />
      <div className="prp-conversation__main">
        {sectionLoading && !detail ? (
          <LoadingSkeleton variant="conversation" />
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
            // Bust memo when tip visibility changes so chips + filtered rows repaint
            timelineVisibilityKey={JSON.stringify(timelineVisibilityNorm)}
            // Search hit scroll; keyboard focus uses store pendingNav in VCL
            scrollToAnchor={activeAnchor}
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
          className="prp-aside-collapse-btn prp-has-tip prp-opt-hint-host"
          onClick={onToggleAside}
          aria-label={
            asideCollapsed ? 'Expand metadata panel' : 'Collapse metadata panel'
          }
          aria-expanded={!asideCollapsed}
        >
          <OptBtnHint label={sidePanelKbd}
            preferredPlacement="bottom"
          />
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
            shortcut={sidePanelKbd}
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
          <AsideCompactRail detail={detail} tags={prTags} />
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
          
          addShortcut="⌥⇧R"
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
          
          addShortcut="⌥⇧A"
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
              className="prp-add-link prp-opt-hint-host"
              disabled={actionBusy}
              onClick={onAddLabel}
              ref={labelAddRef}
              title="Add label… (⌥⇧L)"
            >
              <OptBtnHint label="⌥⇧L"
                preferredPlacement="right"
              />
              Add label…
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title="Projects">
          {(detail.projects || []).length ? (
            <ul className="prp-list prp-aside-projects">
              {(detail.projects || []).map((p: any) => {
                const title = String(p?.title || '').trim() || 'Project';
                const href = String(p?.url || '').trim();
                const num = p?.number != null ? Number(p.number) : null;
                return (
                  <li key={String(p?.id || title)} className="prp-aside-projects__item">
                    {href ? (
                      <a
                        className="prp-entity-link"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        title={title}
                      >
                        {title}
                      </a>
                    ) : (
                      <span title={title}>{title}</span>
                    )}
                    {Number.isFinite(num) ? (
                      <span className="prp-muted prp-aside-projects__num">
                        #{num}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="prp-muted">None yet</span>
          )}
        </AsideSection>
        <AsideSection title="Milestone">
          <div className="prp-label-row prp-milestone">
            {!detail.milestone ? (
              <span className="prp-muted prp-milestone__empty">No milestone</span>
            ) : (
              <span className="prp-label-chip prp-milestone-chip">
                <span
                  className="prp-milestone-chip__title"
                  title={`#${detail.milestone.number}`}
                >
                  {detail.milestone.title ||
                    `Milestone #${detail.milestone.number}`}
                </span>
                <span className="prp-muted prp-milestone-chip__num">
                  #{detail.milestone.number}
                </span>
                {canEditMeta && onClearMilestone ? (
                  <button
                    type="button"
                    className="prp-label-chip__remove"
                    disabled={actionBusy}
                    title="Clear milestone"
                    aria-label="Clear milestone"
                    onClick={onClearMilestone}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            )}
          </div>
          {canEditMeta && (onOpenMilestonePicker || onSetMilestone) ? (
            <button
              type="button"
              className="prp-add-link prp-opt-hint-host"
              disabled={actionBusy}
              onClick={() =>
                onOpenMilestonePicker
                  ? onOpenMilestonePicker()
                  : onSetMilestone?.(false)
              }
              ref={milestoneAddRef}
              title={`${detail.milestone ? 'Change' : 'Set'} milestone… (⌥⇧P)`}
            >
              <OptBtnHint label="⌥⇧P"
                preferredPlacement="right"
              />
              {detail.milestone ? 'Change milestone…' : 'Set milestone…'}
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title="Development" loading={pendingDevelopment}>
          {(() => {
            const dev =
              Array.isArray(detail.developmentIssues) &&
              detail.developmentIssues.length
                ? detail.developmentIssues
                : (detail.linkedIssues || []).map((n: number) => ({
                    number: n,
                    title: '',
                    url: `https://github.com/${detail.owner}/${detail.repo}/issues/${n}`,
                    state: '',
                  }));
            if (!dev.length) {
              return pendingDevelopment ? null : (
                <span className="prp-muted">None yet</span>
              );
            }
            return (
              <>
                <p className="prp-muted prp-aside-dev__hint">
                  Successfully merging this pull request may close these issues.
                </p>
                <ul className="prp-aside-dev prp-aside-dev--badges" role="list">
                  {dev.map((item: any) => {
                    const num = Number(item?.number);
                    if (!Number.isFinite(num) || num <= 0) return null;
                    const title = String(item?.title || '').trim();
                    const href =
                      String(item?.url || '').trim() ||
                      `https://github.com/${detail.owner}/${detail.repo}/issues/${num}`;
                    const state = String(item?.state || '').toLowerCase();
                    const tone =
                      state === 'open'
                        ? 'open'
                        : state === 'closed'
                          ? 'muted'
                          : 'muted';
                    const label = title ? `#${num} ${title}` : `#${num}`;
                    const openMode =
                      typeof resolveDevelopmentMainOpen === 'function'
                        ? resolveDevelopmentMainOpen(item, {
                            owner: detail.owner,
                            repo: detail.repo,
                            knownPullNumbers: Array.isArray(knownPullNumbers)
                              ? knownPullNumbers
                              : [],
                          })
                        : { mode: 'navigate', number: num, href };
                    const canInModal =
                      openMode.mode === 'inModal' &&
                      typeof onOpenLinkedPr === 'function';
                    return (
                      <li key={num} className="prp-aside-dev__badge-item">
                        <div
                          className={`prp-aside-dev__badge prp-aside-dev__badge--${tone}`}
                        >
                          <a
                            className="prp-aside-dev__badge-main"
                            href={openMode.href || href}
                            title={
                              canInModal
                                ? `${label} · open in this view`
                                : label
                            }
                            onClick={(e) => {
                              if (!canInModal) return; // same-tab page navigate
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenLinkedPr(Number(openMode.number || num));
                            }}
                          >
                            <span className="prp-aside-dev__badge-num">
                              #{num}
                            </span>
                            {title ? (
                              <span className="prp-aside-dev__badge-title">
                                {title}
                              </span>
                            ) : null}
                          </a>
                          <a
                            className="prp-aside-dev__badge-ext"
                            href={openMode.href || href}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in new tab"
                            aria-label={`Open #${num} in new tab`}
                          >
                            <IconLinkExternal
                              size={12}
                              className="prp-aside-dev__badge-ext-icon"
                              aria-hidden="true"
                            />
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}
        </AsideSection>
        {showChecks || pendingChecks ? (
          <AsideSection title="Checks" loading={pendingChecks && !showChecks}>
            {showChecks ? <ChecksPanel checks={detail.checks} /> : null}
          </AsideSection>
        ) : null}
        <AsideSection
          title={`Tags${
            Array.isArray(prTags) && prTags.length ? ` (${prTags.length})` : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            Boolean(prTagsLoading) && !(Array.isArray(prTags) && prTags.length)
          }
          onFirstOpen={() => {
            if (typeof onEnsurePrTags === 'function') void onEnsurePrTags();
          }}
        >
          <AsideTagsList
            tags={prTags || []}
            owner={detail.owner}
            repo={detail.repo}
            loading={prTagsLoading}
            error={prTagsError}
          />
        </AsideSection>
        <AsideSection
          title={`Commits${
            detail.commitsCount != null
              ? ` (${detail.commitsCount})`
              : detail.commits?.length
                ? ` (${detail.commits.length})`
                : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            (pendingCommits || commitsLoading) &&
            !(Array.isArray(detail.commits) && detail.commits.length)
          }
          onFirstOpen={() => {
            if (typeof onEnsureAllCommits === 'function') {
              void onEnsureAllCommits();
            }
          }}
        >
          <AsideCommitsTimeline
            commits={detail.commits || []}
            owner={detail.owner}
            repo={detail.repo}
            mayHaveMore={mayHaveMoreCommits(detail)}
            loadingMore={commitsLoading}
            onEnsureAll={onEnsureAllCommits}
          />
        </AsideSection>
        <AsideSection
          title={`Files${
            detail.changedFiles != null
              ? ` (${detail.changedFiles})`
              : detail.files?.length
                ? ` (${detail.files.length})`
                : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            (pendingFiles || filesLoading) &&
            !(Array.isArray(detail.files) && detail.files.length)
          }
          onFirstOpen={() => {
            if (typeof onEnsureAllFiles === 'function') {
              void onEnsureAllFiles();
            }
          }}
        >
          <AsideFilesTree
            files={detail.files || []}
            mayHaveMore={mayHaveMoreFiles(detail)}
            loadingMore={filesLoading}
            onEnsureAll={onEnsureAllFiles}
          />
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
