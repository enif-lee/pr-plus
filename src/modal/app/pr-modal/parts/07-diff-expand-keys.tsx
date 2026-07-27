
  function isDiffThreadCollapsed(commentId: any, resolved: boolean) {
    const key = String(commentId ?? '');
    if (diffThreadCollapse.has(key)) return Boolean(diffThreadCollapse.get(key));
    return Boolean(resolved);
  }

  function onToggleThreadCollapse(commentId: any, resolved?: boolean) {
    const key = String(commentId ?? '');
    if (!key) return;
    setDiffThreadCollapse((prev) => {
      const currently = prev.has(key)
        ? Boolean(prev.get(key))
        : Boolean(resolved);
      const next = new Map(prev);
      next.set(key, !currently);
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
      const result = await api.requestReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        logins
      );
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const existing = Array.isArray(detail.requestedReviewers)
        ? detail.requestedReviewers.slice()
        : [];
      const merged = [...existing];
      for (const name of logins) {
        if (!merged.some((x) => String(x).toLowerCase() === String(name).toLowerCase())) {
          merged.push(name);
        }
      }
      const requestedReviewers = fromApi.length ? fromApi : merged;
      commitMetaPatch({
        requestedReviewers,
        avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
      });
      setActionMsg(`Re-requested review from ${logins.join(', ')}.`);
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
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Re-request review?',
          message: `Re-request review from: ${logins.join(', ')}?`,
          confirmLabel: 'Re-request',
          tone: 'default',
        })
      )
    ) {
      return;
    }
    await applyRerequestReviewers(logins);
  }

  /** Per-row re-request from the Reviewers widget (single login). */
  async function onRerequestReviewer(login: any) {
    if (!detail) return;
    const name = String(login || '').trim();
    if (!name) return;
    // GitHub Apps / bots cannot be re-requested via REST request_reviewers
    if (
      typeof isBotAccount === 'function'
        ? isBotAccount(name, detail)
        : /\[bot\]$/i.test(name)
    ) {
      setActionMsg(`Cannot re-request review from bot ${name}.`);
      return;
    }
    const alreadyPending = (detail.requestedReviewers || []).some(
      (r: any) => String(r || '').toLowerCase() === name.toLowerCase()
    );
    if (alreadyPending) {
      setActionMsg(`${name} is already a requested reviewer.`);
      return;
    }
    await applyRerequestReviewers([name]);
  }

  /**
   * Apply local detail mutation + host cache patch (no full soft-refresh).
   * Strips local-only tombstone/meta fields that must not poison IDB permanently
   * beyond this session — but keeps comments/threads lists on the host.
   */
  function commitCommentListPatch(next: any) {
    if (!next) return;
    setLocalDetail(next);
    try {
      const {
        _metaSeq: _m,
        _dropPending: _d,
        _deletedReviewCommentIds: _dr,
        _deletedIssueCommentIds: _di,
        ...forHost
      } = next;
      onPatchDetail?.({
        ...forHost,
        reviewComments: next.reviewComments,
        comments: next.comments,
        reviewThreads: next.reviewThreads,
        viewerPendingReview: next.viewerPendingReview ?? null,
      });
    } catch {
      /* host optional */
    }
  }

  async function onDeleteReviewComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Delete review comment?',
          message: 'Delete this review comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    // Drop from local + host immediately so revalidate bulk-fetch and merge
    // cannot target / resurrect the deleted id.
    const stripped =
      typeof removeReviewCommentFromDetail === 'function'
        ? removeReviewCommentFromDetail(detail, commentId)
        : {
            ...detail,
            reviewComments: (detail.reviewComments || []).filter(
              (c: any) => c && String(c.id) !== String(commentId)
            ),
          };
    commitCommentListPatch(stripped);
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteReviewComment) throw new Error('Delete review comment API unavailable');
      await api.deleteReviewComment(detail.owner, detail.repo, commentId);
      setActionMsg('Review comment deleted.');
      // No full onRefresh — soft revalidate was re-fetching deleted PRRT ids and failing.
    } catch (err) {
      setActionMsg(err?.message || String(err));
      // Restore truth from host only on failure
      try {
        await onRefresh?.();
      } catch {
        /* ignore secondary errors */
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function onDeleteIssueComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Delete comment?',
          message: 'Delete this comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    const stripped =
      typeof removeIssueCommentFromDetail === 'function'
        ? removeIssueCommentFromDetail(detail, commentId)
        : {
            ...detail,
            comments: (detail.comments || []).filter(
              (c: any) => c && String(c.id) !== String(commentId)
            ),
          };
    commitCommentListPatch(stripped);
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteIssueComment) throw new Error('Delete comment API unavailable');
      await api.deleteIssueComment(detail.owner, detail.repo, commentId);
      setActionMsg('Comment deleted.');
    } catch (err) {
      setActionMsg(err?.message || String(err));
      try {
        await onRefresh?.();
      } catch {
        /* ignore */
      }
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
    confirmOpen: Boolean(confirmState),
    showSelectionComposer,
    selectionIslandPhase,
    conversationCommentFocused: Boolean(
      conversationCommentFocusRef.current ||
        useModalStore.getState().focusedConversationAnchor ||
        useModalStore.getState().pendingConversationNavAnchor
    ),
    contextThreadActive: Boolean(
      layoutMode === LAYOUT_DIFF
        ? commentIndex >= 0 && mappedComments[commentIndex]
        : conversationCommentFocusRef.current ||
            useModalStore.getState().focusedConversationAnchor ||
            useModalStore.getState().pendingConversationNavAnchor
    ),
    hasLineSelection: Boolean(useModalStore.getState().lineSelection),
  };
  actionsRef.current = {
    onClose: requestClose,
    onToggleDiff,
    collapseDiff,
    closePicker,
    focusConversationCommentItem,
    clearConversationCommentFocus,
    runContextThreadAction,
    openSelectionComment: () => {
      setSelectionIslandPhase('comment');
      setShowSelectionComposer(true);
    },
    openSelectionActions: () => {
      setSelectionIslandPhase('actions');
      setShowSelectionComposer(true);
    },
    copySelectionCode,
    copySelectionUrl,
    navSearch,
    navComment,
    navConversationComment,
    navFile,
    scrollDiffPage,
    optArrowScrollSelect,
    scrollConversationPanel,
    toggleViewedActiveFile,
    applyReviewFilterToggle,
    applyGotoQuery,
    applySelectionKeyboardMove,
    toggleSidePanel,
    openStackOrListPr,
    navigateAdjacentPr,
    stackItems,
    openPulls,
    runPaletteCommand,
  };

  // Clear selection action delay / move rAF when modal closes
  useEffect(() => {
    if (open) return undefined;
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
    }
    pendingSelectionMoveRef.current = null;
    try {
      publishShortcutMonitorFire(null);
    } catch {
      /* ignore */
    }
    return undefined;
  }, [open]);

  /** Report a fired product shortcut to the isolated monitor HUD (no App setState). */
  function reportShortcutMonitor(fire: any) {
    if (!fire || !fire.text) return;
    try {
      publishShortcutMonitorFire({ ...fire, at: fire.at || Date.now() });
    } catch {
      /* ignore */
    }
  }

  function reportShortcutAction(action: string) {
    if (!action || typeof buildShortcutMonitorFire !== 'function') return;
    reportShortcutMonitor(buildShortcutMonitorFire(action, isMac));
  }

  /**
   * Opt-hold → store only (no App setState). Leaf OptBtnHint + overlay class bridge
   * re-render; ConversationView tree stays memoized.
   */
  function syncOptHintsActive() {
    const ui = uiRef.current || {};
    const active =
      Boolean(optHeldRef.current) &&
      !optHintsSuppressedRef.current &&
      !ui.paletteOpen &&
      !ui.confirmOpen;
    useModalStore.getState().setOptHintsActive(active);
  }

  useEffect(() => {
    if (!open) {
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
      return undefined;
    }
    let lastHeld = false;
    const sync = (e: KeyboardEvent) => {
      const held = Boolean(e.altKey);
      if (held === lastHeld) {
        if (!held) {
          optHintsSuppressedRef.current = false;
          syncOptHintsActive();
        }
        return;
      }
      lastHeld = held;
      optHeldRef.current = held;
      if (!held) optHintsSuppressedRef.current = false;
      syncOptHintsActive();
    };
    const clear = () => {
      if (!lastHeld) return;
      lastHeld = false;
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
    };
    window.addEventListener('keydown', sync, true);
    window.addEventListener('keyup', sync, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    return () => {
      window.removeEventListener('keydown', sync, true);
      window.removeEventListener('keyup', sync, true);
      window.removeEventListener('blur', clear);
    };
  }, [open]);

  // Palette / confirm open while Opt held — hide badges without App optHeld state
  useEffect(() => {
    syncOptHintsActive();
  }, [paletteOpen, confirmState, open]);

  // Watch GH ⌘K palette open state so Escape race (GH closes first) still skips pr+ close
  useEffect(() => {
    if (!open) return undefined;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return undefined;

    const touch = () => {
      try {
        if (typeof touchGithubCommandPaletteOpen === 'function') {
          touchGithubCommandPaletteOpen(doc);
        } else {
          globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc);
        }
      } catch {
        /* ignore */
      }
    };
    touch();

    const mo = new MutationObserver(() => touch());
    try {
      const dlg = typeof findGithubCommandPaletteDialog === 'function'
        ? findGithubCommandPaletteDialog(doc)
        : doc.getElementById('command-palette-pjax-container');
      if (dlg) {
        mo.observe(dlg, {
          attributes: true,
          attributeFilter: ['open', 'class', 'style', 'hidden', 'aria-hidden'],
        });
      }
      // Palette host may mount after open — watch body for dialog insert
      if (doc.body) {
        mo.observe(doc.body, { childList: true, subtree: true });
      }
    } catch {
      /* ignore */
    }

    // After ⌘K / Ctrl+K GH opens palette asynchronously
    const onMaybeOpen = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
        queueMicrotask(touch);
        requestAnimationFrame(touch);
        setTimeout(touch, 50);
        setTimeout(touch, 200);
      }
    };
    window.addEventListener('keydown', onMaybeOpen, true);

    return () => {
      mo.disconnect();
      window.removeEventListener('keydown', onMaybeOpen, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const alt = Boolean(e.altKey);
      // Physical-key token — never use raw e.key for product chords (macOS ⌥ glyphs)
      const key =
        typeof shortcutKeyFromEvent === 'function'
          ? shortcutKeyFromEvent(e)
          : typeof normalizeShortcutKey === 'function'
            ? normalizeShortcutKey({
                key: e.key,
                code: e.code,
                alt,
              })
            : String(e.key || '').toLowerCase();
      const ui = uiRef.current || {};
      const act = actionsRef.current || {};
      const doc = typeof document !== 'undefined' ? document : null;

      // Keep sticky "was open" timestamp current while typing in GH palette
      let ghOpenNow = false;
      try {
        ghOpenNow =
          typeof touchGithubCommandPaletteOpen === 'function'
            ? touchGithubCommandPaletteOpen(doc)
            : Boolean(
                globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc) ||
                  globalThis.PRListFocus?.isGithubCommandPaletteOpen?.(doc) ||
                  (typeof isGithubCommandPaletteOpen === 'function' &&
                    isGithubCommandPaletteOpen(doc))
              );
      } catch {
        try {
          ghOpenNow =
            typeof isGithubCommandPaletteOpen === 'function' &&
            isGithubCommandPaletteOpen(doc);
        } catch {
          ghOpenNow = false;
        }
      }

      // While GH palette is open: never steal chords (let GH handle).
      // On Escape after GH already closed the dialog on this same keydown:
      // short grace suppresses pr+ shell close only — then shortcuts resume.
      if (ghOpenNow) {
        return;
      }
      if (e.key === 'Escape') {
        const ignoreEsc =
          typeof shouldIgnoreModalEscapeForGithubPalette === 'function'
            ? shouldIgnoreModalEscapeForGithubPalette(doc, { target: e.target })
            : Boolean(
                globalThis.PRListFocus?.shouldIgnoreModalEscapeForGithubPalette?.(
                  doc,
                  { target: e.target }
                )
              );
        if (ignoreEsc) {
          // GH may leave <dialog> stuck in the CSS top layer after close
          try {
            globalThis.PRListFocus?.recoverGithubCommandPaletteTopLayer?.(doc);
          } catch {
            /* ignore */
          }
          return;
        }
      }

      // Diff selection shortcuts (only when not typing in an editable field).
      // `key` is already code-normalized (⌥C → "c" even when e.key is "ç").
      const ae = typeof document !== 'undefined' ? document.activeElement : null;
      const typing =
        ae &&
        (ae === document.body
          ? false
          : (ae as HTMLElement).isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/i.test((ae as HTMLElement).tagName || ''));
      // Live store — App may not re-render on every selection change
      const hasSel = Boolean(useModalStore.getState().lineSelection);
      if (
        !typing &&
        ui.layoutMode === LAYOUT_DIFF &&
        ui.showSelectionComposer &&
        hasSel &&
        key === 'c'
      ) {
        // ⌥C → Comment · ⌘C → Copy code · ⌘⌥C → Copy URL
        if (mod && alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionUrl');
          void act.copySelectionUrl?.();
          return;
        }
        if (mod && !alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionCode');
          void act.copySelectionCode?.();
          return;
        }
        if (!mod && alt && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('openSelectionComment');
          act.openSelectionComment?.();
          return;
        }
      }

      // Escape: dismiss nested UI first, otherwise close the whole modal
      // (including from Diff — do not shrink back to conversation).
      if (e.key === 'Escape') {
        // Confirm owns Escape (cancel) — do not close the PR shell
        if (ui.confirmOpen) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Mermaid / image fullscreen viewers own Escape — close viewer only, keep modal
        if (
          typeof document !== 'undefined' &&
          (document.querySelector('[data-prp-mermaid-viewer="1"]') ||
            document.querySelector('[data-prp-image-viewer="1"]'))
        ) {
          return;
        }
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
          // Comment phase → back to action chips; actions → dismiss island
          if (ui.selectionIslandPhase === 'comment') {
            act.openSelectionActions?.();
          } else {
            dismissSelectionIsland();
          }
          return;
        }
        if (ui.editingBody || ui.editingComment) {
          e.preventDefault();
          setEditingBody(false);
          setEditingComment(null);
          editorSaveRef.current = null;
          return;
        }
        // Reply / other inputs: Esc blurs only — never close sheet or Diff.
        {
          const focusEl =
            (typeof document !== 'undefined'
              ? (document.activeElement as HTMLElement | null)
              : null) || (e.target as HTMLElement | null);
          if (isEditableKeyboardTarget(focusEl) || isEditableKeyboardTarget(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            try {
              focusEl?.blur?.();
            } catch {
              /* ignore */
            }
            return;
          }
        }
        e.preventDefault();
        act.onClose?.();
        return;
      }

      const editable = isEditableKeyboardTarget(e.target);
      // Option product chords: allow Control+Option (⌥⌃R) but not ⌘+Option.
      // `alt` already from e.altKey above (physical-key normalize).
      const ctrlKey = Boolean(e.ctrlKey);
      const altOnly = alt && !e.metaKey && !ctrlKey;
      const shift = Boolean(e.shiftKey);

      // Option / Option+Shift command actions (former mod → opt; no mod back-compat)
      if (
        altOnly &&
        !editable &&
        !ui.paletteOpen &&
        typeof resolvePrModalOptAction === 'function'
      ) {
        const peer = resolvePrModalOptAction({
          alt: true,
          shift,
          mod: false,
          key,
          code: e.code,
        });
        // Diff owns ⌥⇧R for viewed-toggle — do not steal for Add reviewer
        const skipPeerForDiffViewed =
          ui.layoutMode === LAYOUT_DIFF &&
          shift &&
          key === 'r' &&
          (peer?.action === 'promptAddReviewer' ||
            peer?.id === 'opt-reviewer' ||
            peer?.id === 'add-reviewer');
        if (peer?.action && !skipPeerForDiffViewed) {
          e.preventDefault();
          e.stopPropagation();
          optHintsSuppressedRef.current = true;
          syncOptHintsActive();
          // Shortcut monitor: opt peer already has title + chord labels
          if (typeof buildShortcutMonitorFireFromParts === 'function') {
            const chord = isMac
              ? peer.labelMac || peer.label
              : peer.labelWin || peer.labelMac || peer.label;
            reportShortcutMonitor(
              buildShortcutMonitorFireFromParts(
                String(chord || '?'),
                String(peer.title || peer.action),
                String(peer.action || '')
              )
            );
          } else {
            reportShortcutAction(String(peer.action));
          }
          if (peer.action === 'openPalette') {
            setPaletteOpen(true);
            setPaletteQuery('');
            return;
          }
          // Diff leave-review chords: open Finish modal only (never one-shot submit).
          // Finish modal (when open) owns the same chords for actual submit.
          if (peer.action === 'leaveReview') {
            const finishOpen = Boolean(
              typeof document !== 'undefined' &&
                document.querySelector('[data-prp-finish-review="1"]')
            );
            if (finishOpen) {
              // Modal capture/bubble handler performs submit with modal body
              return;
            }
            const liveLayout =
              useModalStore.getState().layoutMode || ui.layoutMode;
            const onDiff =
              liveLayout === LAYOUT_DIFF ||
              (typeof document !== 'undefined' &&
                Boolean(document.querySelector('.prp-modal--diff')));
            if (onDiff) {
              try {
                window.dispatchEvent(
                  new CustomEvent('prp-open-finish-review', {
                    detail: { kind: peer.payload?.kind || 'comment' },
                  })
                );
              } catch {
                /* ignore */
              }
              return;
            }
          }
          // Route through palette runner (merge confirm, etc.)
          act.runPaletteCommand?.({
            action: peer.action,
            payload: peer.payload || {},
            id: peer.id,
            title: peer.title,
          });
          return;
        }
      }

      // Live context — App often does not re-render on ⌥J/K focus (store leaf only),
      // so uiRef.contextThreadActive can stay stale false and block ⌥C/F/D/⌃R.
      const storeUi = useModalStore.getState();
      const liveConvFocus = Boolean(
        conversationCommentFocusRef.current ||
          storeUi.focusedConversationAnchor ||
          storeUi.pendingConversationNavAnchor
      );
      const onDiff =
        ui.layoutMode === LAYOUT_DIFF || storeUi.layoutMode === LAYOUT_DIFF;
      // Diff always exposes context chords; handlers seed commentIndex 0 if needed
      // and no-op when there are no review threads.
      // Conversation keep-alive focus must not win on Diff (hidden panel).
      const liveContextThread = onDiff ? true : liveConvFocus;

      let action =
        typeof resolveModalShortcutAction === 'function'
          ? resolveModalShortcutAction({
              // When Option is held, do not treat Ctrl/⌘ as "mod" — Ctrl pairs with ⌥ for resolve.
              mod: mod && !alt,
              shift,
              alt: alt && !e.metaKey,
              /** Physical Control (⌥⌃R resolve) — not ⌘/meta */
              ctrl: ctrlKey,
              key,
              code: e.code,
              editingBody: ui.editingBody,
              editingComment: ui.editingComment,
              paletteOpen: ui.paletteOpen,
              githubPaletteOpen: false, // already bailed above when open
              editableTarget: editable,
              searchOpen: Boolean(ui.searchOpen),
              hasLineSelection: Boolean(ui.hasLineSelection),
              layoutMode: ui.layoutMode,
              conversationCommentFocused: liveConvFocus,
              contextThreadActive: liveContextThread,
              presentation: isEmbed ? 'embed' : 'modal',
              isEmbed,
            })
          : null;

      // Embed restore (also via pure page-embed helper)
      if (
        !action &&
        isEmbed &&
        typeof resolveEmbedShortcutAction === 'function'
      ) {
        action = resolveEmbedShortcutAction({
          mod: mod && !e.altKey,
          alt: altOnly,
          shift,
          key,
          code: e.code,
          presentation: 'embed',
          editableTarget: editable,
        });
      }

      if (!action) return;

      e.preventDefault();
      e.stopPropagation();
      // Opt-hold tips vanish immediately after a chord fires (until Opt release)
      if (e.altKey) {
        optHintsSuppressedRef.current = true;
        syncOptHintsActive();
      }
      // Bottom-right monitor — only real fires (resolved + about to run)
      reportShortcutAction(String(action));

      switch (action) {
        case 'openPalette':
          setPaletteOpen(true);
          setPaletteQuery('');
          break;
        case 'toggleDiff':
          act.onToggleDiff?.();
          break;
        case 'toggleSidePanel':
          act.toggleSidePanel?.();
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
        case 'toggleFullscreen':
          if (!isEmbed) {
            setShellFullscreen((prev) => toggleShellFullscreen(prev));
          }
          break;
        case 'focusConversationComment':
          act.focusConversationCommentItem?.();
          break;
        case 'clearConversationCommentFocus':
          act.clearConversationCommentFocus?.();
          break;
        case 'contextThreadFold':
        case 'focusedThreadFold':
          act.runContextThreadAction?.('fold');
          break;
        case 'contextThreadGotoDiff':
        case 'focusedThreadGotoDiff':
          act.runContextThreadAction?.('gotoDiff');
          break;
        case 'contextThreadComment':
        case 'focusedThreadComment':
          act.runContextThreadAction?.('comment');
          break;
        case 'contextThreadResolve':
        case 'focusedThreadResolve':
          act.runContextThreadAction?.('resolve');
          break;
        case 'restoreNativeView':
          if (isEmbed && typeof onRestoreNative === 'function') {
            onRestoreNative();
          }
          break;
        case 'stepNavPrev':
          // Find → Diff threads → Conversation comments (⌥K)
          if (ui.searchOpen) {
            act.navSearch?.(-1);
          } else if (ui.layoutMode === LAYOUT_DIFF) {
            act.navComment?.(-1);
          } else {
            act.navConversationComment?.(-1);
          }
          break;
        case 'stepNavNext':
          // Find → Diff threads → Conversation comments (⌥J)
          if (ui.searchOpen) {
            act.navSearch?.(1);
          } else if (ui.layoutMode === LAYOUT_DIFF) {
            act.navComment?.(1);
          } else {
            act.navConversationComment?.(1);
          }
          break;
        case 'navFilePrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.navFile?.(-1);
          break;
        case 'navFileNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.navFile?.(1);
          break;
        case 'scrollDiffPagePrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.scrollDiffPage?.(-1);
          break;
        case 'scrollDiffPageNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.scrollDiffPage?.(1);
          break;
        case 'optArrowScrollSelectPrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(-1);
          break;
        case 'optArrowScrollSelectNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(1);
          break;
        case 'scrollConversationOptPrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, false);
          }
          break;
        case 'scrollConversationOptNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, false);
          }
          break;
        case 'scrollConversationPagePrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, true);
          }
          break;
        case 'scrollConversationPageNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, true);
          }
          break;
        case 'toggleViewedActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.toggleViewedActiveFile?.();
          break;
        case 'toggleReviewFilterUnresolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('unresolved');
          }
          break;
        case 'toggleReviewFilterResolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('resolved');
          }
          break;
        case 'toggleReviewFilterPending':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('pending');
          }
          break;
        case 'moveSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(-1, false);
          }
          break;
        case 'moveSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(1, false);
          }
          break;
        case 'extendSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(-1, true);
          }
          break;
        case 'extendSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(1, true);
          }
          break;
        case 'navAdjacentPrev':
          act.navigateAdjacentPr?.('prev');
          break;
        case 'navAdjacentNext':
          act.navigateAdjacentPr?.('next');
          break;
        default: {
          // navStackDigit1 … navStackDigit9
          const m = String(action || '').match(/^navStackDigit([1-9])$/);
          if (m) {
            const digit = Number(m[1]);
            const items = act.stackItems || [];
            const num =
              typeof stackDigitSlotNumber === 'function'
                ? stackDigitSlotNumber(digit, items)
                : Number(items[digit - 1]?.number);
            if (num != null && Number.isFinite(num) && num > 0) {
              act.openStackOrListPr?.(num);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, isEmbed, onRestoreNative]);

  // Independent section loading: initial (no detail yet) vs soft revalidate (detail present)
  // Progressive load status is shown only in the header stats badge (no top bar).
  const isInitialLoad = Boolean(loading && !detailProp);

  if (!open) return null;

  const hit = activeSearchHit;
  const fsCls = isEmbed ? '' : shellFullscreenClassName(shellFullscreen);
  const presentCls = presentationClassName(presentation);
  const cls =
    `${layoutClassName(layoutMode)} ${
      isEmbed ? 'prp-shell--embed' : shellClassName(shellMode)
    } ${fsCls}${
      !isEmbed && shellResizing ? ' prp-modal--resizing' : ''
    }${
      !isEmbed && shellFullscreenHint ? ' prp-shell--fs-hint' : ''
    } ${animClass} ${theme.className}`.trim();
  const { viewportWidth: vwNow, viewportHeight: vhNow } = viewportSize();
  const appliedSheetWidth = clampSheetWidth(sheetWidth, { viewportWidth: vwNow });
  const appliedModalSize = clampModalSize(modalSize, {
    viewportWidth: vwNow,
    viewportHeight: vhNow,
  });
  // Keep handles in fullscreen so users can drag back to a windowed shell.
  // Embed fills GH main — no resize chrome.
  const showSheetResizer =
    !isEmbed && shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
  const showModalResizer =
    !isEmbed && shellMode === SHELL_MODAL && layoutMode !== LAYOUT_DIFF;
  const shellSizeStyle: React.CSSProperties = isEmbed
    ? ({
        ['--prp-shell-w' as any]: '100%',
        ['--prp-shell-h' as any]: '100%',
      } as React.CSSProperties)
    : shellFullscreen
      ? ({
          ['--prp-shell-w' as any]: '100vw',
          ['--prp-shell-h' as any]: '100vh',
        } as React.CSSProperties)
      : shellMode === SHELL_SHEET
        ? ({
            ['--prp-shell-w' as any]: `${appliedSheetWidth}px`,
            ['--prp-shell-h' as any]: '100vh',
          } as React.CSSProperties)
        : ({
            ['--prp-shell-w' as any]: `${appliedModalSize.width}px`,
            ['--prp-shell-h' as any]: `${appliedModalSize.height}px`,
          } as React.CSSProperties);
