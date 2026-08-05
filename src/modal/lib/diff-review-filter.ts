/**
 * Diff review-thread navigator filters:
 * multi-status (empty ≡ all), hide outdated, multi-author (empty ≡ all).
 */

export type DiffReviewStatus = 'unresolved' | 'resolved' | 'pending';

export type DiffReviewFilterState = {
  /** Active status chips. Empty array/set ≡ show all statuses. */
  statuses: DiffReviewStatus[];
  hideOutdated: boolean;
  /** Author logins (case-insensitive). Empty ≡ all authors. */
  authors: string[];
};

export const DIFF_REVIEW_STATUSES: DiffReviewStatus[] = [
  'unresolved',
  'resolved',
  'pending',
];

/** Product default: Unresolved + Pending on Diff entry. */
export const DEFAULT_DIFF_REVIEW_FILTER: DiffReviewFilterState = {
  statuses: ['unresolved', 'pending'],
  hideOutdated: false,
  authors: [],
};

/**
 * Unrestricted filter (show all statuses/authors, keep outdated).
 * Empty statuses ≡ all — used when jump/nav must force-widen, not product default.
 */
export const UNRESTRICTED_DIFF_REVIEW_FILTER: DiffReviewFilterState = {
  statuses: [],
  hideOutdated: false,
  authors: [],
};

export function createUnrestrictedDiffReviewFilter(): DiffReviewFilterState {
  return {
    statuses: [],
    hideOutdated: false,
    authors: [],
  };
}

function asStatus(raw: unknown): DiffReviewStatus | null {
  const s = String(raw || '').toLowerCase();
  if (s === 'unresolved' || s === 'resolved' || s === 'pending') return s;
  return null;
}

/** Normalize any legacy single-mode string or partial object into a full state. */
export function normalizeDiffReviewFilter(
  raw: unknown
): DiffReviewFilterState {
  if (raw == null || raw === '' || raw === false) {
    return {
      statuses: [],
      hideOutdated: false,
      authors: [],
    };
  }
  // Legacy exclusive mode string
  if (typeof raw === 'string') {
    const st = asStatus(raw);
    return {
      statuses: st ? [st] : [],
      hideOutdated: false,
      authors: [],
    };
  }
  if (typeof raw !== 'object') {
    return { ...DEFAULT_DIFF_REVIEW_FILTER, statuses: [...DEFAULT_DIFF_REVIEW_FILTER.statuses] };
  }
  const o = raw as any;
  let statuses: DiffReviewStatus[] = [];
  if (Array.isArray(o.statuses)) {
    const seen = new Set<DiffReviewStatus>();
    for (const x of o.statuses) {
      const st = asStatus(x);
      if (st && !seen.has(st)) {
        seen.add(st);
        statuses.push(st);
      }
    }
  } else if (o.statuses instanceof Set) {
    for (const x of o.statuses) {
      const st = asStatus(x);
      if (st) statuses.push(st);
    }
  } else if (typeof o.mode === 'string' || typeof o.filter === 'string') {
    const st = asStatus(o.mode || o.filter);
    if (st) statuses = [st];
  }
  const authorsRaw = Array.isArray(o.authors)
    ? o.authors
    : o.authors instanceof Set
      ? [...o.authors]
      : [];
  const authors: string[] = [];
  const seenA = new Set<string>();
  for (const a of authorsRaw) {
    const login = String(a || '').trim().toLowerCase();
    if (!login || seenA.has(login)) continue;
    seenA.add(login);
    authors.push(login);
  }
  return {
    statuses,
    hideOutdated: Boolean(o.hideOutdated),
    authors,
  };
}

export function createDefaultDiffReviewFilter(): DiffReviewFilterState {
  return {
    statuses: [...DEFAULT_DIFF_REVIEW_FILTER.statuses],
    hideOutdated: false,
    authors: [],
  };
}

/**
 * Options for status multi-select evaluation.
 * When `pendingCount` is 0 (or null treated as unknown): if known zero, pending
 * is not a selectable chip — omit from empty/all and matching effective set.
 */
export type DiffReviewFilterEvalOpts = {
  /**
   * Pending (unsubmitted) review comment count for the open PR.
   * When 0, pending is excluded from unrestricted / empty-selection evaluation
   * and from the effective status match set (same as hidden Pending chip).
   * When null/undefined, pending stays in the evaluation (legacy / unknown).
   */
  pendingCount?: number | null;
};

/** Status chips that exist for empty/all evaluation (drops pending when count is 0). */
export function availableDiffReviewStatuses(
  opts?: DiffReviewFilterEvalOpts | null
): DiffReviewStatus[] {
  const n = opts?.pendingCount;
  if (n != null && Number(n) <= 0) {
    return DIFF_REVIEW_STATUSES.filter((s) => s !== 'pending');
  }
  return DIFF_REVIEW_STATUSES.slice();
}

