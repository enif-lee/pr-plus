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
  IconCopy,
  IconDisclosure,
  IconEye,
  IconEyeClosed,
  IconFileDiff,
  IconLink,
  IconLinkExternal,
  IconPencil,
  IconQuote,
  IconSync,
  IconTrash,
} from '@common/icons';
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
  hideReasonLabel,
  insertQuoteIntoDraft,
  isCommentMinimized,
  quoteReplyMarkdown,
  stampQuoteReplyResult,
  viewerCanMinimizeComment,
} from '@lib/comment-quote-hide';
import {
  GroupThreadFoldBtn,
  GroupThreadJumpBtn,
} from './GroupThreadControls';
import { ThreadGapBanner } from './ThreadGapBanner';
import { createCommentChrome } from './comment-chrome';
import { MergeBox } from './MergeBox';
import { DescriptionCard } from './DescriptionCard';
import { ComposerCard } from './ComposerCard';
import { useT } from '@lib/locale-context';
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
  shouldAcceptTimelineVisibilityFromHost,
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
import { CommentActionIconBtn } from '@common/CommentActionIconBtn';
import { useModalStore } from '../../store/modal-store';
import { useSearchGroup } from '../../store/data-groups';
import { useDomainDetail } from '../../app/domain-detail-context';
import {
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
  queryContextThreadHost,
} from '@lib/context-thread-dom';
import { CONTEXT_COMMENT_ACTION_SHORTCUT } from '@lib/shortcut-policy';
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
  const t = useT();
  // Leaf: composer text — typing must not re-render PrModalApp.
  const storeCommentText = useModalStore((s) => s.commentText);
  const storeSetCommentText = useModalStore((s) => s.setCommentText);
  const searchGroup = useSearchGroup();
  /** Local expand of still-minimized comments (Show comment without unhide). */
  const [expandedMinimized, setExpandedMinimized] = useState<
    Record<string, boolean>
  >({});
  const domainDetail = useDomainDetail();
  const {
    detail: detailFromProps,
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
    onHideComment = null,
    onUnhideComment = null,
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
    hasViewerPendingReview = false,
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
    /**
     * Unified Conversation load-more: one page (or 'all') of remaining
     * reviewThreads and/or timelineItems. Diff completeness uses
     * 'threads-all' (threads only).
     */
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
    /** GraphQL timelineItems page meta (comments + system events). */
    timelineMeta = null,
    searchQuery: searchQueryProp = '',
    searchHits: searchHitsProp = null,
    searchHitIndex: searchHitIndexProp = -1,
    activeSearchHit = null,
    mentionCandidates = [],
  } = props;
  const searchQuery = searchQueryProp || searchGroup.searchQuery;
  const searchHits = searchHitsProp ?? searchGroup.searchHits;
  const searchHitIndex =
    searchHitIndexProp >= 0 ? searchHitIndexProp : searchGroup.searchHitIndex;

  // DomainContext first; props still accepted for host-annotated detail overlays.
  const detail = detailFromProps ?? domainDetail;
  const domainPendingCount = useMemo(() => {
    const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
    return list.filter((c: any) => c && c.pending).length;
  }, [detail?.reviewComments]);
  const resolvedPendingCount =
    pendingCount != null ? pendingCount : domainPendingCount;
  const resolvedHasViewerPending =
    hasViewerPendingReview ||
    Boolean(detail?.viewerPendingReview?.id) ||
    domainPendingCount > 0;

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
    Number(resolvedPendingCount) > 0 ? 'review' : 'comment'
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
    if (Number(resolvedPendingCount) > 0) setComposerMode('review');
  }, [resolvedPendingCount]);

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
    // hooks: deps are intentional for this host/session subscription
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
  // remain source of truth. While a tip click is pending, lagging storage
  // round-trips must not clobber hide/re-enable until host matches last emit
  // (or the optimistic lock TTL expires).
  const [localTimelineVis, setLocalTimelineVis] = useState(() =>
    normalizeTimelineVisibility(timelineVisibility)
  );
  const lastEmittedVisRef = useRef<string>(
    JSON.stringify(normalizeTimelineVisibility(timelineVisibility))
  );
  const pendingTimelineVisEmitRef = useRef(false);
  const ignoreHostUntilMsRef = useRef(0);
  useEffect(() => {
    const incoming = normalizeTimelineVisibility(timelineVisibility);
    const incomingJson = JSON.stringify(incoming);
    let lastEmitted: unknown = null;
    try {
      lastEmitted = JSON.parse(lastEmittedVisRef.current || '{}');
    } catch {
      lastEmitted = null;
    }
    const decision =
      typeof shouldAcceptTimelineVisibilityFromHost === 'function'
        ? shouldAcceptTimelineVisibilityFromHost({
            incoming,
            lastEmitted,
            pendingEmit: pendingTimelineVisEmitRef.current,
            nowMs: Date.now(),
            ignoreHostUntilMs: ignoreHostUntilMsRef.current,
          })
        : {
            accept:
              !pendingTimelineVisEmitRef.current ||
              incomingJson === lastEmittedVisRef.current,
            clearPending: true,
          };
    if (!decision.accept) return;
    if (decision.clearPending) pendingTimelineVisEmitRef.current = false;
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
    pendingTimelineVisEmitRef.current = true;
    // Hold optimistic local map long enough for storage lag + e2e waits.
    ignoreHostUntilMsRef.current = Date.now() + 2000;
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

  /**
   * Unified fold: end gap while threads incomplete; middle gap when threads
   * are complete but timelineItems still has older pages (Diff full-load case).
   */
  const threadGap: any = useMemo(() => {
    // Prefer explicit timelineMeta; fall back to commentsMeta (host settles both
    // on the comments side-fetch — cold open can lag timelineMeta projection).
    const cm =
      detail?.commentsMeta && typeof detail.commentsMeta === 'object'
        ? detail.commentsMeta
        : null;
    const tl =
      timelineMeta && typeof timelineMeta === 'object'
        ? timelineMeta
        : cm
          ? {
              hasMore: Boolean(cm.hasMore),
              complete: cm.hasMore === false,
              totalCount: cm.totalCount,
              loadedCount:
                cm.loadedCount != null
                  ? cm.loadedCount
                  : Array.isArray(detail?.comments)
                    ? detail.comments.length
                    : 0,
            }
          : null;
    if (typeof partitionTimelineWithThreadGap !== 'function') {
      const tlTotal = Number(tl?.totalCount);
      const tlLoaded = Number(tl?.loadedCount);
      const tlCountLag =
        Number.isFinite(tlTotal) &&
        Number.isFinite(tlLoaded) &&
        tlTotal > tlLoaded;
      const hasMore =
        Boolean(reviewThreadsMeta?.hasMore) ||
        Boolean(reviewThreadsMeta?.hasOlder) ||
        Boolean(tl?.hasMore) ||
        tl?.complete === false ||
        tlCountLag ||
        Boolean(cm?.hasMore);
      return {
        top: timelineItems,
        bottom: [] as any[],
        hiddenCount: 0,
        showGap: hasMore,
        gapPlacement: hasMore ? 'end' : 'none',
      };
    }
    return partitionTimelineWithThreadGap(
      timelineItems,
      reviewThreadsMeta,
      tl
    );
  }, [
    timelineItems,
    reviewThreadsMeta,
    timelineMeta,
    detail?.commentsMeta,
    detail?.comments,
  ]);

  // Search jump is handled inside VirtualConversationList (scrollToAnchor).
  // Load more / Load all: single handle for threads + timelineItems.

  const paged: any = useMemo(() => {
    const hidden = Math.max(0, Number(threadGap.hiddenCount) || 0);
    const showGap = Boolean(threadGap.showGap);
    return {
      items: Array.isArray(threadGap.top) ? threadGap.top : timelineItems,
      bottomItems: Array.isArray(threadGap.bottom) ? threadGap.bottom : [],
      total: timelineItems.length,
      showThreadGap: showGap,
      hiddenCount: hidden,
      gapPlacement: threadGap.gapPlacement || 'end',
    };
  }, [timelineItems, threadGap]);

  // E2E / host observability: Load-more fold state (TLM.1)
  useEffect(() => {
    try {
      if (typeof document === 'undefined') return;
      const tm = timelineMeta || detail?.timelineMeta || null;
      const cm = detail?.commentsMeta || null;
      const stamp = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.setAttribute(
          'data-prp-conv-show-gap',
          paged?.showThreadGap ? '1' : '0'
        );
        el.setAttribute(
          'data-prp-conv-gap-place',
          String(paged?.gapPlacement || 'none')
        );
        el.setAttribute(
          'data-prp-conv-tl-has-more',
          tm?.hasMore ? '1' : tm?.complete === false ? 'partial' : '0'
        );
        el.setAttribute(
          'data-prp-conv-tl-loaded',
          String(tm?.loadedCount ?? cm?.loadedCount ?? '')
        );
        el.setAttribute(
          'data-prp-conv-tl-total',
          String(tm?.totalCount ?? cm?.totalCount ?? '')
        );
        el.setAttribute(
          'data-prp-conv-load-more-fn',
          typeof onLoadMoreReviewThreads === 'function' ? '1' : '0'
        );
        el.setAttribute(
          'data-prp-conv-timeline-n',
          String(Array.isArray(timelineItems) ? timelineItems.length : 0)
        );
      };
      stamp('prp-page-embed');
      stamp('prp-modal-host');
    } catch {
      /* ignore */
    }
  }, [
    paged?.showThreadGap,
    paged?.gapPlacement,
    timelineMeta,
    detail?.timelineMeta,
    detail?.commentsMeta,
    onLoadMoreReviewThreads,
    timelineItems,
  ]);

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
    number: detail.number,
    htmlUrl: detail.htmlUrl || detail.html_url || null,
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

  function renderTimelineBody(
    item: any,
    kind: string,
    anchorId?: string,
    focused = false
  ) {
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
            showShortcutHint={focused}
            reactionShortcut={CONTEXT_COMMENT_ACTION_SHORTCUT.react.labelMac}
          />
        </>
      );
    }
    return body;
  }

  const {
    commentActions,
    copyCommentBody,
    copyCommentLink,
    quoteReplyToMainComposer,
  } = createCommentChrome({
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
  });

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

  /** Stable GraphQL thread node id (PRRT_…) when present. */
  function threadNodeIdOf(item: any): string | null {
    if (!item) return null;
    const raw =
      item.threadNodeId ||
      item.root?.threadNodeId ||
      (String(item.id || '').startsWith('shell:')
        ? String(item.id).slice(6)
        : null);
    const tid = raw != null ? String(raw).trim() : '';
    if (tid && /^PRRT_/i.test(tid)) return tid;
    return null;
  }

  /**
   * Collapse map key: prefer PRRT so shell:… → numeric id hydrate after
   * lazy comments load does not drop expand state (resolved would re-collapse).
   * Mirrors Diff `collapseKeyForThread`.
   */
  function conversationCollapseKey(item: any): string {
    const tid = threadNodeIdOf(item);
    if (tid) return tid;
    return String(item?.id ?? '');
  }

  function lookupCollapseOverride(item: any): boolean | undefined {
    const key = conversationCollapseKey(item);
    if (key && threadCollapseOverrides.has(key)) {
      return Boolean(threadCollapseOverrides.get(key));
    }
    const legacy = String(item?.id ?? '');
    if (legacy && threadCollapseOverrides.has(legacy)) {
      return Boolean(threadCollapseOverrides.get(legacy));
    }
    const tid = threadNodeIdOf(item);
    if (tid) {
      const shell = `shell:${tid}`;
      if (threadCollapseOverrides.has(shell)) {
        return Boolean(threadCollapseOverrides.get(shell));
      }
    }
    return undefined;
  }

  function writeCollapseOverride(
    item: any,
    collapsed: boolean,
    prev: Map<string, boolean>
  ): Map<string, boolean> {
    const next = new Map(prev);
    const key = conversationCollapseKey(item);
    if (key) next.set(key, collapsed);
    const legacy = String(item?.id ?? '');
    if (legacy && legacy !== key) next.set(legacy, collapsed);
    const tid = threadNodeIdOf(item);
    if (tid) {
      const shell = `shell:${tid}`;
      if (shell !== legacy && shell !== key) next.set(shell, collapsed);
    }
    return next;
  }

  function isReviewThreadCollapsed(item: any) {
    // Shared PRRT expand map (also written by group toggles) so shell→full
    // hydrate that moves a thread into a review-group keeps expand state.
    const o = lookupCollapseOverride(item);
    if (o !== undefined) return o;
    return defaultThreadCollapsed(item);
  }

  function requestThreadCommentsOnExpand(item: any) {
    if (typeof onEnsureThreadComments !== 'function' || !item) return;
    const tid = threadNodeIdOf(item);
    if (tid) void onEnsureThreadComments(tid);
  }

  function toggleThreadCollapse(item: any) {
    if (item?.id == null && !threadNodeIdOf(item)) return;
    const currently = isReviewThreadCollapsed(item);
    const nextCollapsed = !currently;
    setThreadCollapseOverrides((prev) =>
      writeCollapseOverride(item, nextCollapsed, prev)
    );
    // Mirror into group map so if hydrate moves thread under a review-group,
    // isGroupThreadOpen still sees the user intent.
    if (item?.reviewId != null) {
      const nextOpen = !nextCollapsed;
      setGroupThreadOpenOverrides((prev) => {
        const next = new Map(prev);
        const k = groupThreadKey(item.reviewId, item);
        next.set(k, nextOpen);
        const legacy = groupThreadKey(item.reviewId, item?.id);
        if (legacy !== k) next.set(legacy, nextOpen);
        return next;
      });
    }
    if (!nextCollapsed) requestThreadCommentsOnExpand(item);
  }

  /** Directed fold: set collapsed state only when it differs (←/→). */
  function setThreadCollapsed(item: any, wantCollapsed: boolean) {
    if (item?.id == null && !threadNodeIdOf(item)) return false;
    const currently = isReviewThreadCollapsed(item);
    if (currently === wantCollapsed) return false;
    setThreadCollapseOverrides((prev) =>
      writeCollapseOverride(item, wantCollapsed, prev)
    );
    if (item?.reviewId != null) {
      const nextOpen = !wantCollapsed;
      setGroupThreadOpenOverrides((prev) => {
        const next = new Map(prev);
        const k = groupThreadKey(item.reviewId, item);
        next.set(k, nextOpen);
        const legacy = groupThreadKey(item.reviewId, item?.id);
        if (legacy !== k) next.set(legacy, nextOpen);
        return next;
      });
    }
    if (!wantCollapsed) requestThreadCommentsOnExpand(item);
    return true;
  }

  /**
   * Group path-row key: prefer PRRT so shell→numeric hydrate keeps open state.
   * @param reviewId
   * @param thread thread item or raw id (legacy callers)
   */
  function groupThreadKey(reviewId: any, thread: any) {
    if (thread != null && typeof thread === 'object') {
      const tid = threadNodeIdOf(thread) || String(thread.id ?? '');
      return `${reviewId}:${tid}`;
    }
    return `${reviewId}:${thread}`;
  }

  /**
   * Default open state for path rows inside a review-group:
   * - pending (unsubmitted) → closed
   * - resolved → closed
   * - otherwise unresolved → open
   * User toggles win via groupThreadOpenOverrides / shared PRRT collapse map.
   */
  function defaultGroupThreadOpen(thread: any) {
    if (thread?.pending) return false;
    return !Boolean(thread?.resolved);
  }

  function isGroupThreadOpen(reviewId: any, thread: any) {
    // Prefer shared collapse override (standalone expand survives regroup).
    const collapseO = lookupCollapseOverride(thread);
    if (collapseO !== undefined) return !collapseO;

    const k = groupThreadKey(reviewId, thread);
    if (groupThreadOpenOverrides.has(k)) {
      return Boolean(groupThreadOpenOverrides.get(k));
    }
    // Legacy key with raw comment id during shell→numeric hydrate
    const legacy = groupThreadKey(reviewId, thread?.id);
    if (legacy !== k && groupThreadOpenOverrides.has(legacy)) {
      return Boolean(groupThreadOpenOverrides.get(legacy));
    }
    return defaultGroupThreadOpen(thread);
  }

  function toggleGroupThread(reviewId: any, thread: any) {
    const k = groupThreadKey(reviewId, thread);
    const currently = isGroupThreadOpen(reviewId, thread);
    const nextOpen = !currently;
    // Shared PRRT map is source of truth across standalone ↔ group morphs.
    setThreadCollapseOverrides((prev) =>
      writeCollapseOverride(thread, !nextOpen, prev)
    );
    setGroupThreadOpenOverrides((prev) => {
      const next = new Map(prev);
      next.set(k, nextOpen);
      const legacy = groupThreadKey(reviewId, thread?.id);
      if (legacy !== k) next.set(legacy, nextOpen);
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
    if (thread?.id == null && !threadNodeIdOf(thread)) return false;
    const currently = isGroupThreadOpen(reviewId, thread);
    if (currently === wantOpen) return false;
    setThreadCollapseOverrides((prev) =>
      writeCollapseOverride(thread, !wantOpen, prev)
    );
    setGroupThreadOpenOverrides((prev) => {
      const next = new Map(prev);
      const k = groupThreadKey(reviewId, thread);
      next.set(k, wantOpen);
      const legacy = groupThreadKey(reviewId, thread?.id);
      if (legacy !== k) next.set(legacy, wantOpen);
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
      const k = groupThreadKey(reviewGroupId, thread);
      setGroupThreadOpenOverrides((prev) => {
        const next = new Map(prev);
        next.set(k, true);
        const legacy = groupThreadKey(reviewGroupId, thread.id);
        if (legacy !== k) next.set(legacy, true);
        return next;
      });
      requestThreadCommentsOnExpand(thread);
      return;
    }
    setThreadCollapseOverrides((prev) =>
      writeCollapseOverride(thread, false, prev)
    );
    requestThreadCommentsOnExpand(thread);
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
      const k = groupThreadKey(found.reviewGroupId, found.thread);
      const legacy = groupThreadKey(found.reviewGroupId, found.thread.id);
      setGroupThreadOpenOverrides((prev) => {
        const open = prev.has(k)
          ? Boolean(prev.get(k))
          : prev.has(legacy)
            ? Boolean(prev.get(legacy))
            : defaultGroupThreadOpen(found.thread);
        if (open) return prev;
        const next = new Map(prev);
        next.set(k, true);
        if (legacy !== k) next.set(legacy, true);
        return next;
      });
    },
    // findTimelineThreadById closes over timelineItems
    // hooks: deps are intentional for this host/session subscription
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
          const k = groupThreadKey(found.reviewGroupId, t);
          setGroupThreadOpenOverrides((prev) => {
            const next = new Map(prev);
            next.set(k, true);
            const legacy = groupThreadKey(found.reviewGroupId, t.id);
            if (legacy !== k) next.set(legacy, true);
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
    // hooks: deps are intentional for this host/session subscription
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
        {allThreads.map((th: any) => {
          const open = isGroupThreadOpen(reviewId, th);
          const fileLoc = formatThreadFileLoc(th);
          const threadAnchor =
            th?.id != null ? `review-comment:${th.id}` : '';
          const baseRowClass = `prp-review-group__row${
            open ? ' prp-review-group__row--open' : ''
          }${th.resolved ? ' prp-review-group__row--resolved' : ''}${
            th.pending ? ' prp-review-group__row--pending' : ''
          }`;
          return (
            <ConversationKbFocusHost
              key={String(th.id)}
              as="li"
              anchor={threadAnchor}
              className={baseRowClass}
              focusClassName="prp-review-group__row--kb-focus"
              data-thread-focus-anchor={threadAnchor || undefined}
              data-search-anchor={threadAnchor || undefined}
              /* Full path-row is the thread unit (header + body). Always-on
               * unit outline is CSS ::after; kb-focus only elevates accent.
               * Inner comment unit-focus must not own the thread outline. */
              data-prp-thread-unit="path-row"
            >
              <div className="prp-review-group__row-head">
                <GroupThreadFoldBtn
                  anchor={threadAnchor}
                  open={open}
                  onToggle={() => toggleGroupThread(reviewId, th)}
                  fileLoc={fileLoc || ''}
                  path={th.path}
                  pendingBadge={
                    th.pending && !opts.compact ? (
                      <Badge tone="warn" className="prp-review-group__badge">
                        {t('pending')}
                      </Badge>
                    ) : null
                  }
                  outdatedBadge={
                    th.outdated ? (
                      <Badge tone="muted" className="prp-review-group__badge">
                        {t('outdated')}
                      </Badge>
                    ) : null
                  }
                  resolvedBadge={
                    th.resolved && !th.pending ? (
                      <Badge tone="ok" className="prp-review-group__badge">
                        {t('resolved')}
                      </Badge>
                    ) : null
                  }
                />
                {typeof onJumpToReviewThread === 'function' && th.path ? (
                  <GroupThreadJumpBtn
                    anchor={threadAnchor}
                    fileLoc={fileLoc || th.path}
                    onJump={() =>
                      onJumpToReviewThread({
                        id: th.id,
                        path: th.path,
                        line: th.line,
                        startLine: th.startLine ?? th.line,
                        side: th.side || 'RIGHT',
                        outdated: Boolean(th.outdated),
                      })
                    }
                  />
                ) : null}
              </div>
              {open ? (
                <div className="prp-review-group__thread">
                  {renderReviewThreadCard(th, `${keyPrefix}g${reviewId}-`, {
                    forceExpanded: true,
                    hideOuterHeader: true,
                    // Path-row owns always-on + kb-focus thread outline.
                    skipKbFocus: true,
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
        ? t('review_group_action_approved')
        : state === 'CHANGES_REQUESTED'
          ? t('review_group_action_changes_requested')
          : t('review_group_action_commented');
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
    const idKey = String(item.id);
    const minimized = isIssue && isCommentMinimized(item);
    const bodyExpanded = Boolean(expandedMinimized[idKey]);

    // Compact hide chrome: only banner row until Show expands the full card.
    if (minimized && !bodyExpanded) {
      return (
        <ConversationKbFocusClassName
          key={`${keyPrefix}${String(item.id || item.key)}`}
          anchor={itemAnchor}
          baseClass={`${baseClass} prp-card--minimized-only`}
        >
          {(className, focused) => (
            <div
              className={`${className} prp-comment-minimized-card`.trim()}
              data-search-anchor={itemAnchor}
              data-prp-comment-minimized="1"
              data-prp-comment-id={idKey}
              data-prp-minimized-reason={
                item.minimizedReason || DEFAULT_HIDE_REASON
              }
              tabIndex={focused ? -1 : undefined}
            >
              {renderMinimizedBanner(item, { compact: true })}
            </div>
          )}
        </ConversationKbFocusClassName>
      );
    }

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
              {commentActions(
                editKind,
                item.id,
                Boolean(item.canDelete),
                item.body,
                {
                  author: item.author,
                  nodeId: item.nodeId || null,
                  isMinimized: item.isMinimized,
                  minimizedReason: item.minimizedReason,
                  viewerCanMinimize: item.viewerCanMinimize,
                  focused,
                }
              )}
            </div>
            {minimized ? (
              <>
                {renderMinimizedBanner(item, { compact: false })}
                {renderTimelineBody(item, editKind, itemAnchor, focused)}
              </>
            ) : editKind ? (
              renderTimelineBody(item, editKind, itemAnchor, focused)
            ) : (
              renderSearchableBody(item.body || '', itemAnchor, true)
            )}
          </Card>
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderMinimizedBanner(
    item: any,
    opts: { compact?: boolean } = {}
  ) {
    const reason = hideReasonLabel(item.minimizedReason || DEFAULT_HIDE_REASON);
    const idKey = String(item.id);
    const shown = Boolean(expandedMinimized[idKey]);
    return (
      <div
        className={`prp-comment-minimized${
          opts.compact ? ' prp-comment-minimized--compact' : ''
        }`}
        data-prp-comment-minimized="1"
        data-prp-comment-id={idKey}
        data-prp-minimized-reason={item.minimizedReason || DEFAULT_HIDE_REASON}
      >
        <span className="prp-muted">
          This comment was marked as {reason}.
        </span>
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
        {viewerCanMinimizeComment(item) && item.nodeId ? (
          <button
            type="button"
            className="prp-link-btn"
            data-prp-unhide-comment="1"
            data-prp-comment-id={idKey}
            disabled={actionBusy}
            onClick={() =>
              onUnhideComment?.({
                commentId: item.id,
                nodeId: item.nodeId,
              })
            }
          >
            Unhide
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * Unified fold: "N hidden items · Load more… · Load all"
   * (end-of-list, or mid-list when threads complete + timeline partial).
   */
  function renderThreadGap(hiddenCount: number) {
    return (
      <ThreadGapBanner
        hiddenCount={hiddenCount}
        actionBusy={actionBusy}
        onLoadMore={onLoadMoreReviewThreads}
        gapPlacement={paged?.gapPlacement || threadGap?.gapPlacement || 'end'}
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
    opts: {
      forceExpanded?: boolean;
      hideOuterHeader?: boolean;
      /** Outer review-group row already owns kb-focus — avoid dual rings. */
      skipKbFocus?: boolean;
    } = {}
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
      isMinimized: Boolean(item.isMinimized),
      minimizedReason: item.minimizedReason ?? null,
      viewerCanMinimize: item.viewerCanMinimize ?? null,
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
        isMinimized: Boolean(item.isMinimized),
        minimizedReason: item.minimizedReason ?? null,
        viewerCanMinimize: item.viewerCanMinimize ?? null,
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

    const renderThreadShell = (className: string, focused: boolean) => (
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleThreadCollapse(item);
              }}
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
                <Badge tone="warn">{t('pending')}</Badge>
              ) : null}
              {item.outdated ? (
                <Badge tone="muted">{t('outdated')}</Badge>
              ) : null}
              {item.resolved ? (
                <Badge tone="ok">{t('resolved')}</Badge>
              ) : null}
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
          sharePage="conversation"
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
          onHide={onHideComment}
          onUnhide={onUnhideComment}
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
          pendingCount={resolvedPendingCount}
          hasViewerPendingReview={resolvedHasViewerPending}
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
    );

    // Nested under a review-group path row: outer li owns kb-focus ring.
    if (opts.skipKbFocus) {
      return (
        <React.Fragment key={`${keyPrefix}${String(item.id || item.key)}`}>
          {renderThreadShell(threadBaseClass, false)}
        </React.Fragment>
      );
    }

    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={rootAnchor}
        baseClass={threadBaseClass}
      >
        {(className, focused) => renderThreadShell(className, focused)}
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
          const tipKey =
            tipId === 'all'
              ? 'popup_tl_all'
              : tipId === 'review-threads'
                ? 'popup_tl_threads'
                : tipId === 'events'
                  ? 'popup_tl_events'
                  : tipId === 'participants'
                    ? 'popup_tl_participants'
                    : tipId === 'comments'
                      ? 'popup_tl_comments'
                      : '';
          const label =
            (tipKey && t(tipKey)) || TIMELINE_TIP_LABELS[tipId] || tipId;
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
              pendingCount={Number(resolvedPendingCount) || 0}
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
              showShortcutHint={focused}
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
    // hooks: deps are intentional for this host/session subscription
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
          title={t('meta_reviewers')}
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
          emptyLabel={t('empty_no_reviewers')}
          onAdd={canEditMeta ? onAddReviewer : null}
          onRemove={canEditMeta ? onRemoveReviewer : null}
          onRerequest={
            canEditMeta && typeof onRerequestReviewer === 'function'
              ? (login: string) => onRerequestReviewer(login)
              : null
          }
          addLabel={t('meta_add_reviewer')}
          actionBusy={actionBusy}
          addButtonRef={reviewerAddRef}
          avatarUrls={detail.avatarUrls}
          
          addShortcut="⌥⇧R"
        />
        <MetaList
          title={t('meta_assignees')}
          rows={(detail.assignees || []).map((login: string) => {
            const bot =
              typeof isBotAccount === 'function'
                ? isBotAccount(login, detail)
                : /\[bot\]$/i.test(String(login || ''));
            return { login, isBot: bot, canRemove: !bot };
          })}
          emptyLabel={t('empty_no_assignees')}
          onAdd={canEditMeta ? onAddAssignee : null}
          onRemove={canEditMeta ? onRemoveAssignee : null}
          addLabel={t('meta_add_assignee')}
          actionBusy={actionBusy}
          addButtonRef={assigneeAddRef}
          avatarUrls={detail.avatarUrls}
          
          addShortcut="⌥⇧A"
        />
        <AsideSection title={t('meta_labels')}>
          <div className="prp-label-row">
            {(detail.labels || []).length === 0 ? (
              <span className="prp-muted">{t('empty_no_labels')}</span>
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
              title={`${t('meta_add_label')} (⌥⇧L)`}
            >
              <OptBtnHint label="⌥⇧L"
                preferredPlacement="right"
              />
              {t('meta_add_label')}
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title={t('meta_projects')}>
          {(detail.projects || []).length ? (
            <ul className="prp-list prp-aside-projects">
              {(detail.projects || []).map((p: any) => {
                const title = String(p?.title || '').trim() || t('meta_projects');
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
            <span className="prp-muted">{t('meta_none')}</span>
          )}
        </AsideSection>
        <AsideSection title={t('meta_milestone')}>
          <div className="prp-label-row prp-milestone">
            {!detail.milestone ? (
              <span className="prp-muted prp-milestone__empty">{t('empty_no_milestone')}</span>
            ) : (
              <span className="prp-label-chip prp-milestone-chip">
                <span
                  className="prp-milestone-chip__title"
                  title={`#${detail.milestone.number}`}
                >
                  {detail.milestone.title ||
                    `${t('meta_milestone')} #${detail.milestone.number}`}
                </span>
                <span className="prp-muted prp-milestone-chip__num">
                  #{detail.milestone.number}
                </span>
                {canEditMeta && onClearMilestone ? (
                  <button
                    type="button"
                    className="prp-label-chip__remove"
                    disabled={actionBusy}
                    title={t('palette_cmd_clear_milestone')}
                    aria-label={t('palette_cmd_clear_milestone')}
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
              title={`${
                detail.milestone ? t('meta_change_milestone') : t('meta_set_milestone')
              } (⌥⇧P)`}
            >
              <OptBtnHint label="⌥⇧P"
                preferredPlacement="right"
              />
              {detail.milestone ? t('meta_change_milestone') : t('meta_set_milestone')}
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title={t('meta_development')} loading={pendingDevelopment}>
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
                <span className="prp-muted">{t('meta_none')}</span>
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
          <AsideSection title={t('meta_checks')} loading={pendingChecks && !showChecks}>
            {showChecks ? <ChecksPanel checks={detail.checks} /> : null}
          </AsideSection>
        ) : null}
        <AsideSection
          title={`${t('meta_tags')}${
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
