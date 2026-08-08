/**
 * Pure helpers for markdown composers: attachment insert + optimistic detail merge.
 */
import { filesListHasUsableDiffBodies } from './detail-idb';
import {
  detailHasViewerPending,
  filterCacheReviewCommentsForCore,
  hydrateDiscardedPendingBodies,
  isDiscardedPendingBody,
  isUnverifiedLocalOnlyReviewComment,
  noteDiscardedPendingBodies,
  reconcileReviewCommentsAgainstRemote,
  stripOrphanPendingReviewComments,
  stripUnverifiedLocalOnlyReviewComments,
} from './stale-local-review';

export {
  detailHasViewerPending,
  filterCacheReviewCommentsForCore,
  hydrateDiscardedPendingBodies,
  isDiscardedPendingBody,
  isUnverifiedLocalOnlyReviewComment,
  noteDiscardedPendingBodies,
  reconcileReviewCommentsAgainstRemote,
  stripOrphanPendingReviewComments,
  stripUnverifiedLocalOnlyReviewComments,
} from './stale-local-review';

/**
 * Insert an attachment markdown snippet at a cursor offset (or append).
 * Images → ![name](url); other files → [name](url)
 */
export function buildAttachmentMarkdown(
  fileName: string,
  url: string,
  opts: { isImage?: boolean } = {}
): string {
  const name = String(fileName || 'file').replace(/[[\]]/g, '');
  const href = String(url || '').trim();
  if (!href) return '';
  const image =
    opts.isImage != null
      ? Boolean(opts.isImage)
      : /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name) ||
        /^data:image\//i.test(href);
  return image ? `![${name}](${href})` : `[${name}](${href})`;
}

/**
 * @returns {{ text: string, cursor: number }}
 */
export function insertMarkdownAtCursor(
  text: string,
  cursor: number,
  snippet: string
): { text: string; cursor: number } {
  const src = text == null ? '' : String(text);
  const snip = String(snippet || '');
  if (!snip) return { text: src, cursor: Math.max(0, Math.min(cursor || 0, src.length)) };
  let c = Number(cursor);
  if (!Number.isFinite(c) || c < 0) c = src.length;
  if (c > src.length) c = src.length;
  // Prefer blank-line separation when inserting mid/end of non-empty draft
  let prefix = src.slice(0, c);
  let suffix = src.slice(c);
  let insert = snip;
  if (prefix && !/\n$/.test(prefix)) insert = `\n${insert}`;
  if (suffix && !/^\n/.test(suffix)) insert = `${insert}\n`;
  const next = prefix + insert + suffix;
  return { text: next, cursor: prefix.length + insert.length };
}

/**
 * Guess content-type from file name for uploads.
 */
export function guessContentType(fileName: string, fileType?: string): string {
  if (fileType && String(fileType).includes('/')) return String(fileType);
  const n = String(fileName || '').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function samePrIdentity(a: any, b: any): boolean {
  if (!a || !b) return false;
  const an = a.number;
  const bn = b.number;
  if (an != null && bn != null && Number(an) !== Number(bn)) return false;
  if ((an == null) !== (bn == null)) return false;
  const ao = String(a.owner || '').toLowerCase();
  const bo = String(b.owner || '').toLowerCase();
  const ar = String(a.repo || '').toLowerCase();
  const br = String(b.repo || '').toLowerCase();
  if ((ao || bo) && ao !== bo) return false;
  if ((ar || br) && ar !== br) return false;
  return true;
}

function labelKey(l: any): string {
  return String(typeof l === 'string' ? l : l?.name || '')
    .trim()
    .toLowerCase();
}

function labelsFingerprint(list: any[]): string {
  return (Array.isArray(list) ? list : [])
    .map(labelKey)
    .filter(Boolean)
    .sort()
    .join('\0');
}

function assigneesFingerprint(list: any[]): string {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('\0');
}

function reviewersFingerprint(list: any[]): string {
  return assigneesFingerprint(list);
}

function milestoneFingerprint(m: any): string {
  if (m == null) return '';
  if (typeof m === 'number') return String(m);
  const n = m.number != null ? String(m.number) : '';
  const t = String(m.title || '').trim().toLowerCase();
  return `${n}\0${t}`;
}

/** Collect id strings from a Set / array / nullish bag. */
function idSetFrom(raw: any): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  if (raw instanceof Set) {
    for (const v of raw) if (v != null && v !== '') out.add(String(v));
    return out;
  }
  if (Array.isArray(raw)) {
    for (const v of raw) if (v != null && v !== '') out.add(String(v));
  }
  return out;
}

