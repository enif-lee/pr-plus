/** PrModal mutations/meta/write-through — nested install scope for mutual calls. */
import { buildLabelOptions } from '../lib/searchable-select';
import { toggleViewedPath } from '../lib/review-threads';
import {
  stampThreadResolved,
  appendOptimisticReviewComment,
  appendIssueCommentToDetail,
  mapRestReviewComment,
  mapRestIssueComment,
} from '../lib/pr-edit-api';
import {
  makeLocalTimelineEvent,
  mergeTimelineEventsById,
  labelChangeTimelineEvents,
  assigneeChangeTimelineEvents,
  reviewerChangeTimelineEvents,
} from '../lib/conversation-timeline';
import { resolveRootReviewCommentId, normalizeReviewCommentId } from '../lib/review-threads';
import {
  buildMergeConfirmRequest,
  confirmGateProceed,
} from '../lib/confirm-gate';
import {
  canUpdateBranch,
  coerceMergeMethod,
} from '../lib/merge-box-status';
import { useModalStore } from '../store/modal-store';
import {
  mapRequestedReviewersFromApi,
  mapAssigneesFromApi,
  mapLabelsFromApi,
  mergeAvatarUrls,
} from '../app/pr-modal-mappers';
import {
  DEFAULT_HIDE_REASON,
  normalizeHideReason,
  patchDetailCommentMinimized,
  stampHideCommentResult,
} from '../lib/comment-quote-hide';

