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

/** Product default Unresolved+Pending (pending chip may be hidden when count is 0). */
export function isProductDefaultDiffReviewFilter(
  filter: DiffReviewFilterState | null | undefined
): boolean {
  const f = normalizeDiffReviewFilter(filter ?? createDefaultDiffReviewFilter());
  if (f.authors.length) return false;
  const set = new Set(f.statuses);
  return set.has('unresolved') && set.has('pending') && set.size === 2;
}

/**
 * Default open-thread filter matched nothing, but threads exist — widen so
 * Diff StepNav / ⌥J/K are not stuck at 0/0 (resolved-only PRs).
 */
export function shouldAutoWidenEmptyDiffReviewFilter(opts: {
  filter: DiffReviewFilterState | null | undefined;
  filteredRootCount: number;
  unrestrictedRootCount: number;
}): boolean {
  if (Number(opts.filteredRootCount) > 0) return false;
  if (Number(opts.unrestrictedRootCount) <= 0) return false;
  return isProductDefaultDiffReviewFilter(opts.filter);
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

/**
 * Product default filter (unresolved + pending).
 * Optional override for global-persisted hideOutdated.
 */
export function createDefaultDiffReviewFilter(
  overrides?: { hideOutdated?: boolean } | null
): DiffReviewFilterState {
  return {
    statuses: [...DEFAULT_DIFF_REVIEW_FILTER.statuses],
    hideOutdated: Boolean(overrides?.hideOutdated),
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

/** Author row for Diff “Reviewed by…” (login + optional avatar). */
export type ReviewAuthorOption = {
  login: string;
  avatarUrl: string | null;
};

function rootAuthorAvatarUrl(root: any): string | null {
  if (!root || typeof root !== 'object') return null;
  const raw =
    root.avatarUrl ||
    root.avatar_url ||
    root.user?.avatarUrl ||
    root.user?.avatar_url ||
    (root.author && typeof root.author === 'object'
      ? root.author.avatarUrl || root.author.avatar_url
      : null) ||
    null;
  const s = raw != null ? String(raw).trim() : '';
  return s || null;
}

/**
 * Unique review authors from thread roots, sorted by login.
 * Includes avatarUrl when present on the root (falls back to null; UI uses
 * GitHub avatar URL from login).
 */
export function listReviewAuthorsFromComments(
  comments: any[]
): ReviewAuthorOption[] {
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const seen = new Map<string, ReviewAuthorOption>();
  for (const c of list) {
    if (!isThreadRoot(c, byId)) continue;
    const key = rootAuthorLogin(c);
    if (!key) continue;
    const display = String(c.author || c.user?.login || key).trim() || key;
    const avatarUrl = rootAuthorAvatarUrl(c);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, { login: display, avatarUrl });
    } else if (!prev.avatarUrl && avatarUrl) {
      seen.set(key, { ...prev, avatarUrl });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.login.toLowerCase().localeCompare(b.login.toLowerCase())
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
 * Optional `authorSet` / `effectiveStatuses` avoid re-allocating per root.
 */
export function rootMatchesDiffReviewFilter(
  root: any,
  comments: any[],
  filter: DiffReviewFilterState | null | undefined,
  opts?: DiffReviewFilterEvalOpts | null,
  precomputed?: {
    authorSet?: Set<string> | null;
    effectiveStatuses?: DiffReviewStatus[] | null;
    statusUnrestricted?: boolean;
  } | null
): boolean {
  if (!root) return false;
  const f = normalizeDiffReviewFilter(
    filter ?? createDefaultDiffReviewFilter()
  );
  if (f.hideOutdated && Boolean(root.outdated)) return false;
  if (!isAuthorFilterUnrestricted(f)) {
    const author = rootAuthorLogin(root);
    const allowed =
      precomputed?.authorSet ??
      new Set(f.authors.map((a) => a.toLowerCase()));
    if (!author || !allowed.has(author)) return false;
  }
  const statusUnrestricted =
    precomputed?.statusUnrestricted ?? isStatusFilterUnrestricted(f, opts);
  if (!statusUnrestricted) {
    const st = rootReviewStatus(root, comments);
    const effective =
      precomputed?.effectiveStatuses ?? effectiveDiffReviewStatuses(f, opts);
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
  const authorSet = isAuthorFilterUnrestricted(f)
    ? null
    : new Set(f.authors.map((a) => a.toLowerCase()));
  const statusUnrestricted = isStatusFilterUnrestricted(f, opts);
  const effectiveStatuses = statusUnrestricted
    ? null
    : effectiveDiffReviewStatuses(f, opts);
  const pre = {
    authorSet,
    effectiveStatuses,
    statusUnrestricted,
  };
  return list.filter((c) => {
    if (!isThreadRoot(c, byId)) return false;
    const path = c.path || '';
    if (pathSet && path && !pathSet.has(path)) return false;
    return rootMatchesDiffReviewFilter(c, list, f, opts, pre);
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
 * @deprecated Review multi-filter no longer scopes the Diff file list.
 * File scoping for “has comments” is `filterFilesCommentedOnly` (file explorer).
 * Kept as identity so older callers do not hide files unexpectedly.
 */
export function filterFilesByDiffReviewFilter(
  files: any[],
  _comments?: any[],
  _filter?: DiffReviewFilterState | null,
  _opts?: DiffReviewFilterEvalOpts | null
): any[] {
  return Array.isArray(files) ? files.slice() : [];
}