/**
 * Merge host detail onto optimistic local detail without dropping newer local
 * review comments / replies (fixes flash-then-revert after reply).
 *
 * Assignees/labels use `_metaSeq`: local meta writes bump the seq so a mid-flight
 * host re-render (stale detail still mounted while refresh loads) cannot clobber
 * the write. Host snapshots win again once their seq catches up, or when the
 * host payload already matches the local write (seq can drop).
 *
 * `_deletedReviewCommentIds` / `_deletedIssueCommentIds` block resurrection of
 * comments the user just deleted (stale host cache or racey refresh).
 */
export function mergeDetailPreserveOptimistic(prev: any, next: any): any {
  if (!next) return prev || next;
  if (!prev) return next;
  // Switching PRs — never carry optimistic meta/comments across issues
  if (!samePrIdentity(prev, next)) return next;

  const deletedReviewIds = new Set([
    ...idSetFrom(prev._deletedReviewCommentIds),
    ...idSetFrom(next._deletedReviewCommentIds),
  ]);
  const deletedIssueIds = new Set([
    ...idSetFrom(prev._deletedIssueCommentIds),
    ...idSetFrom(next._deletedIssueCommentIds),
  ]);

  const prevRc = Array.isArray(prev.reviewComments) ? prev.reviewComments : [];
  const nextRc = Array.isArray(next.reviewComments) ? next.reviewComments : [];
  // Host-data-first (no durable drop latch): live host PENDING always wins.
  // Drop local pending only when host has no VPR/pending rows and local also
  // does not hold a just-posted VPR (race keep for in-flight Start/Add).
  const nextHasPendingReview = Boolean(next.viewerPendingReview?.id);
  const nextHasAnyPendingComment = nextRc.some((c) => c && c.pending);
  const prevHoldsPendingReview = Boolean(prev.viewerPendingReview?.id);
  const hostHasPending = nextHasAnyPendingComment || nextHasPendingReview;
  if (hostHasPending) {
    for (const c of nextRc) {
      if (c?.pending && c.id != null) deletedReviewIds.delete(String(c.id));
    }
  }
  // Explicit strip: prev cleared VPR (discard/submit) and host still empty.
  const explicitDropPending =
    prev.viewerPendingReview === null && !hostHasPending;
  const dropLocalPending =
    explicitDropPending ||
    (!nextHasPendingReview &&
      !nextHasAnyPendingComment &&
      !prevHoldsPendingReview);
  // Host/next may itself be polluted with IDB ghosts — never seed byId with them.
  // Host snapshot present (any length) or threads meta means GitHub is SoT for
  // which threads exist — drop local-only ghosts on prev-only rows too.
  const remoteReviewAuthoritative =
    nextRc.length > 0 ||
    Boolean(next._sideSettled?.reviews) ||
    Boolean(next._sideSettled?.comments) ||
    (Array.isArray(next.reviewThreads) && next.reviewThreads.length > 0) ||
    (next.reviewThreadsMeta != null &&
      Number(next.reviewThreadsMeta?.loadedThreadCount) >= 0 &&
      next.reviewThreadsMeta?.totalCount != null);

  const byId = new Map<string, any>();
  // Drop window only while host still has no PENDING (post-Discard empty SoT).
  const dropping = explicitDropPending;
  for (const c of nextRc) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    // Live pending from host is never tombstoned.
    if (c.pending && hostHasPending) {
      byId.set(key, c);
      continue;
    }
    if (deletedReviewIds.has(key)) continue;
    // Host-polluted ghost is not GitHub SoT — drop even when present in next
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    // After Discard (host empty): do not accept demoted pending ghosts.
    if (dropping) {
      if (c.pending) {
        deletedReviewIds.add(key);
        continue;
      }
      if (
        c.pendingReviewId != null &&
        String(c.pendingReviewId).trim() !== '' &&
        String(c.pendingReviewId) !== '0'
      ) {
        deletedReviewIds.add(key);
        continue;
      }
      if (isDiscardedPendingBody(prev, c.body) || isDiscardedPendingBody(next, c.body)) {
        deletedReviewIds.add(key);
        continue;
      }
      const prevHad = prevRc.find((p) => p && String(p.id) === key);
      // Host-only or was-pending during drop window → tombstone, never paint
      if (!prevHad || prevHad.pending) {
        deletedReviewIds.add(key);
        continue;
      }
    }
    byId.set(key, c);
  }

  for (const c of prevRc) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (deletedReviewIds.has(key)) continue;
    if (!byId.has(key)) {
      // Do not resurrect pending-only comments after discard/submit (host no longer has them)
      if (c.pending && dropLocalPending) continue;
      // Local-only empty "user" / No content ghosts — GitHub SoT, do not paint
      if (
        remoteReviewAuthoritative &&
        isUnverifiedLocalOnlyReviewComment(c)
      ) {
        continue;
      }
      // Always drop ghosts even when remote is not yet authoritative
      if (isUnverifiedLocalOnlyReviewComment(c)) continue;
      // Keep optimistic-only rows (temp ids or not yet in host snapshot)
      byId.set(key, c);
    } else {
      // Prefer host row but keep optimistic threadNodeId if host lacks it
      const host = byId.get(key);
      byId.set(key, {
        ...c,
        ...host,
        // Host without pending flag wins when review was discarded
        pending: host.pending ?? false,
        pendingReviewId: host.pending ? host.pendingReviewId ?? c.pendingReviewId : null,
        threadNodeId: host.threadNodeId || c.threadNodeId || null,
      });
    }
  }
  const prevComments = Array.isArray(prev.comments) ? prev.comments : [];
  const nextComments = Array.isArray(next.comments) ? next.comments : [];
  const cById = new Map<string, any>();
  for (const c of nextComments) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (deletedIssueIds.has(key)) continue;
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    cById.set(key, c);
  }
  for (const c of prevComments) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (deletedIssueIds.has(key)) continue;
    if (!cById.has(key)) {
      // Same ghost policy for conversation issue comments (user / No content)
      if (isUnverifiedLocalOnlyReviewComment(c)) continue;
      cById.set(key, c);
    }
  }

  const prevAssignees = Array.isArray(prev.assignees) ? prev.assignees : [];
  const nextAssignees = Array.isArray(next.assignees) ? next.assignees : [];
  const prevLabels = Array.isArray(prev.labels) ? prev.labels : [];
  const nextLabels = Array.isArray(next.labels) ? next.labels : [];
  const prevReviewers = Array.isArray(prev.requestedReviewers)
    ? prev.requestedReviewers
    : [];
  const nextReviewers = Array.isArray(next.requestedReviewers)
    ? next.requestedReviewers
    : [];

  const prevSeq = Number(prev._metaSeq) || 0;
  const nextSeq = Number(next._metaSeq) || 0;
  // Host matches what we just wrote → adopt host (incl. colors) and allow seq to settle
  const metaInSync =
    assigneesFingerprint(prevAssignees) === assigneesFingerprint(nextAssignees) &&
    labelsFingerprint(prevLabels) === labelsFingerprint(nextLabels) &&
    reviewersFingerprint(prevReviewers) === reviewersFingerprint(nextReviewers) &&
    milestoneFingerprint(prev.milestone) === milestoneFingerprint(next.milestone);
  const holdLocalMeta = prevSeq > nextSeq && !metaInSync;

  const assignees = holdLocalMeta
    ? prevAssignees
    : Array.isArray(next.assignees)
      ? nextAssignees
      : prevAssignees;
  const labels = holdLocalMeta
    ? prevLabels
    : Array.isArray(next.labels)
      ? nextLabels
      : prevLabels;
  const requestedReviewers = holdLocalMeta
    ? prevReviewers
    : Array.isArray(next.requestedReviewers)
      ? nextReviewers
      : prevReviewers;
  // Milestone: non-null next always wins. List-sketch / incomplete shells with
  // null must not wipe a known non-null prev. Authoritative network null
  // (external clear) still wins when next is not a sketch.
  const nextIsSketch =
    Boolean(next._sketch) || String(next._source || '') === 'list';
  const milestone = holdLocalMeta
    ? prev.milestone ?? null
    : next.milestone != null
      ? next.milestone
      : prev.milestone != null && nextIsSketch
        ? prev.milestone
        : Object.prototype.hasOwnProperty.call(next, 'milestone')
          ? next.milestone
          : prev.milestone ?? null;
  // Drop the lock once host matches local write; otherwise keep the higher seq.
  const metaSeq = holdLocalMeta
    ? prevSeq
    : metaInSync
      ? 0
      : Math.max(prevSeq, nextSeq);

  const avatarUrls = holdLocalMeta
    ? {
        ...(next.avatarUrls && typeof next.avatarUrls === 'object' ? next.avatarUrls : {}),
        ...(prev.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
      }
    : {
        ...(prev.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
        ...(next.avatarUrls && typeof next.avatarUrls === 'object' ? next.avatarUrls : {}),
      };

  // Final strip: never leave user/No content ghosts in painted detail
  const mergedRc = stripUnverifiedLocalOnlyReviewComments([...byId.values()]);
  const mergedHasPending = mergedRc.some((c) => c && c.pending);
  // Prefer host viewerPendingReview when present. If host is empty but we still
  // hold pending comment rows (post→refresh race), keep prev.viewerPendingReview
  // so Submit/Discard keep working. Explicit strip sets prev.viewerPendingReview=null.
  let viewerPendingReview = next.viewerPendingReview;
  if (viewerPendingReview === undefined) {
    viewerPendingReview = prev.viewerPendingReview ?? null;
  } else if (
    !viewerPendingReview?.id &&
    prev.viewerPendingReview?.id &&
    mergedHasPending &&
    !explicitDropPending
  ) {
    viewerPendingReview = prev.viewerPendingReview;
  }
  if (explicitDropPending) {
    viewerPendingReview = null;
  }

  // Prefer boolean host/local subscription; keep local when host is still null
  // after an optimistic toggle (refresh can lag the PUT/DELETE).
  const subscribed =
    typeof next.subscribed === 'boolean'
      ? next.subscribed
      : typeof prev.subscribed === 'boolean'
        ? prev.subscribed
        : next.subscribed ?? prev.subscribed ?? null;

  // Files/commits authority: non-empty next wins; settled empty is authoritative;
  // unsettled empty must not clobber a non-empty local list (deferred side-fetch).
  const files = mergeSliceListAuthority(prev, next, 'files');
  const commits = mergeSliceListAuthority(prev, next, 'commits');
  const sideSettled = mergeSideSettledFlags(prev, next, files, commits);

  // System events (labeled/milestoned/…): union by id; keep local optimistics
  // until a server event covers the same narrative (meta write-through).
  const prevTe = Array.isArray(prev.timelineEvents) ? prev.timelineEvents : [];
  const nextTe = Array.isArray(next.timelineEvents) ? next.timelineEvents : [];
  let timelineEvents = nextTe;
  if (prevTe.length || nextTe.length) {
    // Prefer next (host) for same id, then prev-only; drop covered local:* rows.
    const byId = new Map<string, any>();
    for (const e of prevTe) {
      if (e && e.id != null) byId.set(String(e.id), e);
    }
    for (const e of nextTe) {
      if (e && e.id != null) byId.set(String(e.id), e);
    }
    if (byId.size > 0) {
      const all = [...byId.values()];
      const server = all.filter((e) => !String(e?.id ?? '').startsWith('local:'));
      const locals = all.filter((e) => String(e?.id ?? '').startsWith('local:'));
      const narrEq = (a: any, b: any) => {
        if (!a || !b) return false;
        if (String(a.event || '') !== String(b.event || '')) return false;
        const al = String(a.label?.name || '').toLowerCase();
        const bl = String(b.label?.name || '').toLowerCase();
        if (al || bl) return al === bl && al !== '';
        const aa = String(a.assignee || '').toLowerCase();
        const ba = String(b.assignee || '').toLowerCase();
        if (aa || ba) return aa === ba && aa !== '';
        const ar = String(a.requestedReviewer || '').toLowerCase();
        const br = String(b.requestedReviewer || '').toLowerCase();
        if (ar || br) return ar === br && ar !== '';
        const am = String(
          a.milestone?.title || a.milestone?.number || ''
        ).toLowerCase();
        const bm = String(
          b.milestone?.title || b.milestone?.number || ''
        ).toLowerCase();
        if (am || bm) return am === bm && am !== '';
        return true;
      };
      // Drop local only when a server twin is *at least as new* as the local
      // write (not a historical labeled:bug from a prior mutation / test run).
      const serverCoversLocal = (s: any, local: any) => {
        if (!narrEq(s, local)) return false;
        const ts = Date.parse(String(s?.at || s?.createdAt || ''));
        const tl = Date.parse(String(local?.at || local?.createdAt || ''));
        if (!Number.isFinite(ts) || !Number.isFinite(tl)) return false;
        return ts >= tl - 5_000 && ts <= tl + 180_000;
      };
      const keptLocals = locals.filter(
        (local) => !server.some((s) => serverCoversLocal(s, local))
      );
      timelineEvents = [...server, ...keptLocals];
    } else if (prevTe.length > nextTe.length) {
      timelineEvents = prevTe;
    }
  }

  // Body emoji reactions: keep local optimistic viewer toggles until host
  // snapshot includes the same content with at least as many viewer reacts.
  // A racey host re-render (pre-patch store) used to wipe is-reacted pills.
  const prevBr = Array.isArray(prev.bodyReactions) ? prev.bodyReactions : [];
  const nextBr = Array.isArray(next.bodyReactions) ? next.bodyReactions : null;
  let bodyReactions = nextBr != null ? nextBr : prevBr;
  if (prevBr.length || (nextBr && nextBr.length)) {
    const fp = (list: any[]) =>
      (Array.isArray(list) ? list : [])
        .map((g) => {
          const c = String(g?.content || '').trim();
          const v = g?.viewerHasReacted ? '1' : '0';
          const n = Number(g?.count) || 0;
          return `${c}:${v}:${n}`;
        })
        .filter((s) => s !== ':0:0')
        .sort()
        .join('|');
    const prevViewer = prevBr.filter((g) => g && g.viewerHasReacted);
    const nextViewer =
      nextBr != null ? nextBr.filter((g) => g && g.viewerHasReacted) : [];
    const prevHasViewer = prevViewer.length > 0;
    const nextMissingViewer =
      prevHasViewer &&
      prevViewer.some((pg) => {
        const key = String(pg.content || '');
        const ng = (nextBr || []).find(
          (g) => String(g?.content || '') === key
        );
        return !ng || !ng.viewerHasReacted;
      });
    // Prefer local when host is lagging on viewer reaction state.
    if (nextBr == null || nextMissingViewer) {
      bodyReactions = prevBr;
    } else if (fp(prevBr) === fp(nextBr)) {
      bodyReactions = nextBr;
    } else {
      // Host has the same-or-richer viewer set — adopt host (authoritative).
      bodyReactions = nextBr;
    }
  }

  // Resolve/unresolve write-through: hold local `_resolveStamps` against a
  // lagging host/by-ids snapshot (host comment rows prefer host.resolved and
  // would otherwise flip Unresolve back after a soft side-fetch).
  const resolveStamps = {
    ...(prev._resolveStamps && typeof prev._resolveStamps === 'object'
      ? prev._resolveStamps
      : {}),
    ...(next._resolveStamps && typeof next._resolveStamps === 'object'
      ? next._resolveStamps
      : {}),
  };
  let reviewCommentsOut = mergedRc;
  let reviewThreadsOut = Array.isArray(next.reviewThreads)
    ? next.reviewThreads
    : Array.isArray(prev.reviewThreads)
      ? prev.reviewThreads
      : next.reviewThreads;
  let resolveStampsOut: Record<string, boolean> | undefined =
    Object.keys(resolveStamps).length > 0 ? { ...resolveStamps } : undefined;
  if (resolveStampsOut) {
    const applyStamp = (row: any) => {
      if (!row) return row;
      const tid = String(row.threadNodeId || '');
      if (!tid || !Object.prototype.hasOwnProperty.call(resolveStampsOut!, tid)) {
        return row;
      }
      const want = Boolean(resolveStampsOut![tid]);
      if (Boolean(row.resolved) === want) return row;
      return { ...row, resolved: want };
    };
    reviewCommentsOut = mergedRc.map(applyStamp);
    if (Array.isArray(reviewThreadsOut)) {
      reviewThreadsOut = reviewThreadsOut.map(applyStamp);
    }
    // Drop stamps once host rows for that tid all agree (write converged).
    for (const tid of Object.keys(resolveStampsOut)) {
      const want = Boolean(resolveStampsOut[tid]);
      const relatedC = reviewCommentsOut.filter(
        (c: any) => c && String(c.threadNodeId || '') === tid
      );
      // Prefer host agreement: if next had rows for tid and they all match want,
      // the stamp is done even if we also re-applied (idempotent).
      const hostRelated = nextRc.filter(
        (c: any) => c && String(c.threadNodeId || '') === tid
      );
      const hostAgrees =
        hostRelated.length > 0 &&
        hostRelated.every((c: any) => Boolean(c.resolved) === want);
      if (hostAgrees) {
        delete resolveStampsOut[tid];
        continue;
      }
      // No host rows yet — keep stamp while local rows hold the write.
      if (
        relatedC.length > 0 &&
        relatedC.every((c: any) => Boolean(c.resolved) === want)
      ) {
        // Keep until host agrees
        continue;
      }
    }
    if (Object.keys(resolveStampsOut).length === 0) {
      resolveStampsOut = undefined;
    }
  }

  return {
    ...prev,
    ...next,
    viewerPendingReview,
    reviewComments: reviewCommentsOut,
    reviewThreads: reviewThreadsOut,
    comments: [...cById.values()],
    timelineEvents,
    bodyReactions,
    files,
    commits,
    _sideSettled: sideSettled,
    assignees,
    labels,
    requestedReviewers,
    milestone,
    avatarUrls,
    subscribed,
    _metaSeq: metaSeq,
    _resolveStamps: resolveStampsOut,
    // Keep tombstones local so a stale host snapshot cannot re-add deleted rows.
    // Always arrays (Set serializes to {} in IDB JSON and loses discard ghosts).
    _deletedReviewCommentIds:
      deletedReviewIds.size > 0 ? [...deletedReviewIds] : undefined,
    _deletedIssueCommentIds:
      deletedIssueIds.size > 0 ? [...deletedIssueIds] : undefined,
  };
}

/** Pure list merge for files/commits (exported for unit tests). */
export function mergeSliceListAuthority(
  prev: any,
  next: any,
  key: 'files' | 'commits'
): any[] {
  const prevList = Array.isArray(prev?.[key]) ? prev[key] : [];
  const nextList = Array.isArray(next?.[key]) ? next[key] : null;
  const nextSettled = Boolean(next?._sideSettled?.[key]);
  if (nextList && nextList.length > 0) {
    // Prefer prev only when next is slim IDB (`_patchOmitted`). GitHub REST
    // also omits patch for oversized files without that flag — treating those
    // as "unusable" rejected full fetchAllPrFiles results and left Diff stuck
    // re-fetching / "Loading all files…" forever on large PRs.
    if (
      key === 'files' &&
      nextList.some((f: any) => f && f._patchOmitted) &&
      filesListHasUsableDiffBodies(prevList)
    ) {
      return prevList;
    }
    return nextList;
  }
  if (nextSettled && nextList) return nextList; // authoritative empty
  if (prevList.length > 0) return prevList; // placeholder protection
  return nextList || prevList;
}

function mergeSideSettledFlags(
  prev: any,
  next: any,
  files: any[],
  commits: any[]
) {
  const p = (prev?._sideSettled && typeof prev._sideSettled === 'object'
    ? prev._sideSettled
    : {}) as Record<string, boolean>;
  const n = (next?._sideSettled && typeof next._sideSettled === 'object'
    ? next._sideSettled
    : {}) as Record<string, boolean>;
  const prevFiles = Array.isArray(prev?.files) ? prev.files : [];
  const prevCommits = Array.isArray(prev?.commits) ? prev.commits : [];
  // If we kept prev's non-empty list, keep prev's settled bit for that slice.
  const filesSettled =
    files === prevFiles && prevFiles.length > 0
      ? Boolean(p.files)
      : n.files !== undefined
        ? Boolean(n.files)
        : Boolean(p.files);
  const commitsSettled =
    commits === prevCommits && prevCommits.length > 0
      ? Boolean(p.commits)
      : n.commits !== undefined
        ? Boolean(n.commits)
        : Boolean(p.commits);
  return {
    ...p,
    ...n,
    files: filesSettled,
    commits: commitsSettled,
  };
}

/**
 * Remove all PENDING review comments/replies and clear viewerPendingReview
 * (post-API discard strip). No durable `_dropPending` latch — host settled
 * set-authority (null VPR) + id/body tombstones block demote lag ghosts.
 */
export function stripPendingReviewFromDetail(detail: any): any {
  if (!detail) return detail;
  const list = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const pendingRows = list.filter((c) => c && c.pending);
  const pendingIds = pendingRows
    .filter((c) => c.id != null)
    .map((c) => String(c.id));
  const pendingBodies = pendingRows.map((c) => String(c.body || '').trim()).filter(Boolean);
  const deleted = new Set([
    ...idSetFrom(detail._deletedReviewCommentIds),
    ...pendingIds,
  ]);
  // Also drop demoted orphans already missing pending but matching pendingReviewId
  // of the cleared viewer pending review.
  const vprId =
    detail.viewerPendingReview?.id != null
      ? String(detail.viewerPendingReview.id)
      : null;
  const nextList = list.filter((c) => {
    if (!c || c.id == null) return false;
    if (c.pending) return false;
    if (deleted.has(String(c.id))) return false;
    if (
      vprId &&
      c.pendingReviewId != null &&
      String(c.pendingReviewId) === vprId
    ) {
      deleted.add(String(c.id));
      return false;
    }
    return true;
  });
  const out: any = {
    ...detail,
    viewerPendingReview: null,
    reviewComments: nextList,
    _deletedReviewCommentIds: deleted.size ? [...deleted] : undefined,
  };
  // Strip legacy latch if present on the prior projection.
  if (Object.prototype.hasOwnProperty.call(out, '_dropPending')) {
    delete out._dropPending;
  }
  if (pendingBodies.length) {
    noteDiscardedPendingBodies(out, pendingBodies);
  }
  return out;
}

/**
 * Collect comment id + all replies that chain to it (for cascade delete).
 */
function collectCommentTreeIds(list: any[], rootId: any): Set<string> {
  const drop = new Set<string>();
  if (rootId == null) return drop;
  drop.add(String(rootId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of list) {
      if (!c || c.id == null) continue;
      const cid = String(c.id);
      if (drop.has(cid)) continue;
      const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parent != null && drop.has(String(parent))) {
        drop.add(cid);
        changed = true;
      }
    }
  }
  return drop;
}

