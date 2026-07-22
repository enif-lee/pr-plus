/**
 * Composition root for PR modal — host props + UI orchestration.
 * View surfaces live under views/*; common UI under components/common.
 * Interactive UI state can also be read via zustand store (see store/modal-store).
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  startTransition,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@common/Button';
import { SearchableSelect } from '@common/SearchableSelect';
import { Header } from '../views/chrome/Header';
import { StackStrip } from '../views/chrome/StackStrip';
import { SearchBar } from '../views/chrome/SearchBar';
import { CommandPalette } from '../views/chrome/CommandPalette';
import { LoadingSkeleton } from '../views/chrome/LoadingSkeleton';
import { DiffToolbar } from '../views/chrome/DiffToolbar';
import { ConversationView } from '../views/conversation/ConversationView';
import { FolderFileTree } from '../views/diff/FolderFileTree';
import { VirtualDiff } from '../views/diff/VirtualDiff';
import { SelectionCommentBar } from '../views/diff/SelectionCommentBar';
import { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } from '../lib/layout-mode';
import {
  compareCacheKey,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  resolveCompareRange,
  type DiffCommitFilter as DiffCommitFilterState,
} from '../lib/diff-commit-filter';
import {
  SHELL_MODAL,
  SHELL_SHEET,
  loadShellPref,
  saveShellPref,
  resolveShellStorage,
  toggleShell,
  shellClassName,
  normalizeShell,
  type ShellMode,
} from '../lib/shell-preference';
import {
  applyScrollLock,
  measureScrollbarWidth,
  restoreScrollLock,
  type ScrollLockSnapshot,
} from '../lib/scroll-lock';
import {
  FILE_NAV_DEFAULT_WIDTH,
  clampFileNavWidth,
  toggleFileNavCollapsed,
  nextFileNavWidthFromDrag,
  fileNavGridTemplate,
  loadFileNavPref,
  saveFileNavPref,
  resolveFileNavStorage,
  type FileNavPref,
} from '../lib/file-nav-layout';
import { annotateFilesForCollapse } from '../lib/collapse';
import {
  filterFilesByQuery,
  countReviewThreadsByPath,
  groupReviewThreads,
  toggleViewedPath,
  isPathViewed,
  resolveRootReviewCommentId,
  normalizeReviewCommentId,
} from '../lib/review-threads';
import { flattenFilesToVirtualRows, fileStartIndexMap } from '../lib/diff-rows';
import { buildNestedFileTree, flattenVisibleTree, collectDirPaths } from '../lib/file-tree';
import {
  sortThreadRootComments,
  mapCommentsToRowIndices,
  resolveCommentNav,
} from '../lib/comment-nav';
import {
  buildSearchIndex,
  resolveQuerySearchState,
  resolveQuerySearchStateAsync,
  resolveNavSearchState,
  searchHitRowIndexSet,
  occurrenceIndexAmongRowHits,
  isNavigableSearchHit,
} from '../lib/search-index';
import { calculateVisibleRange, scrollTopForIndex } from '../lib/virtual-range';
import {
  beginLineSelection, extendLineSelection, normalizeSelection, selectionToCommentPayload,
  finalizeSelection, selectionGestureMode, isRowInSelection, isSelectableDiffRow, selectionBlockRole,
} from '../lib/line-selection';
import {
  discardPendingReview,
} from '../lib/pending-review';
import {
  parseSuggestionFences, applySuggestionToFileContent, mapLeaveReviewAction,
  buildRerequestReviewerLogins, mapRestReviewComment, mapRestIssueComment, appendOptimisticReviewComment,
} from '../lib/pr-edit-api';
import { buildPaletteCommands, filterPaletteCommands } from '../lib/command-palette';
import { resolveModalShortcutAction } from '../lib/shortcut-policy';
import { resolveGithubTheme } from '../lib/theme';
import { buildStackStrip, buildStackPathModel } from '../lib/ui-polish';
import {
  mergeCommentsById,
  advanceCommentsMeta,
  sinceCursorFromMeta,
  DEFAULT_COMMENT_PAGE_SIZE,
} from '../lib/comments-page';
import {
  filterSelectOptions, buildPeopleOptions, buildLabelOptions, buildBranchOptions, buildUnifiedReviewerRows,
} from '../lib/searchable-select';
import { loadSessionView, saveSessionView } from '../lib/session-view';
import {
  mergeDetailPreserveOptimistic,
  stripPendingReviewFromDetail,
  buildAssetRepoPath,
} from '../lib/composer-attach';
import {
  normalizePage,
  buildPositionFromComment,
  findCommentIndexByPosition,
  replaceLocationRoute,
  clearLocationRoute,
} from '../lib/uri-route';
import { useModalStore } from '../store/modal-store';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT,
  averageRowHeight,
  rowHeightFor,
  rowOffsets,
} from '@common/utils';

export function PrModalApp({
  open,
  loading,
  loadStage = null,
  onLoadMoreReviewThreads = null,
  error,
  detail: detailProp,
  openPulls,
  onClose,
  onRefresh,
  onPatchDetail = null,
  onOpenStackPr,
  onFetchCompareFiles = null,
  initialRoute = null,
  onRouteChange = null,
}: any) {
  const [localDetail, setLocalDetail] = useState(detailProp);
  /**
   * After discard/submit, host refresh can race and re-merge stale pending rows
   * (mergeDetailPreserveOptimistic keeps local pending while prev still holds
   * viewerPendingReview). While this ref is set, always strip pending from the
   * merged snapshot. Clear the flag only once the host also has no PENDING.
   */
  const forceDropPendingRef = useRef(false);
  // Merge host detail onto optimistic local state so reply/comment flash-revert is avoided
  useEffect(() => {
    if (!detailProp) return;
    setLocalDetail((prev) => {
      let merged =
        typeof mergeDetailPreserveOptimistic === 'function'
          ? mergeDetailPreserveOptimistic(prev, detailProp)
          : detailProp;
      const hostHasPending =
        Boolean(detailProp.viewerPendingReview?.id) ||
        (Array.isArray(detailProp.reviewComments) &&
          detailProp.reviewComments.some((c: any) => c?.pending));
      if (forceDropPendingRef.current) {
        // Always strip — do not wait for host to clear first. Waiting left the
        // toolbar stuck on "N pending" after Discard when the host snapshot was
        // empty but local raceKeep still held viewerPendingReview + rows.
        merged =
          typeof stripPendingReviewFromDetail === 'function'
            ? stripPendingReviewFromDetail(merged)
            : {
                ...merged,
                viewerPendingReview: null,
                reviewComments: (merged.reviewComments || []).filter(
                  (c: any) => c && !c.pending
                ),
              };
        if (!hostHasPending) {
          forceDropPendingRef.current = false;
        }
      }
      return merged;
    });
  }, [detailProp]);
  // Prefer optimistic local copy for all rendering / virtual rows / threads
  const detail = localDetail || detailProp;

  /** Diff files scoped to a commit or commit range (null = full PR files). */
  const [diffCommitFilter, setDiffCommitFilter] = useState<DiffCommitFilterState>({
    mode: 'all',
  });
  const [diffFilesOverride, setDiffFilesOverride] = useState<any[] | null>(null);
  const [diffCommitLoading, setDiffCommitLoading] = useState(false);
  const [diffCommitError, setDiffCommitError] = useState<string | null>(null);
  const [diffCommitLabel, setDiffCommitLabel] = useState<string | null>(null);
  const compareFilesCacheRef = useRef(new Map<string, any[]>());
  const compareFetchGenRef = useRef(0);

  // Reset commit filter when switching PRs
  const prIdentity = detail
    ? `${detail.owner}/${detail.repo}#${detail.number}`
    : '';
  const [stackPathSelections, setStackPathSelections] = useState<Record<string, number>>(
    {}
  );
  const commentPrefetchGenRef = useRef(0);

  useEffect(() => {
    setDiffCommitFilter({ mode: 'all' });
    setDiffFilesOverride(null);
    setDiffCommitError(null);
    setDiffCommitLabel(null);
    setDiffCommitLoading(false);
    compareFilesCacheRef.current = new Map();
    compareFetchGenRef.current += 1;
    setStackPathSelections({});
    commentPrefetchGenRef.current += 1;
  }, [prIdentity]);

  // Lazy-load remaining comment / review-comment pages (offset) then since-refresh.
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return undefined;
    const api = globalThis.PRTreeFetch;
    if (!api?.fetchPrCommentsPage) return undefined;
    const gen = ++commentPrefetchGenRef.current;
    let cancelled = false;

    async function loadKind(kind: 'issue' | 'review') {
      const metaKey = kind === 'issue' ? 'commentsMeta' : 'reviewCommentsMeta';
      const listKey = kind === 'issue' ? 'comments' : 'reviewComments';
      let guard = 0;
      while (!cancelled && gen === commentPrefetchGenRef.current && guard < 40) {
        guard += 1;
        const snap = localDetail || detailProp;
        if (!snap) break;
        const meta = snap[metaKey] || {};
        if (!meta.hasMore || !meta.nextPage) break;
        try {
          const page = await api.fetchPrCommentsPage(snap.owner, snap.repo, snap.number, {
            kind,
            page: meta.nextPage,
            perPage: meta.perPage || DEFAULT_COMMENT_PAGE_SIZE,
          });
          if (cancelled || gen !== commentPrefetchGenRef.current) return;
          setLocalDetail((prev) => {
            if (!prev || Number(prev.number) !== Number(snap.number)) return prev;
            const merged = mergeCommentsById(prev[listKey] || [], page?.items || []);
            return {
              ...prev,
              [listKey]: merged,
              [metaKey]: advanceCommentsMeta(prev[metaKey], page?.meta, merged.length),
            };
          });
          if (!page?.meta?.hasMore) break;
        } catch {
          break;
        }
      }
    }

    // Defer so conversation paints first page immediately
    const t = window.setTimeout(() => {
      void (async () => {
        await loadKind('issue');
        await loadKind('review');
        // Incremental since-pass: pick up comments created after first page window
        if (cancelled || gen !== commentPrefetchGenRef.current) return;
        const snap = localDetail || detailProp;
        if (!snap || !api.fetchPrCommentsPage) return;
        for (const kind of ['issue', 'review'] as const) {
          const metaKey = kind === 'issue' ? 'commentsMeta' : 'reviewCommentsMeta';
          const listKey = kind === 'issue' ? 'comments' : 'reviewComments';
          const since = sinceCursorFromMeta(snap[metaKey]);
          if (!since) continue;
          try {
            const page = await api.fetchPrCommentsPage(snap.owner, snap.repo, snap.number, {
              kind,
              page: 1,
              perPage: DEFAULT_COMMENT_PAGE_SIZE,
              since,
            });
            if (cancelled || gen !== commentPrefetchGenRef.current) return;
            if (!page?.items?.length) continue;
            setLocalDetail((prev) => {
              if (!prev || Number(prev.number) !== Number(snap.number)) return prev;
              const merged = mergeCommentsById(prev[listKey] || [], page.items);
              return {
                ...prev,
                [listKey]: merged,
                [metaKey]: {
                  ...(prev[metaKey] || {}),
                  newestCreatedAt:
                    page.meta?.newestCreatedAt || prev[metaKey]?.newestCreatedAt,
                  maxId: page.meta?.maxId ?? prev[metaKey]?.maxId,
                  loadedCount: merged.length,
                },
              };
            });
          } catch {
            /* ignore incremental errors */
          }
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch keyed by PR identity + open
  }, [open, prIdentity, detailProp?.commentsMeta?.hasMore, detailProp?.reviewCommentsMeta?.hasMore]);

  // --- Zustand-owned interactive UI (selective subscriptions) ---
  const layoutMode = useModalStore((s) => s.layoutMode);
  const setLayoutMode = useModalStore((s) => s.setLayoutMode);
  const diffMode = useModalStore((s) => s.diffMode);
  const setDiffMode = useModalStore((s) => s.setDiffMode);
  const scrollTop = useModalStore((s) => s.scrollTop);
  const setScrollTop = useModalStore((s) => s.setScrollTop);
  const viewportHeight = useModalStore((s) => s.viewportHeight);
  const setViewportHeight = useModalStore((s) => s.setViewportHeight);
  const searchOpen = useModalStore((s) => s.searchOpen);
  const setSearchOpen = useModalStore((s) => s.setSearchOpen);
  const searchQuery = useModalStore((s) => s.searchQuery);
  const setSearchQuery = useModalStore((s) => s.setSearchQuery);
  const searchHits = useModalStore((s) => s.searchHits);
  const setSearchHitsStore = useModalStore((s) => s.setSearchHits);
  const setSearchHits = (hits: any, index?: number) => setSearchHitsStore(hits, index);
  const searchHitIndex = useModalStore((s) => s.searchHitIndex);
  const setSearchHitIndex = useModalStore((s) => s.setSearchHitIndex);
  const activeFilePath = useModalStore((s) => s.activeFilePath);
  const setActiveFilePath = useModalStore((s) => s.setActiveFilePath);
  const animClass = useModalStore((s) => s.animClass);
  const setAnimClass = useModalStore((s) => s.setAnimClass);
  const commentText = useModalStore((s) => s.commentText);
  const setCommentText = useModalStore((s) => s.setCommentText);
  const actionBusy = useModalStore((s) => s.actionBusy);
  const setActionBusy = useModalStore((s) => s.setActionBusy);
  const actionMsg = useModalStore((s) => s.actionMsg);
  const setActionMsg = useModalStore((s) => s.setActionMsg);
  const collapsedFiles = useModalStore((s) => s.collapsedFiles);
  const setCollapsedFiles = useModalStore((s) => s.setCollapsedFiles);
  const expandedDirs = useModalStore((s) => s.expandedDirs);
  const setExpandedDirs = useModalStore((s) => s.setExpandedDirs);
  const commentIndex = useModalStore((s) => s.commentIndex);
  const setCommentIndex = useModalStore((s) => s.setCommentIndex);
  const lineSelection = useModalStore((s) => s.lineSelection);
  const setLineSelection = useModalStore((s) => s.setLineSelection);
  const selecting = useModalStore((s) => s.selecting);
  const setSelecting = useModalStore((s) => s.setSelecting);
  const selectionDraft = useModalStore((s) => s.selectionDraft);
  const setSelectionDraft = useModalStore((s) => s.setSelectionDraft);
  const showSelectionComposer = useModalStore((s) => s.showSelectionComposer);
  const setShowSelectionComposer = useModalStore((s) => s.setShowSelectionComposer);
  const selectionIslandLeaving = useModalStore((s) => s.selectionIslandLeaving);
  const setSelectionIslandLeaving = useModalStore((s) => s.setSelectionIslandLeaving);
  const fileQuery = useModalStore((s) => s.fileQuery);
  const setFileQuery = useModalStore((s) => s.setFileQuery);
  const viewedPaths = useModalStore((s) => s.viewedPaths);
  const setViewedPaths = useModalStore((s) => s.setViewedPaths);
  const replyDrafts = useModalStore((s) => s.replyDrafts);
  const setReplyDraft = useModalStore((s) => s.setReplyDraft);
  const setReplyDrafts = (fn: any) => {
    // bridge object-style updates used by existing call sites
    if (typeof fn === 'function') {
      const next = fn(useModalStore.getState().replyDrafts);
      Object.entries(next || {}).forEach(([k, v]) => setReplyDraft(k, v as string));
    }
  };
  const pendingReview = useModalStore((s) => s.pendingReview);
  const setPendingReview = useModalStore((s) => s.setPendingReview);
  const timelinePage = useModalStore((s) => s.timelinePage);
  const setTimelinePage = useModalStore((s) => s.setTimelinePage);
  const editingBody = useModalStore((s) => s.editingBody);
  const setEditingBody = useModalStore((s) => s.setEditingBody);
  const editingComment = useModalStore((s) => s.editingComment);
  const setEditingComment = useModalStore((s) => s.setEditingComment);
  const paletteOpen = useModalStore((s) => s.paletteOpen);
  const setPaletteOpen = useModalStore((s) => s.setPaletteOpen);
  const paletteQuery = useModalStore((s) => s.paletteQuery);
  const setPaletteQuery = useModalStore((s) => s.setPaletteQuery);
  const picker = useModalStore((s) => s.picker);
  const setPicker = useModalStore((s) => s.setPicker);
  const [theme, setTheme] = useState(() =>
    resolveGithubTheme(typeof document !== 'undefined' ? document : null, typeof window !== 'undefined' ? window : null)
  );
  const [collapsedThreads, setCollapsedThreads] = useState(() => new Set<string>());
  /** Outer shell: modal (default) vs side sheet — persisted preference. */
  const [shellMode, setShellMode] = useState<ShellMode>(() => {
    try {
      if (typeof window === 'undefined') return SHELL_MODAL;
      return loadShellPref(resolveShellStorage(window));
    } catch {
      return SHELL_MODAL;
    }
  });
  /** Diff files navigator: collapsed + width (persisted). */
  const [fileNav, setFileNav] = useState<FileNavPref>(() => {
    try {
      if (typeof window === 'undefined') {
        return { collapsed: false, width: FILE_NAV_DEFAULT_WIDTH };
      }
      // loadFileNavPref restores width; always opens expanded by default.
      return loadFileNavPref(resolveFileNavStorage(window));
    } catch {
      return { collapsed: false, width: FILE_NAV_DEFAULT_WIDTH };
    }
  });
  const fileNavDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  /** True while playing close exit animation before host onClose. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  /** Bump to open inline title editor from command palette. */
  const [titleEditSignal, setTitleEditSignal] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<any>(null);
  const searchInputRef = useRef<any>(null);
  const shellRef = useRef<any>(null);
  const commentBoxRef = useRef<any>(null);
  const collapseInitRef = useRef<any>(null);
  const selectingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<any>(null);
  /** Latest UI flags for capture-phase keydown (avoid stale closures). */
  const uiRef = useRef<any>({});
  /** Latest action handlers for capture-phase keydown. */
  const actionsRef = useRef<any>({});
  /** Last registered Apply-suggestion callback (hover/focus on suggestion block). */
  const applyActionRef = useRef<any>(null);
  /** Active BodyEditor save (draft) while editing body/comment. */
  const editorSaveRef = useRef<any>(null);
  /** Anchors for searchable select popovers (above trigger). */
  const baseBranchRef = useRef<HTMLElement | null>(null);
  const reviewerAddRef = useRef<HTMLElement | null>(null);
  const assigneeAddRef = useRef<HTMLElement | null>(null);
  const labelAddRef = useRef<HTMLElement | null>(null);
  const milestoneAddRef = useRef<HTMLElement | null>(null);
  const pickerAnchorRef = useRef<HTMLElement | null>(null);
  /** Apply session/URI page+position once per PR open. */
  const routeRestoreKeyRef = useRef<string | null>(null);
  const positionAppliedRef = useRef<string | null>(null);
  /** Skip writing URI until after initial restore settles. */
  const [routeWriteReady, setRouteWriteReady] = useState(false);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  const shortcutMod = isMac ? '⌘' : 'Ctrl+';

  // Always re-annotate with gitattributesText so SW fallback defaults cannot
  // skip linguist-generated / binary rules from the fetched attributes file.

  const sourceFiles = useMemo(() => {
    if (diffFilesOverride) return diffFilesOverride;
    return detail?.files || [];
  }, [detail?.files, diffFilesOverride]);

  const annotatedFiles = useMemo(() => {
    if (!sourceFiles?.length) return [];
    return annotateFilesForCollapse(sourceFiles, detail?.gitattributesText || '');
  }, [sourceFiles, detail?.gitattributesText]);

  const applyDiffCommitFilter = useCallback(
    async (nextRaw: DiffCommitFilterState) => {
      const next = normalizeDiffCommitFilter(nextRaw);
      setDiffCommitFilter(next);
      setDiffCommitError(null);
      setScrollTop(0);
      if (listRef.current) listRef.current.scrollTop = 0;

      if (isAllCommitsFilter(next) || !detail) {
        setDiffFilesOverride(null);
        setDiffCommitLabel(null);
        setDiffCommitLoading(false);
        return;
      }

      const baseRefOrSha = detail.baseSha || detail.baseRef || '';
      const range = resolveCompareRange(detail.commits || [], baseRefOrSha, next);
      if (!range) {
        setDiffFilesOverride(null);
        setDiffCommitLabel(null);
        setDiffCommitError('Could not resolve commit range');
        return;
      }
      setDiffCommitLabel(range.label);

      if (typeof onFetchCompareFiles !== 'function') {
        setDiffCommitError('Compare fetch is unavailable');
        return;
      }

      const cacheKey = compareCacheKey(detail.owner, detail.repo, range.base, range.head);
      const cached = compareFilesCacheRef.current.get(cacheKey);
      if (cached) {
        setDiffFilesOverride(cached);
        setDiffCommitLoading(false);
        return;
      }

      const gen = ++compareFetchGenRef.current;
      setDiffCommitLoading(true);
      try {
        const result = await onFetchCompareFiles(range.base, range.head, {
          gitattributesText: detail.gitattributesText || '',
        });
        if (gen !== compareFetchGenRef.current) return;
        const files = Array.isArray(result?.files) ? result.files : [];
        compareFilesCacheRef.current.set(cacheKey, files);
        setDiffFilesOverride(files);
        setDiffCommitError(null);
      } catch (err: any) {
        if (gen !== compareFetchGenRef.current) return;
        setDiffCommitError(err?.message || String(err));
        setDiffFilesOverride(null);
      } finally {
        if (gen === compareFetchGenRef.current) setDiffCommitLoading(false);
      }
    },
    [detail, onFetchCompareFiles, setScrollTop]
  );

  const navFiles = useMemo(() => {
    if (typeof filterFilesByQuery === 'function') {
      return filterFilesByQuery(annotatedFiles, fileQuery);
    }
    return annotatedFiles;
  }, [annotatedFiles, fileQuery]);

  const threadCounts = useMemo(() => {
    if (typeof countReviewThreadsByPath === 'function') {
      return countReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  const threads = useMemo(() => {
    if (typeof groupReviewThreads === 'function') {
      return groupReviewThreads(detail?.reviewComments || []);
    }
    return [];
  }, [detail?.reviewComments]);

  const threadsByCommentId = useMemo(() => {
    const map = new Map();
    for (const t of threads) {
      map.set(String(t.id), t);
    }
    return map;
  }, [threads]);

  const mentionCandidates = useMemo(() => {
    const names = new Set();
    if (detail?.author) names.add(detail.author);
    for (const r of detail?.reviews || []) if (r.author) names.add(r.author);
    for (const c of detail?.comments || []) if (c.author) names.add(c.author);
    for (const c of detail?.reviewComments || []) if (c.author) names.add(c.author);
    return [...names];
  }, [detail]);

  const fileTree = useMemo(() => {
    if (typeof buildNestedFileTree === 'function') return buildNestedFileTree(navFiles);
    return [];
  }, [navFiles]);

  // Expand every folder when a PR's file list first becomes available.
  // expandedDirs starts empty in the store, so without this only top-level names show.
  const fileTreeExpandKeyRef = useRef<string>('');
  useEffect(() => {
    if (!prIdentity || !annotatedFiles?.length) return;
    if (fileTreeExpandKeyRef.current === prIdentity) return;
    if (typeof buildNestedFileTree !== 'function' || typeof collectDirPaths !== 'function') {
      return;
    }
    const fullTree = buildNestedFileTree(annotatedFiles);
    const dirs = collectDirPaths(fullTree);
    fileTreeExpandKeyRef.current = prIdentity;
    setExpandedDirs(dirs);
  }, [prIdentity, annotatedFiles, setExpandedDirs]);

  const virtualRows = useMemo(
    () =>
      flattenFilesToVirtualRows(annotatedFiles, diffMode, {
        collapsedPaths: collapsedFiles,
        reviewComments: detail?.reviewComments || [],
      }),
    [annotatedFiles, diffMode, collapsedFiles, detail?.reviewComments]
  );

  const fileStarts = useMemo(() => fileStartIndexMap(virtualRows), [virtualRows]);
  const avgH = useMemo(() => averageRowHeight(virtualRows), [virtualRows]);
  const rowOffsetList = useMemo(
    () => (typeof rowOffsets === 'function' ? rowOffsets(virtualRows) : null),
    [virtualRows]
  );

  // Diff comment navigator: one stop per review **thread** (roots only; replies excluded).
  const mappedComments = useMemo(() => {
    if (typeof mapCommentsToRowIndices !== 'function') return [];
    const roots =
      typeof sortThreadRootComments === 'function'
        ? sortThreadRootComments(detail?.reviewComments || [])
        : detail?.reviewComments || [];
    return mapCommentsToRowIndices(roots, virtualRows);
  }, [detail?.reviewComments, virtualRows]);

  // Conversation = body/comments/reviews/replies only. Diff = conversation + rows.
  const searchMode =
    layoutMode === LAYOUT_DIFF ? 'full' : 'conversation';

  // Build index only while find is open — not on every keystroke.
  const searchDocs = useMemo(() => {
    if (!searchOpen) return [];
    if (typeof buildSearchIndex === 'function') {
      return buildSearchIndex(detail, virtualRows, { mode: searchMode });
    }
    return Array.isArray(virtualRows) ? virtualRows : [];
  }, [detail, virtualRows, searchOpen, searchMode]);

  const searchGenRef = useRef(0);
  const [searchBusy, setSearchBusy] = useState(false);
  /** After first non-empty search in this open session — gates Load Comments. */
  const [searchHasRun, setSearchHasRun] = useState(false);

  // New PR / close find → allow Load Comments to reappear after next search
  useEffect(() => {
    setSearchHasRun(false);
  }, [prIdentity]);
  // Jump geometry via ref so resize/scroll does not re-trigger search.
  const searchJumpRef = useRef({
    avgH,
    viewportHeight,
    rowCount: virtualRows.length,
    rowOffsetList,
  });
  searchJumpRef.current = {
    avgH,
    viewportHeight,
    rowCount: virtualRows.length,
    rowOffsetList,
  };

  const jumpToSearchHit = useCallback(
    (hit: any) => {
      if (!hit) return;

      // Conversation anchors (body / comments / reviews / replies)
      if (hit.anchorId) {
        if (layoutMode === LAYOUT_DIFF) {
          // Stay in conversation for conversation-only hits when possible
          setLayoutMode(LAYOUT_CENTERED);
        }
        const apply = () => {
          try {
            const el = document.querySelector(
              `[data-search-anchor="${CSS.escape(String(hit.anchorId))}"]`
            ) as HTMLElement | null;
            if (!el) return;
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            const mark = el.querySelector(
              '.prp-search-mark--current'
            ) as HTMLElement | null;
            mark?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          } catch {
            /* ignore */
          }
        };
        apply();
        requestAnimationFrame(() => {
          apply();
          requestAnimationFrame(apply);
        });
        return;
      }

      if (hit.rowIndex == null || !Number.isFinite(Number(hit.rowIndex))) {
        return;
      }
      // Diff row jump
      if (layoutMode !== LAYOUT_DIFF) {
        setLayoutMode(LAYOUT_DIFF);
      }
      const j = searchJumpRef.current;
      const top = scrollTopForIndex(
        hit.rowIndex,
        j.avgH,
        j.viewportHeight,
        j.rowCount,
        j.rowOffsetList
      );
      setScrollTop(top);
      const applyDomScroll = () => {
        const list = listRef.current as HTMLElement | null;
        if (list) list.scrollTop = top;
        const rowEl = list?.querySelector?.(
          `[data-row-index="${hit.rowIndex}"]`
        ) as HTMLElement | null;
        if (rowEl) {
          try {
            const mark = rowEl.querySelector(
              '.prp-search-mark--current'
            ) as HTMLElement | null;
            (mark || rowEl).scrollIntoView({ block: 'center', inline: 'nearest' });
          } catch {
            /* ignore */
          }
        }
      };
      applyDomScroll();
      requestAnimationFrame(() => {
        applyDomScroll();
        requestAnimationFrame(applyDomScroll);
      });
    },
    [layoutMode, setLayoutMode, setScrollTop]
  );

  /**
   * SearchBar already debounces typing → setSearchQuery.
   * This effect only runs on committed query / corpus change: chunked async scan.
   */
  useEffect(() => {
    const q = (searchQuery || '').trim();
    if (!q) {
      searchGenRef.current += 1;
      setSearchBusy(false);
      startTransition(() => {
        setSearchHitsStore([], -1);
      });
      return undefined;
    }

    const gen = ++searchGenRef.current;
    setSearchBusy(true);

    let cancelled = false;
    void (async () => {
      const isCancelled = () => cancelled || gen !== searchGenRef.current;
      try {
        let st: any = null;
        const sortOpts = {
          isCancelled,
          mode: searchMode === 'full' ? 'diff' : 'conversation',
          detail,
        };
        if (typeof resolveQuerySearchStateAsync === 'function') {
          st = await resolveQuerySearchStateAsync(searchDocs, q, sortOpts);
        } else if (typeof resolveQuerySearchState === 'function') {
          await new Promise((r) => setTimeout(r, 0));
          if (isCancelled()) return;
          st = resolveQuerySearchState(searchDocs, q, sortOpts);
        } else {
          st = { hits: [], hitIndex: -1, shouldJump: false, activeHit: null };
        }
        if (isCancelled() || st?.cancelled) return;

        if (isCancelled()) return;
        setSearchBusy(false);
        setSearchHasRun(true);
        const hits = st.hits || [];
        const hitIndex =
          st.hitIndex != null && st.hitIndex >= 0
            ? st.hitIndex
            : hits.length
              ? 0
              : -1;
        const activeHit = hits[hitIndex] || st.activeHit || null;
        setSearchHitsStore(hits, hitIndex);
        // Conversation stays on conversation; only jump to diff rows when already in Diff
        // or when the active hit is a pure diff-row hit without conversation anchor.
        if (
          st.shouldJump &&
          activeHit &&
          isNavigableSearchHit(activeHit)
        ) {
          queueMicrotask(() => {
            if (isCancelled()) return;
            jumpToSearchHit(activeHit);
          });
        }
      } catch {
        if (!isCancelled()) {
          setSearchBusy(false);
          startTransition(() => setSearchHitsStore([], -1));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, searchDocs, setSearchHitsStore, jumpToSearchHit, searchMode, detail]);

  // Diff enter → drain all remaining review threads once (idempotent if complete)
  const diffFullLoadGenRef = useRef(0);
  const diffFullLoadKeyRef = useRef('');
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF) return undefined;
    if (!detail?.owner || !detail?.repo || !detail?.number) return undefined;
    if (typeof onLoadMoreReviewThreads !== 'function') return undefined;
    const meta = detail.reviewThreadsMeta || {};
    if (!meta.hasMore) return undefined;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    // Avoid re-entry for same PR while a load is in flight / already kicked off
    if (diffFullLoadKeyRef.current === key && diffFullLoadGenRef.current > 0) {
      return undefined;
    }
    diffFullLoadKeyRef.current = key;
    const gen = ++diffFullLoadGenRef.current;
    void (async () => {
      try {
        await onLoadMoreReviewThreads('all');
      } catch {
        /* host stage surfaces errors */
      } finally {
        if (gen === diffFullLoadGenRef.current) {
          // allow retry if still hasMore after failure
          if (detail?.reviewThreadsMeta?.hasMore) {
            diffFullLoadKeyRef.current = '';
          }
        }
      }
    })();
    return undefined;
  }, [
    layoutMode,
    detail?.owner,
    detail?.repo,
    detail?.number,
    detail?.reviewThreadsMeta?.hasMore,
    onLoadMoreReviewThreads,
  ]);

  // Reset full-load gate when switching PRs
  useEffect(() => {
    diffFullLoadKeyRef.current = '';
    diffFullLoadGenRef.current = 0;
  }, [prIdentity]);

  const navSearch = useCallback(
    (delta: number) => {
      if (!searchHits.length) return;
      if (typeof resolveNavSearchState !== 'function') return;
      let st = resolveNavSearchState(searchHits, searchHitIndex, delta);
      let guard = 0;
      while (
        st.activeHit &&
        !isNavigableSearchHit(st.activeHit) &&
        guard < searchHits.length
      ) {
        st = resolveNavSearchState(searchHits, st.hitIndex, delta);
        guard += 1;
        if (st.hitIndex === searchHitIndex) break;
      }
      setSearchHitIndex(st.hitIndex);
      if (st.shouldJump && st.activeHit) {
        jumpToSearchHit(st.activeHit);
      }
    },
    [searchHits, searchHitIndex, setSearchHitIndex, jumpToSearchHit]
  );

  const onSearchQueryCommit = useCallback(
    (q: string) => {
      // Low-priority store update — never block the input frame.
      startTransition(() => {
        setSearchQuery(q);
      });
    },
    [setSearchQuery]
  );

  const onSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchHasRun(false);
  }, [setSearchOpen]);

  const onSearchNext = useCallback(() => navSearch(1), [navSearch]);
  const onSearchPrev = useCallback(() => navSearch(-1), [navSearch]);

  const threadsMeta = detail?.reviewThreadsMeta || null;
  const showLoadComments =
    searchHasRun &&
    searchOpen &&
    Boolean(threadsMeta?.hasMore) &&
    typeof onLoadMoreReviewThreads === 'function';

  const onSearchLoadComments = useCallback(async () => {
    if (typeof onLoadMoreReviewThreads !== 'function') return;
    try {
      // 'all' drains dual-window cursors until every review thread is loaded
      await onLoadMoreReviewThreads('all');
      // detail update rebuilds searchDocs → effect re-runs with same query
    } catch {
      /* host surfaces stage errors */
    }
  }, [onLoadMoreReviewThreads]);

  const searchMatchRows = useMemo(
    () => searchHitRowIndexSet(searchHits),
    [searchHits]
  );
  const activeSearchHit =
    searchHitIndex >= 0 && searchHits[searchHitIndex]
      ? searchHits[searchHitIndex]
      : null;
  const activeSearchOccurrence = useMemo(
    () => occurrenceIndexAmongRowHits(searchHits, searchHitIndex),
    [searchHits, searchHitIndex]
  );

  function navComment(delta: number) {
    if (!mappedComments.length) return;
    if (typeof resolveCommentNav === 'function') {
      const st = resolveCommentNav(mappedComments, commentIndex, delta);
      setCommentIndex(st.commentIndex);
      if (st.active?.rowIndex != null) {
        const top = scrollTopForIndex(
          st.active.rowIndex,
          avgH,
          viewportHeight,
          virtualRows.length,
          rowOffsetList
        );
        setScrollTop(top);
        if (listRef.current) listRef.current.scrollTop = top;
      }
    } else {
      const next = (commentIndex + delta + mappedComments.length) % mappedComments.length;
      setCommentIndex(next);
    }
  }

  // Initialize / restore view state once per PR number (sessionStorage + initialRoute)
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    if (routeRestoreKeyRef.current === key) return;
    routeRestoreKeyRef.current = key;
    positionAppliedRef.current = null;
    setRouteWriteReady(false);
    // Zustand survives host unmount — never carry focused comment into a new PR URI
    setCommentIndex(-1);

    let stored: any = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        stored = loadSessionView(sessionStorage, detail.owner, detail.repo, detail.number);
      }
    } catch {
      stored = null;
    }

    if (stored) {
      if (stored.layoutMode === 'diff' || stored.layoutMode === 'centered') {
        setLayoutMode(stored.layoutMode === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED);
      }
      if (stored.diffMode === 'split' || stored.diffMode === 'unified') {
        setDiffMode(stored.diffMode);
      }
      if (Array.isArray(stored.collapsedFiles)) {
        setCollapsedFiles(new Set(stored.collapsedFiles));
      }
      if (Array.isArray(stored.viewedPaths)) {
        setViewedPaths(new Set(stored.viewedPaths));
      }
      if (stored.activeFilePath) setActiveFilePath(stored.activeFilePath);
    }

    // session view layout > URI/host page (only when session had no layoutMode)
    const routePage = normalizePage(initialRoute?.page);
    if (!stored?.layoutMode && routePage) {
      setLayoutMode(routePage === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED);
    }

    // Allow URI writes after restore paints
    requestAnimationFrame(() => {
      setRouteWriteReady(true);
    });
  }, [
    open,
    detail?.owner,
    detail?.repo,
    detail?.number,
    initialRoute?.page,
    setLayoutMode,
    setDiffMode,
    setCollapsedFiles,
    setViewedPaths,
    setActiveFilePath,
    setCommentIndex,
  ]);

  // Focus review comment/thread from URI/session position once comments map
  useEffect(() => {
    if (!open || !detail?.number) return;
    const pos = initialRoute?.position || null;
    if (!pos) return;
    const applyKey = `${detail.number}:${pos}`;
    if (positionAppliedRef.current === applyKey) return;
    if (!mappedComments.length) return;
    const idx = findCommentIndexByPosition(mappedComments, pos);
    if (idx < 0) return;
    positionAppliedRef.current = applyKey;
    // Position implies diff context
    if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);
    setCommentIndex(idx);
    const row = mappedComments[idx];
    if (row?.rowIndex != null) {
      const top = scrollTopForIndex(
        row.rowIndex,
        avgH,
        viewportHeight,
        virtualRows.length,
        rowOffsetList
      );
      setScrollTop(top);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = top;
      });
    }
  }, [
    open,
    detail?.number,
    initialRoute?.position,
    mappedComments,
    layoutMode,
    avgH,
    viewportHeight,
    virtualRows.length,
    setLayoutMode,
    setCommentIndex,
    setScrollTop,
  ]);

  // Persist session view (layout/collapse) for refresh
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    if (!routeWriteReady) return;
    try {
      if (typeof sessionStorage === 'undefined') return;
      saveSessionView(sessionStorage, detail.owner, detail.repo, detail.number, {
        layoutMode,
        diffMode,
        collapsedFiles,
        viewedPaths,
        activeFilePath,
      });
    } catch {
      /* ignore */
    }
  }, [
    open,
    detail?.owner,
    detail?.repo,
    detail?.number,
    layoutMode,
    diffMode,
    collapsedFiles,
    viewedPaths,
    activeFilePath,
    routeWriteReady,
  ]);

  // Sync URI (pr+page / pr+number / pr+position) + host session open snap
  useEffect(() => {
    if (!open || !detail?.number) {
      return;
    }
    if (!routeWriteReady) return;

    const page =
      layoutMode === LAYOUT_DIFF ? 'diff' : ('conversation' as const);
    let position: string | null = null;
    if (commentIndex >= 0 && mappedComments[commentIndex]) {
      position = buildPositionFromComment(mappedComments[commentIndex]);
    }

    // Fixture / non-extension: write location directly (no chrome.*)
    try {
      if (typeof history !== 'undefined' && typeof location !== 'undefined') {
        replaceLocationRoute(history, location, {
          page,
          number: detail.number,
          position,
        });
      }
    } catch {
      /* ignore */
    }

    if (typeof onRouteChange === 'function') {
      onRouteChange({ page, position, number: detail.number });
    }
  }, [
    open,
    detail?.number,
    layoutMode,
    commentIndex,
    mappedComments,
    onRouteChange,
    routeWriteReady,
  ]);

  // Reset route restore markers when modal closes
  useEffect(() => {
    if (open) return undefined;
    routeRestoreKeyRef.current = null;
    positionAppliedRef.current = null;
    setRouteWriteReady(false);
    return undefined;
  }, [open]);

  function expandDiff(after?: any) {
    setAnimClass('prp-modal--animating');
    setLayoutMode(LAYOUT_DIFF);
    requestAnimationFrame(() => {
      setAnimClass('prp-modal--animating prp-modal--anim-in');
      setTimeout(() => {
        setAnimClass('');
        after?.();
      }, 280);
    });
  }

  function collapseDiff() {
    setAnimClass('prp-modal--animating prp-modal--anim-out');
    setTimeout(() => {
      setLayoutMode(LAYOUT_CENTERED);
      setAnimClass('');
    }, 280);
  }

  function onToggleDiff() {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    else expandDiff();
  }

  /** Play exit animation, then notify host to unmount (modal + side sheet). */
  const requestClose = useCallback(() => {
    if (closingRef.current || !open) return;
    closingRef.current = true;
    setClosing(true);
    // Docked sheet slides out; fullscreen Diff / modal scale-fades out
    const sheetSlide =
      shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
    const duration = sheetSlide ? 240 : 280;
    setAnimClass(
      sheetSlide
        ? 'prp-modal--sheet-out'
        : 'prp-modal--animating prp-modal--anim-out'
    );
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closingRef.current = false;
      setClosing(false);
      setAnimClass('');
      onClose?.();
    }, duration);
  }, [open, onClose, shellMode, layoutMode, setAnimClass]);

  // Reset close animation if host forces open again mid-exit / after unmount
  useEffect(() => {
    if (!open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      closingRef.current = false;
      setClosing(false);
      return;
    }
    // Opening: clear residual exit classes
    if (!closingRef.current) {
      setAnimClass('');
    }
  }, [open, setAnimClass]);

  // Lock document scroll while overlay is open so only the panel scrolls
  // (side sheet otherwise leaves a global scrollbar + nested scroll).
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const sbw =
      typeof window !== 'undefined' ? measureScrollbarWidth(window) : 0;
    const snap: ScrollLockSnapshot | null = applyScrollLock(document, {
      scrollbarWidth: sbw,
    });
    return () => {
      restoreScrollLock(document, snap);
    };
  }, [open]);

  function onToggleShell() {
    setShellMode((prev) => {
      const next = toggleShell(prev);
      try {
        if (typeof window !== 'undefined') {
          saveShellPref(resolveShellStorage(window), next);
        }
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  function persistFileNav(next: FileNavPref) {
    try {
      if (typeof window !== 'undefined') {
        saveFileNavPref(resolveFileNavStorage(window), next);
      }
    } catch {
      /* ignore */
    }
  }

  function onToggleFileNavCollapse() {
    setFileNav((prev) => {
      const next = {
        ...prev,
        collapsed: toggleFileNavCollapsed(prev.collapsed),
        width: clampFileNavWidth(prev.width),
      };
      persistFileNav(next);
      return next;
    });
  }

  function onFileNavResizeStart(e: React.PointerEvent) {
    if (fileNav.collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = clampFileNavWidth(fileNav.width);
    fileNavDragRef.current = { startX, startWidth };
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      const drag = fileNavDragRef.current;
      if (!drag) return;
      const nextW = nextFileNavWidthFromDrag(drag.startWidth, ev.clientX - drag.startX);
      setFileNav((prev) => ({ ...prev, width: nextW, collapsed: false }));
    };
    const onUp = (ev: PointerEvent) => {
      fileNavDragRef.current = null;
      try {
        target.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setFileNav((prev) => {
        const next = { ...prev, width: clampFileNavWidth(prev.width) };
        persistFileNav(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Re-apply saved shell + file nav when modal opens (next PR / reopen)
  useEffect(() => {
    if (!open) return;
    try {
      if (typeof window === 'undefined') return;
      const stored = loadShellPref(resolveShellStorage(window));
      setShellMode(normalizeShell(stored));
      setFileNav(loadFileNavPref(resolveFileNavStorage(window)));
    } catch {
      /* ignore */
    }
  }, [open]);

  function onSelectFile(path: any) {
    setActiveFilePath(path);
    // Auto-expand collapsed file when selected from tree
    setCollapsedFiles((prev) => {
      if (!prev.has(path)) return prev;
      const n = new Set(prev);
      n.delete(path);
      return n;
    });
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      const top = scrollTopForIndex(
        idx,
        avgH,
        viewportHeight,
        virtualRows.length,
        rowOffsetList
      );
      setScrollTop(top);
      if (listRef.current) listRef.current.scrollTop = top;
    }
  }

  function onToggleDir(path: any) {
    setExpandedDirs((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function onToggleFileCollapse(path: any) {
    setCollapsedFiles((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function focusCommentBox() {
    try {
      const el = commentBoxRef.current;
      const editor =
        el?.querySelector?.('.prp-wysi__editor') ||
        el?.querySelector?.('.prp-wysi__ghost') ||
        el?.querySelector?.('textarea');
      if (editor) {
        editor.focus?.();
        editor.click?.();
        return;
      }
      el?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      /* ignore */
    }
  }

  function dismissSelectionIsland(after?: any) {
    setSelectionIslandLeaving(true);
    setTimeout(() => {
      setShowSelectionComposer(false);
      setLineSelection(null);
      setSelectionDraft('');
      setSelectionIslandLeaving(false);
      after?.();
    }, 200);
  }

  function closePicker() {
    setPicker(null);
    pickerAnchorRef.current = null;
  }

  function collectPeopleLogins(exclude = []) {
    const excludeSet = new Set((exclude || []).map((x) => String(x || '').toLowerCase()));
    const names = new Set();
    const add = (login) => {
      const raw = String(login || '').trim();
      if (!raw || excludeSet.has(raw.toLowerCase())) return;
      names.add(raw);
    };
    if (detail?.author) add(detail.author);
    for (const r of detail?.requestedReviewers || []) add(r);
    for (const a of detail?.assignees || []) add(a);
    for (const r of detail?.reviews || []) if (r?.author) add(r.author);
    for (const c of detail?.comments || []) if (c?.author) add(c.author);
    for (const c of detail?.reviewComments || []) if (c?.author) add(c.author);
    for (const p of openPulls || []) if (p?.author) add(p.author);
    return [...names];
  }



  /**
   * Unified pending model: only GitHub PENDING review (no separate local batch).
   * Count + submit/discard all target detail.viewerPendingReview / pending comments.
   */
  const serverPendingComments = useMemo(() => {
    const list = detail?.reviewComments || [];
    return list.filter((c: any) => c && c.pending);
  }, [detail?.reviewComments]);
  const pendingCount = serverPendingComments.length;
  const serverPendingReviewId =
    detail?.viewerPendingReview?.id ||
    serverPendingComments.find((c: any) => c.pendingReviewId)?.pendingReviewId ||
    null;
  const hasServerPending = Boolean(serverPendingReviewId) || pendingCount > 0;
  /** @deprecated alias — all UI uses server pending only */
  const totalPendingCount = pendingCount || (serverPendingReviewId ? 1 : 0);

  async function onLeaveReviewAction(kind: any) {
    if (!detail) return;
    const body = commentText.trim();
    // Explicit issue-comment (Conversation "Comment" tab) — never submit PENDING
    const forceIssueComment =
      kind === 'issue-comment' || kind === 'post-comment' || kind === 'comment-only';

    const mapped =
      typeof mapLeaveReviewAction === 'function'
        ? mapLeaveReviewAction(kind)
        : kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'issue-comment', event: 'COMMENT' };

    // Plain conversation comment (Comment tab, or no open PENDING review)
    if (forceIssueComment || (mapped.kind === 'issue-comment' && !hasServerPending)) {
      if (!body) {
        setActionMsg('Write a comment first.');
        focusCommentBox();
        return;
      }
      setActionBusy(true);
      setActionMsg('');
      try {
        const api = globalThis.PRTreeFetch;
        if (!api?.postIssueComment) throw new Error('Comment API unavailable');
        const raw = await api.postIssueComment(
          detail.owner,
          detail.repo,
          detail.number,
          body
        );
        const optimistic = mapRestIssueComment(raw, {
          body,
          author: detail.viewerLogin || '',
        });
        if (optimistic) {
          setLocalDetail((prev) =>
            prev
              ? {
                  ...prev,
                  comments: [...(prev.comments || []), optimistic],
                }
              : prev
          );
        }
        setCommentText('');
        setActionMsg('Comment posted.');
        await onRefresh?.();
      } catch (err) {
        setActionMsg(err?.message || String(err));
      } finally {
        setActionBusy(false);
      }
      return;
    }

    // Review path: submit existing PENDING review, or create one-shot review
    const event =
      mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
    if (event === 'REQUEST_CHANGES' && !body && !hasServerPending) {
      setActionMsg('Request changes requires a comment body or pending review items.');
      focusCommentBox();
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (hasServerPending && serverPendingReviewId && api?.submitPendingPullReview) {
        await api.submitPendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          serverPendingReviewId,
          { event, body }
        );
      } else if (api?.submitPullReview) {
        // No PENDING review: one-shot Approve / Request changes / Comment review
        await api.submitPullReview(detail.owner, detail.repo, detail.number, {
          event,
          body,
          commitId: detail.headSha,
          comments: [],
        });
      } else {
        throw new Error('Review API unavailable');
      }
      setCommentText('');
      // Clear any legacy local batch if present
      setPendingReview(
        typeof discardPendingReview === 'function'
          ? discardPendingReview()
          : { comments: [], body: '' }
      );
      forceDropPendingRef.current = true;
      setLocalDetail((prev) =>
        typeof stripPendingReviewFromDetail === 'function'
          ? stripPendingReviewFromDetail(prev)
          : prev
            ? { ...prev, viewerPendingReview: null }
            : prev
      );
      setActionMsg(
        event === 'APPROVE'
          ? 'Approved.'
          : event === 'REQUEST_CHANGES'
            ? 'Requested changes.'
            : hasServerPending
              ? 'Pending review submitted.'
              : 'Review submitted.'
      );
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSaveBody(body: any) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { body });
      setEditingBody(false);
      setActionMsg('Description updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSaveEditComment(kind, id, body) {
    if (!detail || id == null) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (kind === 'issue') {
        if (!api?.editIssueComment) throw new Error('Edit comment API unavailable');
        await api.editIssueComment(detail.owner, detail.repo, id, body);
      } else {
        if (!api?.editReviewComment) throw new Error('Edit review comment API unavailable');
        await api.editReviewComment(detail.owner, detail.repo, id, body);
      }
      setEditingComment(null);
      setActionMsg('Comment updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applyBaseChange(base: any) {
    if (!detail) return;
    const next = String(base || '').trim();
    if (!next || next === detail.baseRef) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { base: next });
      setLocalDetail((prev) => (prev ? { ...prev, baseRef: next } : prev));
      setActionMsg(`Base branch changed to ${next}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openBasePicker() {
    if (!detail) return;
    const options =
      typeof buildBranchOptions === 'function'
        ? buildBranchOptions(openPulls, {
            baseRef: detail.baseRef,
            headRef: detail.headRef,
          })
        : [];
    pickerAnchorRef.current = baseBranchRef.current;
    setPicker({
      type: 'base',
      title: 'Change base branch',
      options,
      // Empty query so full branch list is visible; free-text still allowed.
      query: '',
      allowFreeText: true,
      placeholder: detail.baseRef ? `Current: ${detail.baseRef}` : 'Filter or type a branch…',
      onPick: (opt) => {
        closePicker();
        void applyBaseChange(opt?.id || opt?.label);
      },
    });
  }

  async function applyAddReviewer(login: any) {
    if (!detail || !login) return;
    const name = String(login).trim();
    if (!name) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.requestReviewers) throw new Error('Request reviewers API unavailable');
      await api.requestReviewers(detail.owner, detail.repo, detail.number, [name]);
      setLocalDetail((prev) => {
        if (!prev) return prev;
        const existing = prev.requestedReviewers || [];
        if (existing.some((x) => String(x).toLowerCase() === name.toLowerCase())) return prev;
        return { ...prev, requestedReviewers: [...existing, name] };
      });
      setActionMsg(`Requested review from ${name}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openReviewerPicker() {
    if (!detail) return;
    const exclude = detail.requestedReviewers || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: { login: id, kind: 'user', avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '' },
          }));
    pickerAnchorRef.current = reviewerAddRef.current;
    setPicker({
      type: 'reviewer',
      title: 'Add reviewer',
      options,
      query: '',
      allowFreeText: true,
      onPick: (opt) => {
        closePicker();
        void applyAddReviewer(opt?.id || opt?.label);
      },
    });
  }

  async function onRemoveReviewer(login: any) {
    if (!detail || !login) return;
    if (!window.confirm(`Remove reviewer ${login}?`)) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.removeReviewers) throw new Error('Remove reviewers API unavailable');
      await api.removeReviewers(detail.owner, detail.repo, detail.number, [login]);
      setActionMsg(`Removed reviewer ${login}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function mapAssigneesFromApi(result: any, fallback: string[] = []) {
    if (Array.isArray(result?.assignees)) {
      return result.assignees
        .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
        .map((s: string) => String(s).trim())
        .filter(Boolean);
    }
    if (Array.isArray(result) && result.every((x) => typeof x === 'string' || x?.login)) {
      return result
        .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
        .map((s: string) => String(s).trim())
        .filter(Boolean);
    }
    return fallback;
  }

  function mapLabelsFromApi(result: any, fallback: any[] = []) {
    // PUT labels returns Label[] directly
    const list = Array.isArray(result)
      ? result
      : Array.isArray(result?.labels)
        ? result.labels
        : null;
    if (!list) return fallback;
    return list
      .map((l: any) => {
        if (typeof l === 'string') return { name: l, color: '' };
        const name = String(l?.name || '').trim();
        if (!name) return null;
        return {
          name,
          color: l.color || '',
          description: l.description || '',
        };
      })
      .filter(Boolean);
  }

  function mergeAvatarUrls(prev: any, result: any, logins: string[] = []) {
    const map = {
      ...(prev?.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
    };
    for (const u of result?.assignees || []) {
      const login = u?.login || '';
      if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
    }
    for (const login of logins) {
      const key = String(login).toLowerCase();
      if (!map[key] && prev?.avatarUrls?.[key]) map[key] = prev.avatarUrls[key];
    }
    return map;
  }

  const metaRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleMetaRefresh() {
    // One debounced full refresh after the last meta write. Host detailFetchGen
    // drops any older in-flight fetches so we do not resurrect pre-write meta.
    if (metaRefreshTimerRef.current) clearTimeout(metaRefreshTimerRef.current);
    metaRefreshTimerRef.current = setTimeout(() => {
      metaRefreshTimerRef.current = null;
      try {
        const p = onRefresh?.();
        if (p && typeof (p as Promise<void>).catch === 'function') {
          void (p as Promise<void>).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }, 450);
  }

  function commitMetaPatch(patch: Record<string, unknown>) {
    const base = detail;
    if (!base) return;
    const next = {
      ...base,
      ...patch,
      avatarUrls: {
        ...(base.avatarUrls && typeof base.avatarUrls === 'object' ? base.avatarUrls : {}),
        ...(patch.avatarUrls && typeof patch.avatarUrls === 'object'
          ? (patch.avatarUrls as Record<string, string>)
          : {}),
      },
      // Local-only lock so in-session host re-renders cannot clobber the write.
      // Never persist _metaSeq to host/cache — that blocked empty API results on reopen.
      _metaSeq: (Number(base._metaSeq) || 0) + 1,
    };
    setLocalDetail(next);
    try {
      const { _metaSeq: _drop, ...forHost } = next;
      onPatchDetail?.({
        ...forHost,
        assignees: next.assignees,
        labels: next.labels,
        avatarUrls: next.avatarUrls,
      });
    } catch {
      /* host optional */
    }
    scheduleMetaRefresh();
  }

  async function applyAddAssignees(logins: any) {
    if (!detail) return;
    const names = (Array.isArray(logins) ? logins : [logins])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (!names.length) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.addAssignees) throw new Error('Add assignees API unavailable');
      const result = await api.addAssignees(
        detail.owner,
        detail.repo,
        detail.number,
        names
      );
      const fromApi = mapAssigneesFromApi(result, []);
      const existing = Array.isArray(detail.assignees) ? detail.assignees.slice() : [];
      const merged = [...existing];
      for (const name of names) {
        if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
          merged.push(name);
        }
      }
      // Prefer API assignees when present; otherwise merge into existing.
      // Empty API list after a successful add is treated as lag — keep merged.
      const assignees = fromApi.length ? fromApi : merged;
      const avatarUrls = mergeAvatarUrls(detail, result, assignees);
      // Trust write response + host cache patch only — full soft-refresh races
      // with in-flight detail fetches and was resurrecting stale labels/assignees.
      commitMetaPatch({ assignees, avatarUrls });
      setActionMsg(
        names.length === 1 ? `Assigned ${names[0]}.` : `Assigned ${names.length} people.`
      );
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openAssigneePicker() {
    if (!detail) return;
    const exclude = detail.assignees || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    pickerAnchorRef.current = assigneeAddRef.current;
    setPicker({
      type: 'assignee',
      title: 'Add assignees',
      options,
      query: '',
      allowFreeText: true,
      multi: true,
      confirmLabel: 'Add assignees',
      onConfirm: (ids: string[]) => {
        closePicker();
        void applyAddAssignees(ids);
      },
      // single-click fallback
      onPick: (opt) => {
        closePicker();
        void applyAddAssignees([opt?.id || opt?.label || opt?.meta?.login]);
      },
    });
  }

  async function onRemoveAssignee(login: any) {
    if (!detail || !login) return;
    if (!window.confirm(`Unassign ${login}?`)) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.removeAssignees) throw new Error('Remove assignees API unavailable');
      const result = await api.removeAssignees(detail.owner, detail.repo, detail.number, [
        login,
      ]);
      const assignees = Array.isArray(result?.assignees)
        ? result.assignees
            .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
            .map((s: string) => String(s).trim())
            .filter(Boolean)
        : (detail.assignees || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch({
        assignees,
        avatarUrls: mergeAvatarUrls(detail, result, assignees),
      });
      setActionMsg(`Unassigned ${login}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applySetLabels(labels: any) {
    if (!detail) return;
    const next = (labels || []).map((s) => String(s).trim()).filter(Boolean);
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueLabels) throw new Error('Set labels API unavailable');
      const result = await api.setIssueLabels(
        detail.owner,
        detail.repo,
        detail.number,
        next
      );
      let labelsOut;
      if (Array.isArray(result)) {
        // PUT /labels returns Label[] (may be empty — clearing is intentional)
        labelsOut = mapLabelsFromApi(result, []);
      } else {
        const fromApi = mapLabelsFromApi(result, []);
        labelsOut =
          fromApi.length > 0 || next.length === 0
            ? fromApi
            : next.map((name) => {
                const existing = (detail.labels || []).find(
                  (l) => String(l.name || l).toLowerCase() === name.toLowerCase()
                );
                return existing && typeof existing === 'object'
                  ? existing
                  : { name, color: '' };
              });
      }
      // No full soft-refresh: in-flight fetchPrDetail responses were overwriting
      // this patch with pre-write assignees/labels a few seconds later.
      commitMetaPatch({ labels: labelsOut });
      setActionMsg(
        next.length === 0
          ? 'Labels cleared.'
          : next.length === 1
            ? `Label “${next[0]}” set.`
            : `Labels updated (${next.length}).`
      );
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openLabelPicker() {
    if (!detail) return;
    const currentNames = (detail.labels || []).map((l) => String(l.name || l).trim());
    const current = new Set(currentNames.map((n) => n.toLowerCase()));
    const common = [
      'bug',
      'enhancement',
      'documentation',
      'good first issue',
      'help wanted',
      'question',
      'wontfix',
      'duplicate',
      'invalid',
    ];
    const pool = [
      ...(detail.labels || []),
      ...common.filter((n) => !current.has(n.toLowerCase())),
    ];
    // Multi-select: include current labels as pre-selected so user can add more
    const options =
      typeof buildLabelOptions === 'function'
        ? buildLabelOptions([
            ...pool,
            ...common.map((n) => ({ name: n })),
          ])
        : [...new Set([...currentNames, ...common])].map((id) => ({
            id,
            label: id,
            meta: { kind: 'label', name: id },
          }));
    // de-dupe options by id
    const seen = new Set();
    const uniqueOpts = [];
    for (const o of options) {
      const id = String(o.id || o.label || '').toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueOpts.push(o);
    }
    pickerAnchorRef.current = labelAddRef.current;
    setPicker({
      type: 'label',
      title: 'Set labels',
      options: uniqueOpts,
      query: '',
      allowFreeText: true,
      multi: true,
      initialSelectedIds: currentNames,
      confirmLabel: 'Apply labels',
      onConfirm: (ids: string[]) => {
        closePicker();
        void applySetLabels(ids);
      },
      onPick: (opt) => {
        // single fallback: add one
        closePicker();
        const name = String(opt?.id || opt?.label || '').trim();
        if (!name) return;
        const names = currentNames.slice();
        if (!names.some((n) => String(n).toLowerCase() === name.toLowerCase())) {
          names.push(name);
        }
        void applySetLabels(names);
      },
    });
  }

  function onRemoveLabel(name: any) {
    if (!detail || !name) return;
    const names = (detail.labels || [])
      .map((l) => l.name || l)
      .filter((n) => String(n).toLowerCase() !== String(name).toLowerCase());
    void applySetLabels(names);
  }

  async function onApplySuggestion(payload: any) {
    if (!detail || !payload?.path || payload.endLine == null) return;
    if (
      !window.confirm(
        `Apply suggestion to ${payload.path}:${payload.startLine || payload.endLine}–${payload.endLine} on ${detail.headRef}?`
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.applyReviewSuggestion) throw new Error('Apply suggestion API unavailable');
      await api.applyReviewSuggestion(detail.owner, detail.repo, {
        path: payload.path,
        headRef: detail.headRef,
        startLine: payload.startLine || payload.endLine,
        endLine: payload.endLine,
        suggestion: payload.suggestion,
        commitMessage: `Apply suggestion to ${payload.path}`,
      });
      setActionMsg(`Suggestion applied to ${payload.path}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function onStartEditReviewComment(id, _body) {
    // Opens inline BodyEditor (conversation timeline or Diff InlineThread)
    setEditingComment({ kind: 'review', id });
  }

  const paletteCommands = useMemo(() => {
    if (typeof buildPaletteCommands !== 'function') return [];
    return buildPaletteCommands(detail || {});
  }, [detail]);

  function runPaletteCommand(cmd: any) {
    if (!cmd) return;
    setPaletteOpen(false);
    setPaletteQuery('');
    const action = cmd.action;
    const p = cmd.payload || {};
    switch (action) {
      case 'toggleDiff':
        onToggleDiff();
        break;
      case 'openSearch':
        setSearchOpen(true);
        queueMicrotask(() => {
          try {
            searchInputRef.current?.focus?.();
            searchInputRef.current?.select?.();
          } catch {
            /* ignore */
          }
        });
        break;
      case 'editTitle':
        setTitleEditSignal((n) => n + 1);
        break;
      case 'editBody':
        setEditingBody(true);
        break;
      case 'promptBase':
        openBasePicker();
        break;
      case 'convertDraft':
        void onSetDraftStage('draft');
        break;
      case 'readyForReview':
        void onSetDraftStage('ready');
        break;
      case 'mergePr':
        void onMergePr(p.method || 'merge');
        break;
      case 'updateBranch':
        void onUpdateBranch();
        break;
      case 'subscribe':
        void onSubscribe(true);
        break;
      case 'unsubscribe':
        void onSubscribe(false);
        break;
      case 'promptMilestone':
        void onSetMilestone(false);
        break;
      case 'clearMilestone':
        void onSetMilestone(true);
        break;
      case 'rerequestReview':
        void onRerequestReview();
        break;
      case 'promptAddReviewer':
        openReviewerPicker();
        break;
      case 'promptRemoveReviewer': {
        if (p.login) {
          void onRemoveReviewer(p.login);
          break;
        }
        const opts = (detail?.requestedReviewers || []).map((id) => ({ id, label: id }));
        if (!opts.length) {
          setActionMsg('No requested reviewers to remove.');
          break;
        }
        setPicker({
          type: 'reviewer',
          title: 'Remove reviewer',
          options: opts,
          query: '',
          allowFreeText: true,
          onPick: (opt) => {
            closePicker();
            if (opt?.id) void onRemoveReviewer(opt.id);
          },
        });
        break;
      }
      case 'removeReviewer':
        if (p.login) void onRemoveReviewer(p.login);
        break;
      case 'promptAddAssignee':
        openAssigneePicker();
        break;
      case 'promptRemoveAssignee': {
        if (p.login) {
          void onRemoveAssignee(p.login);
          break;
        }
        const opts = (detail?.assignees || []).map((id) => ({ id, label: id }));
        if (!opts.length) {
          setActionMsg('No assignees to remove.');
          break;
        }
        setPicker({
          type: 'assignee',
          title: 'Unassign',
          options: opts,
          query: '',
          allowFreeText: true,
          onPick: (opt) => {
            closePicker();
            if (opt?.id) void onRemoveAssignee(opt.id);
          },
        });
        break;
      }
      case 'removeAssignee':
        if (p.login) void onRemoveAssignee(p.login);
        break;
      case 'promptLabels':
        openLabelPicker();
        break;
      case 'leaveReview':
        void onLeaveReviewAction(p.kind || 'comment');
        break;
      case 'closePr':
        void onClosePr();
        break;
      case 'reopenPr':
        void onReopenPr();
        break;
      case 'openGithub':
        if (detail?.htmlUrl) window.open(detail.htmlUrl, '_blank', 'noopener,noreferrer');
        break;
      case 'focusComment':
        focusCommentBox();
        break;
      case 'applySuggestion': {
        const fn = applyActionRef.current;
        if (typeof fn === 'function') fn();
        else setActionMsg('Hover a suggestion block first, then apply.');
        break;
      }
      case 'toggleLabel': {
        if (!p.name || !detail) break;
        const names = (detail.labels || []).map((l) => l.name || l);
        const next = names.includes(p.name)
          ? names.filter((n) => n !== p.name)
          : [...names, p.name];
        void (async () => {
          setActionBusy(true);
          try {
            const api = globalThis.PRTreeFetch;
            await api.setIssueLabels(detail.owner, detail.repo, detail.number, next);
            setActionMsg('Labels updated.');
            await onRefresh?.();
          } catch (err) {
            setActionMsg(err?.message || String(err));
          } finally {
            setActionBusy(false);
          }
        })();
        break;
      }
      case 'noop':
      default:
        break;
    }
  }

  function onSelectionStart(row, point) {
    if (typeof beginLineSelection !== 'function') return;
    const sel = beginLineSelection(row);
    if (!sel) return;
    selectingRef.current = true;
    pointerStartRef.current = point || null;
    setSelecting(true);
    setLineSelection(sel);
    setShowSelectionComposer(false);
  }

  function onSelectionExtend(row: any) {
    if (!selectingRef.current || typeof extendLineSelection !== 'function') return;
    setLineSelection((prev) => extendLineSelection(prev, row) || prev);
  }

  function onSelectionEnd(point, forcedMode) {
    if (!selectingRef.current && forcedMode !== 'click') return;
    selectingRef.current = false;
    setSelecting(false);
    const mode =
      forcedMode ||
      (typeof selectionGestureMode === 'function'
        ? selectionGestureMode(pointerStartRef.current, point || pointerStartRef.current)
        : 'click');
    setLineSelection((prev) => {
      if (!prev) return prev;
      if (typeof finalizeSelection === 'function') return finalizeSelection(prev, mode);
      return prev;
    });
    pointerStartRef.current = null;
    setSelectionIslandLeaving(false);
    setShowSelectionComposer(true);
  }

  /**
   * Post a selection line comment.
   * @param asPending Start review / Add comment — always GitHub PENDING review
   */
  async function postSelectionLineComment(payload: any, { asPending = false } = {}) {
    const api = globalThis.PRTreeFetch;
    if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
    // New pending activity cancels a prior discard force-drop so host PENDING
    // from this post is not immediately stripped on the next refresh merge.
    if (asPending) forceDropPendingRef.current = false;
    const raw = await api.postReviewComment(detail.owner, detail.repo, detail.number, {
      body: payload.body,
      path: payload.path,
      line: payload.line,
      side: payload.side,
      commitId: payload.commit_id || detail.headSha,
      startLine: payload.start_line,
      startSide: payload.start_side,
      asPending: Boolean(asPending),
    });
    const isPending = Boolean(raw?.pending || asPending || serverPendingReviewId);
    if (isPending) forceDropPendingRef.current = false;
    const optimistic = mapRestReviewComment(raw, {
      body: payload.body,
      path: payload.path,
      line: payload.line,
      startLine: payload.start_line,
      side: payload.side,
      author: detail.viewerLogin || '',
      pending: isPending,
      pendingReviewId: raw?.pendingReviewId || serverPendingReviewId || null,
      threadNodeId: raw?.threadNodeId || null,
    });
    if (optimistic) {
      setLocalDetail((prev) => {
        const withComment =
          typeof appendOptimisticReviewComment === 'function'
            ? appendOptimisticReviewComment(prev, { ...optimistic, pending: isPending })
            : prev
              ? {
                  ...prev,
                  reviewComments: [
                    ...(prev.reviewComments || []),
                    { ...optimistic, pending: isPending },
                  ],
                }
              : prev;
        if (!withComment) return withComment;
        // New activity cancels discard-strip so merge won't drop this row
        if (!isPending) {
          return withComment._dropPending
            ? { ...withComment, _dropPending: undefined }
            : withComment;
        }
        // Seed viewerPendingReview so toolbar Submit appears immediately
        const reviewId = optimistic.pendingReviewId || raw?.pendingReviewId || null;
        const pendingRows = (withComment.reviewComments || []).filter(
          (c: any) => c?.pending
        );
        return {
          ...withComment,
          _dropPending: undefined,
          viewerPendingReview: withComment.viewerPendingReview ||
            (reviewId
              ? {
                  id: reviewId,
                  nodeId: null,
                  commentCount: pendingRows.length,
                }
              : null),
        };
      });
    }
    return { raw, isPending };
  }

  async function onSubmitSelectionCommentImmediate() {
    if (!detail || !lineSelection || typeof selectionToCommentPayload !== 'function') return;
    const payload: any = selectionToCommentPayload(lineSelection, {
      body: selectionDraft,
      commitId: detail.headSha,
    });
    if (!payload) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      // If a PENDING review already exists, GitHub forces attach — shown as pending
      const { isPending } = await postSelectionLineComment(payload, { asPending: false });
      setActionMsg(
        isPending
          ? payload.start_line != null
            ? `Added to pending review on ${payload.path}:${payload.start_line}–${payload.line}.`
            : `Added to pending review on ${payload.path}:${payload.line}.`
          : payload.start_line != null
            ? `Comment posted on ${payload.path}:${payload.start_line}–${payload.line}.`
            : `Comment posted on ${payload.path}:${payload.line}.`
      );
      dismissSelectionIsland();
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubmitSelectionCommentPending() {
    if (!detail || !lineSelection || typeof selectionToCommentPayload !== 'function') return;
    const payload: any = selectionToCommentPayload(lineSelection, {
      body: selectionDraft,
      commitId: detail.headSha,
    });
    if (!payload) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      // Unified: always create/attach GitHub PENDING review (no local-only batch)
      await postSelectionLineComment(payload, { asPending: true });
      setActionMsg(
        hasServerPending
          ? `Added to pending review on ${payload.path}:${payload.line}.`
          : `Started pending review on ${payload.path}:${payload.line}.`
      );
      dismissSelectionIsland();
      await onRefresh?.();
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onDiscardPendingReview() {
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const reviewId = serverPendingReviewId;
      if (reviewId && api?.deletePendingPullReview && detail) {
        await api.deletePendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          reviewId
        );
      }
      // Clear local draft batch
      setPendingReview(
        typeof discardPendingReview === 'function'
          ? discardPendingReview()
          : { comments: [], body: '' }
      );
      // Force-drop pending across the post-discard refresh race.
      forceDropPendingRef.current = true;
      setLocalDetail((prev) =>
        typeof stripPendingReviewFromDetail === 'function'
          ? stripPendingReviewFromDetail(prev)
          : prev
            ? {
                ...prev,
                viewerPendingReview: null,
                reviewComments: (prev.reviewComments || []).filter(
                  (c: any) => c && !c.pending
                ),
              }
            : prev
      );
      setActionMsg('Pending review discarded.');
      await onRefresh?.();
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  /**
   * Thread reply — Diff-style dual actions:
   * - mode `comment`: publish immediately when possible
   * - mode `pending`: Start review / Add comment (PENDING review)
   */
  async function onReplyToThread(thread: any, opts: any = {}) {
    const mode = opts?.mode === 'pending' ? 'pending' : 'comment';
    // Draft keys use the inline row / timeline id (usually the root comment id).
    const draftKey =
      thread?.id ??
      thread?.root?.id ??
      thread?.commentId ??
      thread?.root?.commentId;
    const body = (
      replyDrafts[String(draftKey)] ||
      (draftKey != null ? replyDrafts[String(Number(draftKey))] : '') ||
      ''
    ).trim();
    if (!detail || draftKey == null || !body) return;

    // GitHub only accepts replies to **top-level** review comments.
    const rootId =
      typeof resolveRootReviewCommentId === 'function'
        ? resolveRootReviewCommentId(detail.reviewComments || [], draftKey)
        : Number(draftKey);
    const parentId =
      typeof normalizeReviewCommentId === 'function'
        ? normalizeReviewCommentId(rootId ?? draftKey)
        : Number(rootId ?? draftKey);
    if (parentId == null || !Number.isFinite(Number(parentId))) {
      setActionMsg('Cannot reply: invalid review comment id.');
      return;
    }

    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.replyToReviewComment) throw new Error('Reply API unavailable');
      // Pending reply cancels a prior discard force-drop
      if (mode === 'pending') forceDropPendingRef.current = false;
      const threadNodeId =
        thread?.threadNodeId || thread?.root?.threadNodeId || null;
      const parentNodeId =
        thread?.root?.nodeId ||
        thread?.root?.node_id ||
        thread?.nodeId ||
        null;
      const raw = await api.replyToReviewComment(
        detail.owner,
        detail.repo,
        detail.number,
        parentId,
        body,
        {
          mode,
          threadNodeId,
          parentNodeId,
          path: thread?.root?.path || thread?.path || '',
          line: thread?.root?.line ?? thread?.line ?? null,
          side: thread?.root?.side || thread?.side || 'RIGHT',
          commitId: detail.headSha || null,
        }
      );
      const isPending = Boolean(raw?.pending || mode === 'pending');
      if (isPending) forceDropPendingRef.current = false;
      const optimistic = mapRestReviewComment(raw, {
        body,
        author: detail.viewerLogin || '',
        path: thread?.root?.path || thread?.path || '',
        line: thread?.root?.line ?? thread?.line ?? null,
        side: thread?.root?.side || 'RIGHT',
        inReplyToId: parentId,
        threadNodeId,
        pending: isPending,
        pendingReviewId: raw?.pendingReviewId ?? serverPendingReviewId ?? null,
      });
      if (optimistic) {
        setLocalDetail((prev) => {
          const withReply =
            typeof appendOptimisticReviewComment === 'function'
              ? appendOptimisticReviewComment(prev, {
                  ...optimistic,
                  pending: isPending,
                })
              : prev
                ? {
                    ...prev,
                    reviewComments: [
                      ...(prev.reviewComments || []),
                      { ...optimistic, pending: isPending },
                    ],
                  }
                : prev;
          if (!withReply || !isPending) return withReply;
          const reviewId =
            optimistic.pendingReviewId || raw?.pendingReviewId || serverPendingReviewId;
          return {
            ...withReply,
            _dropPending: undefined,
            viewerPendingReview:
              withReply.viewerPendingReview ||
              (reviewId
                ? {
                    id: reviewId,
                    nodeId: null,
                    commentCount: (withReply.reviewComments || []).filter(
                      (c: any) => c?.pending
                    ).length,
                  }
                : null),
          };
        });
      }
      setReplyDrafts((prev: any) => ({ ...prev, [String(draftKey)]: '' }));
      setActionMsg(
        isPending
          ? mode === 'pending'
            ? 'Reply added to pending review.'
            : 'Reply attached to your pending review.'
          : 'Reply posted.'
      );
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onResolveThread(threadNodeId, resolved) {
    if (!threadNodeId) {
      setActionMsg('Resolve requires a review thread id from GitHub.');
      return;
    }
    // Pending (unsubmitted) review threads cannot be resolved on GitHub
    const pendingOnThread = (detail?.reviewComments || []).some(
      (c: any) =>
        c?.pending && c.threadNodeId && String(c.threadNodeId) === String(threadNodeId)
    );
    if (pendingOnThread) {
      setActionMsg(
        'Cannot resolve a pending review thread. Submit or discard the pending review first.'
      );
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.resolveReviewThread) throw new Error('Resolve API unavailable');
      await api.resolveReviewThread(threadNodeId, resolved);
      setActionMsg(resolved ? 'Thread resolved.' : 'Thread unresolved.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function onToggleViewed(path: any) {
    setViewedPaths((prev) =>
      typeof toggleViewedPath === 'function' ? toggleViewedPath(prev, path) : prev
    );
  }

  async function onClosePr() {
    if (!detail) return;
    if (!window.confirm(`Close pull request #${detail.number}?`)) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.closePullRequest && !api?.updatePullState) {
        throw new Error('Close PR API unavailable');
      }
      if (api.closePullRequest) {
        await api.closePullRequest(detail.owner, detail.repo, detail.number);
      } else {
        await api.updatePullState(detail.owner, detail.repo, detail.number, 'closed');
      }
      setActionMsg('Pull request closed.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onReopenPr() {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.reopenPullRequest && !api?.updatePullState) {
        throw new Error('Reopen PR API unavailable');
      }
      if (api.reopenPullRequest) {
        await api.reopenPullRequest(detail.owner, detail.repo, detail.number);
      } else {
        await api.updatePullState(detail.owner, detail.repo, detail.number, 'open');
      }
      setActionMsg('Pull request reopened.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onEditTitle(nextTitle: string) {
    if (!detail) return;
    const title = String(nextTitle ?? '').trim();
    if (!title || title === String(detail.title || '').trim()) return;
    setActionBusy(true);
    setActionMsg('');
    // Optimistic title so header updates immediately
    setLocalDetail((prev) => (prev ? { ...prev, title } : prev));
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { title });
      setActionMsg('Title updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
      // Revert optimistic title on failure
      setLocalDetail((prev) =>
        prev ? { ...prev, title: detail.title } : prev
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function onSetDraftStage(stage: any) {
    if (!detail) return;
    const label = stage === 'ready' ? 'Mark ready for review' : 'Convert to draft';
    if (!window.confirm(`${label}?`)) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setPullRequestDraftStage) throw new Error('Draft stage API unavailable');
      await api.setPullRequestDraftStage(
        detail.owner,
        detail.repo,
        detail.number,
        stage === 'ready' ? 'ready' : 'draft',
        detail.nodeId
      );
      setActionMsg(stage === 'ready' ? 'Marked ready for review.' : 'Converted to draft.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onMergePr(method = 'merge') {
    if (!detail) return;
    if (detail.merged) {
      setActionMsg('Already merged.');
      return;
    }
    if (detail.draft) {
      setActionMsg('Cannot merge a draft PR. Mark ready for review first.');
      return;
    }
    const m = ['merge', 'squash', 'rebase'].includes(method) ? method : 'merge';
    if (!window.confirm(`${m === 'squash' ? 'Squash and merge' : m === 'rebase' ? 'Rebase and merge' : 'Merge'} PR #${detail.number}?`)) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.mergePullRequest) throw new Error('Merge API unavailable');
      await api.mergePullRequest(detail.owner, detail.repo, detail.number, {
        mergeMethod: m,
        commitTitle: detail.title,
      });
      setActionMsg(`Merged (${m}).`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onUpdateBranch() {
    if (!detail) return;
    if (!window.confirm(`Update branch ${detail.headRef} with latest ${detail.baseRef}?`)) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullBranch) throw new Error('Update branch API unavailable');
      await api.updatePullBranch(
        detail.owner,
        detail.repo,
        detail.number,
        detail.headSha
      );
      setActionMsg('Branch updated from base.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubscribe(want: any) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (want) {
        if (!api?.setIssueSubscription) throw new Error('Subscribe API unavailable');
        await api.setIssueSubscription(detail.owner, detail.repo, detail.number, {
          subscribed: true,
          ignored: false,
        });
        setLocalDetail((prev) => (prev ? { ...prev, subscribed: true } : prev));
        setActionMsg('Subscribed to notifications.');
      } else {
        if (!api?.deleteIssueSubscription && !api?.setIssueSubscription) {
          throw new Error('Unsubscribe API unavailable');
        }
        if (api.deleteIssueSubscription) {
          await api.deleteIssueSubscription(detail.owner, detail.repo, detail.number);
        } else {
          await api.setIssueSubscription(detail.owner, detail.repo, detail.number, {
            subscribed: false,
            ignored: true,
          });
        }
        setLocalDetail((prev) => (prev ? { ...prev, subscribed: false } : prev));
        setActionMsg('Unsubscribed.');
      }
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applyMilestoneNumber(milestone: number | null) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueMilestone) throw new Error('Milestone API unavailable');
      await api.setIssueMilestone(detail.owner, detail.repo, detail.number, milestone);
      setLocalDetail((prev) =>
        prev
          ? {
              ...prev,
              milestone:
                milestone == null
                  ? null
                  : {
                      number: milestone,
                      title: prev.milestone?.title || `Milestone ${milestone}`,
                    },
            }
          : prev
      );
      setActionMsg(milestone == null ? 'Milestone cleared.' : `Milestone set to #${milestone}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openMilestonePicker() {
    if (!detail) return;
    const current = detail.milestone;
    const pool = [
      current
        ? {
            id: String(current.number),
            label: `${current.title || 'Milestone'} (#${current.number})`,
          }
        : null,
      { id: '1', label: 'Milestone #1' },
      { id: '2', label: 'Milestone #2' },
      { id: '3', label: 'Milestone #3' },
      { id: '4', label: 'Milestone #4' },
      { id: '5', label: 'Milestone #5' },
    ].filter(Boolean);
    const seen = new Set();
    const options = pool.filter((o: any) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
    pickerAnchorRef.current = milestoneAddRef.current;
    setPicker({
      type: 'milestone',
      title: 'Set milestone',
      options,
      query: '',
      allowFreeText: true,
      placeholder: 'Filter or type a milestone number…',
      onPick: (opt) => {
        closePicker();
        const raw = String(opt?.id || opt?.label || '').replace(/[^\d]/g, '');
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          setActionMsg('Invalid milestone number.');
          return;
        }
        void applyMilestoneNumber(n);
      },
    });
  }

  async function onSetMilestone(clear = false) {
    if (!detail) return;
    if (clear) {
      if (!window.confirm('Clear milestone?')) return;
      await applyMilestoneNumber(null);
      return;
    }
    openMilestonePicker();
  }

  function onToggleThreadCollapse(commentId: any) {
    const key = String(commentId);
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Upload attachment via Contents API (GitHub-style markdown insert after upload).
   * Returns public download URL for markdown image/link.
   */
  async function onUploadFile(fileMeta: {
    file: File;
    name?: string;
    type?: string;
    size?: number;
  }): Promise<string> {
    if (!detail) throw new Error('No PR open');
    const api = globalThis.PRTreeFetch;
    if (!api?.uploadRepoFile) {
      throw new Error('File upload requires PAT with repo contents write access');
    }
    const file = fileMeta.file;
    const name = fileMeta.name || file.name || 'file.bin';
    const path =
      typeof buildAssetRepoPath === 'function'
        ? buildAssetRepoPath(name)
        : `.pr-plus-assets/${Date.now().toString(36)}-${name}`;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const contentBase64 = btoa(binary);
    const branch = detail.headRef || undefined;
    const result = await api.uploadRepoFile(detail.owner, detail.repo, {
      path,
      contentBase64,
      message: `pr+ attach ${name}`,
      branch,
    });
    const url = result?.downloadUrl || result?.htmlUrl || '';
    if (!url) throw new Error('Upload succeeded but no URL returned');
    return url;
  }

  async function applyRerequestReviewers(logins: string[]) {
    if (!detail || !logins?.length) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.requestReviewers) throw new Error('Request reviewers API unavailable');
      await api.requestReviewers(detail.owner, detail.repo, detail.number, logins);
      setActionMsg(`Re-requested review from ${logins.join(', ')}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openRerequestReviewerPicker() {
    if (!detail) return;
    const exclude = detail.requestedReviewers || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    pickerAnchorRef.current = reviewerAddRef.current;
    setPicker({
      type: 'reviewer',
      title: 'Re-request review (username)',
      options,
      query: '',
      allowFreeText: true,
      placeholder: 'Filter or type a username…',
      onPick: (opt) => {
        closePicker();
        const login = String(opt?.id || opt?.label || '').trim();
        if (!login) return;
        const filtered =
          typeof buildRerequestReviewerLogins === 'function'
            ? buildRerequestReviewerLogins({
                requestedReviewers: detail.requestedReviewers,
                reviews: detail.reviews,
                author: detail.author,
                extraLogins: [login],
              })
            : [login];
        if (!filtered.length) {
          setActionMsg('That user is already a pending requested reviewer.');
          return;
        }
        void applyRerequestReviewers(filtered);
      },
    });
  }

  async function onRerequestReview() {
    if (!detail) return;
    // Only past reviewers not already in requested_reviewers (pending POST → 422).
    const logins =
      typeof buildRerequestReviewerLogins === 'function'
        ? buildRerequestReviewerLogins({
            requestedReviewers: detail.requestedReviewers,
            reviews: detail.reviews,
            author: detail.author,
          })
        : [];
    if (!logins.length) {
      // No completed reviewers — pick a username via SearchableSelect
      openRerequestReviewerPicker();
      return;
    }
    if (!window.confirm(`Re-request review from: ${logins.join(', ')}?`)) {
      return;
    }
    await applyRerequestReviewers(logins);
  }

  /** Per-row re-request from the Reviewers widget (single login). */
  async function onRerequestReviewer(login: any) {
    if (!detail) return;
    const name = String(login || '').trim();
    if (!name) return;
    const alreadyPending = (detail.requestedReviewers || []).some(
      (r: any) => String(r || '').toLowerCase() === name.toLowerCase()
    );
    if (alreadyPending) {
      setActionMsg(`${name} is already a requested reviewer.`);
      return;
    }
    await applyRerequestReviewers([name]);
  }

  async function onDeleteReviewComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (!window.confirm('Delete this review comment?')) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteReviewComment) throw new Error('Delete review comment API unavailable');
      await api.deleteReviewComment(detail.owner, detail.repo, commentId);
      setActionMsg('Review comment deleted.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onDeleteIssueComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (!window.confirm('Delete this comment?')) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteIssueComment) throw new Error('Delete comment API unavailable');
      await api.deleteIssueComment(detail.owner, detail.repo, commentId);
      setActionMsg('Comment deleted.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }


  // Keep capture-phase keyboard handler on latest handlers/state (no stale closures).
  uiRef.current = {
    paletteOpen,
    searchOpen,
    layoutMode,
    editingBody,
    editingComment,
    pickerOpen: Boolean(picker),
    showSelectionComposer,
  };
  actionsRef.current = {
    onClose: requestClose,
    onToggleDiff,
    collapseDiff,
    closePicker,
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = String(e.key || '').toLowerCase();
      const ui = uiRef.current || {};
      const act = actionsRef.current || {};

      // Escape: dismiss nested UI first, otherwise close the whole modal
      // (including from Diff — do not shrink back to conversation).
      if (e.key === 'Escape') {
        // Inline title editor owns Escape (cancel) while focused
        const ae = typeof document !== 'undefined' ? document.activeElement : null;
        if (
          ae &&
          (ae as HTMLElement).classList?.contains('prp-header__title-input')
        ) {
          return;
        }
        if (ui.pickerOpen) {
          e.preventDefault();
          e.stopPropagation();
          act.closePicker?.();
          return;
        }
        if (ui.paletteOpen) {
          e.preventDefault();
          e.stopPropagation();
          setPaletteOpen(false);
          return;
        }
        if (ui.searchOpen) {
          e.preventDefault();
          setSearchOpen(false);
          return;
        }
        if (ui.showSelectionComposer) {
          e.preventDefault();
          dismissSelectionIsland();
          return;
        }
        if (ui.editingBody || ui.editingComment) {
          e.preventDefault();
          setEditingBody(false);
          setEditingComment(null);
          editorSaveRef.current = null;
          return;
        }
        e.preventDefault();
        act.onClose?.();
        return;
      }

      const action =
        typeof resolveModalShortcutAction === 'function'
          ? resolveModalShortcutAction({
              mod: mod && !e.altKey,
              shift: Boolean(e.shiftKey),
              key,
              editingBody: ui.editingBody,
              editingComment: ui.editingComment,
              paletteOpen: ui.paletteOpen,
            })
          : null;

      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      switch (action) {
        case 'openPalette':
          setPaletteOpen(true);
          setPaletteQuery('');
          break;
        case 'toggleDiff':
          act.onToggleDiff?.();
          break;
        case 'openSearch':
          setSearchOpen(true);
          // Focus after SearchBar mounts
          queueMicrotask(() => {
            try {
              searchInputRef.current?.focus?.();
              searchInputRef.current?.select?.();
            } catch {
              /* ignore */
            }
          });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const stackPath = useMemo(() => {
    if (!detail?.number) return { items: [], branches: [] };
    const list = Array.isArray(openPulls) ? openPulls : [];
    const merged = list.some((p) => Number(p.number) === Number(detail.number))
      ? list
      : [
          ...list,
          {
            number: detail.number,
            title: detail.title,
            headRef: detail.headRef,
            baseRef: detail.baseRef,
            htmlUrl: detail.htmlUrl,
            draft: detail.draft,
          },
        ];
    if (typeof buildStackPathModel === 'function') {
      return buildStackPathModel(merged, detail.number, stackPathSelections);
    }
    if (typeof buildStackStrip === 'function') {
      return { items: buildStackStrip(merged, detail.number, stackPathSelections), branches: [] };
    }
    return { items: [], branches: [] };
  }, [openPulls, detail, stackPathSelections]);
  const stackItems = stackPath.items;

  // Independent section loading: initial (no detail yet) vs soft revalidate (detail present)
  const isInitialLoad = Boolean(loading && !detailProp);
  const isRevalidating = Boolean(loading && detailProp);
  const stageBusy = Boolean(loadStage?.busy);
  const stageLabel = loadStage?.label ? String(loadStage.label) : '';
  const showTopLoadBar = Boolean(
    isRevalidating ||
      stageBusy ||
      (isInitialLoad && !detailProp) ||
      searchBusy
  );

  // Keep bar/stage mounted through exit so hide transitions can finish.
  // Use CSS transitions (not only keyframes) — more reliable when class toggles.
  const LOAD_BAR_EXIT_MS = 280;
  const [topBarMounted, setTopBarMounted] = useState(false);
  const [topBarLeaving, setTopBarLeaving] = useState(false);
  const topBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topBarVisibleRef = useRef(false);
  const [stageMounted, setStageMounted] = useState(false);
  const [stageLeaving, setStageLeaving] = useState(false);
  const [stageDisplayLabel, setStageDisplayLabel] = useState('');
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageVisibleRef = useRef(false);

  useEffect(() => {
    if (showTopLoadBar) {
      if (topBarTimerRef.current) {
        clearTimeout(topBarTimerRef.current);
        topBarTimerRef.current = null;
      }
      topBarVisibleRef.current = true;
      setTopBarLeaving(false);
      setTopBarMounted(true);
      return undefined;
    }
    // Exit path: only once per hide cycle
    if (!topBarVisibleRef.current || !topBarMounted) return undefined;
    topBarVisibleRef.current = false;
    setTopBarLeaving(true);
    topBarTimerRef.current = setTimeout(() => {
      setTopBarMounted(false);
      setTopBarLeaving(false);
      topBarTimerRef.current = null;
    }, LOAD_BAR_EXIT_MS);
    return undefined;
  }, [showTopLoadBar, topBarMounted]);

  useEffect(() => {
    if (stageLabel) {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      stageVisibleRef.current = true;
      setStageDisplayLabel(stageLabel);
      setStageLeaving(false);
      setStageMounted(true);
      return undefined;
    }
    if (!stageVisibleRef.current || !stageMounted) return undefined;
    stageVisibleRef.current = false;
    setStageLeaving(true);
    stageTimerRef.current = setTimeout(() => {
      setStageMounted(false);
      setStageLeaving(false);
      setStageDisplayLabel('');
      stageTimerRef.current = null;
    }, LOAD_BAR_EXIT_MS);
    return undefined;
  }, [stageLabel, stageMounted]);

  if (!open) return null;

  const hit = activeSearchHit;
  const cls =
    `${layoutClassName(layoutMode)} ${shellClassName(shellMode)} ${animClass} ${theme.className}`.trim();

  return (
    <div
      className={`prp-overlay ${shellClassName(shellMode)} ${theme.className}${
        closing ? ' prp-overlay--leaving' : ''
      }`.trim()}
      tabIndex={-1}
      data-color-mode={theme.mode}
      data-shell={shellMode}
      data-layout={layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation'}
      data-leaving={closing ? '1' : '0'}
    >
      <div className="prp-backdrop" onClick={requestClose} />
      <div
        className={cls}
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Pull request #${detail.number}` : 'Pull request'}
        data-color-mode={theme.mode}
        data-shell={shellMode}
      >
        {topBarMounted ? (
          <div
            className={`prp-top-loading-bar${topBarLeaving ? ' prp-top-loading-bar--leaving' : ''}`}
            role="progressbar"
            aria-label={
              stageDisplayLabel ||
              (isRevalidating ? 'Refreshing pull request' : 'Loading pull request')
            }
            aria-busy={!topBarLeaving}
            aria-hidden={topBarLeaving ? true : undefined}
          />
        ) : null}
        {stageMounted && stageDisplayLabel ? (
          <div
            className={`prp-load-stage${stageBusy && !stageLeaving ? ' prp-load-stage--busy' : ''}${
              stageLeaving ? ' prp-load-stage--leaving' : ''
            }`}
            role="status"
            aria-live="polite"
            aria-hidden={stageLeaving ? true : undefined}
          >
            {stageBusy && !stageLeaving ? (
              <span className="prp-load-stage__spinner" aria-hidden="true" />
            ) : null}
            <span className="prp-load-stage__label">{stageDisplayLabel}</span>
          </div>
        ) : null}
        <Header
          detail={detail}
          onClose={requestClose}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          actionBusy={actionBusy}
          onClosePr={onClosePr}
          onReopenPr={onReopenPr}
          onEditTitle={onEditTitle}
          titleEditSignal={titleEditSignal}
          onChangeBase={openBasePicker}
          baseBranchRef={baseBranchRef}
          sectionLoading={isInitialLoad}
          shortcutMod={shortcutMod}
          shellMode={shellMode}
          onToggleShell={onToggleShell}
          onSubscribe={onSubscribe}
        />
        <StackStrip
          items={stackItems}
          branches={stackPath.branches}
          resetKey={prIdentity}
          onOpenPr={onOpenStackPr}
          onPathChange={(parentHeadRef, childNumber) => {
            setStackPathSelections((prev) => ({
              ...prev,
              [parentHeadRef]: Number(childNumber),
            }));
          }}
        />
        <SearchBar
          open={searchOpen}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          searching={searchBusy}
          showLoadComments={showLoadComments}
          onLoadComments={onSearchLoadComments}
          loadCommentsBusy={Boolean(loadStage?.busy && loadStage?.phase === 'threads')}
          onChange={onSearchQueryCommit}
          onClose={onSearchClose}
          onNext={onSearchNext}
          onPrev={onSearchPrev}
        />
        {error ? <div className="prp-status prp-status--error">{error}</div> : null}
        {/* Diff layout initial load uses full-body skeleton; conversation uses per-region skeletons */}
        {isInitialLoad && layoutMode === LAYOUT_DIFF ? (
          <LoadingSkeleton variant="diff" />
        ) : null}
        {(detail || isInitialLoad) && layoutMode === LAYOUT_CENTERED ? (
          <ConversationView
            detail={
              detail
                ? {
                    ...detail,
                    files: annotatedFiles,
                    magicLinks:
                      detail.magicLinks?.length
                        ? detail.magicLinks
                        : (openPulls || []).find(
                            (p) => Number(p.number) === Number(detail.number)
                          )?.magicLinks || [],
                  }
                : null
            }
            commentText={commentText}
            setCommentText={setCommentText}
            actionBusy={actionBusy}
            actionMsg={actionMsg}
            onLeaveReviewAction={onLeaveReviewAction}
            onDiscardPending={onDiscardPendingReview}
            timelinePage={timelinePage}
            onTimelinePage={setTimelinePage}
            sectionLoading={isInitialLoad}
            onDeleteIssueComment={onDeleteIssueComment}
            onDeleteReviewComment={onDeleteReviewComment}
            onEditIssueComment={(id, body) => onSaveEditComment('issue', id, body)}
            onEditReviewComment={(id, body) => onSaveEditComment('review', id, body)}
            editingBody={editingBody}
            onStartEditBody={() => setEditingBody(true)}
            onCancelEditBody={() => setEditingBody(false)}
            onSaveBody={onSaveBody}
            editingComment={editingComment}
            onStartEditComment={(kind, id) => setEditingComment({ kind, id })}
            onCancelEditComment={() => setEditingComment(null)}
            onSaveEditComment={onSaveEditComment}
            pendingCount={totalPendingCount}
            onLoadMoreReviewThreads={onLoadMoreReviewThreads}
            reviewThreadsMeta={detail?.reviewThreadsMeta || null}
            searchQuery={(searchQuery || '').trim()}
            searchHits={searchHits}
            searchHitIndex={searchHitIndex}
            activeSearchHit={activeSearchHit}
            onAddReviewer={openReviewerPicker}
            onRemoveReviewer={onRemoveReviewer}
            onAddAssignee={openAssigneePicker}
            onRemoveAssignee={onRemoveAssignee}
            onAddLabel={openLabelPicker}
            onRemoveLabel={onRemoveLabel}
            onApplySuggestion={onApplySuggestion}
            onRegisterApply={(fn) => {
              applyActionRef.current = fn;
            }}
            onRegisterEditorSave={(fn) => {
              editorSaveRef.current = fn;
            }}
            onSetMilestone={onSetMilestone}
            onOpenMilestonePicker={openMilestonePicker}
            onClearMilestone={() => void onSetMilestone(true)}
            onRerequestReviewer={onRerequestReviewer}
            onMergePr={onMergePr}
            onUpdateBranch={onUpdateBranch}
            onSetDraftStage={onSetDraftStage}
            onClosePr={onClosePr}
            onReopenPr={onReopenPr}
            commentBoxRef={commentBoxRef}
            onUploadFile={onUploadFile}
            reviewerAddRef={reviewerAddRef}
            assigneeAddRef={assigneeAddRef}
            labelAddRef={labelAddRef}
            milestoneAddRef={milestoneAddRef}
            replyDrafts={replyDrafts}
            onReplyDraft={(id: any, text: string) =>
              setReplyDrafts((prev: any) => ({ ...prev, [String(id)]: text }))
            }
            onReplyToThread={onReplyToThread}
            onResolveThread={onResolveThread}
          />
        ) : null}
        {detail && layoutMode === LAYOUT_DIFF ? (
          <div
            className={`prp-diff-layout${
              fileNav.collapsed ? ' prp-diff-layout--nav-collapsed' : ''
            }`}
            style={
              {
                // Keep a 3-track template for any grid fallbacks; primary layout
                // is flex + animated --prp-file-nav-width (see styles.css).
                gridTemplateColumns: fileNavGridTemplate(fileNav),
                ['--prp-file-nav-width' as any]: fileNav.collapsed
                  ? '0px'
                  : `${clampFileNavWidth(fileNav.width)}px`,
                ['--prp-file-nav-resizer' as any]: fileNav.collapsed ? '0px' : '4px',
              } as React.CSSProperties
            }
            data-file-nav-collapsed={fileNav.collapsed ? '1' : '0'}
            data-file-nav-width={clampFileNavWidth(fileNav.width)}
          >
            {/*
              Nav + resizer stay mounted so width/opacity can animate. Collapse
              is purely CSS (0-width tracks / flex basis); do not unmount.
            */}
            <FolderFileTree
              files={annotatedFiles}
              tree={fileTree}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              activePath={activeFilePath}
              onSelect={onSelectFile}
              collapsedFiles={collapsedFiles}
              onToggleFileCollapse={onToggleFileCollapse}
              fileQuery={fileQuery}
              onFileQuery={setFileQuery}
              threadCounts={threadCounts}
              viewedPaths={viewedPaths}
              onToggleViewed={onToggleViewed}
              navCollapsed={fileNav.collapsed}
              onToggleNavCollapse={onToggleFileNavCollapse}
            />
            <div
              className="prp-file-nav-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize files navigator"
              aria-valuenow={clampFileNavWidth(fileNav.width)}
              aria-valuemin={160}
              aria-valuemax={520}
              data-collapsed={fileNav.collapsed ? '1' : '0'}
              onPointerDown={onFileNavResizeStart}
              title="Drag to resize files navigator"
            />
            <div className="prp-diff-pane">
              <DiffToolbar
                detail={detail}
                fileNavCollapsed={fileNav.collapsed}
                onToggleFileNav={onToggleFileNavCollapse}
                annotatedFileCount={annotatedFiles.length}
                rowCount={virtualRows.length}
                filtered={Boolean(diffFilesOverride)}
                diffMode={diffMode}
                onDiffMode={(mode: string) => {
                  setDiffMode(mode);
                  setScrollTop(0);
                  if (listRef.current) listRef.current.scrollTop = 0;
                }}
                commits={detail.commits || []}
                commitFilter={diffCommitFilter}
                onCommitFilter={applyDiffCommitFilter}
                commitLoading={diffCommitLoading}
                commitError={diffCommitError}
                commitLabel={diffCommitLabel}
                commitDisabled={!onFetchCompareFiles}
                comments={mappedComments}
                commentIndex={commentIndex}
                onPrevComment={() => navComment(-1)}
                onNextComment={() => navComment(1)}
                pendingBatch={null}
                pendingServerCount={pendingCount}
                totalPendingCount={totalPendingCount}
                onDiscardPending={onDiscardPendingReview}
                onLeaveReviewAction={onLeaveReviewAction}
                actionBusy={actionBusy}
                actionMsg={actionMsg}
              />
              <VirtualDiff
                virtualRows={virtualRows}
                scrollTop={scrollTop}
                viewportHeight={viewportHeight}
                onViewportHeight={(h: number) => {
                  if (h > 0 && h !== viewportHeight) setViewportHeight(h);
                }}
                listRef={listRef}
                highlightRowIndex={
                  hit?.rowIndex ??
                  (commentIndex >= 0 ? mappedComments[commentIndex]?.rowIndex : undefined)
                }
                searchQuery={(searchQuery || '').trim()}
                searchMatchRows={searchMatchRows}
                activeSearchHit={hit}
                activeSearchOccurrence={activeSearchOccurrence}
                searchHits={searchHits}
                searchHitIndex={searchHitIndex}
                onScroll={(top) => setScrollTop(top)}
                selection={lineSelection}
                selecting={selecting}
                onSelectionStart={onSelectionStart}
                onSelectionExtend={onSelectionExtend}
                onSelectionEnd={onSelectionEnd}
                onToggleCollapse={onToggleFileCollapse}
                viewedPaths={viewedPaths}
                onToggleViewed={onToggleViewed}
                threadsByCommentId={threadsByCommentId}
                replyDrafts={replyDrafts}
                onReplyDraft={(id, text) =>
                  setReplyDrafts((prev) => ({ ...prev, [String(id)]: text }))
                }
                onReply={onReplyToThread}
                pendingCount={totalPendingCount}
                onResolve={onResolveThread}
                onDeleteReviewComment={onDeleteReviewComment}
                onEditReviewComment={onStartEditReviewComment}
                onSaveEditReviewComment={(id, body) =>
                  onSaveEditComment('review', id, body)
                }
                onCancelEditReviewComment={() => setEditingComment(null)}
                editingCommentId={
                  editingComment?.kind === 'review' ? editingComment.id : null
                }
                onRegisterEditorSave={(fn) => {
                  editorSaveRef.current = fn;
                }}
                onApplySuggestion={onApplySuggestion}
                onRegisterApply={(fn) => {
                  applyActionRef.current = fn;
                }}
                actionBusy={actionBusy}
                viewerLogin={detail.viewerLogin}
                prOpen={detail.state === 'open'}
                linkCtx={{
                  owner: detail.owner,
                  repo: detail.repo,
                  magicLinks:
                    detail.magicLinks?.length
                      ? detail.magicLinks
                      : (openPulls || []).find(
                          (p) => Number(p.number) === Number(detail.number)
                        )?.magicLinks || [],
                }}
                onUploadFile={onUploadFile}
                collapsedThreads={collapsedThreads}
                onToggleThreadCollapse={onToggleThreadCollapse}
              />
              {(showSelectionComposer || selectionIslandLeaving) && lineSelection ? (
                <SelectionCommentBar
                  selection={lineSelection}
                  draft={selectionDraft}
                  onDraft={setSelectionDraft}
                  onSubmitImmediate={onSubmitSelectionCommentImmediate}
                  onSubmitPending={onSubmitSelectionCommentPending}
                  onCancel={() => dismissSelectionIsland()}
                  actionBusy={actionBusy}
                  listRef={listRef}
                  leaving={selectionIslandLeaving}
                  pendingCount={totalPendingCount}
                  onUploadFile={onUploadFile}
                  linkCtx={{
                    owner: detail.owner,
                    repo: detail.repo,
                    magicLinks: detail.magicLinks || [],
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <CommandPalette
          open={paletteOpen}
          query={paletteQuery}
          onQuery={setPaletteQuery}
          commands={paletteCommands}
          onRun={runPaletteCommand}
          onClose={() => setPaletteOpen(false)}
        />
        <SearchableSelect
          open={!!picker}
          title={picker?.title}
          options={picker?.options || []}
          query={picker?.query || ''}
          onQuery={(q) => setPicker((prev) => (prev ? { ...prev, query: q } : prev))}
          onPick={(opt) => picker?.onPick?.(opt)}
          onClose={closePicker}
          allowFreeText={picker?.allowFreeText !== false}
          multi={Boolean(picker?.multi)}
          initialSelectedIds={picker?.initialSelectedIds || null}
          onConfirm={
            picker?.onConfirm
              ? (ids: string[]) => picker.onConfirm(ids)
              : null
          }
          confirmLabel={picker?.confirmLabel || 'Apply'}
          anchorRef={pickerAnchorRef}
          placement="top"
          placeholder={
            picker?.placeholder ||
            (picker?.type === 'base'
              ? 'Filter or type a branch…'
              : picker?.type === 'label'
                ? 'Filter or type labels…'
                : picker?.type === 'milestone'
                  ? 'Filter or type a milestone number…'
                  : picker?.type === 'assignee'
                    ? 'Filter or type usernames…'
                    : 'Filter or type a username…')
          }
        />
      </div>
    </div>
  );
}


export default PrModalApp;