export function installPrModalMutations(d: Record<string, any>) {
  function timelineActorFromDetail(snap: any = d.detail) {
    const login = String(snap?.viewerLogin || '').trim();
    const key = login.toLowerCase();
    const avatarUrl =
      (key && snap?.avatarUrls?.[key]) ||
      snap?.viewerAvatarUrl ||
      snap?.user?.avatar_url ||
      '';
    return { login, avatarUrl: String(avatarUrl || '') };
  }
  async function refreshTimelineEvents(opts: { retryMs?: number } = {}) {
    const snap = d.detailRef.current || d.detail;
    if (!snap?.owner || !snap?.repo || !snap?.number) return;
    const api = globalThis.PRTreeFetch;
    if (typeof api?.fetchPrTimelineEvents !== 'function') return;
    const identity = d.prIdentity;
    const owner = snap.owner;
    const repo = snap.repo;
    const number = snap.number;
    const prevIds = new Set(
      (Array.isArray(snap.timelineEvents) ? snap.timelineEvents : [])
        .map((e: any) => (e?.id != null ? String(e.id) : ''))
        .filter(Boolean)
    );
    const prevLen = prevIds.size;
    const maxId = (list: any[]) => {
      let m = 0;
      for (const e of list) {
        const n = Number(e?.id);
        if (Number.isFinite(n) && n > m) m = n;
      }
      return m;
    };
    const prevMax = maxId(
      Array.isArray(snap.timelineEvents) ? snap.timelineEvents : []
    );
    try {
      let events: any[] = [];
      // Events API often lags the mutating write; poll for new numeric ids.
      const gaps = [0, 500, 1200, 2500, 4000];
      for (const gap of gaps) {
        if (gap) await new Promise((r) => setTimeout(r, gap));
        if (d.prIdentity !== identity) return;
        const batch = await api.fetchPrTimelineEvents(owner, repo, number);
        if (!Array.isArray(batch)) continue;
        events = batch;
        const nextMax = maxId(events);
        const grew =
          events.length > prevLen ||
          nextMax > prevMax ||
          events.some((e) => e?.id != null && !prevIds.has(String(e.id)));
        if (grew || gap === gaps[gaps.length - 1]) break;
      }
      if (d.prIdentity !== identity) return;
      if (!Array.isArray(events)) events = [];
      // Fold onto d.detailRef first (commitMetaPatch writes optimistics there
      // synchronously — setState alone would still be stale mid-poll).
      const live = d.detailRef.current || d.detail;
      const merged = mergeTimelineEventsById(
        Array.isArray(live?.timelineEvents) ? live.timelineEvents : [],
        events
      );
      if (live) {
        d.detailRef.current = { ...live, timelineEvents: merged };
      }
      applyDomainDetail((prev: any) => {
        const base = prev || live;
        if (!base) return prev;
        return {
          ...base,
          timelineEvents: mergeTimelineEventsById(base.timelineEvents, events),
        };
      });
      void patchHostDetail({ timelineEvents: merged });
    } catch {
      /* soft-fail: meta write + local timeline already applied */
    }
  }
  /**
   * After a successful meta write (labels / assignees / reviewers / milestone),
   * update local + host cache only — never re-fetch full PR detail.
   * Host gets a **narrow** patch (keys from `patch` only) — never full detail.
   * Injects local timeline events immediately so conversation updates even when
   * the Events API lags; then refreshes from GitHub to converge on real ids.
   */
  function commitMetaPatch(
    patch: Record<string, unknown>,
    opts: {
      refreshTimeline?: boolean;
      localTimelineEvents?: any[];
    } = {}
  ) {
    // Prefer live ref so a fast second meta write sees prior local timeline rows.
    const base = d.detailRef.current || d.detail;
    if (!base) return;
    const localTe = Array.isArray(opts.localTimelineEvents)
      ? opts.localTimelineEvents
      : [];
    const timelineEvents =
      localTe.length > 0
        ? mergeTimelineEventsById(base.timelineEvents, localTe)
        : Array.isArray(base.timelineEvents)
          ? base.timelineEvents
          : [];
    const next = {
      ...base,
      ...patch,
      ...(localTe.length > 0 ? { timelineEvents } : null),
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
    // Host SoT: detailRef for same-tick chains + narrow onPatchDetail (no localDetail).
    d.detailRef.current = next;
    const forHost: Record<string, unknown> = { ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'avatarUrls') || next.avatarUrls) {
      forHost.avatarUrls = next.avatarUrls;
    }
    if (localTe.length > 0) {
      forHost.timelineEvents = timelineEvents;
    }
    void patchHostDetail(forHost);
    if (opts.refreshTimeline !== false) {
      queueMicrotask(() => {
        void refreshTimelineEvents();
      });
    }
  }

  /**
   * Write-through to host with ack. After API success, never roll back local;
   * on failed apply retry once then surface cache write failure.
   */
  function patchHostDetail(patch: Record<string, unknown>): {
    status: 'applied' | 'stale' | 'failed' | 'skipped';
    error?: string;
  } {
    if (typeof d.onPatchDetail !== 'function') {
      return { status: 'skipped' };
    }
    const run = () => {
      try {
        const res = d.onPatchDetail(patch);
        if (res && typeof res === 'object' && typeof res.status === 'string') {
          return res as { status: 'applied' | 'stale' | 'failed' | 'skipped'; error?: string };
        }
        // Phase 3 contract: void/legacy return is NOT applied.
        return {
          status: 'failed' as const,
          error: 'onPatchDetail returned no status (void ≠ applied)',
        };
      } catch (err: any) {
        return {
          status: 'failed' as const,
          error: err?.message || String(err),
        };
      }
    };
    let res = run();
    if (res.status === 'failed') {
      res = run();
    }
    if (res.status === 'failed') {
      const msg = res.error || 'Host cache write failed';
      console.warn('[pr-plus] host patch failed after API success', msg, patch);
      try {
        d.setActionMsg(`Saved on GitHub; cache sync failed (${msg})`);
      } catch {
        /* ignore */
      }
    }
    return res;
  }

  /** Host-data-first domain paint: detailRef + narrow onPatchDetail only (no localDetail SoT). */
  const DOMAIN_DETAIL_KEYS = [
    'title', 'body', 'draft', 'state', 'merged', 'mergeable', 'mergeableState', 'mergeStateStatus',
    'assignees', 'labels', 'requestedReviewers', 'milestone', 'baseRef', 'baseSha', 'headRef', 'headSha',
    'subscribed', 'avatarUrls', 'bodyReactions', 'comments', 'commentsMeta', 'timelineEvents',
    'reviewComments', 'reviewThreads', 'reviewCommentsMeta', 'reviewThreadsMeta', 'viewerPendingReview',
    'reviews', 'files', 'commits', 'commitsCount', 'changedFiles', 'gitattributesText',
    '_deletedReviewCommentIds', '_deletedReviewBodies', '_deletedIssueCommentIds', '_resolveStamps',
    'headBranchDeleted', 'headRefDeleted',
  ] as const;

  function pickDomainPatch(next: any, base: any = null): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (!next || typeof next !== 'object') return patch;
    for (const k of DOMAIN_DETAIL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(next, k)) continue;
      if (base && next[k] === base[k]) continue;
      patch[k] = next[k];
    }
    return patch;
  }

  /**
   * Apply domain snapshot via host SoT only.
   * Updates detailRef for same-tick mutation chaining; UI paints from host props.
   */
  function applyDomainDetail(
    nextOrUpdater: any
  ): { status: 'applied' | 'stale' | 'failed' | 'skipped'; error?: string } {
    const base = d.detailRef.current || d.detail;
    const next =
      typeof nextOrUpdater === 'function' ? nextOrUpdater(base) : nextOrUpdater;
    if (!next) return { status: 'skipped' };
    d.detailRef.current = next;
    const patch = pickDomainPatch(next, base);
    if (!Object.keys(patch).length) {
      // Full replace keys when updater returned whole detail without diffs detected
      for (const k of DOMAIN_DETAIL_KEYS) {
        if (Object.prototype.hasOwnProperty.call(next, k)) patch[k] = next[k];
      }
    }
    if (!Object.keys(patch).length) return { status: 'skipped' };
    return patchHostDetail(patch);
  }

  async function applyAddAssignees(logins: any) {
    const base = d.detailRef.current || d.detail;
    if (!base) return;
    const names = (Array.isArray(logins) ? logins : [logins])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (!names.length) return;
    const prevAssignees = Array.isArray(base.assignees) ? base.assignees.slice() : [];
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.addAssignees) throw new Error('Add assignees API unavailable');
      // Pessimistic: paint assignees only after API success.
      const result = await api.addAssignees(
        base.owner,
        base.repo,
        base.number,
        names
      );
      const fromApi = mapAssigneesFromApi(result, []);
      const merged = fromApi.length ? fromApi.slice() : prevAssignees.slice();
      for (const name of names) {
        if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
          merged.push(name);
        }
      }
      const assignees = merged;
      const avatarUrls = mergeAvatarUrls(base, result, assignees);
      commitMetaPatch(
        { assignees, avatarUrls },
        {
          localTimelineEvents: assigneeChangeTimelineEvents(
            prevAssignees,
            assignees,
            timelineActorFromDetail(base)
          ),
        }
      );
      d.setActionMsg(
        names.length === 1 ? `Assigned ${names[0]}.` : `Assigned ${names.length} people.`
      );
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function openAssigneePicker() {
    if (!d.detail) return;
    const exclude = d.detail.assignees || [];
    const logins = d.collectPeopleLogins(exclude);
    const options =
      typeof d.buildPeopleOptions === 'function'
        ? d.buildPeopleOptions(logins, {}, d.detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: d.detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    d.pickerAnchorRef.current = d.assigneeAddRef?.current;
    // Shared single-select surface with openReviewerPicker (not multi-Apply).
    d.setPicker({
      type: 'assignee',
      title: 'Add assignee',
      options,
      query: '',
      allowFreeText: true,
      multi: false,
      placeholder: 'Filter or type a username…',
      onPick: (opt) => {
        d.closePicker();
        void applyAddAssignees([opt?.id || opt?.label || opt?.meta?.login]);
      },
    });
  }
  async function onRemoveAssignee(login: any) {
    if (!d.detail || !login) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Unassign?',
          message: `Unassign ${login}?`,
          confirmLabel: 'Unassign',
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
      if (!api?.removeAssignees) throw new Error('Remove assignees API unavailable');
      const result = await api.removeAssignees(d.detail.owner, d.detail.repo, d.detail.number, [
        login,
      ]);
      const assignees = Array.isArray(result?.assignees)
        ? result.assignees
            .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
            .map((s: string) => String(s).trim())
            .filter(Boolean)
        : (d.detail.assignees || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch(
        {
          assignees,
          avatarUrls: mergeAvatarUrls(d.detail, result, assignees),
        },
        {
          localTimelineEvents: assigneeChangeTimelineEvents(
            d.detail.assignees,
            assignees,
            timelineActorFromDetail(d.detail)
          ),
        }
      );
      d.setActionMsg(`Unassigned ${login}.`);
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function applySetLabels(labels: any) {
    if (!d.detail) return;
    // Snapshot pre-write labels from the live ref (not a stale render closure)
    // so clear→set in the same session always produces labeled/unlabeled rows.
    const prevLabels = Array.isArray(d.detailRef.current?.labels)
      ? d.detailRef.current.labels
      : Array.isArray(d.detail.labels)
        ? d.detail.labels
        : [];
    const next = (labels || []).map((s) => String(s).trim()).filter(Boolean);
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueLabels) throw new Error('Set labels API unavailable');
      const result = await api.setIssueLabels(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
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
                const existing = (prevLabels || []).find(
                  (l: any) =>
                    String(l.name || l).toLowerCase() === name.toLowerCase()
                );
                return existing && typeof existing === 'object'
                  ? existing
                  : { name, color: '' };
              });
      }
      // Prefer API result for chips; for timeline delta also consider the
      // requested name set so an empty/lagging PUT body still paints events.
      const actor = timelineActorFromDetail(d.detailRef.current || d.detail);
      const requestedAsLabels = next.map((name) => {
        const existing = (labelsOut || prevLabels || []).find(
          (l: any) => String(l.name || l).toLowerCase() === name.toLowerCase()
        );
        return existing && typeof existing === 'object'
          ? existing
          : { name, color: '' };
      });
      let localTimelineEvents = labelChangeTimelineEvents(
        prevLabels,
        labelsOut,
        actor
      );
      if (!localTimelineEvents.length) {
        localTimelineEvents = labelChangeTimelineEvents(
          prevLabels,
          requestedAsLabels,
          actor
        );
      }
      // No full soft-refresh: in-flight fetchPrDetail responses were overwriting
      // this patch with pre-write assignees/labels a few seconds later.
      // Local labeled/unlabeled rows so conversation updates immediately.
      commitMetaPatch(
        { labels: labelsOut },
        { localTimelineEvents }
      );
      d.setActionMsg(
        next.length === 0
          ? 'Labels cleared.'
          : next.length === 1
            ? `Label “${next[0]}” set.`
            : `Labels updated (${next.length}).`
      );
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function openLabelPicker() {
    if (!d.detail) return;
    const currentNames = (d.detail.labels || []).map((l) =>
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
        repoLabels = (await api.fetchRepoLabels(d.detail.owner, d.detail.repo)) || [];
      }
    } catch {
      /* offline / no token — still open with PR labels + default colors */
    }
  
    const pool = [
      ...repoLabels,
      ...(d.detail.labels || []),
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
    d.pickerAnchorRef.current = d.labelAddRef?.current;
  
    async function createAndSelectLabel(name: string) {
      const raw = String(name || '').trim();
      if (!raw) return '';
      d.setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
      try {
        const api = globalThis.PRTreeFetch;
        let created: any = { name: raw, color: '' };
        if (typeof api?.createRepoLabel === 'function') {
          created = await api.createRepoLabel(d.detail.owner, d.detail.repo, {
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
        d.setPicker((prev: any) => {
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
        d.setActionMsg(`Created label “${nextOpt.id || raw}”.`);
        return String(nextOpt.id || raw);
      } catch (err: any) {
        d.setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        d.setActionMsg(err?.message || String(err));
        throw err;
      }
    }
  
    d.setPicker({
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
        d.closePicker();
        void applySetLabels(ids);
      },
      onPick: (opt) => {
        // single fallback: add one
        d.closePicker();
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
    if (!d.detail || !name) return;
    const names = (d.detail.labels || [])
      .map((l) => l.name || l)
      .filter((n) => String(n).toLowerCase() !== String(name).toLowerCase());
    void applySetLabels(names);
  }
  async function onSaveBody(body: any) {
    if (!d.detail) return;
    const nextBody = body == null ? '' : String(body);
    d.setActionBusy(true);
    d.setActionMsg('');
    // Pessimistic: paint description only after API success (no pre-await body stamp).
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(d.detail.owner, d.detail.repo, d.detail.number, { body: nextBody });
      d.setEditingBody(false);
      d.setActionMsg('Description updated.');
      // Narrow write-through host/IDB — no full soft-refresh after known body write.
      const base = d.detailRef.current || d.detail;
      const next = base ? { ...base, body: nextBody } : null;
      if (next) {
        d.detailRef.current = next;
        applyDomainDetail(next);
      }
      void patchHostDetail({ body: nextBody });
    } catch (err) {
      // Prior settled body preserved (never pre-painted).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onSaveEditComment(kind, id, body) {
    if (!d.detail || id == null) return;
    const nextBody = body == null ? '' : String(body);
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (kind === 'issue') {
        if (!api?.editIssueComment) throw new Error('Edit comment API unavailable');
        await api.editIssueComment(d.detail.owner, d.detail.repo, id, nextBody);
      } else {
        if (!api?.editReviewComment) throw new Error('Edit review comment API unavailable');
        // PENDING review comments 404 on REST PATCH — pass PRRC_ nodeId for GraphQL.
        const list = Array.isArray(d.detail.reviewComments)
          ? d.detail.reviewComments
          : [];
        const row = list.find(
          (c: any) => c && String(c.id) === String(id)
        );
        const nodeId =
          row?.nodeId ||
          row?.node_id ||
          null;
        await api.editReviewComment(
          d.detail.owner,
          d.detail.repo,
          id,
          nextBody,
          {
            nodeId: nodeId || undefined,
            pullNumber: d.detail.number,
          }
        );
      }
      d.setEditingComment(null);
      d.setActionMsg('Comment updated.');
      // Narrow post-API body patch on latest detail (no full soft-refresh).
      const base = d.detailRef.current || d.detail;
      if (!base) return;
      const key = String(id);
      let next = base;
      if (kind === 'issue') {
        const list = Array.isArray(base.comments) ? base.comments : [];
        next = {
          ...base,
          comments: list.map((c: any) =>
            c && String(c.id) === key ? { ...c, body: nextBody } : c
          ),
        };
      } else {
        const list = Array.isArray(base.reviewComments) ? base.reviewComments : [];
        next = {
          ...base,
          reviewComments: list.map((c: any) =>
            c && String(c.id) === key ? { ...c, body: nextBody } : c
          ),
        };
      }
      commitCommentListPatch(next);
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function applyBaseChange(base: any) {
    if (!d.detail) return;
    const next = String(base || '').trim();
    if (!next || next === d.detail.baseRef) return;
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(d.detail.owner, d.detail.repo, d.detail.number, { base: next });
      applyDomainDetail((prev) => (prev ? { ...prev, baseRef: next } : prev));
      d.setActionMsg(`Base branch changed to ${next}.`);
      await d.onRefresh?.();
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function openBasePicker() {
    if (!d.detail) return;
    const options =
      typeof d.buildBranchOptions === 'function'
        ? d.buildBranchOptions(d.openPulls, {
            baseRef: d.detail.baseRef,
            headRef: d.detail.headRef,
          })
        : [];
    d.pickerAnchorRef.current = d.baseBranchRef.current;
    d.setPicker({
      type: 'base',
      title: 'Change base branch',
      options,
      // Empty query so full branch list is visible; free-text still allowed.
      query: '',
      allowFreeText: true,
      placeholder: d.detail.baseRef ? `Current: ${d.detail.baseRef}` : 'Filter or type a branch…',
      onPick: (opt) => {
        d.closePicker();
        void applyBaseChange(opt?.id || opt?.label);
      },
    });
  }
  async function applyAddReviewer(login: any) {
    if (!d.detail || !login) return;
    const name = String(login).trim();
    if (!name) return;
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.requestReviewers) throw new Error('Request reviewers API unavailable');
      const result = await api.requestReviewers(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
        [name]
      );
      // Prefer API payload when present; otherwise optimistic merge.
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const existing = Array.isArray(d.detail.requestedReviewers)
        ? d.detail.requestedReviewers.slice()
        : [];
      const merged = [...existing];
      if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
      const requestedReviewers = fromApi.length ? fromApi : merged;
      commitMetaPatch(
        {
          requestedReviewers,
          avatarUrls: mergeAvatarUrls(d.detail, result, requestedReviewers),
        },
        {
          localTimelineEvents: reviewerChangeTimelineEvents(
            d.detail.requestedReviewers,
            requestedReviewers,
            timelineActorFromDetail(d.detail)
          ),
        }
      );
      d.setActionMsg(`Requested review from ${name}.`);
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function openReviewerPicker() {
    if (!d.detail) return;
    const exclude = d.detail.requestedReviewers || [];
    const logins = d.collectPeopleLogins(exclude);
    const options =
      typeof d.buildPeopleOptions === 'function'
        ? d.buildPeopleOptions(logins, {}, d.detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: { login: id, kind: 'user', avatarUrl: d.detail.avatarUrls?.[String(id).toLowerCase()] || '' },
          }));
    d.pickerAnchorRef.current = d.reviewerAddRef?.current;
    // Shared single-select surface with openAssigneePicker (⌥1–3 quick pick).
    d.setPicker({
      type: 'reviewer',
      title: 'Add reviewer',
      options,
      query: '',
      allowFreeText: true,
      multi: false,
      placeholder: 'Filter or type a username…',
      onPick: (opt) => {
        d.closePicker();
        void applyAddReviewer(opt?.id || opt?.label);
      },
    });
  }
  async function onRemoveReviewer(login: any) {
    if (!d.detail || !login) return;
    if (
      typeof d.isBotAccount === 'function'
        ? d.isBotAccount(login, d.detail)
        : /\[bot\]$/i.test(String(login || ''))
    ) {
      d.setActionMsg(`Cannot remove bot reviewer ${login}.`);
      return;
    }
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Remove reviewer?',
          message: `Remove reviewer ${login}?`,
          confirmLabel: 'Remove',
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
      if (!api?.removeReviewers) throw new Error('Remove reviewers API unavailable');
      const result = await api.removeReviewers(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
        [login]
      );
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const requestedReviewers = fromApi.length
        ? fromApi
        : (d.detail.requestedReviewers || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch(
        { requestedReviewers },
        {
          localTimelineEvents: reviewerChangeTimelineEvents(
            d.detail.requestedReviewers,
            requestedReviewers,
            timelineActorFromDetail(d.detail)
          ),
        }
      );
      d.setActionMsg(`Removed reviewer ${login}.`);
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onApplySuggestion(payload: any) {
    if (!d.detail || !payload?.path || payload.endLine == null) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Apply suggestion?',
          message: `Apply suggestion to ${payload.path}:${payload.startLine || payload.endLine}–${payload.endLine} on ${d.detail.headRef}?`,
          confirmLabel: 'Apply',
          tone: 'warn',
        })
      )
    ) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.applyReviewSuggestion) throw new Error('Apply suggestion API unavailable');
      await api.applyReviewSuggestion(d.detail.owner, d.detail.repo, {
        path: payload.path,
        headRef: d.detail.headRef,
        startLine: payload.startLine || payload.endLine,
        endLine: payload.endLine,
        suggestion: payload.suggestion,
        commitMessage: `Apply suggestion to ${payload.path}`,
      });
      d.setActionMsg(`Suggestion applied to ${payload.path}.`);
      await d.onRefresh?.();
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function onStartEditReviewComment(id, _body) {
    // Opens inline BodyEditor (conversation timeline or Diff InlineThread)
    d.setEditingComment({ kind: 'review', id });
  }
  async function onDiscardPendingReview() {
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const reviewId = d.serverPendingReviewId;
      if (reviewId && api?.deletePendingPullReview && d.detail) {
        await api.deletePendingPullReview(
          d.detail.owner,
          d.detail.repo,
          d.detail.number,
          reviewId
        );
      }
      // Clear local draft batch
      d.setPendingReview(
        typeof d.discardPendingReview === 'function'
          ? d.discardPendingReview()
          : { comments: [], body: '' }
      );
      // Clear PRR_ latch so Add comment cannot re-attach to a deleted review.
      if (d.pendingReviewNodeIdRef) {
        d.pendingReviewNodeIdRef.current = null;
      }
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.removeAttribute(
            'data-prp-pending-review-node'
          );
        }
      } catch {
        /* ignore */
      }
      let stripped: any = null;
      applyDomainDetail((prev) => {
        stripped =
          typeof d.stripPendingReviewFromDetail === 'function'
            ? d.stripPendingReviewFromDetail(prev)
            : prev
              ? {
                  ...prev,
                  viewerPendingReview: null,
                  reviewComments: (prev.reviewComments || []).filter(
                    (c: any) => c && !c.pending
                  ),
                }
              : prev;
        return stripped;
      });
      // Write-through host: null VPR + filtered comments (set-authority; no latch).
      if (stripped) {
        void patchHostDetail({
          viewerPendingReview: null,
          reviewComments: stripped.reviewComments,
          ...(stripped._deletedReviewCommentIds
            ? { _deletedReviewCommentIds: stripped._deletedReviewCommentIds }
            : {}),
          ...(stripped._deletedReviewBodies
            ? { _deletedReviewBodies: stripped._deletedReviewBodies }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(stripped, 'reviewThreads')
            ? { reviewThreads: stripped.reviewThreads }
            : {}),
        });
      }
      d.setActionMsg('Pending review discarded.');
      await d.onRefresh?.();
      // Re-strip after refresh so a racey onRefresh/IDB write cannot leave a
      // pre-discard snapshot. Host live PENDING (if delete failed/recreated)
      // wins via settled set-authority on the next core/threads apply.
      let post: any = null;
      applyDomainDetail((prev) => {
        post =
          typeof d.stripPendingReviewFromDetail === 'function'
            ? d.stripPendingReviewFromDetail(prev)
            : prev;
        return post;
      });
      if (post) {
        void patchHostDetail({
          viewerPendingReview: null,
          reviewComments: post.reviewComments,
          ...(post._deletedReviewCommentIds
            ? { _deletedReviewCommentIds: post._deletedReviewCommentIds }
            : {}),
          ...(post._deletedReviewBodies
            ? { _deletedReviewBodies: post._deletedReviewBodies }
            : {}),
        });
      }
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
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
    if (!d.detail || draftKey == null || !body) return;
  
    // GitHub only accepts replies to **top-level** review comments.
    const rootId =
      typeof resolveRootReviewCommentId === 'function'
        ? resolveRootReviewCommentId(d.detail.reviewComments || [], draftKey)
        : Number(draftKey);
    const parentId =
      typeof normalizeReviewCommentId === 'function'
        ? normalizeReviewCommentId(rootId ?? draftKey)
        : Number(rootId ?? draftKey);
    if (parentId == null || !Number.isFinite(Number(parentId))) {
      d.setActionMsg('Cannot reply: invalid review comment id.');
      return;
    }
  
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.replyToReviewComment) throw new Error('Reply API unavailable');
      const threadNodeId =
        thread?.threadNodeId || thread?.root?.threadNodeId || null;
      const parentNodeId =
        thread?.root?.nodeId ||
        thread?.root?.node_id ||
        thread?.nodeId ||
        null;
      const raw = await api.replyToReviewComment(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
        parentId,
        body,
        {
          mode,
          threadNodeId,
          parentNodeId,
          path: thread?.root?.path || thread?.path || '',
          line: thread?.root?.line ?? thread?.line ?? null,
          side: thread?.root?.side || thread?.side || 'RIGHT',
          commitId: d.detail.headSha || null,
        }
      );
      const isPending = Boolean(raw?.pending || mode === 'pending');
      // Pessimistic: server-mapped reply → host write-through (no pre-paint).
      const mapped = mapRestReviewComment(raw, {
        body,
        author: d.detail.viewerLogin || '',
        path: thread?.root?.path || thread?.path || '',
        line: thread?.root?.line ?? thread?.line ?? null,
        side: thread?.root?.side || 'RIGHT',
        inReplyToId: parentId,
        threadNodeId,
        pending: isPending,
        pendingReviewId: raw?.pendingReviewId ?? d.serverPendingReviewId ?? null,
      });
      if (mapped) {
        const base = d.detail || {};
        const withReply =
          typeof appendOptimisticReviewComment === 'function'
            ? appendOptimisticReviewComment(base, {
                ...mapped,
                pending: isPending,
              })
            : {
                ...base,
                reviewComments: [
                  ...(base.reviewComments || []),
                  { ...mapped, pending: isPending },
                ],
              };
        let next = withReply;
        if (isPending) {
          const reviewId =
            mapped.pendingReviewId ||
            raw?.pendingReviewId ||
            d.serverPendingReviewId;
          next = {
            ...withReply,
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
        }
        commitCommentListPatch(next);
      }
      d.setReplyDrafts((prev: any) => ({ ...prev, [String(draftKey)]: '' }));
      d.setActionMsg(
        isPending
          ? mode === 'pending'
            ? 'Reply added to pending review.'
            : 'Reply attached to your pending review.'
          : 'Reply posted.'
      );
      // Confirmed write already in host cache — avoid soft-refresh race wipe.
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onResolveThread(threadNodeId, resolved) {
    const tid = threadNodeId != null ? String(threadNodeId).trim() : '';
    if (!tid || !/^PRRT_/i.test(tid)) {
      d.setActionMsg(
        'Resolve requires a GraphQL review thread id (PRRT_…). Refresh the pull to load thread ids.'
      );
      return;
    }
    // Pending (unsubmitted) review threads cannot be resolved on GitHub
    const pendingOnThread = (d.detail?.reviewComments || []).some(
      (c: any) =>
        c?.pending && c.threadNodeId && String(c.threadNodeId) === tid
    );
    if (pendingOnThread) {
      d.setActionMsg(
        'Cannot resolve a pending review thread. Submit or discard the pending review first.'
      );
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    // Pessimistic: stamp local + host only after resolve API succeeds.
    // Sync host patch (not queueMicrotask) so mergeDetailPreserveOptimistic sees
    // the stamped resolved flag before a racey side-fetch re-render.
    const stamp = (snap: any, nextResolved: boolean) =>
      typeof stampThreadResolved === 'function'
        ? stampThreadResolved(snap, tid, nextResolved)
        : snap;
    const applyStamp = (nextResolved: boolean) => {
      const base = d.detailRef.current || d.detail;
      const next = stamp(base, nextResolved);
      if (!next) return;
      applyDomainDetail(next);
    };
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.resolveReviewThread) throw new Error('Resolve API unavailable');
      await api.resolveReviewThread(tid, resolved);
      applyStamp(Boolean(resolved));
      d.setActionMsg(resolved ? 'Thread resolved.' : 'Thread unresolved.');
    } catch (err) {
      // Prior settled resolve state preserved (never pre-stamped).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function onToggleViewed(path: any) {
    if (!path) return;
    const markingViewed = !d.isPathViewed(d.viewedPaths, path);
    d.setViewedPaths((prev) =>
      typeof d.applyViewedToggle === 'function'
        ? d.applyViewedToggle(prev, path, markingViewed)
        : typeof toggleViewedPath === 'function'
          ? toggleViewedPath(prev, path)
          : prev
    );
    // Viewed → collapse; uncheck → expand so the file can be re-read.
    d.setCollapsedFiles((prev) => {
      const n = d.materializeCollapsedPaths(prev, d.annotatedFiles, d.viewedPaths);
      if (markingViewed) n.add(path);
      else n.delete(path);
      return n;
    });
    // Server sync (best-effort) — local state already updated optimistically.
    void (async () => {
      try {
        const api = globalThis.PRTreeFetch;
        let gqlId =
          d.pullRequestGqlIdRef.current ||
          d.detail?.nodeId ||
          d.detail?.node_id ||
          null;
        if (!gqlId && api?.fetchViewerViewedPaths && d.detail?.owner) {
          const res = await api.fetchViewerViewedPaths(
            d.detail.owner,
            d.detail.repo,
            d.detail.number
          );
          if (res?.pullRequestId) {
            d.pullRequestGqlIdRef.current = res.pullRequestId;
            gqlId = res.pullRequestId;
          }
        }
        if (!gqlId) return;
        if (markingViewed && api?.markFileAsViewed) {
          await api.markFileAsViewed(gqlId, path);
        } else if (!markingViewed && api?.unmarkFileAsViewed) {
          await api.unmarkFileAsViewed(gqlId, path);
        }
      } catch (err) {
        // Keep local toggle; surface soft error
        d.setActionMsg(
          err?.message
            ? `Viewed saved locally (${err.message})`
            : 'Viewed saved locally (server sync failed)'
        );
      }
    })();
  }
  async function onClosePr() {
    if (!d.detail) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Close pull request?',
          message: `Close pull request #${d.detail.number}?`,
          confirmLabel: 'Close PR',
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
      if (!api?.closePullRequest && !api?.updatePullState) {
        throw new Error('Close PR API unavailable');
      }
      if (api.closePullRequest) {
        await api.closePullRequest(d.detail.owner, d.detail.repo, d.detail.number);
      } else {
        await api.updatePullState(d.detail.owner, d.detail.repo, d.detail.number, 'closed');
      }
      d.setActionMsg('Pull request closed.');
      // Write-through host/d.detail cache BEFORE close so SWR does not resurrect open.
      const closedPatch = {
        state: 'closed',
        mergeable: false,
        merged: false,
      };
      applyDomainDetail((d) => (d ? { ...d, ...closedPatch } : d));
      void patchHostDetail(closedPatch);
      // Return to the pulls list (centered modal and side sheet).
      d.requestClose();
      try {
        await d.onRefresh?.();
      } catch {
        /* list refresh is best-effort after close */
      }
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onReopenPr() {
    if (!d.detail) return;
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.reopenPullRequest && !api?.updatePullState) {
        throw new Error('Reopen PR API unavailable');
      }
      if (api.reopenPullRequest) {
        await api.reopenPullRequest(d.detail.owner, d.detail.repo, d.detail.number);
      } else {
        await api.updatePullState(d.detail.owner, d.detail.repo, d.detail.number, 'open');
      }
      d.setActionMsg('Pull request reopened.');
      const openPatch = {
        state: 'open',
        merged: false,
        mergeable: null as boolean | null,
      };
      applyDomainDetail((d) => (d ? { ...d, ...openPatch } : d));
      void patchHostDetail(openPatch);
      try {
        await d.onRefresh?.();
      } catch {
        /* best-effort */
      }
      applyDomainDetail((d) =>
        d ? { ...d, state: 'open', merged: false } : d
      );
      void patchHostDetail({ state: 'open', merged: false });
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onEditTitle(nextTitle: string) {
    if (!d.detail) return;
    const title = String(nextTitle ?? '').trim();
    const prevTitle = String(d.detail.title || '');
    if (!title || title === prevTitle.trim()) return;
    d.setActionBusy(true);
    d.setActionMsg('');
    // Pessimistic: paint title only after API success.
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(d.detail.owner, d.detail.repo, d.detail.number, { title });
      d.setActionMsg('Title updated.');
      const renameEv = makeLocalTimelineEvent({
        event: 'renamed',
        actor: timelineActorFromDetail(d.detail).login,
        avatarUrl: timelineActorFromDetail(d.detail).avatarUrl,
        rename: { from: prevTitle, to: title },
      });
      const base = d.detailRef.current || d.detail;
      const timelineEvents = mergeTimelineEventsById(
        Array.isArray(base?.timelineEvents)
          ? base.timelineEvents
          : Array.isArray(d.detail.timelineEvents)
            ? d.detail.timelineEvents
            : [],
        [renameEv]
      );
      applyDomainDetail((prev) =>
        prev
          ? {
              ...prev,
              title,
              timelineEvents,
            }
          : prev
      );
      void patchHostDetail({
        title,
        timelineEvents,
      });
      // Timeline-only convergence — never full soft-refresh after known title write.
      void refreshTimelineEvents();
    } catch (err) {
      // Prior settled title preserved (never pre-painted).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onSetDraftStage(stage: any) {
    if (!d.detail) return;
    const wantReady = stage === 'ready';
    const nextDraft = !wantReady;
    const label = wantReady ? 'Mark ready for review' : 'Convert to draft';
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: `${label}?`,
          message: `${label} for #${d.detail.number}?`,
          confirmLabel: label,
          tone: 'default',
        })
      )
    ) {
      return;
    }
    // Pessimistic: draft flag + host cache only after API success; re-assert after
    // refresh so SWR/IDB cannot resurrect pre-write draft.
    const applyDraft = (draft: boolean) => {
      applyDomainDetail((prev) => (prev ? { ...prev, draft: Boolean(draft) } : prev));
      void patchHostDetail({ draft: Boolean(draft) });
    };
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setPullRequestDraftStage) throw new Error('Draft stage API unavailable');
      const result = await api.setPullRequestDraftStage(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
        wantReady ? 'ready' : 'draft',
        d.detail.nodeId
      );
      const confirmed =
        result && typeof result.draft === 'boolean'
          ? result.draft
          : nextDraft;
      applyDraft(confirmed);
      d.setActionMsg(
        confirmed
          ? 'Converted to draft.'
          : 'Marked ready for review.'
      );
      void refreshTimelineEvents();
      try {
        await d.onRefresh?.();
      } catch {
        /* best-effort — draft already patched */
      }
      // Re-assert after refresh: REST/cache can briefly lag GraphQL.
      applyDraft(confirmed);
    } catch (err) {
      // Prior settled draft preserved (never pre-painted).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onMergePr(method = 'merge') {
    if (!d.detail) return;
    if (d.detail.merged) {
      d.setActionMsg('Already merged.');
      return;
    }
    if (d.detail.draft) {
      d.setActionMsg('Cannot merge a draft PR. Mark ready for review first.');
      return;
    }
    // Respect repository Settings → Pull Requests merge methods.
    const m = coerceMergeMethod(d.detail, method);
    if (!m) {
      d.setActionMsg(
        'No merge methods are enabled for this repository (check Settings → Pull Requests).'
      );
      return;
    }
    const mergeReq =
      typeof buildMergeConfirmRequest === 'function'
        ? buildMergeConfirmRequest(m, d.detail.number)
        : {
            title: 'Merge?',
            message: `Merge PR #${d.detail.number}?`,
            confirmLabel: 'Merge',
            tone: 'danger' as const,
          };
    if (!confirmGateProceed(await d.requestConfirm(mergeReq))) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.mergePullRequest) throw new Error('Merge API unavailable');
      await api.mergePullRequest(d.detail.owner, d.detail.repo, d.detail.number, {
        mergeMethod: m,
        commitTitle: d.detail.title,
      });
      d.setActionMsg(
        `Merged (${m}). You can delete the head branch below if you no longer need it.`
      );
      // Stay open so Merge box can offer optional delete head branch.
      // Mirror draft path: host write-through + post-refresh re-assert so SWR/IDB
      // and open-list stack do not resurrect pre-merge status.
      const mergedPatch = {
        merged: true,
        state: 'closed',
        mergeable: false,
        draft: false,
      };
      const applyMerged = () => {
        applyDomainDetail((d) => (d ? { ...d, ...mergedPatch } : d));
        void patchHostDetail(mergedPatch);
      };
      applyMerged();
      try {
        await d.onRefresh?.();
      } catch {
        /* list refresh is best-effort */
      }
      applyMerged();
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onUpdateBranch() {
    if (!d.detail) return;
    // Same gate as MergeBox CTA / palette — only when head is behind base.
    if (!canUpdateBranch(d.detail)) {
      d.setActionMsg('Branch is already up to date with base.');
      return;
    }
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Update branch?',
          message: `Update branch ${d.detail.headRef} with latest ${d.detail.baseRef}?`,
          confirmLabel: 'Update branch',
          tone: 'warn',
        })
      )
    ) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullBranch) throw new Error('Update branch API unavailable');
      await api.updatePullBranch(
        d.detail.owner,
        d.detail.repo,
        d.detail.number,
        d.detail.headSha
      );
      d.setActionMsg('Branch updated from base.');
      await d.onRefresh?.();
    } catch (err) {
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onSubscribe(want: any) {
    if (!d.detail) return;
    const nextSubscribed = Boolean(want);
    const prevSubscribed = d.detail.subscribed;
    // Optimistic UI — swap icon immediately; revert on failure
    applyDomainDetail((prev) =>
      prev ? { ...prev, subscribed: nextSubscribed } : prev
    );
    void patchHostDetail({ subscribed: nextSubscribed });
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const nodeId = d.detail.nodeId || null;
      if (nextSubscribed) {
        if (!api?.setIssueSubscription) throw new Error('Subscribe API unavailable');
        const result = await api.setIssueSubscription(
          d.detail.owner,
          d.detail.repo,
          d.detail.number,
          { subscribed: true, ignored: false, nodeId }
        );
        if (result && typeof result.subscribed === 'boolean') {
          applyDomainDetail((prev) =>
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
            d.detail.owner,
            d.detail.repo,
            d.detail.number,
            nodeId
          );
        } else {
          result = await api.setIssueSubscription(
            d.detail.owner,
            d.detail.repo,
            d.detail.number,
            { subscribed: false, ignored: false, nodeId }
          );
        }
        if (result && typeof result.subscribed === 'boolean') {
          applyDomainDetail((prev) =>
            prev ? { ...prev, subscribed: result.subscribed } : prev
          );
        }
      }
      // Icon state is enough feedback — no success toast
      d.setActionMsg('');
      // Keep optimistic value — skip full refresh (stale subscription can clobber UI)
    } catch (err) {
      applyDomainDetail((prev) =>
        prev
          ? {
              ...prev,
              subscribed:
                typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed,
            }
          : prev
      );
      void patchHostDetail({ subscribed: typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed });
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  function commitCommentListPatch(next: any) {
    if (!next) return;
    // Host-data-first: single write path (detailRef + onPatchDetail).
    applyDomainDetail(next);
  }
  async function onDeleteReviewComment(commentId: any) {
    if (!d.detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Delete review comment?',
          message: 'Delete this review comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    // Pessimistic: strip only after delete API succeeds (latest detailRef).
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteReviewComment) throw new Error('Delete review comment API unavailable');
      await api.deleteReviewComment(d.detail.owner, d.detail.repo, commentId);
      const base = d.detailRef.current || d.detail;
      const stripped =
        typeof d.removeReviewCommentFromDetail === 'function'
          ? d.removeReviewCommentFromDetail(base, commentId)
          : {
              ...base,
              reviewComments: (base?.reviewComments || []).filter(
                (c: any) => c && String(c.id) !== String(commentId)
              ),
            };
      commitCommentListPatch(stripped);
      d.setActionMsg('Review comment deleted.');
      // No full d.onRefresh — soft revalidate was re-fetching deleted PRRT ids and failing.
    } catch (err) {
      // Prior settled comments preserved (never pre-stripped).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }
  async function onDeleteIssueComment(commentId: any) {
    if (!d.detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await d.requestConfirm({
          title: 'Delete comment?',
          message: 'Delete this comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    // Pessimistic: strip only after delete API succeeds (latest detailRef).
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteIssueComment) throw new Error('Delete comment API unavailable');
      await api.deleteIssueComment(d.detail.owner, d.detail.repo, commentId);
      const base = d.detailRef.current || d.detail;
      const stripped =
        typeof d.removeIssueCommentFromDetail === 'function'
          ? d.removeIssueCommentFromDetail(base, commentId)
          : {
              ...base,
              comments: (base?.comments || []).filter(
                (c: any) => c && String(c.id) !== String(commentId)
              ),
            };
      commitCommentListPatch(stripped);
      d.setActionMsg('Comment deleted.');
    } catch (err) {
      // Prior settled comments preserved (never pre-stripped).
      d.setActionMsg(err?.message || String(err));
    } finally {
      d.setActionBusy(false);
    }
  }

  /**
   * Hide (minimize) a comment via GraphQL minimizeComment.
   * @param {{ commentId: any, nodeId: string, reason?: string }} opts
   */
  async function onHideComment(opts: {
    commentId?: any;
    nodeId?: string | null;
    reason?: string | null;
  } = {}) {
    const commentId = opts.commentId;
    const nodeId = String(opts.nodeId || '').trim();
    const reason = normalizeHideReason(opts.reason || DEFAULT_HIDE_REASON);
    if (!nodeId) {
      d.setActionMsg('Hide unavailable (missing comment id).');
      stampHideCommentResult({
        ok: false,
        commentId,
        isMinimized: false,
        reason,
        action: 'hide',
      });
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.minimizeComment) {
        throw new Error('Hide comment API unavailable');
      }
      await api.minimizeComment(nodeId, reason);
      const base = d.detailRef.current || d.detail;
      const next = patchDetailCommentMinimized(base, commentId, {
        isMinimized: true,
        minimizedReason: reason,
      });
      commitCommentListPatch(next);
      d.setActionMsg(`Comment hidden (${reason.toLowerCase().replace(/_/g, '-')}).`);
      stampHideCommentResult({
        ok: true,
        commentId,
        isMinimized: true,
        reason,
        action: 'hide',
      });
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
      stampHideCommentResult({
        ok: false,
        commentId,
        isMinimized: false,
        reason,
        action: 'hide',
      });
    } finally {
      d.setActionBusy(false);
    }
  }

  /**
   * Unhide (unminimize) a comment via GraphQL unminimizeComment.
   */
  async function onUnhideComment(opts: {
    commentId?: any;
    nodeId?: string | null;
  } = {}) {
    const commentId = opts.commentId;
    const nodeId = String(opts.nodeId || '').trim();
    if (!nodeId) {
      d.setActionMsg('Unhide unavailable (missing comment id).');
      stampHideCommentResult({
        ok: false,
        commentId,
        isMinimized: true,
        action: 'unhide',
      });
      return;
    }
    d.setActionBusy(true);
    d.setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.unminimizeComment) {
        throw new Error('Unhide comment API unavailable');
      }
      await api.unminimizeComment(nodeId);
      const base = d.detailRef.current || d.detail;
      const next = patchDetailCommentMinimized(base, commentId, {
        isMinimized: false,
        minimizedReason: null,
      });
      commitCommentListPatch(next);
      d.setActionMsg('Comment restored.');
      stampHideCommentResult({
        ok: true,
        commentId,
        isMinimized: false,
        action: 'unhide',
      });
    } catch (err: any) {
      d.setActionMsg(err?.message || String(err));
      stampHideCommentResult({
        ok: false,
        commentId,
        isMinimized: true,
        action: 'unhide',
      });
    } finally {
      d.setActionBusy(false);
    }
  }

  return {
    timelineActorFromDetail,
    refreshTimelineEvents,
    commitMetaPatch,
    patchHostDetail,
    applyAddAssignees,
    openAssigneePicker,
    onRemoveAssignee,
    applySetLabels,
    openLabelPicker,
    onRemoveLabel,
    onSaveBody,
    onSaveEditComment,
    applyBaseChange,
    openBasePicker,
    applyAddReviewer,
    openReviewerPicker,
    onRemoveReviewer,
    onApplySuggestion,
    onStartEditReviewComment,
    onDiscardPendingReview,
    onReplyToThread,
    onResolveThread,
    onToggleViewed,
    onClosePr,
    onReopenPr,
    onEditTitle,
    onSetDraftStage,
    onMergePr,
    onUpdateBranch,
    onSubscribe,
    commitCommentListPatch,
    onDeleteReviewComment,
    onDeleteIssueComment,
    onHideComment,
    onUnhideComment,
  };
}