/**
 * Drop deleted comment ids from reviewThreads.commentIds; drop empty threads.
 * Threads that only referenced deleted comments leave revalidate targets.
 */
function scrubReviewThreads(threads: any, dropIds: Set<string>): any[] | undefined {
  if (!Array.isArray(threads)) return threads;
  if (!dropIds.size) return threads;
  return threads
    .map((t) => {
      if (!t) return t;
      const ids = Array.isArray(t.commentIds) ? t.commentIds : null;
      if (!ids) return t;
      const nextIds = ids.filter((id) => id != null && !dropIds.has(String(id)));
      return { ...t, commentIds: nextIds };
    })
    .filter((t) => {
      if (!t?.threadNodeId) return Boolean(t);
      const ids = Array.isArray(t.commentIds) ? t.commentIds : null;
      // Keep threads with unknown commentIds; drop only when we know they're empty
      if (ids == null) return true;
      return ids.length > 0;
    });
}

/**
 * Optimistically remove a review comment (and its reply tree) from detail.
 * Records tombstone ids so merge/refresh cannot resurrect them, and so
 * revalidate bulk-fetch (collectUnresolvedThreadNodeIds) no longer targets
 * empty/deleted threads.
 */
export function removeReviewCommentFromDetail(detail: any, commentId: any): any {
  if (!detail || commentId == null) return detail;
  const list = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const drop = collectCommentTreeIds(list, commentId);
  if (!drop.size) return detail;
  const nextList = list.filter((c) => c && c.id != null && !drop.has(String(c.id)));
  const deleted = new Set([...idSetFrom(detail._deletedReviewCommentIds), ...drop]);
  const remainingPending = nextList.filter((c) => c && c.pending);
  const nextThreads = scrubReviewThreads(detail.reviewThreads, drop);
  let viewerPendingReview = detail.viewerPendingReview;
  if (!remainingPending.length) {
    viewerPendingReview = null;
  } else if (viewerPendingReview && typeof viewerPendingReview === 'object') {
    viewerPendingReview = {
      ...viewerPendingReview,
      commentCount: remainingPending.length,
    };
  }
  const out: any = {
    ...detail,
    reviewComments: nextList,
    reviewThreads: nextThreads !== undefined ? nextThreads : detail.reviewThreads,
    viewerPendingReview,
    _deletedReviewCommentIds: deleted,
  };
  if (Object.prototype.hasOwnProperty.call(out, '_dropPending')) {
    delete out._dropPending;
  }
  return out;
}

/**
 * Optimistically remove an issue (conversation) comment from detail.
 */
export function removeIssueCommentFromDetail(detail: any, commentId: any): any {
  if (!detail || commentId == null) return detail;
  const list = Array.isArray(detail.comments) ? detail.comments : [];
  const key = String(commentId);
  if (!list.some((c) => c && String(c.id) === key)) {
    // Still tombstone so a stale host page cannot reintroduce it
    const deleted = new Set([...idSetFrom(detail._deletedIssueCommentIds), key]);
    return { ...detail, _deletedIssueCommentIds: deleted };
  }
  const deleted = new Set([...idSetFrom(detail._deletedIssueCommentIds), key]);
  return {
    ...detail,
    comments: list.filter((c) => c && String(c.id) !== key),
    _deletedIssueCommentIds: deleted,
  };
}

/**
 * Build a safe asset path under the repo for Contents API uploads.
 */
export function buildAssetRepoPath(fileName: string, opts: { prefix?: string } = {}): string {
  const base = String(fileName || 'file.bin')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  const prefix = (opts.prefix || '.pr-plus-assets').replace(/\/$/, '');
  const stamp = Date.now().toString(36);
  return `${prefix}/${stamp}-${base || 'file.bin'}`;
}
