
  const searchGenRef = useRef(0);
  const [searchBusy, setSearchBusy] = useState(false);
  /** After first non-empty search in this open session — gates Load Comments. */
  const [searchHasRun, setSearchHasRun] = useState(false);

  // New PR / close find → allow Load Comments to reappear after next search
  useEffect(() => {
    setSearchHasRun(false);
  }, [prIdentity]);

  // Fresh PR → drop expanded hunk context cache
  useEffect(() => {
    setDiffFileLines(new Map());
    setDiffExpandedRanges(new Map());
    setDiffExpandBusyKey(null);
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

      /**
       * Prefer Diff row targets first. Review-comment docs often carry BOTH
       * anchorId and rowIndex — old code checked anchorId first and forced
       * Conversation, so Search prev/next "jumped back" into Conversation.
       */
      if (searchHitHasRowIndex(hit)) {
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
              (mark || rowEl).scrollIntoView({
                block: 'center',
                inline: 'nearest',
              });
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
        return;
      }

      // Conversation-only anchors (body / issue comments / review events)
      if (hit.anchorId) {
        // Never yank Diff → Conversation during search navigation.
        // navSearch skips these while layout is Diff; if we still land here,
        // no-op rather than flipping the shell.
        if (layoutMode === LAYOUT_DIFF) {
          return;
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
      }
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
        // Use searchDocs snapshot only — do not depend on `detail` object identity
        // (host re-renders with new detail refs during thread load and would restart search forever).
        const sortOpts = {
          isCancelled,
          // Match sort order to the active view corpus
          mode: searchMode === 'diff' ? 'diff' : 'conversation',
          detail: detailRef.current,
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
        // Only auto-jump when the hit is visible in the *current* layout.
        // Avoid Diff → Conversation on first body/anchor match.
        if (
          st.shouldJump &&
          activeHit &&
          isNavigableSearchHit(activeHit) &&
          (typeof isSearchHitVisibleInLayout !== 'function' ||
            isSearchHitVisibleInLayout(activeHit, layoutMode))
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
  }, [
    searchQuery,
    searchDocs,
    setSearchHitsStore,
    jumpToSearchHit,
    searchMode,
    layoutMode,
  ]);

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
      // Layout-aware next/prev: skip conversation-only hits while in Diff so
      // "previous" never flips the shell to Conversation mid-nav.
      const st =
        typeof resolveNavSearchStateForLayout === 'function'
          ? resolveNavSearchStateForLayout(
              searchHits,
              searchHitIndex,
              delta,
              layoutMode
            )
          : typeof resolveNavSearchState === 'function'
            ? resolveNavSearchState(searchHits, searchHitIndex, delta)
            : null;
      if (!st) return;
      if (
        st.activeHit &&
        typeof isSearchHitVisibleInLayout === 'function' &&
        !isSearchHitVisibleInLayout(st.activeHit, layoutMode)
      ) {
        return;
      }
      setSearchHitIndex(st.hitIndex);
      if (st.shouldJump && st.activeHit) {
        jumpToSearchHit(st.activeHit);
      }
    },
    [
      searchHits,
      searchHitIndex,
      setSearchHitIndex,
      jumpToSearchHit,
      layoutMode,
    ]
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

  /**
   * After expand / filter clear, remappedComments gains a real rowIndex — finish scroll.
   * Stores comment id (+ optional path) while virtual rows rebuild.
   */
  const pendingCommentJumpRef = useRef<{
    commentId: string | number;
    path?: string;
  } | null>(null);

  const expandFileForJump = useCallback(
    (path: string) => {
      if (!path) return;
      setActiveFilePath(path);
      setCollapsedFiles((prev) => {
        const file = annotatedFiles.find(
          (f: any) => (f.filename || f.path) === path
        );
        if (
          !isPathCollapsed(
            path,
            prev,
            Boolean(file?.defaultCollapsed),
            false,
            viewedPaths
          )
        ) {
          return prev;
        }
        const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
        n.delete(path);
        return n;
      });
    },
    [annotatedFiles, setActiveFilePath, setCollapsedFiles, viewedPaths]
  );

  const scrollMappedCommentIntoView = useCallback(
    (active: { rowIndex?: number | null } | null | undefined) => {
      if (active?.rowIndex == null) return false;
      // ⌥J/K thread nav on Diff: pin active comment near 1/3 viewport height
      const top = scrollTopForIndex(
        active.rowIndex,
        avgH,
        viewportHeight,
        virtualRows.length,
        rowOffsetList,
        { align: 'third' }
      );
      // Single write path: DOM + store. VirtualDiff applies prop change once.
      // Extra rAF/scrollIntoView stacks cause visible shake on ⌥J/K.
      const el = listRef.current;
      if (el && Math.abs((el.scrollTop || 0) - top) > 1) {
        el.scrollTop = top;
      }
      const prevTop = Number(useModalStore.getState().scrollTop) || 0;
      if (Math.abs(prevTop - top) > 1) {
        setScrollTop(top);
      }
      return true;
    },
    [avgH, viewportHeight, virtualRows.length, rowOffsetList, setScrollTop]
  );

  /** Open Diff, expand file, scroll to thread root (or queue until rows re-map). */
  const jumpToReviewComment = useCallback(
    (target: {
      id?: string | number | null;
      path?: string | null;
      line?: number | null;
      side?: string | null;
    }) => {
      if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);

      // Clear thread filter if it hides the target file
      const path = target.path ? String(target.path) : '';
      if (
        path &&
        diffReviewFilter &&
        !reviewFilteredFiles.some(
          (f: any) => (f.filename || f.path) === path
        )
      ) {
        setDiffReviewFilter(null);
      }

      if (path) expandFileForJump(path);

      const id = target.id;
      let idx = -1;
      if (id != null) {
        idx = mappedComments.findIndex((c) => String(c.id) === String(id));
      }
      if (idx < 0 && path) {
        const line =
          target.line != null && Number.isFinite(Number(target.line))
            ? Number(target.line)
            : null;
        const side =
          String(target.side || 'RIGHT').toUpperCase() === 'LEFT'
            ? 'LEFT'
            : 'RIGHT';
        idx = mappedComments.findIndex((c) => {
          if (c.path !== path) return false;
          if (line == null) return true;
          const cl =
            c.line != null
              ? Number(c.line)
              : c.originalLine != null
                ? Number(c.originalLine)
                : null;
          if (cl !== line) return false;
          const cs =
            String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
          return cs === side;
        });
      }

      if (idx < 0) {
        // Still open Diff at file; comment may load later via Load more
        if (path) {
          expandFileForJump(path);
          const fileIdx = fileStarts.get(path);
          if (typeof fileIdx === 'number') {
            scrollMappedCommentIntoView({ rowIndex: fileIdx });
          }
        }
        return;
      }

      setCommentIndex(idx);
      const active = mappedComments[idx];
      useModalStore
        .getState()
        .setActiveDiffCommentId(active?.id ?? id ?? null);
      // Prefer exact inline row; if only header (collapsed) or missing, re-try after expand
      const onlyHeader =
        active?.rowIndex != null &&
        virtualRows[active.rowIndex]?.kind === 'file-header' &&
        virtualRows[active.rowIndex]?.collapsed;
      if (active?.rowIndex != null && !onlyHeader) {
        pendingCommentJumpRef.current = null;
        scrollMappedCommentIntoView(active);
      } else {
        pendingCommentJumpRef.current = {
          commentId: active?.id ?? id ?? idx,
          path: path || active?.path,
        };
        // Header fallback while waiting for expand remount
        scrollMappedCommentIntoView(active);
      }
    },
    [
      layoutMode,
      setLayoutMode,
      diffReviewFilter,
      reviewFilteredFiles,
      expandFileForJump,
      mappedComments,
      virtualRows,
      setCommentIndex,
      scrollMappedCommentIntoView,
      fileStarts,
    ]
  );

  // Finish jump after collapse expand / filter clear rebuilds virtual rows
  useEffect(() => {
    const pending = pendingCommentJumpRef.current;
    if (!pending || !mappedComments.length) return;
    const idx = mappedComments.findIndex(
      (c) => String(c.id) === String(pending.commentId)
    );
    if (idx < 0) return;
    const active = mappedComments[idx];
    if (active?.rowIndex == null) return;
    const row = virtualRows[active.rowIndex];
    // Wait until we have more than a collapsed header when possible
    if (row?.kind === 'file-header' && row.collapsed) return;
    pendingCommentJumpRef.current = null;
    setCommentIndex(idx);
    scrollMappedCommentIntoView(active);
  }, [
    mappedComments,
    virtualRows,
    setCommentIndex,
    scrollMappedCommentIntoView,
  ]);

  /** Pending Goto after expand: path + lines until virtualRows rebuild. */
  const pendingGotoRef = useRef<{
    path: string;
    startLine: number;
    endLine: number | null;
  } | null>(null);

  function scrollSelectionIntoView(sel: any) {
    const headIdx = Number(sel?.headRowIndex);
    if (!Number.isFinite(headIdx) || headIdx < 0) return;
    const top = scrollTopForIndex(
      headIdx,
      avgH,
      viewportHeight,
      virtualRows.length,
      rowOffsetList
    );
    setScrollTop(top);
    if (listRef.current) listRef.current.scrollTop = top;
  }

  // Single-file mode: seed first/last line after cross-file hop rebuilds rows
  useEffect(() => {
    const pending = pendingCrossFileSeedRef.current;
    if (!pending) return;
    const path = String(pending.path || '').trim();
    if (!path) {
      pendingCrossFileSeedRef.current = null;
      return;
    }
    const row =
      pending.edge === 'last'
        ? typeof lastSelectableRowInFile === 'function'
          ? lastSelectableRowInFile(virtualRows, path)
          : null
        : typeof firstSelectableRowInFile === 'function'
          ? firstSelectableRowInFile(virtualRows, path)
          : null;
    if (!row) {
      // Still collapsed / not in rows yet — keep waiting
      return;
    }
    pendingCrossFileSeedRef.current = null;
    const sel =
      typeof beginLineSelection === 'function' ? beginLineSelection(row) : null;
    if (sel) {
      setLineSelection(sel);
      setSelectionIslandLeaving(false);
      scheduleSelectionActionsReveal();
      queueMicrotask(() => {
        try {
          scrollSelectionHeadDomOnly(sel);
        } catch {
          /* ignore */
        }
      });
    }
  }, [virtualRows, singleFileMode]);

  // Finish Goto once expand rebuilds selectable rows for the target file
  useEffect(() => {
    const pending = pendingGotoRef.current;
    if (!pending) return;
    const result =
      typeof resolvePendingGotoSelection === 'function'
        ? resolvePendingGotoSelection(virtualRows, pending)
        : { status: 'idle' as const };
    if (result.status === 'waiting' || result.status === 'idle') return;
    pendingGotoRef.current = null;
    if (result.status === 'ready' && result.selection) {
      setLineSelection(result.selection);
      scrollSelectionIntoView(result.selection);
      setActionMsg('');
      return;
    }
    if (result.status === 'missing') {
      setActionMsg(
        `No selectable line ${pending.startLine} in ${pending.path}.`
      );
    }
  }, [
    virtualRows,
    avgH,
    viewportHeight,
    rowOffsetList,
    setLineSelection,
    setScrollTop,
    setActionMsg,
  ]);

  function navComment(delta: number) {
    if (!mappedComments.length) return;
    if (typeof resolveCommentNav === 'function') {
      const st = resolveCommentNav(mappedComments, commentIndex, delta);
      const active = st.active;
      if (active) {
        jumpToReviewComment({
          id: active.id,
          path: active.path,
          line: active.line ?? active.originalLine ?? null,
          side: active.side,
        });
      } else {
        setCommentIndex(st.commentIndex);
      }
    } else {
      const next =
        (commentIndex + delta + mappedComments.length) % mappedComments.length;
      const active = mappedComments[next];
      if (active) {
        jumpToReviewComment({
          id: active.id,
          path: active.path,
          line: active.line ?? active.originalLine ?? null,
          side: active.side,
        });
      } else {
        setCommentIndex(next);
      }
    }
  }

  /** Scroll left file-nav so the active file row is visible when off-screen. */
  function scrollFileNavRowIntoView(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    requestAnimationFrame(() => {
      try {
        const root =
          typeof document !== 'undefined'
            ? document.querySelector('.prp-filetree')
            : null;
        if (!root) return;
        const esc =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(p)
            : p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row =
          (root.querySelector(
            `.prp-filetree__item--active[data-file-path="${esc}"]`
          ) as HTMLElement | null) ||
          (root.querySelector(
            `[data-file-path="${esc}"]`
          ) as HTMLElement | null);
        row?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    });
  }

  /** Diff file step — same DFS order as explorer + Diff list (displayFiles). */
  function navFile(delta: number) {
    if (typeof resolveAdjacentFileNav !== 'function') return;
    const st = resolveAdjacentFileNav(displayFiles, activeFilePath, delta);
    if (st.path) onSelectFile(st.path);
  }

  /** Scroll Diff virtual list by ~one viewport page. */
  function scrollDiffPage(delta: number) {
    const el = listRef.current as HTMLElement | null;
    if (!el) return;
    const next =
      typeof nextScrollTopByPage === 'function'
        ? nextScrollTopByPage(
            el.scrollTop,
            el.clientHeight,
            el.scrollHeight,
            delta
          )
        : Math.max(
            0,
            Math.min(
              el.scrollHeight - el.clientHeight,
              el.scrollTop + (delta < 0 ? -1 : 1) * el.clientHeight * 0.9
            )
          );
    el.scrollTop = next;
    setScrollTop(next);
  }

  /**
   * ⌥↑ / ⌥↓ on Diff: override browser default — multi-step selection jump.
   * Scroll is handled once by selection reveal (no second scroll path — that
   * double-setState was a key-hold lag source).
   */
  function optArrowScrollSelect(delta: number) {
    if (layoutMode !== LAYOUT_DIFF) return;
    const dir = delta < 0 ? -1 : 1;
    const steps =
      (typeof DIFF_OPT_ARROW_SHORTCUT !== 'undefined' &&
        Number(DIFF_OPT_ARROW_SHORTCUT.selectionSteps)) ||
      8;
    applySelectionKeyboardMove(dir * steps, false);
  }

  /** Conversation timeline scroller (virtual list). */
  function conversationScrollerEl(): HTMLElement | null {
    try {
      if (typeof document === 'undefined') return null;
      return document.querySelector(
        '.prp-conversation-virtual.prp-scroll-float'
      ) as HTMLElement | null;
    } catch {
      return null;
    }
  }

  /**
   * ⌥↑ / ⌥↓ on Conversation: scroll the timeline panel (not selection).
   * ⌥⇧↑ / ⌥⇧↓: ~one viewport page.
   */
  function scrollConversationPanel(delta: number, page = false) {
    if (layoutMode === LAYOUT_DIFF) return;
    const el = conversationScrollerEl();
    if (!el) return;
    if (page) {
      const next =
        typeof nextScrollTopByPage === 'function'
          ? nextScrollTopByPage(
              el.scrollTop,
              el.clientHeight,
              el.scrollHeight,
              delta
            )
          : Math.max(
              0,
              Math.min(
                el.scrollHeight - el.clientHeight,
                el.scrollTop + (delta < 0 ? -1 : 1) * el.clientHeight * 0.9
              )
            );
      el.scrollTop = next;
      return;
    }
    const dir = delta < 0 ? -1 : 1;
    const rh =
      (typeof DIFF_OPT_ARROW_SHORTCUT !== 'undefined' &&
        Number((DIFF_OPT_ARROW_SHORTCUT as any).conversationRowHeight)) ||
      48;
    const dy =
      typeof optArrowScrollDeltaPx === 'function'
        ? optArrowScrollDeltaPx(dir, rh, el.clientHeight)
        : dir * rh * 8;
    if (typeof applyScrollerDelta === 'function') {
      applyScrollerDelta(el, dy);
    } else {
      el.scrollTop = Math.max(
        0,
        Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dy)
      );
    }
  }

  /**
   * Timeline items in **page visual order** (same as VirtualConversationList):
   * newest window (top) → oldest window (bottom). reverseComments only moves
   * composer/merge, not item order — do not reverse the list here.
   */
  function conversationCommentPageOrder() {
    const items =
      typeof buildConversationTimeline === 'function' && detail
        ? buildConversationTimeline(detail)
        : [];
    const timeline = (Array.isArray(items) ? items : []).filter(
      (i: any) => !(i && i.kind === 'review-group' && i.pending)
    );
    if (typeof partitionTimelineWithThreadGap === 'function') {
      const gap = partitionTimelineWithThreadGap(
        timeline,
        detail?.reviewThreadsMeta || null
      );
      if (gap?.showGap && Array.isArray(gap.bottom) && gap.bottom.length > 0) {
        return [...(gap.top || []), ...gap.bottom];
      }
    }
    return timeline;
  }

  /**
   * ⌥J / ⌥K on Conversation: step next/prev in page order (wraps).
   * Seeds on first press; focuses conversation layout if needed.
   */
  function navConversationComment(delta: number) {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageOrder();
    const cur =
      conversationCommentFocusRef.current?.anchor ||
      useModalStore.getState().focusedConversationAnchor ||
      null;
    const next =
      typeof stepConversationCommentFocus === 'function'
        ? stepConversationCommentFocus(ordered, cur, delta)
        : typeof pickConversationCommentFocusTarget === 'function'
          ? pickConversationCommentFocusTarget(ordered)
          : null;
    if (!next) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = next;
    // Scroll first; leaf scroller promotes focus ring after scroll.
    useModalStore.getState().requestConversationNav(next.anchor);
  }

  function toggleViewedActiveFile() {
    const path = String(activeFilePath || '').trim();
    if (!path) return;
    onToggleViewed(path);
  }

  /** Apply Diff review-filter toggle (⌥U/R/P). */
  function applyReviewFilterToggle(
    target: 'unresolved' | 'resolved' | 'pending'
  ) {
    setDiffReviewFilter((prev) =>
      typeof toggleReviewFilter === 'function'
        ? toggleReviewFilter(prev, target)
        : prev === target
          ? null
          : target
    );
  }

  /**
   * Goto path:line[:line] or bare line[:line] — select file + line range.
   * Expands collapsed files first; if rows are not ready, queues pendingGotoRef
   * and re-applies after virtualRows rebuild (same pattern as comment jump).
   * @returns false when parse/apply failed (keep Goto open)
   */
  function applyGotoQuery(query: string): boolean {
    if (typeof parseGotoQuery !== 'function') return false;
    const parsed = parseGotoQuery(query);
    if (!parsed) {
      setActionMsg('Invalid Goto query. Use path:line[:line] or line[:line].');
      return false;
    }
    const path =
      typeof resolveGotoPathAmongFiles === 'function'
        ? resolveGotoPathAmongFiles(
            parsed.path,
            activeFilePath,
            displayFiles
          )
        : String(parsed.path || activeFilePath || '').trim() || null;
    if (!path) {
      setActionMsg('No file for Goto — open a file or include a path.');
      return false;
    }
    // Force-expand collapsed/viewed/default-collapsed so selectable rows rebuild
    setCollapsedFiles((prev) =>
      typeof expandPathInCollapsedSet === 'function'
        ? expandPathInCollapsedSet(prev, path, annotatedFiles, viewedPaths)
        : (() => {
            const n = materializeCollapsedPaths(
              prev,
              annotatedFiles,
              viewedPaths
            );
            n.delete(path);
            return n;
          })()
    );
    // Expand + activate file (may rebuild virtualRows async)
    onSelectFile(path);

    const pending = {
      path,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
    };
    const result =
      typeof resolvePendingGotoSelection === 'function'
        ? resolvePendingGotoSelection(virtualRows, pending)
        : { status: 'missing' as const };

    if (result.status === 'ready' && result.selection) {
      pendingGotoRef.current = null;
      setLineSelection(result.selection);
      scrollSelectionIntoView(result.selection);
      setActionMsg('');
      return true;
    }

    if (result.status === 'waiting') {
      // File still collapsed / body not in virtualRows yet — re-apply after expand
      pendingGotoRef.current = pending;
      setActionMsg('');
      return true;
    }

    // Expanded but no selectable line, or unknown — still queue once so a
    // concurrent expand that lands next frame can succeed; effect fails cleanly.
    pendingGotoRef.current = pending;
    setActionMsg('');
    // Microtask: if rows already final and still missing, effect runs on next paint
    queueMicrotask(() => {
      try {
        const p = pendingGotoRef.current;
        if (!p || p.path !== path) return;
        const again =
          typeof resolvePendingGotoSelection === 'function'
            ? resolvePendingGotoSelection(
                // use latest store-driven rows from this render; effect handles later
                virtualRows,
                p
              )
            : { status: 'missing' as const };
        if (again.status === 'ready' && again.selection) {
          pendingGotoRef.current = null;
          setLineSelection(again.selection);
          scrollSelectionIntoView(again.selection);
        } else if (again.status === 'missing') {
          pendingGotoRef.current = null;
          setActionMsg(`No selectable line ${p.startLine} in ${p.path}.`);
        }
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  function clearSelectionActionsTimer() {
    if (selectionActionsTimerRef.current != null) {
      clearTimeout(selectionActionsTimerRef.current);
      selectionActionsTimerRef.current = null;
    }
  }

  /**
   * Hide action toggles immediately; re-show after idle so key-hold stays light.
   * File-target composer stays immediate (caller sets show + phase).
   */
  function scheduleSelectionActionsReveal() {
    clearSelectionActionsTimer();
    if (useModalStore.getState().showSelectionComposer) {
      setShowSelectionComposer(false);
    }
    const delay =
      typeof SELECTION_ACTIONS_REVEAL_MS === 'number'
        ? SELECTION_ACTIONS_REVEAL_MS
        : 300;
    selectionActionsTimerRef.current = setTimeout(() => {
      selectionActionsTimerRef.current = null;
      const st = useModalStore.getState();
      if (!st.lineSelection || st.selecting) return;
      // File-level composer is shown explicitly; do not override phase here
      if (
        st.lineSelection.kind === 'file' ||
        st.lineSelection.subjectType === 'file'
      ) {
        return;
      }
      setSelectionIslandLeaving(false);
      setSelectionIslandPhase('actions');
      setShowSelectionComposer(true);
    }, delay);
  }

  /**
   * Keep selection head visible with **minimal** scroll — do not re-center.
   * Forcing scrollTopForIndex (quarter align) on every arrow key jumps the Diff
   * upward after file-nav pin and suddenly reveals the previous file.
   */
  function scrollSelectionHeadDomOnly(sel: any) {
    const headIdx = Number(sel?.headRowIndex);
    if (!Number.isFinite(headIdx) || headIdx < 0) return;
    try {
      const el = listRef.current as HTMLElement | null;
      const cur =
        el && typeof el.scrollTop === 'number'
          ? el.scrollTop
          : Number(useModalStore.getState().scrollTop) || 0;
      const vp =
        el && el.clientHeight > 0
          ? el.clientHeight
          : viewportHeight;
      // Sticky file header overlays the top of the Diff list (~ROW_HEIGHT).
      // Without padTop, ArrowUp pins the caret under that fixed bar.
      const stickyTop =
        typeof ROW_HEIGHT === 'number' && ROW_HEIGHT > 0 ? ROW_HEIGHT : avgH;
      const top =
        typeof scrollTopToRevealIndex === 'function'
          ? scrollTopToRevealIndex(
              headIdx,
              cur,
              avgH,
              vp,
              virtualRows.length,
              rowOffsetList,
              { padTop: stickyTop + 2, padBottom: 2 }
            )
          : cur;
      if (Math.abs(top - cur) < 0.5) return;
      if (el) el.scrollTop = top;
      // Only sync store on real jumps so App does not re-render every key
      const prev = Number(useModalStore.getState().scrollTop) || 0;
      if (Math.abs(prev - top) >= Math.max(24, avgH * 2)) {
        setScrollTop(top);
      }
    } catch {
      /* ignore */
    }
  }

  /** Expand a path if collapsed so selectable lines exist after cross-file hop. */
  function ensureFileExpandedForSelection(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    setCollapsedFiles((prev) => {
      const file = annotatedFiles.find(
        (f: any) => (f.filename || f.path) === p
      );
      if (
        !isPathCollapsed(
          p,
          prev,
          Boolean(file?.defaultCollapsed),
          false,
          viewedPaths
        )
      ) {
        return prev;
      }
      if (typeof expandPathInCollapsedSet === 'function') {
        return expandPathInCollapsedSet(
          prev,
          p,
          annotatedFiles,
          viewedPaths
        );
      }
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      n.delete(p);
      return n;
    });
  }

  /**
   * Sync tree active path when caret crosses files (do NOT call onSelectFile —
   * that clears selection and re-pins scroll to file start).
   */
  function syncActiveFileFromSelection(sel: any) {
    const path = String(sel?.filePath || '').trim();
    if (!path) return;
    const cur = String(useModalStore.getState().activeFilePath || '').trim();
    if (path === cur) return;
    setActiveFilePath(path);
    ensureFileExpandedForSelection(path);
    scrollFileNavRowIntoView(path);
  }

  function flushSelectionKeyboardMove(delta: number, shift: boolean) {
    if (typeof moveLineSelection !== 'function') return;
    const st = useModalStore.getState();
    const activePath = String(st.activeFilePath || '').trim();
    const prevSel = st.lineSelection;
    const nextSel =
      moveLineSelection(prevSel, virtualRows, delta, {
        shift,
        activeFilePath: activePath,
      }) || prevSel;

    // No-op: skip React / scroll work under key-hold against an edge
    const unchanged =
      nextSel === prevSel ||
      (prevSel &&
        nextSel &&
        Number(nextSel.headRowIndex) === Number(prevSel.headRowIndex) &&
        Number(nextSel.anchorRowIndex) === Number(prevSel.anchorRowIndex) &&
        String(nextSel.filePath || '') === String(prevSel.filePath || ''));

    // Single-file mode hop at EOF/BOF (not multi-line extend)
    if (
      unchanged &&
      !shift &&
      singleFileMode &&
      typeof resolveAdjacentFileNav === 'function'
    ) {
      const atEdge =
        typeof isSelectionAtFileEdge === 'function'
          ? isSelectionAtFileEdge(prevSel || nextSel, virtualRows, delta)
          : true;
      if (atEdge) {
        const d = delta < 0 ? -1 : 1;
        const adj = resolveAdjacentFileNav(displayFiles, activePath, d);
        if (adj.path && adj.path !== activePath) {
          pendingCrossFileSeedRef.current = {
            path: adj.path,
            edge: d > 0 ? 'first' : 'last',
          };
          setActiveFilePath(adj.path);
          ensureFileExpandedForSelection(adj.path);
          scrollFileNavRowIntoView(adj.path);
          setLineSelection(null);
          scheduleSelectionActionsReveal();
          return;
        }
      }
    }

    if (unchanged) {
      // Still keep actions hidden while holding against edge
      scheduleSelectionActionsReveal();
      return;
    }

    setLineSelection(nextSel);
    // Avoid setSelectionIslandLeaving every frame if already false
    if (useModalStore.getState().selectionIslandLeaving) {
      setSelectionIslandLeaving(false);
    }
    scheduleSelectionActionsReveal();
    // DOM scroll + light path sync after paint (not another React commit)
    queueMicrotask(() => {
      try {
        const sel = useModalStore.getState().lineSelection || nextSel;
        const prevPath = String(activePath || '');
        const nextPath = String(sel?.filePath || '');
        if (nextPath && nextPath !== prevPath) {
          syncActiveFileFromSelection(sel);
        }
        scrollSelectionHeadDomOnly(sel);
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Keyboard line move — rAF-coalesced under key-repeat so held arrows do not
   * thrash React with one update per OS keydown.
   */
  function applySelectionKeyboardMove(delta: number, shift: boolean) {
    const pending = pendingSelectionMoveRef.current;
    if (pending && pending.shift === Boolean(shift)) {
      pending.delta += delta;
    } else {
      pendingSelectionMoveRef.current = {
        delta,
        shift: Boolean(shift),
      };
    }
    if (selectionMoveRafRef.current) return;
    selectionMoveRafRef.current = requestAnimationFrame(() => {
      selectionMoveRafRef.current = 0;
      const p = pendingSelectionMoveRef.current;
      pendingSelectionMoveRef.current = null;
      if (!p || !p.delta) return;
      flushSelectionKeyboardMove(p.delta, p.shift);
    });
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

    // Host/stack nav page wins so Diff↔Conversation is preserved when switching
    // stacked PRs (do not clobber with the target PR's stored session layout).
    const routePage = normalizePage(initialRoute?.page);
    if (routePage) {
      setLayoutMode(routePage === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED);
    }

    // Commit filter restore runs via applyDiffCommitFilter effect below
    // (needs detail.commits for compare range). Do not half-set state here.

    if (stored) {
      if (
        !routePage &&
        (stored.layoutMode === 'diff' || stored.layoutMode === 'centered')
      ) {
        setLayoutMode(
          stored.layoutMode === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED
        );
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

  // Inbound /changes/{sha}|{a}..{b} → full applyDiffCommitFilter (compare files + label)
  useEffect(() => {
    if (!open || !detail?.number) return;
    const filter = commitFilterFromGithubRoute(initialRoute || null);
    const key = `${detail.number}:${filter.mode}:${filter.sha || ''}:${filter.endSha || ''}`;
    if (ghCommitRouteAppliedRef.current === key) return;
    // Single/range need commits list to resolve compare base...head
    if (
      filter.mode !== 'all' &&
      (!Array.isArray(detail.commits) || detail.commits.length === 0)
    ) {
      return;
    }
    ghCommitRouteAppliedRef.current = key;
    void applyDiffCommitFilter(filter);
  }, [
    open,
    detail?.number,
    detail?.commits,
    initialRoute?.commitSha,
    initialRoute?.commitEndSha,
    applyDiffCommitFilter,
  ]);

  // Restore #diff-{key}R… line selection once files are available.
  // When inbound URL has no #diff-, clear zustand selection so URI write
  // does not re-emit a stale hash after soft-nav remount.
  useEffect(() => {
    if (!open || !detail?.number) return;
    const fileKey = initialRoute?.fileKey || null;
    const filePathHint = initialRoute?.filePath || null;
    const startLine = initialRoute?.startLine ?? null;
    const applyKey = `${detail.number}:${fileKey || ''}:${filePathHint || ''}:${startLine}:${initialRoute?.endLine ?? ''}`;
    if (ghSelectionAppliedRef.current === applyKey) return;

    if (!fileKey && !filePathHint) {
      ghSelectionAppliedRef.current = applyKey;
      setLineSelection(null);
      return;
    }

    const files =
      (Array.isArray(diffFilesOverride) && diffFilesOverride) ||
      (Array.isArray(detail.files) && detail.files) ||
      [];
    if (!files.length && !filePathHint) return;

    const path =
      (filePathHint && String(filePathHint)) ||
      findFilePathByDiffKey(files, fileKey) ||
      null;
    if (!path) return;

    ghSelectionAppliedRef.current = applyKey;
    setActiveFilePath(path);
    if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);

    if (startLine != null && Number(startLine) >= 1) {
      const end =
        initialRoute?.endLine != null &&
        Number(initialRoute.endLine) >= Number(startLine)
          ? Math.floor(Number(initialRoute.endLine))
          : Math.floor(Number(startLine));
      const side =
        String(initialRoute?.side || 'RIGHT').toUpperCase() === 'LEFT'
          ? 'LEFT'
          : 'RIGHT';
      setLineSelection({
        filePath: path,
        anchorLine: Math.floor(Number(startLine)),
        headLine: end,
        anchorSide: side,
        headSide: side,
      });
    } else {
      // File-level #diff-{key} without lines — clear line range selection
      setLineSelection(null);
    }
  }, [
    open,
    detail?.number,
    detail?.files,
    diffFilesOverride,
    initialRoute?.fileKey,
    initialRoute?.filePath,
    initialRoute?.startLine,
    initialRoute?.endLine,
    initialRoute?.side,
    layoutMode,
    setActiveFilePath,
    setLayoutMode,
    setLineSelection,
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
