/**
 * Composition root for PR modal — host props + UI orchestration.
 * View surfaces live under views/*; common UI under components/common.
 * Interactive UI state can also be read via zustand store (see store/modal-store).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@common/Button';
import { SearchableSelect } from '@common/SearchableSelect';
import { Header } from '../views/chrome/Header';
import { StackStrip } from '../views/chrome/StackStrip';
import { SearchBar } from '../views/chrome/SearchBar';
import { CommandPalette } from '../views/chrome/CommandPalette';
import { LoadingSkeleton } from '../views/chrome/LoadingSkeleton';
import { CommentNavBar } from '../views/chrome/CommentNavBar';
import { PendingReviewBar } from '../views/chrome/PendingReviewBar';
import { DiffChrome } from '../views/chrome/DiffChrome';
import { ConversationView } from '../views/conversation/ConversationView';
import { FolderFileTree } from '../views/diff/FolderFileTree';
import { VirtualDiff } from '../views/diff/VirtualDiff';
import { SelectionCommentBar } from '../views/diff/SelectionCommentBar';
import { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } from '../lib/layout-mode';
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
import { filterFilesByQuery, countReviewThreadsByPath, groupReviewThreads, toggleViewedPath, isPathViewed } from '../lib/review-threads';
import { flattenFilesToVirtualRows, fileStartIndexMap } from '../lib/diff-rows';
import { buildNestedFileTree, flattenVisibleTree } from '../lib/file-tree';
import { sortInlineComments, mapCommentsToRowIndices, resolveCommentNav } from '../lib/comment-nav';
import { buildSearchIndex, resolveQuerySearchState, resolveNavSearchState } from '../lib/search-index';
import { calculateVisibleRange, scrollTopForIndex } from '../lib/virtual-range';
import {
  beginLineSelection, extendLineSelection, normalizeSelection, selectionToCommentPayload,
  finalizeSelection, selectionGestureMode, isRowInSelection, isSelectableDiffRow, selectionBlockRole,
} from '../lib/line-selection';
import {
  createEmptyPendingReview, addPendingComment, discardPendingReview, pendingReviewCount,
  buildPendingReviewSubmitPayload,
} from '../lib/pending-review';
import {
  parseSuggestionFences, applySuggestionToFileContent, mapLeaveReviewAction,
  buildRerequestReviewerLogins, mapRestReviewComment, mapRestIssueComment, appendOptimisticReviewComment,
} from '../lib/pr-edit-api';
import { buildPaletteCommands, filterPaletteCommands } from '../lib/command-palette';
import { resolveModalShortcutAction } from '../lib/shortcut-policy';
import { resolveGithubTheme } from '../lib/theme';
import { buildStackStrip } from '../lib/ui-polish';
import {
  filterSelectOptions, buildPeopleOptions, buildLabelOptions, buildBranchOptions, buildUnifiedReviewerRows,
} from '../lib/searchable-select';
import { loadSessionView, saveSessionView } from '../lib/session-view';
import {
  mergeDetailPreserveOptimistic,
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
  error,
  detail: detailProp,
  openPulls,
  onClose,
  onRefresh,
  onOpenStackPr,
  initialRoute = null,
  onRouteChange = null,
}: any) {
  const [localDetail, setLocalDetail] = useState(detailProp);
  // Merge host detail onto optimistic local state so reply/comment flash-revert is avoided
  useEffect(() => {
    if (!detailProp) return;
    setLocalDetail((prev) =>
      typeof mergeDetailPreserveOptimistic === 'function'
        ? mergeDetailPreserveOptimistic(prev, detailProp)
        : detailProp
    );
  }, [detailProp]);
  // Prefer optimistic local copy for all rendering / virtual rows / threads
  const detail = localDetail || detailProp;

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
      return loadFileNavPref(resolveFileNavStorage(window));
    } catch {
      return { collapsed: false, width: FILE_NAV_DEFAULT_WIDTH };
    }
  });
  const fileNavDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  /** True while playing close exit animation before host onClose. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
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

  const annotatedFiles = useMemo(() => {
    if (!detail?.files) return [];
    return annotateFilesForCollapse(detail.files, detail.gitattributesText || '');
  }, [detail]);

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

  const mappedComments = useMemo(() => {
    if (typeof mapCommentsToRowIndices !== 'function') return [];
    const sorted =
      typeof sortInlineComments === 'function'
        ? sortInlineComments(detail?.reviewComments || [])
        : detail?.reviewComments || [];
    return mapCommentsToRowIndices(sorted, virtualRows);
  }, [detail?.reviewComments, virtualRows]);

  useEffect(() => {
    if (!searchQuery || !virtualRows?.length) {
      setSearchHits([], -1);
      return;
    }
    if (typeof resolveQuerySearchState === 'function') {
      const docs =
        typeof buildSearchIndex === 'function'
          ? buildSearchIndex(detail, virtualRows)
          : virtualRows;
      const st = resolveQuerySearchState(docs, searchQuery);
      setSearchHits(st.hits || [], st.hitIndex ?? 0);
    }
  }, [searchQuery, virtualRows, detail]);

  function navSearch(delta: number) {
    if (!searchHits.length) return;
    if (typeof resolveNavSearchState === 'function') {
      const st = resolveNavSearchState(searchHits, searchHitIndex, delta);
      setSearchHitIndex(st.hitIndex);
      if (st.shouldJump && st.activeHit) {
        const top = scrollTopForIndex(
          st.activeHit.rowIndex,
          avgH,
          viewportHeight,
          virtualRows.length,
          rowOffsetList
        );
        setScrollTop(top);
        if (listRef.current) listRef.current.scrollTop = top;
      }
    }
  }

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



  async function onLeaveReviewAction(kind: any) {
    if (!detail) return;
    const mapped =
      typeof mapLeaveReviewAction === 'function'
        ? mapLeaveReviewAction(kind)
        : kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'issue-comment', event: 'COMMENT' };
    const body = commentText.trim();
    const pending =
      typeof pendingReviewCount === 'function'
        ? pendingReviewCount(pendingReview)
        : pendingReview?.comments?.length || 0;

    // Plain conversation comment (no pending line comments)
    if (mapped.kind === 'issue-comment' && !pending) {
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

    // Review path: Approve / Request changes / Comment with pending
    const event =
      mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
    if (event === 'REQUEST_CHANGES' && !body && !pending) {
      setActionMsg('Request changes requires a comment body or pending line comments.');
      focusCommentBox();
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.submitPullReview) throw new Error('Review API unavailable');
      const payload: any =
        typeof buildPendingReviewSubmitPayload === 'function'
          ? buildPendingReviewSubmitPayload(pendingReview, {
              event,
              body,
              commitId: detail.headSha,
            })
          : { event, body, commit_id: detail.headSha, comments: [] };
      if (!payload) throw new Error('Invalid review payload');
      await api.submitPullReview(detail.owner, detail.repo, detail.number, {
        event: payload.event,
        body: payload.body,
        commitId: payload.commit_id,
        comments: payload.comments,
      });
      setCommentText('');
      setPendingReview(
        typeof discardPendingReview === 'function'
          ? discardPendingReview()
          : { comments: [], body: '' }
      );
      setActionMsg(
        event === 'APPROVE'
          ? 'Approved.'
          : event === 'REQUEST_CHANGES'
            ? 'Requested changes.'
            : 'Review comment submitted.'
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
      typeof buildPeopleOptions === 'function' ? buildPeopleOptions(logins) : logins.map((id) => ({ id, label: id }));
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

  async function applyAddAssignee(login: any) {
    if (!detail || !login) return;
    const name = String(login).trim();
    if (!name) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.addAssignees) throw new Error('Add assignees API unavailable');
      await api.addAssignees(detail.owner, detail.repo, detail.number, [name]);
      setLocalDetail((prev) => {
        if (!prev) return prev;
        const existing = prev.assignees || [];
        if (existing.some((x) => String(x).toLowerCase() === name.toLowerCase())) return prev;
        return { ...prev, assignees: [...existing, name] };
      });
      setActionMsg(`Assigned ${name}.`);
      await onRefresh?.();
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
      typeof buildPeopleOptions === 'function' ? buildPeopleOptions(logins) : logins.map((id) => ({ id, label: id }));
    pickerAnchorRef.current = assigneeAddRef.current;
    setPicker({
      type: 'assignee',
      title: 'Add assignee',
      options,
      query: '',
      allowFreeText: true,
      onPick: (opt) => {
        closePicker();
        void applyAddAssignee(opt?.id || opt?.label);
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
      await api.removeAssignees(detail.owner, detail.repo, detail.number, [login]);
      setActionMsg(`Unassigned ${login}.`);
      await onRefresh?.();
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
      await api.setIssueLabels(detail.owner, detail.repo, detail.number, next);
      setLocalDetail((prev) =>
        prev
          ? {
              ...prev,
              labels: next.map((name) => {
                const existing = (prev.labels || []).find(
                  (l) => String(l.name || l).toLowerCase() === name.toLowerCase()
                );
                return existing || { name };
              }),
            }
          : prev
      );
      setActionMsg('Labels updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openLabelPicker() {
    if (!detail) return;
    const current = new Set(
      (detail.labels || []).map((l) => String(l.name || l).toLowerCase())
    );
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
    const options =
      typeof buildLabelOptions === 'function'
        ? buildLabelOptions(pool).filter((o) => !current.has(String(o.id).toLowerCase()))
        : pool
            .map((l) => (typeof l === 'string' ? l : l?.name))
            .filter((n) => n && !current.has(String(n).toLowerCase()))
            .map((id) => ({ id, label: id }));
    pickerAnchorRef.current = labelAddRef.current;
    setPicker({
      type: 'label',
      title: 'Add label',
      options,
      query: '',
      allowFreeText: true,
      onPick: (opt) => {
        closePicker();
        const name = String(opt?.id || opt?.label || '').trim();
        if (!name) return;
        const names = (detail.labels || []).map((l) => l.name || l);
        if (names.some((n) => String(n).toLowerCase() === name.toLowerCase())) return;
        void applySetLabels([...names, name]);
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

  function onStartEditReviewComment(id, body) {
    setEditingComment({ kind: 'review', id });
    // For inline edit from diff we use prompt for speed when body is long in virtual list
    if (layoutMode === LAYOUT_DIFF) {
      const next = window.prompt('Edit review comment:', body || '');
      if (next == null) {
        setEditingComment(null);
        return;
      }
      void onSaveEditComment('review', id, next);
    }
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
      case 'editTitle':
        void onEditTitle();
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
      const api = globalThis.PRTreeFetch;
      if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
      const raw = await api.postReviewComment(detail.owner, detail.repo, detail.number, {
        body: payload.body,
        path: payload.path,
        line: payload.line,
        side: payload.side,
        commitId: payload.commit_id,
        startLine: payload.start_line,
        startSide: payload.start_side,
      });
      const optimistic = mapRestReviewComment(raw, {
        body: payload.body,
        path: payload.path,
        line: payload.line,
        startLine: payload.start_line,
        side: payload.side,
        author: detail.viewerLogin || '',
      });
      if (optimistic) {
        setLocalDetail((prev) =>
          typeof appendOptimisticReviewComment === 'function'
            ? appendOptimisticReviewComment(prev, optimistic)
            : prev
              ? {
                  ...prev,
                  reviewComments: [...(prev.reviewComments || []), optimistic],
                }
              : prev
        );
      }
      setActionMsg(
        payload.start_line != null
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

  function onSubmitSelectionCommentPending() {
    if (!lineSelection || typeof selectionToCommentPayload !== 'function') return;
    if (typeof addPendingComment !== 'function') {
      setActionMsg('Pending review API unavailable');
      return;
    }
    const payload: any = selectionToCommentPayload(lineSelection, {
      body: selectionDraft,
      commitId: detail?.headSha,
    });
    if (!payload) return;
    const { batch, added } = addPendingComment(pendingReview, {
      path: payload.path,
      line: payload.line,
      side: payload.side,
      startLine: payload.start_line,
      startSide: payload.start_side,
      body: payload.body,
    });
    if (!added) return;
    setPendingReview(batch);
    setActionMsg(
      `Added to pending review (${typeof pendingReviewCount === 'function' ? pendingReviewCount(batch) : batch.comments.length}).`
    );
    dismissSelectionIsland();
  }

  function onDiscardPendingReview() {
    setPendingReview(
      typeof discardPendingReview === 'function'
        ? discardPendingReview()
        : { comments: [], body: '' }
    );
    setActionMsg('Pending review discarded.');
  }

  async function onReplyToThread(thread: any) {
    const id = thread?.id || thread?.root?.id;
    const body = (replyDrafts[String(id)] || '').trim();
    if (!detail || !id || !body) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.replyToReviewComment) throw new Error('Reply API unavailable');
      const raw = await api.replyToReviewComment(
        detail.owner,
        detail.repo,
        detail.number,
        id,
        body
      );
      const optimistic = mapRestReviewComment(raw, {
        body,
        author: detail.viewerLogin || '',
        path: thread?.root?.path || thread?.path || '',
        line: thread?.root?.line ?? thread?.line ?? null,
        side: thread?.root?.side || 'RIGHT',
        inReplyToId: id,
        threadNodeId: thread?.threadNodeId || thread?.root?.threadNodeId || null,
      });
      if (optimistic) {
        setLocalDetail((prev) =>
          typeof appendOptimisticReviewComment === 'function'
            ? appendOptimisticReviewComment(prev, optimistic)
            : prev
              ? {
                  ...prev,
                  reviewComments: [...(prev.reviewComments || []), optimistic],
                }
              : prev
        );
      }
      setReplyDrafts((prev: any) => ({ ...prev, [String(id)]: '' }));
      setActionMsg('Reply posted.');
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

  async function onEditTitle() {
    if (!detail) return;
    const next = window.prompt('PR title:', detail.title || '');
    if (next == null) return;
    const title = String(next).trim();
    if (!title || title === detail.title) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { title });
      setActionMsg('Title updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
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

  async function onRerequestReview() {
    if (!detail) return;
    // Only past reviewers not already in requested_reviewers (pending POST → 422).
    let logins =
      typeof buildRerequestReviewerLogins === 'function'
        ? buildRerequestReviewerLogins({
            requestedReviewers: detail.requestedReviewers,
            reviews: detail.reviews,
            author: detail.author,
          })
        : [];
    if (!logins.length) {
      const one = window.prompt(
        'No completed reviewers to re-request (pending requests are skipped). Username:'
      );
      if (!one) return;
      logins =
        typeof buildRerequestReviewerLogins === 'function'
          ? buildRerequestReviewerLogins({
              requestedReviewers: detail.requestedReviewers,
              reviews: detail.reviews,
              author: detail.author,
              extraLogins: [String(one).trim()],
            })
          : [String(one).trim()];
      if (!logins.length) {
        setActionMsg('That user is already a pending requested reviewer.');
        return;
      }
    } else if (!window.confirm(`Re-request review from: ${logins.join(', ')}?`)) {
      return;
    }
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

      // Escape is handled with layout context (diff vs close modal)
      if (e.key === 'Escape') {
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
        if (ui.layoutMode === LAYOUT_DIFF) {
          e.preventDefault();
          act.collapseDiff?.();
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
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const stackItems = useMemo(() => {
    if (typeof buildStackStrip !== 'function' || !detail?.number) return [];
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
    return buildStackStrip(merged, detail.number);
  }, [openPulls, detail]);

  if (!open) return null;

  const hit = searchHitIndex >= 0 ? searchHits[searchHitIndex] : null;
  const cls =
    `${layoutClassName(layoutMode)} ${shellClassName(shellMode)} ${animClass} ${theme.className}`.trim();
  // Independent section loading: initial (no detail yet) vs soft revalidate (detail present)
  const isInitialLoad = Boolean(loading && !detailProp);
  const isRevalidating = Boolean(loading && detailProp);

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
        {isRevalidating ? (
          <div
            className="prp-top-loading-bar"
            role="progressbar"
            aria-label="Refreshing pull request"
            aria-busy="true"
          />
        ) : null}
        <Header
          detail={detail}
          onClose={requestClose}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          themeMode={theme.mode}
          actionBusy={actionBusy}
          onClosePr={onClosePr}
          onReopenPr={onReopenPr}
          onEditTitle={onEditTitle}
          onChangeBase={openBasePicker}
          baseBranchRef={baseBranchRef}
          sectionLoading={isInitialLoad}
          shortcutMod={shortcutMod}
          shellMode={shellMode}
          onToggleShell={onToggleShell}
          onSubscribe={onSubscribe}
        />
        <StackStrip items={stackItems} onOpenPr={onOpenStackPr} />
        <SearchBar
          open={searchOpen}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          onChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onNext={() => navSearch(1)}
          onPrev={() => navSearch(-1)}
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
            pendingCount={
              typeof pendingReviewCount === 'function'
                ? pendingReviewCount(pendingReview)
                : 0
            }
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
            onRerequestReview={onRerequestReview}
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
          />
        ) : null}
        {detail && layoutMode === LAYOUT_DIFF ? (
          <div
            className={`prp-diff-layout${
              fileNav.collapsed ? ' prp-diff-layout--nav-collapsed' : ''
            }`}
            style={
              {
                gridTemplateColumns: fileNavGridTemplate(fileNav),
                ['--prp-file-nav-width' as any]: `${clampFileNavWidth(fileNav.width)}px`,
              } as React.CSSProperties
            }
            data-file-nav-collapsed={fileNav.collapsed ? '1' : '0'}
            data-file-nav-width={clampFileNavWidth(fileNav.width)}
          >
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
              <DiffChrome detail={detail} />
              <div className="prp-diff-pane__head">
                <div
                  className="prp-diff-mode"
                  role="radiogroup"
                  aria-label="Diff view mode"
                >
                  <label className="prp-diff-mode__opt">
                    <input
                      type="radio"
                      name="prp-diff-mode"
                      value="unified"
                      checked={diffMode === 'unified'}
                      onChange={() => {
                        setDiffMode('unified');
                        setScrollTop(0);
                        if (listRef.current) listRef.current.scrollTop = 0;
                      }}
                    />
                    Unified
                  </label>
                  <label className="prp-diff-mode__opt">
                    <input
                      type="radio"
                      name="prp-diff-mode"
                      value="split"
                      checked={diffMode === 'split'}
                      onChange={() => {
                        setDiffMode('split');
                        setScrollTop(0);
                        if (listRef.current) listRef.current.scrollTop = 0;
                      }}
                    />
                    Split
                  </label>
                </div>
                <span className="prp-muted" data-diff-mode={diffMode}>
                  {diffMode} · {virtualRows.length} rows · click single · drag multi
                </span>
                <CommentNavBar
                  comments={mappedComments}
                  commentIndex={commentIndex}
                  onPrev={() => navComment(-1)}
                  onNext={() => navComment(1)}
                />
                {actionMsg ? <span className="prp-action-inline"> · {actionMsg}</span> : null}
              </div>
              <PendingReviewBar
                batch={pendingReview}
                onDiscard={onDiscardPendingReview}
                onLeaveReviewAction={onLeaveReviewAction}
                actionBusy={actionBusy}
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
                onResolve={onResolveThread}
                onDeleteReviewComment={onDeleteReviewComment}
                onEditReviewComment={onStartEditReviewComment}
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
                  pendingCount={
                    typeof pendingReviewCount === 'function'
                      ? pendingReviewCount(pendingReview)
                      : 0
                  }
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
          anchorRef={pickerAnchorRef}
          placement="top"
          placeholder={
            picker?.placeholder ||
            (picker?.type === 'base'
              ? 'Filter or type a branch…'
              : picker?.type === 'label'
                ? 'Filter or type a label…'
                : picker?.type === 'milestone'
                  ? 'Filter or type a milestone number…'
                  : 'Filter or type a username…')
          }
        />
      </div>
    </div>
  );
}


export default PrModalApp;
