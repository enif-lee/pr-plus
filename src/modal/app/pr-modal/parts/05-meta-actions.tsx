


  /**
   * Unified pending model: only GitHub PENDING review (no separate local batch).
   * Count is **thread** units (roots), not individual pending replies.
   */
  const serverPendingComments = useMemo(() => {
    const list = detail?.reviewComments || [];
    return list.filter((c: any) => c && c.pending);
  }, [detail?.reviewComments]);
  const pendingCount = useMemo(() => {
    if (typeof countPendingReviewThreads === 'function') {
      return countPendingReviewThreads(detail?.reviewComments || []);
    }
    // Fallback: roots only (no parent in the set)
    const list = detail?.reviewComments || [];
    const byId = new Map(
      list.filter((c: any) => c?.id != null).map((c: any) => [String(c.id), c])
    );
    return list.filter((c: any) => {
      if (!c?.pending) return false;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) return false;
      return true;
    }).length;
  }, [detail?.reviewComments]);
  const serverPendingReviewId =
    detail?.viewerPendingReview?.id ||
    serverPendingComments.find((c: any) => c.pendingReviewId)?.pendingReviewId ||
    null;
  const hasServerPending = Boolean(serverPendingReviewId) || pendingCount > 0;
  /** Thread-level pending count (same as pendingCount; kept for Diff toolbar props). */
  const totalPendingCount = pendingCount;

  // Clear review filter when the active mode has nothing left.
  // Use path counts + comment count so a brief host refresh race (pending
  // rows stripped then restored) does not wipe the Pending toggle mid-click.
  useEffect(() => {
    if (!diffReviewFilter) return;
    if (diffReviewFilter === 'pending') {
      const hasPendingPaths = hasAnyReviewThreads(pendingThreadCounts);
      if (totalPendingCount === 0 && !hasPendingPaths) {
        setDiffReviewFilter(null);
      }
      return;
    }
    if (!hasAnyReviewThreads(threadCounts) && totalPendingCount === 0) {
      setDiffReviewFilter(null);
    }
  }, [threadCounts, pendingThreadCounts, diffReviewFilter, totalPendingCount]);

  /**
   * Leave a review (Diff Finish modal / Conversation Review tab / shortcuts).
   * @param kind 'comment' | 'approve' | 'request_changes' | 'issue-comment'
   * @param opts.body optional body override (Finish modal); else Conversation commentText
   * @returns true when the action succeeded
   */
  async function onLeaveReviewAction(
    kind: any,
    opts?: { body?: string } | null
  ): Promise<boolean> {
    if (!detail) return false;
    // Always bind fetch bridge first — never reference bare `api`
    const fetchApi = globalThis.PRTreeFetch;
    if (!fetchApi) {
      setActionMsg(
        'Extension bridge unavailable (PRTreeFetch). Refresh this GitHub tab after reloading pr+.'
      );
      return false;
    }
    // Own PR: GitHub 422s APPROVE / REQUEST_CHANGES — hide + hard-block
    if (
      typeof isReviewVerdictKind === 'function' &&
      isReviewVerdictKind(kind) &&
      typeof isViewerPrAuthor === 'function' &&
      isViewerPrAuthor(detail)
    ) {
      setActionMsg('Cannot approve or request changes on your own pull request.');
      return false;
    }
    const body =
      opts && opts.body != null
        ? String(opts.body).trim()
        : commentText.trim();
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

    // Plain conversation comment — only when explicitly forced (Comment tab).
    // Diff "Submit review" / Review-tab Comment always use the PR review path
    // (submitPendingPullReview or one-shot submitPullReview), even with 0 pending.
    if (forceIssueComment) {
      if (!body) {
        setActionMsg('Write a comment first.');
        focusCommentBox();
        return false;
      }
      setActionBusy(true);
      setActionMsg('');
      try {
        if (!fetchApi.postIssueComment) throw new Error('Comment API unavailable');
        const raw = await fetchApi.postIssueComment(
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
        return true;
      } catch (err: any) {
        setActionMsg(err?.message || String(err));
        return false;
      } finally {
        setActionBusy(false);
      }
    }

    // Review path: submit existing PENDING review, or create one-shot review.
    // Empty body + no pending items → nothing to submit (Comment / Approve / RC).
    const event =
      mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
    if (!body && !hasServerPending) {
      setActionMsg(
        'Write a comment or add pending review comments before submitting.'
      );
      focusCommentBox();
      return false;
    }

    // Resolve PENDING review id (viewerPendingReview or any pending comment)
    const pendingReviewId =
      serverPendingReviewId ||
      detail?.viewerPendingReview?.id ||
      serverPendingComments.find((c: any) => c?.pendingReviewId != null)
        ?.pendingReviewId ||
      null;

    setActionBusy(true);
    setActionMsg('');
    try {
      if (hasServerPending || pendingReviewId) {
        if (!pendingReviewId) {
          throw new Error(
            'Pending review comments exist but no review id is available. Refresh and try again.'
          );
        }
        if (!fetchApi.submitPendingPullReview) {
          throw new Error('Submit pending review API unavailable');
        }
        await fetchApi.submitPendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          pendingReviewId,
          { event, body }
        );
      } else if (fetchApi.submitPullReview) {
        // No PENDING review: one-shot Approve / Request changes / Comment review
        await fetchApi.submitPullReview(detail.owner, detail.repo, detail.number, {
          event,
          body,
          commitId: detail.headSha,
          comments: [],
        });
      } else {
        throw new Error('Review API unavailable');
      }
      if (!(opts && opts.body != null)) {
        setCommentText('');
      }
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
            : hasServerPending || pendingReviewId
              ? 'Pending review submitted.'
              : 'Review submitted.'
      );
      await onRefresh?.();
      return true;
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
      return false;
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
      const result = await api.requestReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        [name]
      );
      // Prefer API payload when present; otherwise optimistic merge.
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const existing = Array.isArray(detail.requestedReviewers)
        ? detail.requestedReviewers.slice()
        : [];
      const merged = [...existing];
      if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
      const requestedReviewers = fromApi.length ? fromApi : merged;
      commitMetaPatch({
        requestedReviewers,
        avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
      });
      setActionMsg(`Requested review from ${name}.`);
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
    if (
      typeof isBotAccount === 'function'
        ? isBotAccount(login, detail)
        : /\[bot\]$/i.test(String(login || ''))
    ) {
      setActionMsg(`Cannot remove bot reviewer ${login}.`);
      return;
    }
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Remove reviewer?',
          message: `Remove reviewer ${login}?`,
          confirmLabel: 'Remove',
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
      if (!api?.removeReviewers) throw new Error('Remove reviewers API unavailable');
      const result = await api.removeReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        [login]
      );
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const requestedReviewers = fromApi.length
        ? fromApi
        : (detail.requestedReviewers || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch({ requestedReviewers });
      setActionMsg(`Removed reviewer ${login}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function mapRequestedReviewersFromApi(result: any, fallback: string[] = []) {
    // POST/DELETE requested_reviewers → { users: User[], teams: Team[] }
    const users = Array.isArray(result?.users)
      ? result.users
      : Array.isArray(result?.requested_reviewers)
        ? result.requested_reviewers
        : Array.isArray(result)
          ? result
          : null;
    if (!users) return fallback;
    return users
      .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
      .map((s: string) => String(s).trim())
      .filter(Boolean);
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
    for (const u of result?.users || []) {
      const login = u?.login || '';
      if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
    }
    for (const login of logins) {
      const key = String(login).toLowerCase();
      if (!map[key] && prev?.avatarUrls?.[key]) map[key] = prev.avatarUrls[key];
    }
    return map;
  }

  /**
   * After a successful meta write (labels / assignees / reviewers / milestone),
   * update local + host cache only — never re-fetch full PR detail.
   */
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
      const { _metaSeq: _drop, ...forHost } = next as any;
      onPatchDetail?.({
        ...forHost,
        assignees: next.assignees,
        labels: next.labels,
        requestedReviewers: next.requestedReviewers,
        milestone: next.milestone,
        avatarUrls: next.avatarUrls,
      });
    } catch {
      /* host optional */
    }
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
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Unassign?',
          message: `Unassign ${login}?`,
          confirmLabel: 'Unassign',
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

  async function openLabelPicker() {
    if (!detail) return;
    const currentNames = (detail.labels || []).map((l) =>
      String(l.name || l).trim()
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

    // Prefer repo label catalog (real colors). Fall back to PR labels + defaults.
    let repoLabels: Array<{ name?: string; color?: string; description?: string }> =
      [];
    try {
      const api = globalThis.PRTreeFetch;
      if (typeof api?.fetchRepoLabels === 'function') {
        repoLabels = (await api.fetchRepoLabels(detail.owner, detail.repo)) || [];
      }
    } catch {
      /* offline / no token — still open with PR labels + default colors */
    }

    const pool = [
      ...repoLabels,
      ...(detail.labels || []),
      ...common.map((n) => ({ name: n })),
    ];
    const options =
      typeof buildLabelOptions === 'function'
        ? buildLabelOptions(pool)
        : [...new Set([...currentNames, ...common])].map((id) => ({
            id,
            label: id,
            meta: { kind: 'label', name: id },
          }));
    // de-dupe options by id (buildLabelOptions already does; keep belt)
    const seen = new Set();
    const uniqueOpts: any[] = [];
    for (const o of options) {
      const id = String(o.id || o.label || '').toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueOpts.push(o);
    }
    pickerAnchorRef.current = labelAddRef.current;

    async function createAndSelectLabel(name: string) {
      const raw = String(name || '').trim();
      if (!raw) return '';
      setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
      try {
        const api = globalThis.PRTreeFetch;
        let created: any = { name: raw, color: '' };
        if (typeof api?.createRepoLabel === 'function') {
          created = await api.createRepoLabel(detail.owner, detail.repo, {
            name: raw,
          });
        }
        const nextOpt =
          typeof buildLabelOptions === 'function'
            ? buildLabelOptions([created])[0]
            : {
                id: created.name || raw,
                label: created.name || raw,
                meta: {
                  kind: 'label',
                  name: created.name || raw,
                  color: created.color || '',
                },
              };
        setPicker((prev: any) => {
          if (!prev) return prev;
          const opts = Array.isArray(prev.options) ? prev.options.slice() : [];
          const key = String(nextOpt.id || '').toLowerCase();
          if (!opts.some((o: any) => String(o.id || '').toLowerCase() === key)) {
            opts.unshift(nextOpt);
          }
          return {
            ...prev,
            options: opts,
            query: '',
            createBusy: false,
          };
        });
        setActionMsg(`Created label “${nextOpt.id || raw}”.`);
        return String(nextOpt.id || raw);
      } catch (err: any) {
        setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        setActionMsg(err?.message || String(err));
        throw err;
      }
    }

    setPicker({
      type: 'label',
      title: 'Set labels',
      options: uniqueOpts,
      query: '',
      allowFreeText: true,
      allowCreate: true,
      createBusy: false,
      multi: true,
      initialSelectedIds: currentNames,
      confirmLabel: 'Apply labels',
      onCreate: (name: string) => {
        void createAndSelectLabel(name);
      },
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
      !confirmGateProceed(
        await requestConfirm({
          title: 'Apply suggestion?',
          message: `Apply suggestion to ${payload.path}:${payload.startLine || payload.endLine}–${payload.endLine} on ${detail.headRef}?`,
          confirmLabel: 'Apply',
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
      return {
        items: buildStackStrip(merged, detail.number, stackPathSelections),
        branches: [],
      };
    }
    return { items: [], branches: [] };
  }, [openPulls, detail, stackPathSelections]);
  const stackItems = stackPath.items;

  const openStackOrListPr = useCallback(
    (n: number) => {
      const num = Number(n);
      if (!Number.isFinite(num) || num <= 0) return;
      // Reset path selections so the opened PR becomes the focused stack current
      setStackPathSelections({});
      const page = layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation';
      if (typeof onOpenStackPr === 'function') {
        onOpenStackPr(num, { page });
      }
    },
    [layoutMode, onOpenStackPr]
  );

  const navigateAdjacentPr = useCallback(
    (direction: 'prev' | 'next') => {
      if (typeof resolveAdjacentPrNumber !== 'function') return;
      const next = resolveAdjacentPrNumber({
        direction,
        currentNumber: detail?.number,
        stackItems,
        openPulls: Array.isArray(openPulls) ? openPulls : [],
      });
      if (next != null) openStackOrListPr(next);
    },
    [detail?.number, stackItems, openPulls, openStackOrListPr]
  );

  const paletteCommands = useMemo(() => {
    if (typeof buildPaletteCommands !== 'function') return [];
    const canVerdict =
      typeof canSubmitReviewVerdict === 'function'
        ? canSubmitReviewVerdict(detail)
        : true;
    return buildPaletteCommands(detail || {}, {
      stackItems,
      openPulls: Array.isArray(openPulls) ? openPulls : [],
      canSubmitReviewVerdict: canVerdict,
      // Diff-only commands (file nav, selection, filters, viewed…)
      layoutMode: layoutMode === LAYOUT_DIFF ? 'diff' : 'centered',
    });
  }, [detail, stackItems, openPulls, layoutMode]);

  function runPaletteCommand(cmd: any) {
    if (!cmd) return;
    setPaletteOpen(false);
    setPaletteQuery('');
    const action = cmd.action;
    const p = cmd.payload || {};
    switch (action) {
      case 'openStackPr': {
        const n = Number(p.number);
        if (Number.isFinite(n) && n > 0) openStackOrListPr(n);
        break;
      }
      case 'navAdjacentPrev':
        navigateAdjacentPr('prev');
        break;
      case 'navAdjacentNext':
        navigateAdjacentPr('next');
        break;
      // Diff view actions (also reachable via keyboard; palette when layout=diff)
      case 'navFilePrev':
        navFile(-1);
        break;
      case 'navFileNext':
        navFile(1);
        break;
      case 'scrollDiffPagePrev':
        scrollDiffPage(-1);
        break;
      case 'scrollDiffPageNext':
        scrollDiffPage(1);
        break;
      case 'optArrowScrollSelectPrev':
        optArrowScrollSelect(-1);
        break;
      case 'optArrowScrollSelectNext':
        optArrowScrollSelect(1);
        break;
      case 'toggleViewedActiveFile':
        toggleViewedActiveFile();
        break;
      case 'stepNavPrev':
        if (searchOpen) navSearch(-1);
        else if (layoutMode === LAYOUT_DIFF) navComment(-1);
        else navConversationComment(-1);
        break;
      case 'stepNavNext':
        if (searchOpen) navSearch(1);
        else if (layoutMode === LAYOUT_DIFF) navComment(1);
        else navConversationComment(1);
        break;
      case 'scrollConversationOptPrev':
        scrollConversationPanel(-1, false);
        break;
      case 'scrollConversationOptNext':
        scrollConversationPanel(1, false);
        break;
      case 'scrollConversationPagePrev':
        scrollConversationPanel(-1, true);
        break;
      case 'scrollConversationPageNext':
        scrollConversationPanel(1, true);
        break;
      case 'contextThreadFold':
      case 'focusedThreadFold':
        runContextThreadAction('fold');
        break;
      case 'contextThreadGotoDiff':
      case 'focusedThreadGotoDiff':
        runContextThreadAction('gotoDiff');
        break;
      case 'contextThreadComment':
      case 'focusedThreadComment':
        runContextThreadAction('comment');
        break;
      case 'contextThreadResolve':
      case 'focusedThreadResolve':
        runContextThreadAction('resolve');
        break;
      case 'toggleReviewFilterUnresolved':
        applyReviewFilterToggle('unresolved');
        break;
      case 'toggleReviewFilterResolved':
        applyReviewFilterToggle('resolved');
        break;
      case 'toggleReviewFilterPending':
        applyReviewFilterToggle('pending');
        break;
      case 'moveSelectionUp':
        applySelectionKeyboardMove(-1, false);
        break;
      case 'moveSelectionDown':
        applySelectionKeyboardMove(1, false);
        break;
      case 'extendSelectionUp':
        applySelectionKeyboardMove(-1, true);
        break;
      case 'extendSelectionDown':
        applySelectionKeyboardMove(1, true);
        break;
      case 'openSelectionComment':
        setSelectionIslandPhase('comment');
        setShowSelectionComposer(true);
        break;
      case 'copySelectionCode':
        void copySelectionCode();
        break;
      case 'copySelectionUrl':
        void copySelectionUrl();
        break;
      case 'toggleDiff':
        onToggleDiff();
        break;
      case 'toggleSidePanel':
        toggleSidePanel();
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
      case 'toggleFullscreen':
        onToggleShellFullscreen();
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
      case 'toggleDraftStage':
        // ⌥⇧D: draft → ready, open PR → convert to draft
        void onSetDraftStage(detail?.draft ? 'ready' : 'draft');
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
      case 'leaveReview': {
        const kind = p.kind || 'comment';
        if (
          typeof isReviewVerdictKind === 'function' &&
          isReviewVerdictKind(kind) &&
          typeof isViewerPrAuthor === 'function' &&
          isViewerPrAuthor(detail)
        ) {
          setActionMsg('Cannot approve or request changes on your own pull request.');
          break;
        }
        // Finish modal already open → its capture-phase Opt chords own submit.
        // Do not fall through to one-shot submitPullReview (that skipped the modal).
        if (
          typeof document !== 'undefined' &&
          document.querySelector('[data-prp-finish-review="1"]')
        ) {
          break;
        }
        // Diff: always open Finish-your-review (never direct-submit from shortcut).
        // Read live store + DOM — render-closure layoutMode can lag behind uiRef.
        const liveLayout =
          useModalStore.getState().layoutMode ||
          uiRef.current?.layoutMode ||
          layoutMode;
        const diffActive =
          liveLayout === LAYOUT_DIFF ||
          (typeof document !== 'undefined' &&
            Boolean(
              document.querySelector(
                '.prp-body-panel--diff.prp-body-panel--active, .prp-modal--diff'
              )
            ));
        if (diffActive) {
          try {
            window.dispatchEvent(
              new CustomEvent('prp-open-finish-review', {
                detail: { kind },
              })
            );
          } catch {
            /* open failed — do not silent-submit */
            setActionMsg('Could not open Finish your review.');
          }
          break;
        }
        // Conversation Review tab / palette while not on Diff
        void onLeaveReviewAction(kind);
        break;
      }
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

  function onSelectionStart(row, point, opts: any = {}) {
    const shiftKey = Boolean(opts?.shiftKey);
    const prev = useModalStore.getState().lineSelection;
    let next = null;
    let keepRange = false;
    if (typeof applySelectionPointerDown === 'function') {
      const result = applySelectionPointerDown(prev, row, { shiftKey });
      if (result.mode === 'ignore') {
        shiftRangeRef.current = false;
        return;
      }
      next = result.selection;
      keepRange = Boolean(result.keepRange);
    } else if (typeof beginLineSelection === 'function') {
      if (
        shiftKey &&
        prev &&
        row?.filePath === prev.filePath &&
        typeof extendLineSelection === 'function'
      ) {
        next = extendLineSelection(prev, row) || prev;
        keepRange = true;
      } else {
        next = beginLineSelection(row);
        keepRange = false;
      }
    }
    if (!next) {
      shiftRangeRef.current = false;
      return;
    }
    shiftRangeRef.current = keepRange;
    selectingRef.current = true;
    pointerStartRef.current = point || null;
    setSelecting(true);
    setLineSelection(next);
    // Hide island while dragging; reveal after pointer-up idle delay
    clearSelectionActionsTimer();
    setShowSelectionComposer(false);
  }
