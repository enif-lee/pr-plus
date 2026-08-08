/**
 * Unverified local-cache-only review/issue comments paint as "user" +
 * MarkdownView "_No content_". GitHub is SoT — drop these ghosts on merge.
 *
 * Also: discarded PENDING must not re-seed from IDB/SWR when network core
 * reports no viewer PENDING (see filterCacheReviewCommentsForCore).
 */

/**
 * Session body tombstones must live in sessionStorage (not a module Map):
 * modal bundle and pure detail-store IIFE are separate copies — Map wouldn't
 * share across host hydrate vs App strip.
 */
const SS_DISCARD_BODIES = 'prp:discarded-pending-bodies-v1';

export function prDetailKey(
  owner: any,
  repo: any,
  number: any
): string {
  return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number) || 0}`;
}

function readSessionBodyMap(): Record<string, string[]> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(SS_DISCARD_BODIES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionBodyMap(map: Record<string, string[]>): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(SS_DISCARD_BODIES, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

export function noteDiscardedPendingBodies(
  detail: any,
  bodies: Iterable<string>
): void {
  const key = prDetailKey(detail?.owner, detail?.repo, detail?.number);
  const trimmed: string[] = [];
  for (const b of bodies) {
    const t = String(b || '').trim();
    if (t) trimmed.push(t);
  }
  if (trimmed.length && !key.endsWith('#0')) {
    const map = readSessionBodyMap();
    const set = new Set(Array.isArray(map[key]) ? map[key] : []);
    for (const t of trimmed) set.add(t);
    map[key] = [...set];
    writeSessionBodyMap(map);
  }
  // Durable on detail for IDB (array)
  if (detail && typeof detail === 'object') {
    const prev = Array.isArray(detail._deletedReviewBodies)
      ? detail._deletedReviewBodies
      : [];
    const next = new Set(prev.map(String));
    for (const t of trimmed) next.add(t);
    detail._deletedReviewBodies = next.size ? [...next] : undefined;
  }
}

export function isDiscardedPendingBody(detail: any, body: any): boolean {
  const t = String(body || '').trim();
  if (!t) return false;
  const key = prDetailKey(detail?.owner, detail?.repo, detail?.number);
  if (!key.endsWith('#0')) {
    const map = readSessionBodyMap();
    const list = map[key];
    if (Array.isArray(list) && list.some((b) => String(b).trim() === t)) {
      return true;
    }
  }
  const durable = detail?._deletedReviewBodies;
  if (Array.isArray(durable) && durable.some((b) => String(b).trim() === t)) {
    return true;
  }
  return false;
}

/** Load durable body tombstones from a cache snapshot into sessionStorage. */
export function hydrateDiscardedPendingBodies(detail: any): void {
  if (!detail || typeof detail !== 'object') return;
  const bodies = detail._deletedReviewBodies;
  if (Array.isArray(bodies) && bodies.length) {
    noteDiscardedPendingBodies(detail, bodies);
  }
}

/**
 * Empty body + missing/generic author, not pending.
 * Shells with a real author stay; pending attach races stay.
 */
export function isUnverifiedLocalOnlyReviewComment(c: any): boolean {
  if (!c || c.id == null) return false;
  if (c.pending) return false;
  // GraphQL deferred shell placeholders (empty until expand) are intentional
  if (c._commentsPending || c.commentsLoaded === false) return false;
  if (String(c.id).startsWith('shell:')) return false;
  const body = String(c.body ?? c.bodyText ?? c.bodyHTML ?? '').trim();
  if (body) return false;
  const author = String(
    c.author || c.user?.login || c.user?.name || ''
  ).trim();
  if (author && author.toLowerCase() !== 'user') return false;
  return true;
}

/** True when detail still claims a viewer PENDING review (id and/or pending rows). */
export function detailHasViewerPending(detail: any): boolean {
  if (!detail || typeof detail !== 'object') return false;
  const id = detail.viewerPendingReview?.id;
  if (id != null && String(id).trim() !== '' && String(id) !== '0') {
    return true;
  }
  const rc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  return rc.some((c: any) => c && c.pending);
}

/**
 * Host-settled set authority for reviewComments.
 * When hostAuthoritative, only host ids are kept; cache may fill fields for
 * those ids only. When not authoritative (progressive), union + ghost filter.
 */
export function mergeCommentsHostFirst(
  hostComments: any[] | null | undefined,
  cacheComments: any[] | null | undefined,
  opts: { hostAuthoritative?: boolean; networkDetail?: any } = {}
): any[] {
  const host = Array.isArray(hostComments) ? hostComments : [];
  const cache = Array.isArray(cacheComments) ? cacheComments : [];
  const hostAuthoritative = Boolean(opts.hostAuthoritative);
  const networkDetail = opts.networkDetail ?? null;
  const networkHasPending = detailHasViewerPending(networkDetail);

  if (hostAuthoritative) {
    // Settled host set: cache-only ids are treated as deleted.
    const byId = new Map<string, any>();
    for (const c of host) {
      if (!c || c.id == null) continue;
      if (isUnverifiedLocalOnlyReviewComment(c)) continue;
      byId.set(String(c.id), c);
    }
    // Optional field fill from cache for host ids only (deferred bodies etc.)
    for (const c of cache) {
      if (!c || c.id == null) continue;
      const key = String(c.id);
      if (!byId.has(key)) continue;
      const h = byId.get(key);
      const hostBody = String(h.body ?? h.bodyText ?? '').trim();
      const cacheBody = String(c.body ?? c.bodyText ?? '').trim();
      if (!hostBody && cacheBody) {
        byId.set(key, { ...c, ...h, body: h.body || c.body });
      }
    }
    return [...byId.values()];
  }

  // Progressive / empty host: reinject cache with pending + ghost rules.
  return filterCacheReviewCommentsForCore(cache, {
    ...networkDetail,
    reviewComments: host,
    viewerPendingReview:
      networkDetail?.viewerPendingReview ??
      (networkHasPending ? { id: 1 } : null),
  });
}

/**
 * Filter cache/local reviewComments before reinjecting into network core
 * that has empty reviewComments. Never reinject pending rows when network
 * reports no viewer PENDING (post-Discard server empty).
 * Also drop ids tombstoned in network/cache `_deletedReviewCommentIds`.
 */
export function filterCacheReviewCommentsForCore(
  cacheComments: any[] | null | undefined,
  networkDetail: any = null
): any[] {
  const networkHasPending = detailHasViewerPending(networkDetail);
  const deleted = new Set<string>();
  const delList = networkDetail?._deletedReviewCommentIds;
  if (delList instanceof Set) {
    for (const id of delList) deleted.add(String(id));
  } else if (Array.isArray(delList)) {
    for (const id of delList) if (id != null) deleted.add(String(id));
  }
  // Host-first: when network already lists concrete ids, do not use this path
  // for set-diff — callers should use mergeCommentsHostFirst(hostAuthoritative).
  const list = Array.isArray(cacheComments) ? cacheComments : [];
  return list.filter((c) => {
    if (!c || c.id == null) return false;
    if (deleted.has(String(c.id))) return false;
    const body = String(c.body ?? c.bodyText ?? '').trim();
    // Body tombs only block demoted non-pending reinject; live pending from
    // network is handled by detailHasViewerPending, not body match.
    if (!c.pending && isDiscardedPendingBody(networkDetail, body)) return false;
    // Discarded PENDING must not reappear from IDB after server delete
    if (c.pending) return networkHasPending;
    // Orphan rows that still carry pendingReviewId with no network PENDING
    if (
      !networkHasPending &&
      c.pendingReviewId != null &&
      String(c.pendingReviewId).trim() !== ''
    ) {
      return false;
    }
    if (c._commentsPending || c.commentsLoaded === false) return true;
    if (String(c.id).startsWith('shell:')) return true;
    if (isUnverifiedLocalOnlyReviewComment(c)) return false;
    if (body) return true;
    const author = String(
      c.author || c.user?.login || c.user?.name || ''
    ).trim();
    return Boolean(author && author.toLowerCase() !== 'user');
  });
}

/**
 * Drop orphan pending reviewComments when viewerPendingReview is gone.
 * Durable cache must not keep discarded PENDING rows after strip/delete.
 */
export function stripOrphanPendingReviewComments(detail: any): any {
  if (!detail || typeof detail !== 'object') return detail;
  const id = detail.viewerPendingReview?.id;
  const hasVpr =
    id != null && String(id).trim() !== '' && String(id) !== '0';
  if (hasVpr) return detail;
  const list = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  if (!list.some((c: any) => c && c.pending)) {
    return detail.viewerPendingReview
      ? { ...detail, viewerPendingReview: null }
      : detail;
  }
  return {
    ...detail,
    viewerPendingReview: null,
    reviewComments: list.filter((c: any) => c && !c.pending),
  };
}

/** Drop unverified ghosts from a reviewComments list (stable order). */
export function stripUnverifiedLocalOnlyReviewComments(
  list: any[] | null | undefined
): any[] {
  const arr = Array.isArray(list) ? list : [];
  return arr.filter((c) => c && !isUnverifiedLocalOnlyReviewComment(c));
}

/**
 * Reconcile local vs remote reviewComments.
 * Remote rows win by id; local-only ghosts dropped when remote is present
 * or remoteAuthoritative.
 */
export function reconcileReviewCommentsAgainstRemote(
  localComments: any[] | null | undefined,
  remoteComments: any[] | null | undefined,
  opts: { remoteAuthoritative?: boolean } = {}
): any[] {
  const local = Array.isArray(localComments) ? localComments : [];
  const remote = Array.isArray(remoteComments) ? remoteComments : [];
  const remoteAuthoritative = Boolean(opts.remoteAuthoritative);

  if (!remote.length && !remoteAuthoritative) {
    return stripUnverifiedLocalOnlyReviewComments(local);
  }

  // Remote rows win by id; drop ghosts. Keep local-only non-ghost rows for
  // post-API race (pessimistic paint before host list catches up).
  // Strict cache-only drop uses mergeCommentsHostFirst(..., hostAuthoritative).
  const byId = new Map<string, any>();
  for (const c of remote) {
    if (!c || c.id == null) continue;
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    byId.set(String(c.id), c);
  }
  for (const c of local) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (byId.has(key)) continue;
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    // When remoteAuthoritative empty list, still no local ghosts (handled above)
    byId.set(key, c);
  }
  return [...byId.values()];
}
