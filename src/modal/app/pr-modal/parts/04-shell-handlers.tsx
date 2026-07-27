
  // Sync URI + host session open snap.
  // Embed: GitHub /pull/N/changes[/{sha}|/{a}..{b}]#diff-…R…
  // List modal: legacy prp_* query params.
  // On close (open true → false), strip prp_* only for modal presentation.
  const uriWasOpenRef = useRef(false);
  useEffect(() => {
    if (!open || !detail?.number) {
      if (uriWasOpenRef.current) {
        uriWasOpenRef.current = false;
        if (!isEmbed) {
          try {
            if (typeof history !== 'undefined' && typeof location !== 'undefined') {
              clearLocationRoute(history, location);
            }
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
    if (!routeWriteReady) return;

    uriWasOpenRef.current = true;
    const page =
      layoutMode === LAYOUT_DIFF ? 'diff' : ('conversation' as const);
    let position: string | null = null;
    if (commentIndex >= 0 && mappedComments[commentIndex]) {
      position = buildPositionFromComment(mappedComments[commentIndex]);
    }

    const commits = githubCommitsFromFilter(diffCommitFilter);
    const sel =
      page === 'diff'
        ? githubSelectionFields(useModalStore.getState().lineSelection)
        : {
            filePath: null,
            startLine: null,
            endLine: null,
            side: null as 'LEFT' | 'RIGHT' | null,
          };
    const fileKey =
      page === 'diff' && sel.filePath ? githubDiffFileKey(sel.filePath) : null;

    const routePayload = {
      page,
      position,
      number: detail.number,
      commitSha: page === 'diff' ? commits.commitSha : null,
      commitEndSha: page === 'diff' ? commits.commitEndSha : null,
      filePath: sel.filePath,
      fileKey,
      startLine: sel.startLine,
      endLine: sel.endLine,
      side: sel.side,
    };

    // Fixture / non-extension: write location directly (no chrome.*)
    try {
      if (typeof history !== 'undefined' && typeof location !== 'undefined') {
        if (isEmbed && detail.owner && detail.repo) {
          replaceGithubPrLocation(history, location, {
            owner: detail.owner,
            repo: detail.repo,
            number: detail.number,
            page,
            commitSha: routePayload.commitSha,
            commitEndSha: routePayload.commitEndSha,
            filePath: routePayload.filePath,
            fileKey: routePayload.fileKey,
            startLine: routePayload.startLine,
            endLine: routePayload.endLine,
            side: routePayload.side,
          });
        } else {
          replaceLocationRoute(history, location, {
            page,
            number: detail.number,
            position,
          });
        }
      }
    } catch {
      /* ignore */
    }

    if (typeof onRouteChange === 'function') {
      onRouteChange(routePayload);
    }
  }, [
    open,
    detail?.number,
    detail?.owner,
    detail?.repo,
    layoutMode,
    commentIndex,
    mappedComments,
    onRouteChange,
    routeWriteReady,
    isEmbed,
    diffCommitFilter,
  ]);

  // Debounced URI/hash update when selection moves (no App re-render per caret)
  useEffect(() => {
    if (!open || !routeWriteReady || !detail?.number) return undefined;
    let timer = 0;
    const unsub = useModalStore.subscribe((state, prev) => {
      if (state.lineSelection === prev.lineSelection) return;
      if (state.layoutMode !== LAYOUT_DIFF) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const sel = githubSelectionFields(
            useModalStore.getState().lineSelection
          );
          const commits = githubCommitsFromFilter(diffCommitFilter);
          const fileKey = sel.filePath
            ? githubDiffFileKey(sel.filePath)
            : null;
          if (typeof onRouteChange === 'function') {
            onRouteChange({
              page: 'diff',
              position: null,
              number: detail.number,
              commitSha: commits.commitSha,
              commitEndSha: commits.commitEndSha,
              filePath: sel.filePath,
              fileKey,
              startLine: sel.startLine,
              endLine: sel.endLine,
              side: sel.side,
            });
          }
        } catch {
          /* ignore */
        }
      }, 280);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [open, routeWriteReady, detail?.number, onRouteChange, diffCommitFilter]);

  // Reset route restore markers when modal closes
  useEffect(() => {
    if (open) return undefined;
    routeRestoreKeyRef.current = null;
    positionAppliedRef.current = null;
    setRouteWriteReady(false);
    return undefined;
  }, [open]);

  /** Instant layout swap — keep-alive panels, no fade/scale on Diff ↔ Conversation. */
  function expandDiff(after?: any) {
    setAnimClass('');
    setLayoutMode(LAYOUT_DIFF);
    after?.();
  }

  function collapseDiff() {
    setAnimClass('');
    setLayoutMode(LAYOUT_CENTERED);
  }

  function onToggleDiff() {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    else expandDiff();
  }

  /** Play exit animation, then notify host to unmount (modal + side sheet). */
  const requestClose = useCallback(() => {
    // Embed has no exit chrome — ignore close (Escape stays no-op for shell).
    if (isEmbed) return;
    if (closingRef.current || !open) return;
    closingRef.current = true;
    setClosing(true);
    // Drop deep-link params as soon as close starts (don't wait for anim end)
    try {
      if (typeof history !== 'undefined' && typeof location !== 'undefined') {
        clearLocationRoute(history, location);
      }
    } catch {
      /* ignore */
    }
    uriWasOpenRef.current = false;
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
  }, [open, onClose, shellMode, layoutMode, setAnimClass, isEmbed]);

  /**
   * After close or merge (or soft-revalidate that flips state), auto-close the
   * centered modal or side sheet so the user returns to the pulls list.
   * Does not close when opening an already-closed/merged PR.
   */
  const terminalClosePrKeyRef = useRef('');
  const terminalCloseWasTerminalRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!open) {
      terminalClosePrKeyRef.current = '';
      terminalCloseWasTerminalRef.current = null;
      return;
    }
    if (!detail) return;
    const key = `${detail.owner || ''}/${detail.repo || ''}#${detail.number}`;
    const isTerminal =
      Boolean(detail.merged) ||
      String(detail.state || '').toLowerCase() === 'closed';
    if (terminalClosePrKeyRef.current !== key) {
      terminalClosePrKeyRef.current = key;
      terminalCloseWasTerminalRef.current = isTerminal;
      return;
    }
    if (isTerminal && terminalCloseWasTerminalRef.current === false) {
      terminalCloseWasTerminalRef.current = true;
      requestClose();
      return;
    }
    terminalCloseWasTerminalRef.current = isTerminal;
  }, [open, detail, requestClose]);

  /**
   * One-shot enter animation when the shell opens.
   * Depends only on `open` (not loading/loadStage/detail) so progressive host
   * re-renders during fetch must not re-fire sheet/modal enter motion.
   */
  const enterAnimTokenRef = useRef(0);
  useEffect(() => {
    if (!open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      closingRef.current = false;
      setClosing(false);
      enterAnimTokenRef.current += 1;
      return;
    }
    if (isEmbed) {
      // Embed has no enter chrome animation
      if (!closingRef.current) setAnimClass('');
      return;
    }
    if (closingRef.current) return;

    const token = ++enterAnimTokenRef.current;
    // Capture shell at open — preference is already hydrated via useState init
    const sheetSlide =
      shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
    const enterClass = sheetSlide
      ? 'prp-modal--sheet-in'
      : 'prp-modal--animating prp-modal--anim-in';
    const duration = sheetSlide ? 250 : 290;
    setAnimClass(enterClass);
    const t = window.setTimeout(() => {
      if (enterAnimTokenRef.current !== token) return;
      if (!closingRef.current) setAnimClass('');
    }, duration);
    return () => {
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only; avoid load re-entry
  }, [open, isEmbed, setAnimClass]);

  // Lock document scroll while overlay is open so only the panel scrolls
  // (side sheet otherwise leaves a global scrollbar + nested scroll).
  // Embed fills GH main — leave document scroll alone.
  useEffect(() => {
    if (!open || isEmbed || typeof document === 'undefined') return undefined;
    const sbw =
      typeof window !== 'undefined' ? measureScrollbarWidth(window) : 0;
    const snap: ScrollLockSnapshot | null = applyScrollLock(document, {
      scrollbarWidth: sbw,
    });
    return () => {
      restoreScrollLock(document, snap);
    };
  }, [open, isEmbed]);

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
      const nextCollapsed = toggleFileNavCollapsed(prev.collapsed);
      // Expanding the files panel: load remaining file pages for search.
      if (prev.collapsed && !nextCollapsed) {
        void ensureAllFiles();
      }
      const next = {
        ...prev,
        collapsed: nextCollapsed,
        width: clampFileNavWidth(prev.width),
      };
      persistFileNav(next);
      return next;
    });
  }

  /** Conversation metadata-rail toggle (registered by ConversationView). */
  const asideToggleRef = useRef<(() => void) | null>(null);
  const onRegisterAsideToggle = useCallback((fn: (() => void) | null) => {
    asideToggleRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  /**
   * Context-thread actions from ConversationView (fold/goto/comment/resolve).
   * Diff path is handled in App via commentIndex + mappedComments.
   */
  const contextThreadActionsRef = useRef<{
    fold: () => boolean;
    gotoDiff: () => boolean;
    comment: () => boolean;
    resolve: () => boolean;
  } | null>(null);
  const onRegisterContextThreadActions = useCallback(
    (
      api: {
        fold: () => boolean;
        gotoDiff: () => boolean;
        comment: () => boolean;
        resolve: () => boolean;
      } | null
    ) => {
      contextThreadActionsRef.current =
        api && typeof api.fold === 'function' ? api : null;
    },
    []
  );

  /**
   * ⌥B — Diff: files navigator; Conversation: metadata rail.
   */
  function toggleSidePanel() {
    if (layoutMode === LAYOUT_DIFF) {
      onToggleFileNavCollapse();
      return;
    }
    try {
      asideToggleRef.current?.();
    } catch {
      /* ignore */
    }
  }

  /** Active Diff review-thread unit (⌥J/K nav index) — always read live store. */
  function getActiveDiffContextThread(): any | null {
    const st = useModalStore.getState();
    if (st.layoutMode !== LAYOUT_DIFF) return null;
    const list = mappedComments;
    if (!list.length) return null;
    let idx = Number(st.commentIndex);
    if (!(idx >= 0 && idx < list.length) && st.activeDiffCommentId != null) {
      idx = list.findIndex(
        (c: any) => String(c?.id) === String(st.activeDiffCommentId)
      );
    }
    if (!(idx >= 0 && idx < list.length)) return null;
    return list[idx] || null;
  }

  /**
   * Ensure Diff has a context thread before fold/comment/resolve.
   * Seeds index 0 when user has not yet pressed ⌥J/K.
   */
  function ensureDiffContextThread(): any | null {
    let c = getActiveDiffContextThread();
    if (c) return c;
    const st = useModalStore.getState();
    if (st.layoutMode !== LAYOUT_DIFF || !mappedComments.length) return null;
    const first = mappedComments[0];
    if (!first || first.id == null) return null;
    setCommentIndex(0);
    useModalStore.getState().setActiveDiffCommentId(first.id);
    return first;
  }

  function runDiffContextThreadAction(
    kind: 'fold' | 'gotoDiff' | 'comment' | 'resolve'
  ): boolean {
    const c = ensureDiffContextThread();
    if (!c || c.id == null) return false;
    const id = c.id;
    const anchor = `review-comment:${id}`;
    const thread = threadsByCommentId?.get?.(String(id)) || null;
    const resolved = Boolean(thread?.resolved ?? c.resolved);
    const pending = Boolean(
      c.pending || thread?.pending || thread?.root?.pending
    );
    const threadNodeId =
      thread?.threadNodeId ||
      c.threadNodeId ||
      thread?.root?.threadNodeId ||
      null;

    if (kind === 'fold') {
      onToggleThreadCollapse(id, resolved);
      return true;
    }
    if (kind === 'gotoDiff') {
      // Already on Diff — re-reveal the active thread (scroll + expand file).
      jumpToReviewComment({
        id,
        path: c.path || thread?.root?.path || thread?.path,
        line: c.line ?? c.originalLine ?? thread?.root?.line ?? null,
        side: c.side || thread?.root?.side || 'RIGHT',
      });
      return true;
    }
    if (kind === 'comment') {
      if (isContextThreadReplyFocused(anchor)) {
        const drafts = useModalStore.getState().replyDrafts || {};
        const body = String(
          drafts[String(id)] ||
            (id != null ? drafts[String(Number(id))] : '') ||
            ''
        ).trim();
        if (!body) return false;
        void onReplyToThread(
          {
            id,
            path: c.path || thread?.root?.path,
            line: c.line ?? thread?.root?.line ?? null,
            side: c.side || thread?.root?.side || 'RIGHT',
            threadNodeId,
            root: thread?.root || c,
          },
          { mode: 'comment' }
        );
        return true;
      }
      // Ensure thread row is mounted/visible, expand, then focus reply.
      jumpToReviewComment({
        id,
        path: c.path || thread?.root?.path || thread?.path,
        line: c.line ?? c.originalLine ?? thread?.root?.line ?? null,
        side: c.side || thread?.root?.side || 'RIGHT',
      });
      if (isDiffThreadCollapsed(id, resolved)) {
        onToggleThreadCollapse(id, resolved);
      }
      focusContextThreadReplyAfterPaint(anchor);
      return true;
    }
    if (kind === 'resolve') {
      if (!threadNodeId || pending) return false;
      void onResolveThread(threadNodeId, !resolved);
      return true;
    }
    return false;
  }

  function runContextThreadAction(
    kind: 'fold' | 'gotoDiff' | 'comment' | 'resolve'
  ): boolean {
    // Prefer live store layout — keep-alive Conversation stays mounted on Diff.
    const liveLayout = useModalStore.getState().layoutMode;
    if (liveLayout === LAYOUT_DIFF) {
      return runDiffContextThreadAction(kind);
    }
    try {
      return Boolean(contextThreadActionsRef.current?.[kind]?.());
    } catch {
      return false;
    }
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

  function viewportSize() {
    if (typeof window === 'undefined') {
      return { viewportWidth: undefined as number | undefined, viewportHeight: undefined as number | undefined };
    }
    return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  }

  function persistSheetWidth(w: number) {
    try {
      if (typeof window !== 'undefined') {
        saveSheetWidth(resolveShellSizeStorage(window), w);
      }
    } catch {
      /* ignore */
    }
  }

  function persistModalSize(size: ModalShellSize) {
    try {
      if (typeof window !== 'undefined') {
        saveModalSize(resolveShellSizeStorage(window), size);
      }
    } catch {
      /* ignore */
    }
  }

  function onToggleShellFullscreen() {
    setShellFullscreen((prev) => toggleShellFullscreen(prev));
  }

  function onSheetResizeStart(e: React.PointerEvent) {
    if (shellMode !== SHELL_SHEET) return;
    if (layoutMode === LAYOUT_DIFF) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const { viewportWidth } = viewportSize();
    // Fullscreen → windowed: start at full viewport width so the left edge
    // tracks the handle immediately (natural shrink from full-bleed).
    const fromFs = Boolean(shellFullscreen);
    const startWidth = clampSheetWidth(
      fromFs ? viewportWidth : sheetWidth,
      { viewportWidth }
    );
    if (fromFs) {
      setShellFullscreen(false);
      setSheetWidth(startWidth);
      setShellFullscreenHint(true);
    }
    // Persistable width to keep if we re-enter fullscreen on release
    const widthBeforeGesture = clampSheetWidth(sheetWidth, { viewportWidth });
    shellResizeDragRef.current = { kind: 'sheet', startX, startWidth };
    setShellResizing(true);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const endDrag = (ev?: PointerEvent) => {
      shellResizeDragRef.current = null;
      setShellResizing(false);
      setShellFullscreenHint(false);
      if (ev) {
        try {
          target.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev: PointerEvent) => {
      const drag = shellResizeDragRef.current;
      if (!drag || drag.kind !== 'sheet') return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : viewportWidth;
      // During drag only resize — fullscreen waits until pointerup (handle release).
      const nextW = nextSheetWidthFromDrag(drag.startWidth, drag.startX, ev.clientX, {
        viewportWidth: vw,
      });
      setSheetWidth(nextW);
      setShellFullscreenHint(
        typeof sheetWidthHitsFullscreen === 'function' &&
          sheetWidthHitsFullscreen(nextW, vw, SHELL_FULLSCREEN_EDGE_PX)
      );
    };
    const onUp = (ev: PointerEvent) => {
      endDrag(ev);
      setSheetWidth((prev) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : undefined;
        const next = clampSheetWidth(prev, { viewportWidth: vw });
        // Promote to fullscreen only when the handle is released in the snap zone.
        // Keep a usable windowed width for the next exit (pre-gesture, not full vw).
        if (
          typeof sheetWidthHitsFullscreen === 'function' &&
          sheetWidthHitsFullscreen(next, vw, SHELL_FULLSCREEN_EDGE_PX)
        ) {
          setShellFullscreen(true);
          const keep = fromFs ? widthBeforeGesture : startWidth;
          persistSheetWidth(keep);
          return keep;
        }
        persistSheetWidth(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onModalResizeStart(e: React.PointerEvent) {
    if (shellMode !== SHELL_MODAL) return;
    if (layoutMode === LAYOUT_DIFF) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const { viewportWidth, viewportHeight } = viewportSize();
    // Fullscreen → windowed: start at full viewport so SE corner tracks the handle.
    const fromFs = Boolean(shellFullscreen);
    const start = clampModalSize(
      fromFs
        ? { width: viewportWidth, height: viewportHeight }
        : modalSize,
      { viewportWidth, viewportHeight }
    );
    const sizeBeforeGesture = clampModalSize(modalSize, {
      viewportWidth,
      viewportHeight,
    });
    if (fromFs) {
      setShellFullscreen(false);
      setModalSize(start);
      setShellFullscreenHint(true);
    }
    shellResizeDragRef.current = { kind: 'modal', startX, startY, start };
    setShellResizing(true);
    if (!fromFs) setShellFullscreenHint(false);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const endDrag = (ev?: PointerEvent) => {
      shellResizeDragRef.current = null;
      setShellResizing(false);
      setShellFullscreenHint(false);
      if (ev) {
        try {
          target.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev: PointerEvent) => {
      const drag = shellResizeDragRef.current;
      if (!drag || drag.kind !== 'modal') return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : viewportWidth;
      const vh = typeof window !== 'undefined' ? window.innerHeight : viewportHeight;
      const next = nextModalSizeFromDrag(
        drag.start,
        ev.clientX - drag.startX,
        ev.clientY - drag.startY,
        {
          viewportWidth: vw,
          viewportHeight: vh,
        }
      );
      setModalSize(next);
      setShellFullscreenHint(
        typeof modalSizeHitsFullscreen === 'function' &&
          modalSizeHitsFullscreen(next, vw, vh, SHELL_FULLSCREEN_EDGE_PX)
      );
    };
    const onUp = (ev: PointerEvent) => {
      endDrag(ev);
      setModalSize((prev) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : undefined;
        const vh = typeof window !== 'undefined' ? window.innerHeight : undefined;
        const next = clampModalSize(prev, {
          viewportWidth: vw,
          viewportHeight: vh,
        });
        // Release in snap zone → fullscreen; keep a windowed size for next exit.
        if (
          typeof modalSizeHitsFullscreen === 'function' &&
          modalSizeHitsFullscreen(next, vw, vh, SHELL_FULLSCREEN_EDGE_PX)
        ) {
          setShellFullscreen(true);
          const keep = fromFs ? sizeBeforeGesture : start;
          persistModalSize(keep);
          return keep;
        }
        persistModalSize(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Re-apply saved shell + sizes + file nav when modal opens (next PR / reopen)
  useEffect(() => {
    if (!open) return;
    try {
      if (typeof window === 'undefined') return;
      const stored = loadShellPref(resolveShellStorage(window));
      setShellMode(normalizeShell(stored));
      setFileNav(loadFileNavPref(resolveFileNavStorage(window)));
      const sizeStore = resolveShellSizeStorage(window);
      setSheetWidth(
        loadSheetWidth(sizeStore, { viewportWidth: window.innerWidth })
      );
      setModalSize(
        loadModalSize(sizeStore, {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        })
      );
      // Fullscreen is session-only; reset on each open for a predictable shell.
      setShellFullscreen(false);
      setShellFullscreenHint(false);
    } catch {
      /* ignore */
    }
  }, [open]);

  function onSelectFile(path: any) {
    setActiveFilePath(path);
    // Drop prior-file line selection so the next Arrow seeds the first
    // selectable (displayed) line of this file.
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
    }
    pendingSelectionMoveRef.current = null;
    selectingRef.current = false;
    setSelecting(false);
    setLineSelection(null);
    setShowSelectionComposer(false);
    setSelectionIslandLeaving(false);
    setSelectionIslandPhase('actions');
    // Auto-expand collapsed file when selected from tree (including defaults/viewed).
    // Use expandPathInCollapsedSet so emptying the set does not re-collapse
    // the path via isPathCollapsed's empty-set + viewedPaths branch.
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
      if (typeof expandPathInCollapsedSet === 'function') {
        return expandPathInCollapsedSet(
          prev,
          path,
          annotatedFiles,
          viewedPaths
        );
      }
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      n.delete(path);
      return n;
    });
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      // Pin file header to the first line of the Diff scrollport
      const top = scrollTopForIndex(
        idx,
        avgH,
        viewportHeight,
        virtualRows.length,
        rowOffsetList,
        { align: 'start' }
      );
      setScrollTop(top);
      if (listRef.current) listRef.current.scrollTop = top;
    }
    // Keep left nav focus visible when stepping to an off-screen file
    scrollFileNavRowIntoView(String(path || ''));
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
    // Materialize defaults first so toggling one path does not open every
    // other binary/huge/generated/viewed file that only collapsed via defaults.
    setCollapsedFiles((prev) => {
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
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

  function isEditableKeyboardTarget(el: EventTarget | null) {
    if (!el || typeof el !== 'object') return false;
    const node = el as HTMLElement;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
    if (node.isContentEditable) return true;
    return Boolean(node.closest?.('textarea, input, select, [contenteditable="true"]'));
  }

  function focusConversationCommentItem() {
    // Always land on conversation layout so the timeline is visible.
    // Scroll then focus via ConversationKbFocusScroller (leaf store sub).
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageOrder();
    const target =
      typeof pickConversationCommentFocusTarget === 'function'
        ? pickConversationCommentFocusTarget(ordered)
        : null;
    if (!target) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = target;
    useModalStore.getState().requestConversationNav(target.anchor);
  }

  function clearConversationCommentFocus() {
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
  }

  function dismissSelectionIsland(after?: any) {
    clearSelectionActionsTimer();
    setSelectionIslandLeaving(true);
    setTimeout(() => {
      setShowSelectionComposer(false);
      setLineSelection(null);
      setSelectionDraft('');
      setSelectionIslandPhase('actions');
      setSelectionIslandLeaving(false);
      after?.();
    }, 200);
  }

  async function copySelectionCode() {
    const sel = useModalStore.getState().lineSelection;
    if (!sel) return false;
    const text =
      typeof extractSelectedCodeText === 'function'
        ? extractSelectedCodeText(virtualRows, sel)
        : '';
    if (!text) {
      setActionMsg('No code in selection');
      return false;
    }
    const ok = await copyTextToClipboard(text);
    setActionMsg(ok ? 'Code copied' : 'Copy failed');
    return ok;
  }

  async function copySelectionUrl() {
    const sel = useModalStore.getState().lineSelection;
    if (!sel || !detail) return false;
    const norm =
      typeof normalizeSelection === 'function' ? normalizeSelection(sel) : null;
    if (!norm) return false;
    const url =
      typeof githubBlobLinePermalink === 'function'
        ? githubBlobLinePermalink({
            owner: detail.owner,
            repo: detail.repo,
            path: norm.filePath,
            startLine: norm.startLine,
            endLine: norm.endLine,
            side: norm.endSide,
            headSha: detail.headSha,
            headRef: detail.headRef,
            baseSha: detail.baseSha,
            baseRef: detail.baseRef,
          })
        : '';
    if (!url) {
      setActionMsg('Could not build URL');
      return false;
    }
    const ok = await copyTextToClipboard(url);
    setActionMsg(ok ? 'URL copied' : 'Copy failed');
    return ok;
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