/**
 * Active statuses used for root matching.
 * When pendingCount is 0, drop pending so a ghost default pending chip cannot
 * leave the filter stuck on pending-only (empty) or block "all selected".
 */
export function effectiveDiffReviewStatuses(
  filter: DiffReviewFilterState | null | undefined,
  opts?: DiffReviewFilterEvalOpts | null
): DiffReviewStatus[] {
  const f = normalizeDiffReviewFilter(filter ?? { statuses: [] });
  const n = opts?.pendingCount;
  if (n != null && Number(n) <= 0) {
    return f.statuses.filter((s) => s !== 'pending');
  }
  return f.statuses.slice();
}

/**
 * Empty status set → no status restriction.
 * All *available* chips selected → same (pending omitted when pendingCount is 0).
 */
export function isStatusFilterUnrestricted(
  filter: DiffReviewFilterState | null | undefined,
  opts?: DiffReviewFilterEvalOpts | null
): boolean {
  const effective = effectiveDiffReviewStatuses(filter, opts);
  if (!effective.length) return true;
  const available = availableDiffReviewStatuses(opts);
  return available.every((s) => effective.includes(s));
}

export function isAuthorFilterUnrestricted(
  filter: DiffReviewFilterState | null | undefined
): boolean {
  const f = normalizeDiffReviewFilter(filter ?? { authors: [] });
  return !f.authors.length;
}

export function isStatusActive(
  filter: DiffReviewFilterState | null | undefined,
  status: DiffReviewStatus
): boolean {
  const f = normalizeDiffReviewFilter(filter ?? createDefaultDiffReviewFilter());
  return f.statuses.includes(status);
}

/**
 * Multi-select toggle for a status chip.
 * Returns a new filter; does not mutate.
 */
export function toggleDiffReviewStatus(
  filter: DiffReviewFilterState | null | undefined,
  target: DiffReviewStatus | string
): DiffReviewFilterState {
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  const t = asStatus(target);
  if (!t) return f;
  const set = new Set(f.statuses);
  if (set.has(t)) set.delete(t);
  else set.add(t);
  return {
    ...f,
    statuses: DIFF_REVIEW_STATUSES.filter((s) => set.has(s)),
  };
}

/**
 * Back-compat entry for shortcut-policy toggleReviewFilter(current, target).
 * Accepts legacy string | null or full state; returns full state.
 */
export function toggleReviewFilter(
  current: unknown,
  target: string
): DiffReviewFilterState {
  // Legacy exclusive: if current is plain string/null, start from that exclusive set
  // then multi-toggle (so first shortcut on null with default uses createDefault? —
  // App holds full state; shortcuts call toggle on prev state).
  if (current == null || typeof current === 'string') {
    const base =
      current == null
        ? createDefaultDiffReviewFilter()
        : normalizeDiffReviewFilter(current);
    return toggleDiffReviewStatus(base, target);
  }
  return toggleDiffReviewStatus(
    normalizeDiffReviewFilter(current),
    target
  );
}

export function toggleDiffReviewAuthor(
  filter: DiffReviewFilterState | null | undefined,
  login: string
): DiffReviewFilterState {
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  const key = String(login || '').trim().toLowerCase();
  if (!key) return f;
  const set = new Set(f.authors.map((a) => a.toLowerCase()));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return { ...f, authors: [...set].sort() };
}

export function setDiffReviewHideOutdated(
  filter: DiffReviewFilterState | null | undefined,
  hide: boolean
): DiffReviewFilterState {
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  return { ...f, hideOutdated: Boolean(hide) };
}

function rootIsPending(root: any, comments: any[]): boolean {
  if (!root) return false;
  if (root.pending) return true;
  const rootId = root.id != null ? String(root.id) : '';
  if (!rootId) return false;
  for (const c of comments) {
    if (!c || !c.pending) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && String(parentId) === rootId) return true;
  }
  return false;
}

function isThreadRoot(c: any, byId: Map<string, any>): boolean {
  if (!c) return false;
  const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
  if (parentId != null && byId.has(String(parentId))) return false;
  return true;
}

function rootAuthorLogin(root: any): string {
  return String(root?.author || root?.user?.login || '')
    .trim()
    .toLowerCase();
}

/**
 * Unique review authors (login) from thread roots, sorted.
 */
