/**
 * Residual domain / host-side actions extracted from PrModalApp (Phase 4/7).
 * API → host patch; no localDetail SoT. Picker UI still uses bag setters.
 */
import {
  milestoneChangeTimelineEvents,
  reviewerChangeTimelineEvents,
} from '../lib/conversation-timeline-events';
import {
  applyReactionToggle,
  findCommentForReactionTarget,
  patchCommentReactionsInList,
} from '../lib/comment-reactions';
import {
  resolveDeleteHeadBranchTarget,
  shouldShowDeleteHeadBranch,
} from '../lib/delete-head-branch';
import {
  mapRequestedReviewersFromApi,
  mergeAvatarUrls,
} from '../app/pr-modal-mappers';
import { confirmGateProceed } from '../lib/confirm-gate';
import {
  isGithubVideoAttachment,
  uploadGithubCommentAttachment,
} from '../lib/composer-attach';

export function installSideActions(d: Record<string, any>) {
  async function onDeleteHeadBranch() {
    const detail = d.detail;
    if (!detail || !shouldShowDeleteHeadBranch(detail)) return;
    const target = resolveDeleteHeadBranchTarget(detail);
    if (!target) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Delete branch?',
          message: `Delete head branch “${target.branch}” from ${target.owner}/${target.repo}? This cannot be undone from pr+.`,
          confirmLabel: 'Delete branch',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteHeadBranch) throw new Error('Delete branch API unavailable');
      await api.deleteHeadBranch(target.owner, target.repo, target.branch);
      d.applyDomainDetailToHost?.((prev: any) =>
        prev ? { ...prev, headBranchDeleted: true, headRefDeleted: true } : prev
      );
      d.setActionMsg(`Deleted branch ${target.branch}.`);
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }

  async function applyMilestoneNumber(
    milestone: number | null,
    opts: { titleHint?: string } = {}
  ) {
    const base = d.detailRef?.current || d.detail;
    if (!base) return;
    d.setActionBusy(true);
    d.setActionMsg('');
    const titleHint = String(opts.titleHint || '').trim();
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueMilestone) throw new Error('Milestone API unavailable');
      const result = await api.setIssueMilestone(
        base.owner,
        base.repo,
        base.number,
        milestone
      );
      let nextMilestone: any = null;
      if (milestone == null) {
        nextMilestone = null;
      } else if (result?.milestone && typeof result.milestone === 'object') {
        nextMilestone = {
          number: Number(result.milestone.number) || milestone,
          title:
            result.milestone.title || titleHint || `Milestone ${milestone}`,
        };
      } else {
        nextMilestone = {
          number: milestone,
          title: titleHint || `Milestone ${milestone}`,
        };
      }
      if (
        nextMilestone &&
        (!nextMilestone.title ||
          /^Milestone\s+\d+$/i.test(String(nextMilestone.title))) &&
        typeof api?.fetchRepoMilestones === 'function'
      ) {
        try {
          const catalog = await api.fetchRepoMilestones(base.owner, base.repo);
          const hit = (Array.isArray(catalog) ? catalog : []).find(
            (m: any) => Number(m?.number) === Number(nextMilestone.number)
          );
          if (hit?.title) nextMilestone = { ...nextMilestone, title: hit.title };
        } catch {
          /* keep fallback title */
        }
      }
      const prevMs = base.milestone ?? null;
      d.commitMetaPatch?.(
        { milestone: nextMilestone },
        {
          localTimelineEvents: milestoneChangeTimelineEvents(
            prevMs,
            nextMilestone,
            d.timelineActorFromDetail?.(base)
          ),
        }
      );
      d.setActionMsg(
        milestone == null
          ? 'Milestone cleared.'
          : `Milestone set to #${milestone}.`
      );
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }

  async function openMilestonePicker() {
    const detail = d.detail;
    if (!detail) return;
    const current = detail.milestone;
    let repoMilestones: any[] = [];
    try {
      const api = globalThis.PRTreeFetch;
      if (typeof api?.fetchRepoMilestones === 'function') {
        repoMilestones =
          (await api.fetchRepoMilestones(detail.owner, detail.repo)) || [];
      }
    } catch {
      /* offline */
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
      typeof d.buildMilestoneOptions === 'function'
        ? d.buildMilestoneOptions(pool)
        : pool.map((m: any) => ({
            id: String(m.number),
            label: `${m.title || 'Milestone'} (#${m.number})`,
            meta: { kind: 'milestone', number: m.number, title: m.title },
          }));
    if (d.pickerAnchorRef) d.pickerAnchorRef.current = d.milestoneAddRef?.current;
    async function createAndSetMilestone(title: string) {
      const raw = String(title || '').trim();
      if (!raw) return;
      d.setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
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
        d.closePicker?.();
        await applyMilestoneNumber(n);
        d.setActionMsg(`Created milestone “${created.title || raw}” (#${n}).`);
      } catch (err: any) {
        d.setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        d.setActionMsg(err?.message || String(err));
      }
    }
    d.setPicker({
      type: 'milestone',
      title: 'Set milestone',
      options,
      query: '',
      allowFreeText: true,
      allowCreate: true,
      createBusy: false,
      multi: false,
      confirmLabel: 'Set milestone',
      placeholder: 'Filter milestones or type a new title…',
      onCreate: (name: string) => {
        void createAndSetMilestone(name);
      },
      onPick: (opt: any) => {
        d.closePicker?.();
        const titleHint = String(opt?.meta?.title || opt?.label || '')
          .replace(/\s*\(#\d+\)\s*$/, '')
          .trim();
        const fromMeta = Number(opt?.meta?.number);
        const n =
          Number.isFinite(fromMeta) && fromMeta > 0
            ? fromMeta
            : Number(String(opt?.id || opt?.label || '').replace(/[^\d]/g, ''));
        if (!Number.isFinite(n) || n <= 0) {
          d.setActionMsg('Invalid milestone.');
          return;
        }
        void applyMilestoneNumber(n, { titleHint });
      },
    });
  }

  async function onSetMilestone(clear = false) {
    const detail = d.detail;
    if (!detail) return;
    if (clear) {
      if (
        !confirmGateProceed(
          await d.requestConfirm({
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

  async function onUploadFile(fileMeta: {
    file: File;
    name?: string;
    type?: string;
    size?: number;
  }): Promise<string> {
    const detail = d.detail;
    if (!detail) throw new Error('No PR open');
    const file = fileMeta.file;
    const name = fileMeta.name || file.name || 'file.bin';
    if (isGithubVideoAttachment(name, fileMeta.type || file.type)) {
      try {
        return await uploadGithubCommentAttachment(file, detail);
      } catch {
        throw new Error(
          d.videoAttachmentUploadFailed || 'Video attachment upload failed'
        );
      }
    }
    const api = globalThis.PRTreeFetch;
    if (!api?.uploadRepoFile) {
      throw new Error('File upload requires PAT with repo contents write access');
    }
    const path =
      typeof d.buildAssetRepoPath === 'function'
        ? d.buildAssetRepoPath(name)
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
    const detail = d.detail;
    if (!detail || !logins?.length) return;
    d.setActionBusy(true);
    d.setActionMsg('');
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
      d.commitMetaPatch?.(
        {
          requestedReviewers,
          avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
        },
        {
          localTimelineEvents: reviewerChangeTimelineEvents(
            detail.requestedReviewers,
            requestedReviewers,
            d.timelineActorFromDetail?.(detail)
          ),
        }
      );
      d.setActionMsg(`Re-requested review from ${logins.join(', ')}.`);
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }

  function openRerequestReviewerPicker() {
    const detail = d.detail;
    if (!detail) return;
    const exclude = detail.requestedReviewers || [];
    const logins =
      typeof d.collectPeopleLogins === 'function'
        ? d.collectPeopleLogins(exclude)
        : [];
    const options =
      typeof d.buildPeopleOptions === 'function'
        ? d.buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id: string) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    if (d.pickerAnchorRef) d.pickerAnchorRef.current = d.reviewerAddRef?.current;
    d.setPicker({
      type: 'reviewer',
      title: 'Re-request review (username)',
      options,
      query: '',
      allowFreeText: true,
      placeholder: 'Filter or type a username…',
      onPick: (opt: any) => {
        d.closePicker?.();
        const login = String(opt?.id || opt?.label || '').trim();
        if (!login) return;
        const filtered =
          typeof d.buildRerequestReviewerLogins === 'function'
            ? d.buildRerequestReviewerLogins({
                requestedReviewers: detail.requestedReviewers,
                reviews: detail.reviews,
                author: detail.author,
                extraLogins: [login],
              })
            : [login];
        if (!filtered.length) {
          d.setActionMsg('That user is already a pending requested reviewer.');
          return;
        }
        void applyRerequestReviewers(filtered);
      },
    });
  }

  async function onRerequestReview() {
    const detail = d.detail;
    if (!detail) return;
    const logins =
      typeof d.buildRerequestReviewerLogins === 'function'
        ? d.buildRerequestReviewerLogins({
            requestedReviewers: detail.requestedReviewers,
            reviews: detail.reviews,
            author: detail.author,
          })
        : [];
    if (!logins.length) {
      openRerequestReviewerPicker();
      return;
    }
    if (
      !confirmGateProceed(
        await d.requestConfirm({
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

  async function onRerequestReviewer(login: any) {
    const detail = d.detail;
    if (!detail) return;
    const name = String(login || '').trim();
    if (!name) return;
    if (
      typeof d.isBotAccount === 'function'
        ? d.isBotAccount(name, detail)
        : /\[bot\]$/i.test(name)
    ) {
      d.setActionMsg(`Cannot re-request review from bot ${name}.`);
      return;
    }
    const alreadyPending = (detail.requestedReviewers || []).some(
      (r: any) => String(r || '').toLowerCase() === name.toLowerCase()
    );
    if (alreadyPending) {
      d.setActionMsg(`${name} is already a requested reviewer.`);
      return;
    }
    await applyRerequestReviewers([name]);
  }

  async function onLoadReactors(target: {
    kind: 'issue' | 'review' | 'pr';
    commentId: string | number;
    nodeId?: string | null;
    number?: number | null;
  }) {
    const detail = d.detail;
    if (!detail) return;
    const api = globalThis.PRTreeFetch;
    if (typeof api?.fetchReactableReactors !== 'function') return;
    let nodeId = target?.nodeId ? String(target.nodeId) : '';
    if (!nodeId && target?.kind === 'pr' && detail.nodeId) {
      nodeId = String(detail.nodeId);
    }
    if (!nodeId) return;
    try {
      const groups = await api.fetchReactableReactors(nodeId, { first: 5 });
      if (!Array.isArray(groups) || !groups.length) return;
      const kindRaw = String(target?.kind || '').toLowerCase();
      if (kindRaw === 'pr') {
        d.applyDomainDetailToHost?.({ ...detail, bodyReactions: groups });
        d.patchHostDetail?.({ bodyReactions: groups });
        return;
      }
      if (kindRaw === 'review') {
        const list = Array.isArray(detail.reviewComments)
          ? detail.reviewComments
          : [];
        const id = String(target.commentId);
        const nextList = list.map((c: any) =>
          c && String(c.id) === id ? { ...c, reactions: groups } : c
        );
        d.commitCommentListPatch?.({ ...detail, reviewComments: nextList });
        return;
      }
      const list = Array.isArray(detail.comments) ? detail.comments : [];
      const id = String(target.commentId);
      const nextList = list.map((c: any) =>
        c && String(c.id) === id ? { ...c, reactions: groups } : c
      );
      d.commitCommentListPatch?.({ ...detail, comments: nextList });
    } catch {
      /* soft */
    }
  }

  function stampReactionDiag(payload: Record<string, unknown>) {
    try {
      if (typeof document === 'undefined') return;
      const json = JSON.stringify({
        t: Date.now(),
        ...payload,
      });
      document.documentElement.setAttribute('data-prp-last-reaction', json);
    } catch {
      /* ignore */
    }
  }

  async function onToggleReaction(
    target: {
      kind: 'issue' | 'review' | 'pr';
      commentId: string | number;
      nodeId?: string | null;
      number?: number | null;
    },
    content: string,
    currentlyReacted: boolean
  ) {
    // Live host detail — closed-over render detail can miss mid-thread replies
    // that hydrated after the last shell snapshot.
    const detail = d.detailRef?.current || d.detail;
    if (!detail || !content) {
      stampReactionDiag({
        phase: 'abort',
        reason: !detail ? 'no-detail' : 'no-content',
      });
      return;
    }
    const kindRaw = String(target?.kind || '').toLowerCase();
    const kind =
      kindRaw === 'review' ? 'review' : kindRaw === 'pr' ? 'pr' : 'issue';
    const viewerLogin = detail.viewerLogin || null;
    const api = globalThis.PRTreeFetch;
    if (!api?.toggleCommentReaction) {
      stampReactionDiag({ phase: 'abort', reason: 'no-api' });
      d.setActionMsg?.('Reaction API unavailable');
      return;
    }

    // Reactions stay **optimistic** (host-first plan): paint first, API, rollback.
    if (kind === 'pr') {
      const live = d.detailRef?.current || detail;
      const prevReactions = Array.isArray(live.bodyReactions)
        ? live.bodyReactions
        : [];
      const nextReactions = applyReactionToggle(
        prevReactions,
        content,
        !currentlyReacted,
        viewerLogin
      );
      const nodeId = (() => {
        const id = String(target.nodeId || live.nodeId || '').trim();
        if (
          id.startsWith('I_') ||
          id.startsWith('PR_') ||
          id.includes('Issue') ||
          id.includes('PullRequest')
        ) {
          return id;
        }
        return null;
      })();
      stampReactionDiag({
        phase: 'start',
        kind: 'pr',
        content,
        currentlyReacted,
        commentId: target.commentId ?? live.number,
        number: target.number ?? live.number,
        nodeId,
        owner: live.owner,
        repo: live.repo,
      });
      d.commitCommentListPatch?.({ ...live, bodyReactions: nextReactions });
      try {
        const result = await api.toggleCommentReaction(live.owner, live.repo, 'pr', {
          content,
          viewerHasReacted: currentlyReacted,
          nodeId,
          number: target.number ?? live.number,
          commentId: target.commentId ?? live.number,
        });
        stampReactionDiag({
          phase: 'ok',
          kind: 'pr',
          content,
          nodeId,
          via: (result as any)?.via || null,
        });
      } catch (err: any) {
        d.commitCommentListPatch?.({ ...live, bodyReactions: prevReactions });
        const msg = err?.message || String(err) || 'Reaction failed';
        stampReactionDiag({
          phase: 'err',
          kind: 'pr',
          content,
          nodeId,
          message: msg,
          status: err?.status ?? null,
        });
        d.setActionMsg(msg);
      }
      return;
    }

    if (target?.commentId == null && !target?.nodeId) {
      stampReactionDiag({ phase: 'abort', reason: 'no-id', kind });
      return;
    }
    const listKey = kind === 'review' ? 'reviewComments' : 'comments';
    const live = d.detailRef?.current || detail;
    const list = Array.isArray(live[listKey]) ? live[listKey] : [];
    // Mid-thread reply: match REST id **or** GraphQL nodeId (not root-only).
    const comment = findCommentForReactionTarget(list, target);
    const prevReactions = Array.isArray(comment?.reactions)
      ? comment.reactions
      : [];
    const nodeId = String(target.nodeId || comment?.nodeId || '').trim() || null;
    const commentId =
      target.commentId != null && target.commentId !== ''
        ? target.commentId
        : comment?.id;
    // Refuse synthetic shell / non-comment ids before hitting the network
    const idStr = commentId != null ? String(commentId) : '';
    if (/^shell:/i.test(idStr) || /^PRRT_/i.test(idStr)) {
      stampReactionDiag({
        phase: 'abort',
        reason: 'synthetic-id',
        kind,
        commentId,
        nodeId,
      });
      d.setActionMsg('Reaction unavailable until comments finish loading.');
      return;
    }
    const nextReactions = applyReactionToggle(
      prevReactions,
      content,
      !currentlyReacted,
      viewerLogin
    );
    const optimisticList = patchCommentReactionsInList(
      list,
      commentId,
      nextReactions,
      nodeId
    );
    // Never soft-upsert synthetic rows — only patch matched comments.
    // Soft-upsert of missing ids polluted the list and left UI without pills.
    stampReactionDiag({
      phase: 'start',
      kind,
      content,
      currentlyReacted,
      commentId,
      nodeId,
      listKey,
      listLen: list.length,
      foundInList: Boolean(comment),
      matchedPatch: optimisticList !== list,
      owner: live.owner,
      repo: live.repo,
    });
    if (optimisticList !== list) {
      d.commitCommentListPatch?.({
        ...live,
        [listKey]: optimisticList,
      });
    }
    try {
      const result = await api.toggleCommentReaction(live.owner, live.repo, kind, {
        content,
        viewerHasReacted: currentlyReacted,
        nodeId,
        commentId,
      });
      // If we could not paint optimistically (not in list), re-read live and force
      // a patch now that the server accepted the toggle.
      if (optimisticList === list) {
        const live2 = d.detailRef?.current || live;
        const list2 = Array.isArray(live2[listKey]) ? live2[listKey] : list;
        const forced = patchCommentReactionsInList(
          list2,
          commentId,
          nextReactions,
          nodeId
        );
        if (forced !== list2) {
          d.commitCommentListPatch?.({ ...live2, [listKey]: forced });
        }
      }
      stampReactionDiag({
        phase: 'ok',
        kind,
        content,
        commentId,
        nodeId,
        via: (result as any)?.via || null,
      });
    } catch (err: any) {
      // Rollback optimistic paint
      if (optimisticList !== list) {
        const rolled = patchCommentReactionsInList(
          optimisticList,
          commentId,
          prevReactions,
          nodeId
        );
        d.commitCommentListPatch?.({
          ...live,
          [listKey]: rolled,
        });
      }
      const msg = err?.message || String(err) || 'Reaction failed';
      stampReactionDiag({
        phase: 'err',
        kind,
        content,
        commentId,
        nodeId,
        foundInList: Boolean(comment),
        message: msg,
        status: err?.status ?? null,
      });
      d.setActionMsg(msg);
    }
  }

  return {
    onDeleteHeadBranch,
    applyMilestoneNumber,
    openMilestonePicker,
    onSetMilestone,
    onUploadFile,
    applyRerequestReviewers,
    openRerequestReviewerPicker,
    onRerequestReview,
    onRerequestReviewer,
    onLoadReactors,
    onToggleReaction,
  };
}
