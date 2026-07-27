
export function PrModalApp({
  open,
  loading,
  loadStage = null,
  /** Independent side panels still loading without settled cache */
  sidePending = null,
  onLoadMoreReviewThreads = null,
  error,
  detail: detailProp,
  openPulls,
  onClose,
  onRefresh,
  onPatchDetail = null,
  onOpenStackPr,
  onFetchCompareFiles = null,
  onFetchAllPrCommits = null,
  onFetchAllPrFiles = null,
  initialRoute = null,
  onRouteChange = null,
  prefs = null,
  /** 'modal' overlay (default) | 'embed' in-page under GitHub header */
  presentation = 'modal',
  shellChrome = null,
  /** Embed: tear down replace mode and show original GH PR UI */
  onRestoreNative = null,
}: any) {
  const reverseComments = prefs?.reverseComments !== false;
  /** Diff hunk list shows only the active file; file tree still lists all. */
  const singleFileMode = prefs?.singleFileMode === true;
  const isEmbed = isEmbedPresentation(presentation);
  const embedChrome = shellChrome && typeof shellChrome === 'object' ? shellChrome : null;
  const showCloseChrome =
    !isEmbed &&
    (embedChrome?.showClose !== false) &&
    typeof onClose === 'function' &&
    shouldShowEmbedChrome(presentation, 'close');
  const showShellToggleChrome =
    !isEmbed && shouldShowEmbedChrome(presentation, 'shellToggle');
  const showFullscreenChrome =
    !isEmbed && shouldShowEmbedChrome(presentation, 'fullscreen');
  const showRestoreNativeChrome =
    isEmbed &&
    shouldShowEmbedChrome(presentation, 'restoreNative') &&
    typeof onRestoreNative === 'function';
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
  const detailRef = useRef(detail);
  detailRef.current = detail;

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
  /**
   * Opt-hold badges live in the store (OptBtnHint leaf-subscribes).
   * Refs track physical hold/suppress without re-rendering App/Conversation.
   */
  const optHeldRef = useRef(false);
  const optHintsSuppressedRef = useRef(false);
  /** In-app confirm dialog (replaces window.confirm). */
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'warn' | 'default';
    resolve: (ok: boolean) => void;
  }>(null);

  const requestConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      tone?: 'danger' | 'warn' | 'default';
    }) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel || 'Confirm',
          cancelLabel: opts.cancelLabel || 'Cancel',
          tone: opts.tone || 'default',
          resolve,
        });
      }),
    []
  );

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmState((prev) => {
      if (prev?.resolve) prev.resolve(ok);
      return null;
    });
  }, []);
  const commentPrefetchGenRef = useRef(0);
  /** Dedup GH commit-filter restore from inbound /changes/{sha}|{a}..{b}. */
  const ghCommitRouteAppliedRef = useRef<string | null>(null);
  /** Dedup GH #diff- selection restore / clear. */
  const ghSelectionAppliedRef = useRef<string | null>(null);

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
    setDiffThreadCollapse(new Map());
    setDiffReviewFilter(null);
    setFileExtFilter(new Set());
    setFileUnreadOnly(false);
    // Zustand selection survives remount — clear so we never write another PR's #diff-
    // Use getState() so this effect can run before setLineSelection is declared below
    // (avoids TDZ: Cannot access 'setLineSelection' before initialization).
    useModalStore.getState().setLineSelection(null);
    ghSelectionAppliedRef.current = null;
    ghCommitRouteAppliedRef.current = null;
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
            // Continue newest→older walks (issue from-end / review desc)
            order: meta.order || undefined,
            preferNewest: false,
          });
          if (cancelled || gen !== commentPrefetchGenRef.current) return;
          setLocalDetail((prev) => {
            if (!prev || Number(prev.number) !== Number(snap.number)) return prev;
            const tomb =
              listKey === 'reviewComments'
                ? prev._deletedReviewCommentIds
                : prev._deletedIssueCommentIds;
            const merged = mergeCommentsById(
              prev[listKey] || [],
              page?.items || [],
              tomb
            );
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
              const tomb =
                listKey === 'reviewComments'
                  ? prev._deletedReviewCommentIds
                  : prev._deletedIssueCommentIds;
              const merged = mergeCommentsById(
                prev[listKey] || [],
                page.items,
                tomb
              );
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
  const actionMsgSeq = useModalStore((s) => s.actionMsgSeq);
  const setActionMsg = useModalStore((s) => s.setActionMsg);
  const collapsedFiles = useModalStore((s) => s.collapsedFiles);
  const setCollapsedFiles = useModalStore((s) => s.setCollapsedFiles);
  const expandedDirs = useModalStore((s) => s.expandedDirs);
  const setExpandedDirs = useModalStore((s) => s.setExpandedDirs);
  const commentIndex = useModalStore((s) => s.commentIndex);
  const setCommentIndex = useModalStore((s) => s.setCommentIndex);
  // Do NOT subscribe to lineSelection/selecting for render — key-hold would
  // re-render the whole modal. VirtualDiff + SelectionCommentBar read the store.
  const setLineSelection = useModalStore((s) => s.setLineSelection);
  const setSelecting = useModalStore((s) => s.setSelecting);
  const selectionDraft = useModalStore((s) => s.selectionDraft);
  const setSelectionDraft = useModalStore((s) => s.setSelectionDraft);
  const showSelectionComposer = useModalStore((s) => s.showSelectionComposer);
  /** Selection island: action chips first, then comment composer. */
  const [selectionIslandPhase, setSelectionIslandPhase] = useState<
    'actions' | 'comment'
  >('actions');
  const setShowSelectionComposer = useModalStore((s) => s.setShowSelectionComposer);
  const selectionIslandLeaving = useModalStore((s) => s.selectionIslandLeaving);
  const setSelectionIslandLeaving = useModalStore((s) => s.setSelectionIslandLeaving);
  const fileQuery = useModalStore((s) => s.fileQuery);
  const setFileQuery = useModalStore((s) => s.setFileQuery);
  const viewedPaths = useModalStore((s) => s.viewedPaths);
  const setViewedPaths = useModalStore((s) => s.setViewedPaths);
  // Do NOT subscribe to replyDrafts for render — each keystroke would re-render
  // the whole modal. InlineThread leaf-subscribes to its own draft id.
  const setReplyDrafts = (fn: any) => {
    // bridge object-style updates used by existing call sites
    if (typeof fn === 'function') {
      const prev = useModalStore.getState().replyDrafts;
      const next = fn(prev) || {};
      if (next && typeof next === 'object') {
        useModalStore.setState({ replyDrafts: { ...next } });
      }
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
  /**
   * Diff inline-thread collapse overrides (commentId → collapsed).
   * Default: resolved threads start collapsed; open threads start expanded.
   */
  const [diffThreadCollapse, setDiffThreadCollapse] = useState(
    () => new Map<string, boolean>()
  );
  /**
   * Diff “expand gap” (context between hunks): path → head file lines,
   * path → merged 1-based new-line ranges already expanded.
   */
  const [diffFileLines, setDiffFileLines] = useState(
    () => new Map<string, string[]>()
  );
  const [diffExpandedRanges, setDiffExpandedRanges] = useState(
    () => new Map<string, Array<{ start: number; end: number }>>()
  );
  const [diffExpandBusyKey, setDiffExpandBusyKey] = useState<string | null>(null);
  /** Diff toolbar: Unresolved | Resolved | off (null). Filters files + review nav. */
  const [diffReviewFilter, setDiffReviewFilter] = useState<DiffReviewFilterMode>(null);
  /** Files-nav filters (shared with Diff review nav counts). */
  const [fileExtFilter, setFileExtFilter] = useState(() => new Set<string>());
  const [fileUnreadOnly, setFileUnreadOnly] = useState(false);
  /** Outer shell: modal (default) vs side sheet — persisted preference. */
  const [shellMode, setShellMode] = useState<ShellMode>(() => {
    try {
      if (typeof window === 'undefined') return SHELL_MODAL;
      return loadShellPref(resolveShellStorage(window));
    } catch {
      return SHELL_MODAL;
    }
  });
  /** Side-sheet width (px) — persisted, viewport-clamped on apply. */
  const [sheetWidth, setSheetWidth] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return SHEET_DEFAULT_WIDTH;
      return loadSheetWidth(resolveShellSizeStorage(window), {
        viewportWidth: window.innerWidth,
      });
    } catch {
      return SHEET_DEFAULT_WIDTH;
    }
  });
  /** Centered modal width/height (px) — persisted. */
  const [modalSize, setModalSize] = useState<ModalShellSize>(() => {
    try {
      if (typeof window === 'undefined') {
        return { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT };
      }
      return loadModalSize(resolveShellSizeStorage(window), {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    } catch {
      return { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT };
    }
  });
  /** Fullscreen shell — session-only; does not wipe stored sizes. */
  const [shellFullscreen, setShellFullscreen] = useState(false);
  /** Blue dimmer while resizing into the ~50px fullscreen snap zone (not yet committed). */
  const [shellFullscreenHint, setShellFullscreenHint] = useState(false);
  /** True while the user is dragging a shell resizer (disables size CSS transition). */
  const [shellResizing, setShellResizing] = useState(false);
  const shellResizeDragRef = useRef<
    | { kind: 'sheet'; startX: number; startWidth: number }
    | { kind: 'modal'; startX: number; startY: number; start: ModalShellSize }
    | null
  >(null);
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
  /** Conversation viewport: GraphQL PRRT_… ids currently on screen */
  const visibleConvThreadNodeIdsRef = useRef<string[]>([]);
  const searchInputRef = useRef<any>(null);
  const shellRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const commentBoxRef = useRef<any>(null);
  /**
   * Conversation keyboard focus — store only (leaf cards subscribe).
   * Ref mirrors last target for step nav without App re-render.
   */
  const conversationCommentFocusRef = useRef<{
    id: string;
    kind: string;
    anchor: string;
  } | null>(null);
  // Drop keyboard focus when switching PRs
  useEffect(() => {
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
  }, [prIdentity]);
  const collapseInitRef = useRef<any>(null);
  const selectingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<any>(null);
  /** Shift-click range: finalize as multi (do not collapse head to anchor). */
  const shiftRangeRef = useRef<boolean>(false);
  /**
   * Delay selection action toggles after line select/move so key-hold does not
   * remount the island (TipPopover layout) every keydown.
   */
  const selectionActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Coalesce key-repeat line moves to one React update per animation frame. */
  const selectionMoveRafRef = useRef(0);
  const pendingSelectionMoveRef = useRef<{ delta: number; shift: boolean } | null>(
    null
  );
  /**
   * Single-file mode: hop to adjacent file at EOF/BOF, then seed first/last
   * selectable line once virtualRows rebuild for that path.
   */
  const pendingCrossFileSeedRef = useRef<{
    path: string;
    edge: 'first' | 'last';
  } | null>(null);
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

  /** True after we paged through every commit/file for this PR open. */
  const commitsFullyLoadedRef = useRef(false);
  const filesFullyLoadedRef = useRef(false);
  const [commitListLoading, setCommitListLoading] = useState(false);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [prTags, setPrTags] = useState<Array<{ name: string; sha: string }> | null>(
    null
  );
  const [prTagsLoading, setPrTagsLoading] = useState(false);
  const [prTagsError, setPrTagsError] = useState<string | null>(null);

  useEffect(() => {
    commitsFullyLoadedRef.current = false;
    filesFullyLoadedRef.current = false;
    setPrTags(null);
    setPrTagsError(null);
  }, [prIdentity]);

  // Tags that point at commits in this PR (or head sha).
  useEffect(() => {
    if (!detail?.owner || !detail?.repo) return;
    const api = globalThis.PRTreeFetch;
    let cancelled = false;
    const shas = [
      detail.headSha,
      ...((detail.commits || []).map((c: any) => c?.sha).filter(Boolean) as string[]),
    ];
    const uniq = [...new Set(shas.map((s) => String(s).trim()).filter(Boolean))];
    if (!uniq.length) {
      setPrTags([]);
      setPrTagsError(null);
      return;
    }
    setPrTagsLoading(true);
    setPrTagsError(null);
    void (async () => {
      try {
        let tags: any[] = [];
        if (typeof api?.fetchTagsForCommits === 'function') {
          tags = await api.fetchTagsForCommits(detail.owner, detail.repo, uniq);
        } else if (typeof api?.fetchRepoTags === 'function') {
          // Stale SW without FETCH_TAGS_FOR_COMMITS — filter client-side.
          const all = await api.fetchRepoTags(detail.owner, detail.repo);
          const want = new Set(uniq.map((s) => String(s).toLowerCase()));
          tags = (Array.isArray(all) ? all : []).filter((t: any) =>
            want.has(String(t?.sha || '').toLowerCase())
          );
        }
        if (cancelled) return;
        setPrTags(Array.isArray(tags) ? tags : []);
        setPrTagsError(null);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || String(err);
        // Stale service worker after upgrade: don't surface as a hard error.
        if (/unknown type:\s*PR_TREE_FETCH_TAGS/i.test(msg)) {
          setPrTags([]);
          setPrTagsError(null);
          try {
            console.warn(
              '[pr+] Tags require reloading the extension (chrome://extensions → pr+ → Reload).',
              msg
            );
          } catch {
            /* ignore */
          }
        } else {
          setPrTagsError(msg);
          setPrTags([]);
        }
      } finally {
        if (!cancelled) setPrTagsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    detail?.owner,
    detail?.repo,
    detail?.headSha,
    // Re-run when commit list identity changes (page load / ensureAll).
    detail?.commits?.length,
    prIdentity,
  ]);

  const ensureAllCommits = useCallback(async () => {
    if (!detail || typeof onFetchAllPrCommits !== 'function') return;
    if (commitsFullyLoadedRef.current) return;
    setCommitListLoading(true);
    try {
      const all = await onFetchAllPrCommits();
      if (!Array.isArray(all)) return;
      commitsFullyLoadedRef.current = true;
      setLocalDetail((prev: any) =>
        prev ? { ...prev, commits: all } : prev
      );
      try {
        onPatchDetail?.({ commits: all });
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setDiffCommitError(err?.message || String(err));
    } finally {
      setCommitListLoading(false);
    }
  }, [detail, onFetchAllPrCommits, onPatchDetail]);

  const ensureAllFiles = useCallback(async () => {
    if (!detail || typeof onFetchAllPrFiles !== 'function') return;
    if (filesFullyLoadedRef.current) return;
    // Don't clobber a commit-range override with full PR files mid-filter.
    if (diffFilesOverride) {
      filesFullyLoadedRef.current = true;
      return;
    }
    setFileListLoading(true);
    try {
      const all = await onFetchAllPrFiles({
        gitattributesText: detail.gitattributesText || '',
      });
      if (!Array.isArray(all) || !all.length) {
        filesFullyLoadedRef.current = true;
        return;
      }
      filesFullyLoadedRef.current = true;
      setLocalDetail((prev: any) => (prev ? { ...prev, files: all } : prev));
      try {
        onPatchDetail?.({ files: all, changedFiles: all.length });
      } catch {
        /* ignore */
      }
    } catch {
      /* soft-fail: keep partial file list */
    } finally {
      setFileListLoading(false);
    }
  }, [detail, onFetchAllPrFiles, onPatchDetail, diffFilesOverride]);

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

  const threadCounts = useMemo(() => {
    if (typeof countReviewThreadsByPath === 'function') {
      return countReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  const unresolvedThreadCounts = useMemo(() => {
    if (typeof countUnresolvedReviewThreadsByPath === 'function') {
      return countUnresolvedReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  const pendingThreadCounts = useMemo(() => {
    if (typeof countPendingReviewThreadsByPath === 'function') {
      return countPendingReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  /**
   * Filter-toggle badges — same universe as Diff comment nav (0/N):
   * thread roots on paths in the current file list. Prefer counting the same
   * roots filterReviewRootsForNav uses so pending/path rules match nav.
   */
  const reviewThreadTotals = useMemo(() => {
    const pathSet = new Set<string>();
    for (const f of annotatedFiles || []) {
      const p = f?.filename || f?.path;
      if (p) pathSet.add(String(p));
    }
    const all = detail?.reviewComments || [];
    // Same root selection as comment nav with no resolution filter
    if (typeof filterReviewRootsForNav === 'function') {
      const roots = filterReviewRootsForNav(all, null, pathSet);
      let unresolved = 0;
      let resolved = 0;
      let pendingThreads = 0;
      for (const c of roots) {
        if (!c) continue;
        const pending = Boolean(c.pending);
        // Match filterReviewRootsForNav pending-mode (replies may mark pending)
        // via a second pass: roots already include reply-pending via rootIsPending
        // only when mode is pending/unresolved. For null mode all roots return.
        // Re-check pending like unresolved mode would: use pending flag on root
        // and any pending reply in the full list.
        let isPending = pending;
        if (!isPending && c.id != null) {
          const rid = String(c.id);
          for (const r of all) {
            if (!r?.pending) continue;
            const parent = r.inReplyToId ?? r.in_reply_to_id ?? null;
            if (parent != null && String(parent) === rid) {
              isPending = true;
              break;
            }
          }
        }
        if (isPending) pendingThreads += 1;
        if (c.resolved) resolved += 1;
        else if (!isPending) unresolved += 1;
      }
      return {
        total: roots.length,
        unresolved,
        resolved,
        pendingThreads,
      };
    }
    if (typeof countReviewThreadTotals === 'function') {
      return countReviewThreadTotals(all, { allowedPaths: pathSet });
    }
    return { total: 0, unresolved: 0, resolved: 0, pendingThreads: 0 };
  }, [detail?.reviewComments, annotatedFiles]);

  /**
   * Resolve-status (Unresolved/Resolved/Pending) filter only.
   * Extension chips are derived from this list so selecting one ext does not
   * hide other ext chips / drop multi-select — only review mode reshapes them.
   */
  const reviewScopedFiles = useMemo(
    () =>
      filterFilesByReviewMode(
        annotatedFiles,
        threadCounts,
        unresolvedThreadCounts,
        diffReviewFilter,
        pendingThreadCounts
      ),
    [
      annotatedFiles,
      threadCounts,
      unresolvedThreadCounts,
      pendingThreadCounts,
      diffReviewFilter,
    ]
  );

  /**
   * Files after resolve-status + name/ext/unread filters, then **DFS tree
   * order** (dirs-first + name sort — same as left file explorer).
   * Shared by Diff virtual list, file tree, prev/next file nav, and pathOrder.
   */
  const displayFiles = useMemo(() => {
    let list = reviewScopedFiles;
    if (typeof filterFilesByQuery === 'function') {
      list = filterFilesByQuery(list, fileQuery);
    }
    list = filterFilesByExtensions(list, fileExtFilter);
    list = filterFilesUnreadOnly(list, viewedPaths, fileUnreadOnly);
    // One order for Diff + explorer + step-nav (not GitHub files[] API order)
    if (typeof filesInTreeOrder === 'function') {
      list = filesInTreeOrder(list);
    }
    return list;
  }, [
    reviewScopedFiles,
    fileQuery,
    fileExtFilter,
    viewedPaths,
    fileUnreadOnly,
  ]);

  /**
   * Diff virtual list source. In single-file mode only the active (or first)
   * file is flattened to rows; the left tree still uses full displayFiles.
   * Order is already DFS via displayFiles.
   */
  const diffDisplayFiles = useMemo(
    () =>
      typeof resolveDiffDisplayFiles === 'function'
        ? resolveDiffDisplayFiles(displayFiles, activeFilePath, singleFileMode)
        : displayFiles,
    [singleFileMode, displayFiles, activeFilePath]
  );

  /** @deprecated alias — keep names used below / tests */
  const reviewFilteredFiles = displayFiles;
  const navFiles = displayFiles;

  const displayPathSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of displayFiles) {
      const p = f?.filename || f?.path;
      if (p) s.add(p);
    }
    return s;
  }, [displayFiles]);

  /**
   * Review comments limited by thread resolution + current file set.
   * When no review filter is active, keep every comment on visible files
   * (including pending) so Diff inline cards always render.
   */
  const navReviewComments = useMemo(() => {
    const all = detail?.reviewComments || [];
    if (!diffReviewFilter && displayPathSet.size === annotatedFiles.length) {
      // Fast path: no review mode and no file filters that shrink the set
      const unfiltered =
        !String(fileQuery || '').trim() &&
        fileExtFilter.size === 0 &&
        !fileUnreadOnly;
      if (unfiltered) return all;
    }
    // Path-only filter when review mode is off — never drop pending by mode
    if (!diffReviewFilter) {
      if (!displayPathSet.size) return all;
      return all.filter((c: any) => {
        if (!c) return false;
        const path = c.path || '';
        return !path || displayPathSet.has(path);
      });
    }
    return typeof filterReviewCommentsForNav === 'function'
      ? filterReviewCommentsForNav(all, diffReviewFilter, displayPathSet)
      : all;
  }, [
    detail?.reviewComments,
    diffReviewFilter,
    displayPathSet,
    annotatedFiles.length,
    fileQuery,
    fileExtFilter,
    fileUnreadOnly,
  ]);

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
    const add = (v: unknown) => {
      const s = typeof v === 'string' ? v : (v as any)?.login || (v as any)?.name || '';
      if (s) names.add(String(s).replace(/^@/, ''));
    };
    if (detail?.author) add(detail.author);
    if (detail?.viewerLogin) add(detail.viewerLogin);
    for (const r of detail?.reviews || []) add(r.author);
    for (const c of detail?.comments || []) add(c.author);
    for (const c of detail?.reviewComments || []) add(c.author);
    for (const a of detail?.assignees || []) add(a);
    for (const r of detail?.requestedReviewers || []) add(r);
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
      flattenFilesToVirtualRows(diffDisplayFiles, diffMode, {
        collapsedPaths: collapsedFiles,
        viewedPaths,
        reviewComments: navReviewComments,
        expandedRanges: diffExpandedRanges,
        fileLineTexts: diffFileLines,
        // Image preview URLs for binary-less image files (added/replaced)
        owner: detail?.owner,
        repo: detail?.repo,
        baseSha: detail?.baseSha,
        headSha: detail?.headSha,
        baseRef: detail?.baseRef,
        headRef: detail?.headRef,
        webOrigin:
          typeof location !== 'undefined' ? location.origin : 'https://github.com',
      }),
    [
      diffDisplayFiles,
      diffMode,
      collapsedFiles,
      viewedPaths,
      navReviewComments,
      diffExpandedRanges,
      diffFileLines,
      detail?.owner,
      detail?.repo,
      detail?.baseSha,
      detail?.headSha,
      detail?.baseRef,
      detail?.headRef,
    ]
  );

  const fileStarts = useMemo(() => fileStartIndexMap(virtualRows), [virtualRows]);

  const isDiffCommentCollapsed = useCallback(
    (rowOrId: any, resolvedHint?: boolean) => {
      if (rowOrId && typeof rowOrId === 'object' && rowOrId.kind === 'inline-comment') {
        const id = rowOrId.commentId;
        const thread = threadsByCommentId?.get?.(String(id));
        const resolved = Boolean(thread?.resolved ?? rowOrId.resolved);
        return isDiffThreadCollapsed(id, resolved);
      }
      return isDiffThreadCollapsed(rowOrId, Boolean(resolvedHint));
    },
    [diffThreadCollapse, threadsByCommentId]
  );

  const commentHeightOpts = useMemo(
    () => ({
      isCollapsed: (row: any) => isDiffCommentCollapsed(row),
    }),
    [isDiffCommentCollapsed]
  );

  const avgH = useMemo(
    () => averageRowHeight(virtualRows, commentHeightOpts),
    [virtualRows, commentHeightOpts]
  );
  const rowOffsetList = useMemo(
    () =>
      typeof rowOffsets === 'function' ? rowOffsets(virtualRows, commentHeightOpts) : null,
    [virtualRows, commentHeightOpts]
  );

  // Diff comment navigator: filtered roots, top → bottom (file list + row order).
  const mappedComments = useMemo(() => {
    if (typeof mapCommentsToRowIndices !== 'function') return [];
    const pathOrder =
      typeof buildPathOrderMap === 'function'
        ? buildPathOrderMap(displayFiles)
        : null;
    const roots =
      typeof filterReviewRootsForNav === 'function'
        ? sortThreadRootComments(
            filterReviewRootsForNav(
              detail?.reviewComments || [],
              diffReviewFilter,
              displayPathSet
            ),
            pathOrder
          )
        : typeof sortThreadRootComments === 'function'
          ? sortThreadRootComments(navReviewComments, pathOrder)
          : navReviewComments;
    return mapCommentsToRowIndices(roots, virtualRows, { pathOrder });
  }, [
    detail?.reviewComments,
    virtualRows,
    diffReviewFilter,
    displayPathSet,
    displayFiles,
    navReviewComments,
  ]);

  // Keep commentIndex inside the filtered list when filters change
  useEffect(() => {
    if (commentIndex < 0) return;
    if (!mappedComments.length) {
      setCommentIndex(-1);
      return;
    }
    if (commentIndex >= mappedComments.length) {
      setCommentIndex(mappedComments.length - 1);
    }
  }, [mappedComments, commentIndex, setCommentIndex]);

  // Sync Diff context-thread id for tips / shortcuts (leaf-subscribe in InlineThread)
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF || commentIndex < 0) {
      useModalStore.getState().setActiveDiffCommentId(null);
      return;
    }
    const id = mappedComments[commentIndex]?.id;
    useModalStore
      .getState()
      .setActiveDiffCommentId(id != null ? id : null);
  }, [layoutMode, commentIndex, mappedComments]);

  // Search is view-scoped: Conversation corpus vs Diff virtual rows only.
  // Never mix the two so Find does not surface off-screen content.
  const searchMode =
    layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation';

  // Build index only while find is open — not on every keystroke.
  const searchDocs = useMemo(() => {
    if (!searchOpen) return [];
    if (typeof buildSearchIndex === 'function') {
      return buildSearchIndex(detail, virtualRows, { mode: searchMode });
    }
    return Array.isArray(virtualRows) ? virtualRows : [];
  }, [detail, virtualRows, searchOpen, searchMode]);
