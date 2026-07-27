
  function onSelectionExtend(row: any) {
    if (!selectingRef.current || typeof extendLineSelection !== 'function') return;
    setLineSelection((prev) => extendLineSelection(prev, row) || prev);
  }

  function onSelectionEnd(point, forcedMode) {
    if (!selectingRef.current && forcedMode !== 'click') return;
    selectingRef.current = false;
    setSelecting(false);
    const keepShiftRange = shiftRangeRef.current;
    shiftRangeRef.current = false;
    const mode =
      keepShiftRange
        ? 'shift'
        : forcedMode ||
          (typeof selectionGestureMode === 'function'
            ? selectionGestureMode(
                pointerStartRef.current,
                point || pointerStartRef.current
              )
            : 'click');
    setLineSelection((prev) => {
      if (!prev) return prev;
      if (typeof finalizeSelection === 'function') return finalizeSelection(prev, mode);
      return prev;
    });
    pointerStartRef.current = null;
    setSelectionIslandLeaving(false);
    setSelectionIslandPhase('actions');
    // Delay action toggles so rapid re-clicks / key chords stay cheap
    scheduleSelectionActionsReveal();
  }

  /**
   * Post a selection line comment.
   * @param asPending Start review / Add comment — always GitHub PENDING review
   */
  function onFileHeaderComment(filePath: string) {
    const path = String(filePath || '').trim();
    if (!path) return;
    // Dismiss line selection if any; open file-level composer
    setSelecting(false);
    selectingRef.current = false;
    setSelectionIslandLeaving(false);
    setLineSelection({ kind: 'file', filePath: path, subjectType: 'file' });
    setSelectionDraft('');
    setSelectionIslandPhase('comment');
    setShowSelectionComposer(true);
  }

  async function postSelectionLineComment(payload: any, { asPending = false } = {}) {
    const api = globalThis.PRTreeFetch;
    if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
    // New pending activity cancels a prior discard force-drop so host PENDING
    // from this post is not immediately stripped on the next refresh merge.
    if (asPending) forceDropPendingRef.current = false;
    const isFile = payload.subject_type === 'file' || payload.subjectType === 'file';
    const raw = await api.postReviewComment(detail.owner, detail.repo, detail.number, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      side: payload.side,
      commitId: payload.commit_id || detail.headSha,
      startLine: isFile ? null : payload.start_line,
      startSide: isFile ? null : payload.start_side,
      asPending: Boolean(asPending),
      subjectType: isFile ? 'file' : 'line',
    });
    const isPending = Boolean(raw?.pending || asPending || serverPendingReviewId);
    if (isPending) forceDropPendingRef.current = false;
    const optimistic = mapRestReviewComment(raw, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      startLine: isFile ? null : payload.start_line,
      side: payload.side,
      author: detail.viewerLogin || '',
      pending: isPending,
      pendingReviewId: raw?.pendingReviewId || serverPendingReviewId || null,
      threadNodeId: raw?.threadNodeId || null,
      subjectType: isFile ? 'file' : 'line',
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

  function selectionActionMessage(payload: any, isPending: boolean) {
    if (payload.subject_type === 'file' || payload.subjectType === 'file') {
      return isPending
        ? `Added file comment to pending review on ${payload.path}.`
        : `File comment posted on ${payload.path}.`;
    }
    if (isPending) {
      return payload.start_line != null
        ? `Added to pending review on ${payload.path}:${payload.start_line}–${payload.line}.`
        : `Added to pending review on ${payload.path}:${payload.line}.`;
    }
    return payload.start_line != null
      ? `Comment posted on ${payload.path}:${payload.start_line}–${payload.line}.`
      : `Comment posted on ${payload.path}:${payload.line}.`;
  }

  async function onSubmitSelectionCommentImmediate() {
    const lineSelection = useModalStore.getState().lineSelection;
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
      setActionMsg(selectionActionMessage(payload, isPending));
      dismissSelectionIsland();
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubmitSelectionCommentPending() {
    const lineSelection = useModalStore.getState().lineSelection;
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
      if (payload.subject_type === 'file' || payload.subjectType === 'file') {
        setActionMsg(
          hasServerPending
            ? `Added file comment to pending review on ${payload.path}.`
            : `Started pending review with file comment on ${payload.path}.`
        );
      } else {
        setActionMsg(
          hasServerPending
            ? `Added to pending review on ${payload.path}:${payload.line}.`
            : `Started pending review on ${payload.path}:${payload.line}.`
        );
      }
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
    const drafts = useModalStore.getState().replyDrafts || {};
    const body = (
      drafts[String(draftKey)] ||
      (draftKey != null ? drafts[String(Number(draftKey))] : '') ||
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
    if (!path) return;
    const markingViewed = !isPathViewed(viewedPaths, path);
    setViewedPaths((prev) =>
      typeof toggleViewedPath === 'function' ? toggleViewedPath(prev, path) : prev
    );
    // Viewed → collapse; uncheck → expand so the file can be re-read.
    setCollapsedFiles((prev) => {
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      if (markingViewed) n.add(path);
      else n.delete(path);
      return n;
    });
  }

  async function onClosePr() {
    if (!detail) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Close pull request?',
          message: `Close pull request #${detail.number}?`,
          confirmLabel: 'Close PR',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
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
      // Mark closed locally so UI + auto-close effect agree before host refresh.
      setLocalDetail((d) =>
        d
          ? {
              ...d,
              state: 'closed',
              mergeable: false,
            }
          : d
      );
      // Return to the pulls list (centered modal and side sheet).
      requestClose();
      try {
        await onRefresh?.();
      } catch {
        /* list refresh is best-effort after close */
      }
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
    const wantReady = stage === 'ready';
    const nextDraft = !wantReady;
    const prevDraft = Boolean(detail.draft);
    const label = wantReady ? 'Mark ready for review' : 'Convert to draft';
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: `${label}?`,
          message: `${label} for #${detail.number}?`,
          confirmLabel: label,
          tone: 'default',
        })
      )
    ) {
      return;
    }
    // Optimistic + host cache so merge box / header flip immediately and a
    // remount does not resurrect the pre-write draft flag from SWR/IDB.
    const applyDraft = (draft: boolean) => {
      setLocalDetail((prev) => (prev ? { ...prev, draft: Boolean(draft) } : prev));
      try {
        onPatchDetail?.({ draft: Boolean(draft) });
      } catch {
        /* host optional */
      }
    };
    applyDraft(nextDraft);
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setPullRequestDraftStage) throw new Error('Draft stage API unavailable');
      const result = await api.setPullRequestDraftStage(
        detail.owner,
        detail.repo,
        detail.number,
        wantReady ? 'ready' : 'draft',
        detail.nodeId
      );
      const confirmed =
        result && typeof result.draft === 'boolean'
          ? result.draft
          : nextDraft;
      applyDraft(confirmed);
      setActionMsg(
        confirmed
          ? 'Converted to draft.'
          : 'Marked ready for review.'
      );
      try {
        await onRefresh?.();
      } catch {
        /* best-effort — draft already patched */
      }
      // Re-assert after refresh: REST/cache can briefly lag GraphQL and
      // clobber optimistic draft via mergeDetailPreserveOptimistic.
      applyDraft(confirmed);
    } catch (err) {
      applyDraft(prevDraft);
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
    const mergeReq =
      typeof buildMergeConfirmRequest === 'function'
        ? buildMergeConfirmRequest(m, detail.number)
        : {
            title: 'Merge?',
            message: `Merge PR #${detail.number}?`,
            confirmLabel: 'Merge',
            tone: 'danger' as const,
          };
    if (!confirmGateProceed(await requestConfirm(mergeReq))) {
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
      // Mark merged locally so UI + auto-close effect agree before host refresh.
      setLocalDetail((d) =>
        d
          ? {
              ...d,
              merged: true,
              state: 'closed',
              mergeable: false,
            }
          : d
      );
      // Return to the pulls list (works for centered modal and side sheet).
      requestClose();
      try {
        await onRefresh?.();
      } catch {
        /* list refresh is best-effort after close */
      }
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onUpdateBranch() {
    if (!detail) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Update branch?',
          message: `Update branch ${detail.headRef} with latest ${detail.baseRef}?`,
          confirmLabel: 'Update branch',
          tone: 'warn',
        })
      )
    ) {
      return;
    }
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
    const nextSubscribed = Boolean(want);
    const prevSubscribed = detail.subscribed;
    // Optimistic UI — swap icon immediately; revert on failure
    setLocalDetail((prev) =>
      prev ? { ...prev, subscribed: nextSubscribed } : prev
    );
    try {
      onPatchDetail?.({ subscribed: nextSubscribed });
    } catch {
      /* host optional */
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const nodeId = detail.nodeId || null;
      if (nextSubscribed) {
        if (!api?.setIssueSubscription) throw new Error('Subscribe API unavailable');
        const result = await api.setIssueSubscription(
          detail.owner,
          detail.repo,
          detail.number,
          { subscribed: true, ignored: false, nodeId }
        );
        if (result && typeof result.subscribed === 'boolean') {
          setLocalDetail((prev) =>
            prev ? { ...prev, subscribed: result.subscribed } : prev
          );
        }
      } else {
        if (!api?.deleteIssueSubscription && !api?.setIssueSubscription) {
          throw new Error('Unsubscribe API unavailable');
        }
        let result = null;
        if (api.deleteIssueSubscription) {
          result = await api.deleteIssueSubscription(
            detail.owner,
            detail.repo,
            detail.number,
            nodeId
          );
        } else {
          result = await api.setIssueSubscription(
            detail.owner,
            detail.repo,
            detail.number,
            { subscribed: false, ignored: false, nodeId }
          );
        }
        if (result && typeof result.subscribed === 'boolean') {
          setLocalDetail((prev) =>
            prev ? { ...prev, subscribed: result.subscribed } : prev
          );
        }
      }
      // Icon state is enough feedback — no success toast
      setActionMsg('');
      // Keep optimistic value — skip full refresh (stale subscription can clobber UI)
    } catch (err) {
      setLocalDetail((prev) =>
        prev
          ? {
              ...prev,
              subscribed:
                typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed,
            }
          : prev
      );
      try {
        onPatchDetail?.({
          subscribed:
            typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed,
        });
      } catch {
        /* ignore */
      }
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
      const result = await api.setIssueMilestone(
        detail.owner,
        detail.repo,
        detail.number,
        milestone
      );
      // PATCH /issues returns the issue (with milestone object) when successful.
      let nextMilestone: any = null;
      if (milestone == null) {
        nextMilestone = null;
      } else if (result?.milestone && typeof result.milestone === 'object') {
        nextMilestone = {
          number: Number(result.milestone.number) || milestone,
          title: result.milestone.title || `Milestone ${milestone}`,
        };
      } else {
        nextMilestone = {
          number: milestone,
          title: detail.milestone?.title || `Milestone ${milestone}`,
        };
      }
      commitMetaPatch({ milestone: nextMilestone });
      setActionMsg(milestone == null ? 'Milestone cleared.' : `Milestone set to #${milestone}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function openMilestonePicker() {
    if (!detail) return;
    const current = detail.milestone;

    let repoMilestones: Array<{
      number?: number;
      title?: string;
      state?: string;
      description?: string;
    }> = [];
    try {
      const api = globalThis.PRTreeFetch;
      if (typeof api?.fetchRepoMilestones === 'function') {
        repoMilestones =
          (await api.fetchRepoMilestones(detail.owner, detail.repo)) || [];
      }
    } catch {
      /* offline / no token — still open with current milestone */
    }

    const pool = [
      ...(repoMilestones || []),
      current
        ? {
            number: current.number,
            title: current.title || `Milestone ${current.number}`,
            state: current.state || '',
          }
        : null,
    ].filter(Boolean);
    const options =
      typeof buildMilestoneOptions === 'function'
        ? buildMilestoneOptions(pool)
        : pool.map((m: any) => ({
            id: String(m.number),
            label: `${m.title || 'Milestone'} (#${m.number})`,
            meta: {
              kind: 'milestone',
              number: m.number,
              title: m.title,
            },
          }));

    pickerAnchorRef.current = milestoneAddRef.current;

    async function createAndSetMilestone(title: string) {
      const raw = String(title || '').trim();
      if (!raw) return;
      setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
      try {
        const api = globalThis.PRTreeFetch;
        if (typeof api?.createRepoMilestone !== 'function') {
          throw new Error('Create milestone API unavailable');
        }
        const created = await api.createRepoMilestone(detail.owner, detail.repo, {
          title: raw,
        });
        const n = Number(created?.number);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Milestone created but number missing');
        }
        closePicker();
        await applyMilestoneNumber(n);
        setActionMsg(`Created milestone “${created.title || raw}” (#${n}).`);
      } catch (err: any) {
        setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        setActionMsg(err?.message || String(err));
      }
    }

    setPicker({
      type: 'milestone',
      title: 'Set milestone',
      options,
      query: '',
      allowFreeText: true,
      allowCreate: true,
      createBusy: false,
      placeholder: 'Filter milestones or type a new title…',
      onCreate: (name: string) => {
        void createAndSetMilestone(name);
      },
      onPick: (opt) => {
        closePicker();
        // Prefer meta.number; fall back to parsing id
        const fromMeta = Number(opt?.meta?.number);
        if (Number.isFinite(fromMeta) && fromMeta > 0) {
          void applyMilestoneNumber(fromMeta);
          return;
        }
        const raw = String(opt?.id || opt?.label || '').replace(/[^\d]/g, '');
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          setActionMsg('Invalid milestone.');
          return;
        }
        void applyMilestoneNumber(n);
      },
    });
  }

  async function onSetMilestone(clear = false) {
    if (!detail) return;
    if (clear) {
      if (
        !confirmGateProceed(
          await requestConfirm({
            title: 'Clear milestone?',
            message: 'Remove the milestone from this pull request?',
            confirmLabel: 'Clear',
            tone: 'warn',
          })
        )
      ) {
        return;
      }
      await applyMilestoneNumber(null);
      return;
    }
    void openMilestonePicker();
  }

  /**
   * Expand omitted context between diff hunks (GitHub-style middle expand).
   * Fetches head file text once per path, then merges the requested line range.
   * @param {'all'|'up'|'down'} direction
   */
  async function onExpandDiffGap(
    row: any,
    direction: 'all' | 'up' | 'down' | 'fromStart' | 'fromEnd' = 'all'
  ) {
    if (!detail || !row?.filePath) return;
    // fromStart/fromEnd = front/back of the remaining gap; up/down kept as aliases
    const range = resolveExpandRange(direction, row);
    if (!range) return;
    const path = String(row.filePath);
    // Busy key uses **gap identity** (gapStart/End), not the expanded sub-range,
    // so partial fromStart/fromEnd still disable matching edge controls.
    const busyKey =
      typeof makeExpandBusyKey === 'function'
        ? makeExpandBusyKey(path, row, direction)
        : `${path}:${row.gapStartNew}-${row.gapEndNew}:${direction}`;
    setDiffExpandBusyKey(busyKey);
    try {
      let lines = diffFileLines.get(path);
      if (!lines) {
        const api = globalThis.PRTreeFetch;
        if (!api?.getRepoFileText) {
          throw new Error('File read API unavailable');
        }
        const res = await api.getRepoFileText(detail.owner, detail.repo, {
          path,
          ref: detail.headSha || detail.headRef,
        });
        lines = String(res?.text ?? '').split('\n');
        // split keeps a trailing empty entry when file ends with \n — matches editors
        setDiffFileLines((prev) => {
          const next = new Map(prev);
          next.set(path, lines as string[]);
          return next;
        });
      }
      setDiffExpandedRanges((prev) => {
        const next = new Map(prev);
        next.set(path, mergeLineRanges(prev.get(path) || [], range.start, range.end));
        return next;
      });
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to expand diff context');
    } finally {
      setDiffExpandBusyKey((k) => (k === busyKey ? null : k));
    }
  }