export function listReviewAuthorsFromComments(comments: any[]): string[] {
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    if (!isThreadRoot(c, byId)) continue;
    const login = rootAuthorLogin(c);
    if (!login || seen.has(login)) continue;
    // keep display form from first occurrence
    const display = String(c.author || c.user?.login || login).trim();
    seen.add(login);
    out.push(display || login);
  }
  return out.sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Status of a root for multi-select matching.
 * Pending takes precedence over unresolved (draft not "open submitted").
 */
export function rootReviewStatus(
  root: any,
  comments: any[]
): DiffReviewStatus {
  if (rootIsPending(root, comments)) return 'pending';
  if (root?.resolved) return 'resolved';
  return 'unresolved';
}

/**
 * Whether a root passes the full Diff review filter.
 */
export function rootMatchesDiffReviewFilter(
  root: any,
  comments: any[],
  filter: DiffReviewFilterState | null | undefined,
  opts?: DiffReviewFilterEvalOpts | null
): boolean {
  if (!root) return false;
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  if (f.hideOutdated && Boolean(root.outdated)) return false;
  if (!isAuthorFilterUnrestricted(f)) {
    const author = rootAuthorLogin(root);
    const allowed = new Set(f.authors.map((a) => a.toLowerCase()));
    if (!author || !allowed.has(author)) return false;
  }
  if (!isStatusFilterUnrestricted(f, opts)) {
    const st = rootReviewStatus(root, comments);
    const effective = effectiveDiffReviewStatuses(f, opts);
    if (!effective.includes(st)) return false;
  }
  return true;
}

/**
 * Filter thread roots for Diff nav / file scoping.
 */
export function filterReviewRootsForDiffNav(
  comments: any[],
  filter: DiffReviewFilterState | null | undefined,
  allowedPaths: Set<string> | string[] | null = null,
  opts?: DiffReviewFilterEvalOpts | null
): any[] {
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const pathSet =
    allowedPaths instanceof Set
      ? allowedPaths
      : allowedPaths
        ? new Set(Array.isArray(allowedPaths) ? allowedPaths : [])
        : null;
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  return list.filter((c) => {
    if (!isThreadRoot(c, byId)) return false;
    const path = c.path || '';
    if (pathSet && path && !pathSet.has(path)) return false;
    return rootMatchesDiffReviewFilter(c, list, f, opts);
  });
}

/**
 * Keep roots that pass filters **and** their replies (for InlineThread).
 */
export function filterReviewCommentsForDiffNav(
  comments: any[],
  filter: DiffReviewFilterState | null | undefined,
  allowedPaths: Set<string> | string[] | null = null,
  opts?: DiffReviewFilterEvalOpts | null
): any[] {
  const list = Array.isArray(comments) ? comments : [];
  const allowedRoots = filterReviewRootsForDiffNav(
    list,
    filter,
    allowedPaths,
    opts
  );
  const rootIds = new Set(
    allowedRoots
      .map((c) => (c && c.id != null ? String(c.id) : ''))
      .filter(Boolean)
  );
  if (!rootIds.size) return [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  return list.filter((c) => {
    if (!c || c.id == null) return false;
    if (rootIds.has(String(c.id))) return true;
    let parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    const seen = new Set();
    while (parentId != null && !seen.has(String(parentId))) {
      const key = String(parentId);
      if (rootIds.has(key)) return true;
      seen.add(key);
      const parent = byId.get(key);
      if (!parent) break;
      parentId = parent.inReplyToId ?? parent.in_reply_to_id ?? null;
    }
    return false;
  });
}

/**
 * Files that still have ≥1 root matching the Diff review filter.
 */
export function filterFilesByDiffReviewFilter(
  files: any[],
  comments: any[],
  filter: DiffReviewFilterState | null | undefined,
  opts?: DiffReviewFilterEvalOpts | null
): any[] {
  const list = Array.isArray(files) ? files : [];
  const roots = filterReviewRootsForDiffNav(comments, filter, null, opts);
  // Unrestricted status+author+outdated with no roots → still show all files
  // when there are simply no comments (not a "hide everything" case).
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  const unrestricted =
    isStatusFilterUnrestricted(f, opts) &&
    isAuthorFilterUnrestricted(f) &&
    !f.hideOutdated;
  if (unrestricted) return list.slice();

  const paths = new Set<string>();
  for (const r of roots) {
    const p = r?.path || '';
    if (p) paths.add(p);
  }
  // No matching review threads for the active status/author filters: keep the
  // full file list so Diff stays usable (blank Diff when default is
  // unresolved+pending but the PR only has resolved — or no — threads).
  // Thread/comment nav still uses filterReviewRootsForDiffNav / ForDiffNav.
  if (!paths.size) return list.slice();
  return list.filter((file) => {
    const path = file?.filename || file?.path || '';
    return path && paths.has(path);
  });
}
