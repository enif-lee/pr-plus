
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
