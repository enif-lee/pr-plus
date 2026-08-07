/**
 * Isolated progressive PR detail store (TypeScript ESM).
 * Source of truth for slice isolation; content-script pure twin stays for MV3 order.
 */
import { reconcileReviewCommentsAgainstRemote } from './stale-local-review';

export const META_KEYS = [
  'owner',
  'repo',
  'number',
  'nodeId',
  'title',
  'body',
  'state',
  'draft',
  'author',
  'authorAvatarUrl',
  'viewerLogin',
  'baseRef',
  'headRef',
  'baseSha',
  'headSha',
  'baseOwner',
  'baseRepo',
  'headOwner',
  'headRepo',
  'magicLinks',
  'htmlUrl',
  'merged',
  'mergeable',
  'mergeableState',
  'mergeStateStatus',
  'behindBy',
  'conflictFiles',
  'rebaseable',
  /** Repository Settings → Pull Requests merge methods */
  'allowMergeCommit',
  'allowSquashMerge',
  'allowRebaseMerge',
  /** REST repo.permissions.admin → merge-box bypass-rules opt-in */
  'viewerCanMergeAsAdmin',
  'createdAt',
  'updatedAt',
  'additions',
  'deletions',
  'changedFiles',
  'commitsCount',
  'labels',
  'assignees',
  'requestedReviewers',
  'requestedTeams',
  'milestone',
  'avatarUrls',
  'actorIsBot',
  'subscribed',
  'locked',
  'gitattributesText',
  /** PR body (issue) reaction groups */
  'bodyReactions',
];

function emptyListSlice(items?: unknown) {
  return {
    items: Array.isArray(items) ? items.slice() : [],
    settled: false,
  };
}

type ApplyOpts = {
  settled?: boolean;
  trustEmpty?: boolean;
  source?: string | null;
  sketch?: boolean;
  cacheFull?: boolean;
  gitattributesText?: string | null;
  pageMeta?: unknown;
  avatarUrls?: Record<string, string> | null;
  [key: string]: unknown;
};

export function createEmptyStore() {
  return {
    meta: {},
    files: emptyListSlice(),
    commits: emptyListSlice(),
    comments: {
      items: [],
      pageMeta: null,
      timelineEvents: [],
      /** GraphQL timelineItems page cursors / coverage (not REST comments only). */
      timelineMeta: null,
      settled: false,
    },
    reviews: emptyListSlice(),
    checks: {
      data: {
        state: 'unknown',
        totalCount: 0,
        statuses: [],
        checkRuns: [],
      },
      settled: false,
    },
    development: {
      linkedIssues: [],
      developmentIssues: [],
      projects: [],
      settled: false,
    },
    threads: {
      reviewThreads: [],
      reviewComments: [],
      reviewThreadsMeta: null,
      reviewCommentsMeta: null,
      settled: false,
    },
    pendingReview: null,
    flags: {
      sketch: false,
      source: null,
      cacheFull: false,
    },
  };
}

export function cloneStore(store) {
  return store ? JSON.parse(JSON.stringify(store)) : createEmptyStore();
}

export function pickMeta(flat: Record<string, any> | null | undefined): Record<string, any> {
  if (!flat || typeof flat !== 'object') return {};
  const out: Record<string, any> = {};
  for (const k of META_KEYS) {
    if (Object.prototype.hasOwnProperty.call(flat, k)) {
      out[k] = flat[k];
    }
  }
  return out;
}

/**
 * Meta keys whose soft-refresh projections must not resurrect after an App
 * write-through. Bumps metaRefreshGen only — never openGen / detailFetchGen.
 * Does NOT include viewerPendingReview (pending epoch / forceDrop handles that).
 */
export const SUPERSEDES_META_REFRESH_KEYS = [
  'assignees',
  'labels',
  'requestedReviewers',
  'milestone',
  'title',
  'body',
  'draft',
  'state',
  'merged',
  'baseRef',
  'subscribed',
] as const;

export function patchTouchesSupersedeMeta(
  patch: Record<string, any> | null | undefined
): boolean {
  if (!patch || typeof patch !== 'object') return false;
  return SUPERSEDES_META_REFRESH_KEYS.some((k) =>
    Object.prototype.hasOwnProperty.call(patch, k)
  );
}

/** Drop supersede-meta keys so a stale soft-refresh cannot overwrite them. */
export function stripSupersededMetaFields(
  flat: Record<string, any> | null | undefined
): Record<string, any> {
  if (!flat || typeof flat !== 'object') return {};
  const out = { ...flat };
  for (const k of SUPERSEDES_META_REFRESH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, k)) delete out[k];
  }
  return out;
}

/** Keys that App meta write-through owns until network core catches up. */
export const PEOPLE_META_AUTHORITY_KEYS = [
  'labels',
  'assignees',
  'requestedReviewers',
  'milestone',
] as const;

/** How long a non-empty people-meta write shields core revalidate from stale REST. */
export const PEOPLE_META_AUTHORITY_TTL_MS = 120_000;
/**
 * Clear-all writes (empty labels/assignees) only need a short shield — long empty
 * authority made UI show "No labels" while GitHub already had chips again
 * (external edit / soft-reset session reuse), which felt broken.
 */
export const PEOPLE_META_CLEAR_TTL_MS = 12_000;

function labelNameKey(l: any): string {
  return String(typeof l === 'string' ? l : l?.name || '')
    .trim()
    .toLowerCase();
}

function peopleListFingerprint(list: any): string {
  return (Array.isArray(list) ? list : [])
    .map((x) =>
      typeof x === 'string'
        ? String(x).trim().toLowerCase()
        : labelNameKey(x) || String(x?.login || '').trim().toLowerCase()
    )
    .filter(Boolean)
    .sort()
    .join('\0');
}

function milestoneFp(m: any): string {
  if (m == null) return '';
  if (typeof m === 'number') return String(m);
  const n = m.number != null ? String(m.number) : '';
  const t = String(m.title || '').trim().toLowerCase();
  return `${n}\0${t}`;
}

export function peopleMetaFingerprint(key: string, value: any): string {
  if (key === 'milestone') return milestoneFp(value);
  return peopleListFingerprint(value);
}

/**
 * Snapshot of people/meta after a confirmed GitHub write. Used so open /
 * detail-page revalidate cannot flash the post-write chips then wipe them
 * with a stale core GET (labels briefly appear then vanish).
 */
export function buildPeopleMetaAuthority(
  identity: {
    owner?: string | null;
    repo?: string | null;
    number?: number | string | null;
  },
  patch: Record<string, any> | null | undefined,
  opts: { gen?: number; at?: number } = {}
): Record<string, any> | null {
  if (!patch || typeof patch !== 'object') return null;
  const fields: Record<string, any> = {};
  for (const k of PEOPLE_META_AUTHORITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      fields[k] = patch[k];
    }
  }
  if (!Object.keys(fields).length) return null;
  const n = Number(identity?.number);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    owner: String(identity?.owner || '').toLowerCase(),
    repo: String(identity?.repo || '').toLowerCase(),
    number: n,
    gen: Number(opts.gen) || 0,
    at: Number(opts.at) || Date.now(),
    fields,
  };
}

function authorityMatchesIdentity(
  authority: any,
  identity: {
    owner?: string | null;
    repo?: string | null;
    number?: number | string | null;
  }
): boolean {
  if (!authority || typeof authority !== 'object') return false;
  const n = Number(identity?.number);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (Number(authority.number) !== n) return false;
  const o = String(identity?.owner || '').toLowerCase();
  const r = String(identity?.repo || '').toLowerCase();
  if (authority.owner && o && authority.owner !== o) return false;
  if (authority.repo && r && authority.repo !== r) return false;
  return true;
}

function isEmptyPeopleMetaValue(key: string, value: any): boolean {
  if (key === 'milestone') return value == null || milestoneFp(value) === '';
  return peopleListFingerprint(value) === '';
}

/**
 * Overlay confirmed people-meta writes onto a network core flat when REST is
 * still missing the chips (or still shows pre-write values).
 *
 * Policy:
 * - **Non-empty write** (add labels): force authority while net differs (TTL 120s).
 * - **Empty write** (clear labels): force empty only briefly (CLEAR_TTL) so a
 *   stale core GET cannot resurrect chips; after that, non-empty network wins
 *   (external re-add / session reuse after soft-reset).
 * - When net matches authority fingerprint → fullyMatched (caller drops auth).
 *
 * @returns {{ flat: object, fullyMatched: boolean }}
 */
export function applyPeopleMetaAuthorityToCore(
  coreFlat: Record<string, any> | null | undefined,
  authority: any,
  identity: {
    owner?: string | null;
    repo?: string | null;
    number?: number | string | null;
  },
  opts: { now?: number; ttlMs?: number; clearTtlMs?: number } = {}
): { flat: Record<string, any> | null | undefined; fullyMatched: boolean } {
  if (!coreFlat || typeof coreFlat !== 'object') {
    return { flat: coreFlat, fullyMatched: false };
  }
  if (!authorityMatchesIdentity(authority, identity)) {
    return { flat: coreFlat, fullyMatched: false };
  }
  const now = Number(opts.now) || Date.now();
  const age = now - Number(authority.at || 0);
  const ttl =
    Number.isFinite(opts.ttlMs) && Number(opts.ttlMs) >= 0
      ? Number(opts.ttlMs)
      : PEOPLE_META_AUTHORITY_TTL_MS;
  const clearTtl =
    Number.isFinite(opts.clearTtlMs) && Number(opts.clearTtlMs) >= 0
      ? Number(opts.clearTtlMs)
      : PEOPLE_META_CLEAR_TTL_MS;
  if (age > ttl) {
    return { flat: coreFlat, fullyMatched: false };
  }
  const fields =
    authority.fields && typeof authority.fields === 'object'
      ? authority.fields
      : {};
  const keys = Object.keys(fields);
  if (!keys.length) return { flat: coreFlat, fullyMatched: false };

  let allMatched = true;
  let appliedShield = false;
  const out = { ...coreFlat };
  for (const k of keys) {
    const authVal = fields[k];
    const netVal = coreFlat[k];
    const authFp = peopleMetaFingerprint(k, authVal);
    const netFp = peopleMetaFingerprint(k, netVal);
    if (authFp === netFp) {
      continue;
    }
    allMatched = false;
    const authEmpty = isEmptyPeopleMetaValue(k, authVal);
    const netEmpty = isEmptyPeopleMetaValue(k, netVal);

    // Clear-write: only shield empty while net is still stale-nonempty briefly.
    if (authEmpty) {
      if (!netEmpty && age > clearTtl) {
        // Network has chips again after our clear window — abandon shield.
        continue;
      }
      // Within clear window (or net already empty): keep empty authority.
      appliedShield = true;
      out[k] = authVal;
      continue;
    }

    // Non-empty write: keep until net catches up (or overall TTL).
    appliedShield = true;
    out[k] = authVal;
  }
  if (allMatched) return { flat: out, fullyMatched: true };
  if (!appliedShield) {
    // Every differing key abandoned (e.g. clear past TTL) → pure network
    return { flat: coreFlat, fullyMatched: false };
  }
  return { flat: out, fullyMatched: false };
}

/** Comment / thread / pending keys only — never full detail spread. */
export const COMMENT_PATCH_KEYS = [
  'comments',
  'commentsMeta',
  'timelineEvents',
  'timelineMeta',
  'reviewComments',
  'reviewThreads',
  'reviewCommentsMeta',
  'reviewThreadsMeta',
  'viewerPendingReview',
  'bodyReactions',
  'reviews',
] as const;

export function pickCommentPatchKeys(
  detail: Record<string, any> | null | undefined
): Record<string, any> {
  if (!detail || typeof detail !== 'object') return {};
  const out: Record<string, any> = {};
  for (const k of COMMENT_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(detail, k)) {
      out[k] = detail[k];
    }
  }
  return out;
}

function mergeAvatarMaps(a, b) {
  return {
    ...(a && typeof a === 'object' ? a : {}),
    ...(b && typeof b === 'object' ? b : {}),
  };
}

/**
 * Hydrate store from a flat app-detail (list sketch, cache, or legacy).
 */
export function fromAppDetail(flat) {
  const store = createEmptyStore();
  if (!flat || typeof flat !== 'object') return store;

  store.meta = pickMeta(flat);
  store.flags.sketch = Boolean(flat._sketch);
  store.flags.source = flat._source || (flat._sketch ? 'list' : null);
  store.flags.cacheFull = flat._cacheFull === true;

  const settled =
    flat._sideSettled && typeof flat._sideSettled === 'object'
      ? flat._sideSettled
      : {};

  store.files = {
    items: Array.isArray(flat.files) ? flat.files.slice() : [],
    settled:
      Boolean(settled.files) ||
      flat._cacheFull === true ||
      (Array.isArray(flat.files) && flat.files.length > 0),
  };
  store.commits = {
    items: Array.isArray(flat.commits) ? flat.commits.slice() : [],
    settled:
      Boolean(settled.commits) ||
      flat._cacheFull === true ||
      (Array.isArray(flat.commits) && flat.commits.length > 0),
  };
  store.comments = {
    items: Array.isArray(flat.comments) ? flat.comments.slice() : [],
    pageMeta: flat.commentsMeta || null,
    timelineEvents: Array.isArray(flat.timelineEvents)
      ? flat.timelineEvents.slice()
      : [],
    timelineMeta:
      flat.timelineMeta != null && typeof flat.timelineMeta === 'object'
        ? { ...flat.timelineMeta }
        : null,
    settled:
      Boolean(settled.comments) ||
      (Array.isArray(flat.comments) && flat.comments.length > 0) ||
      (flat.timelineMeta != null && typeof flat.timelineMeta === 'object'),
  };
  store.reviews = {
    items: Array.isArray(flat.reviews) ? flat.reviews.slice() : [],
    settled:
      Boolean(settled.reviews) ||
      (Array.isArray(flat.reviews) && flat.reviews.length > 0),
  };

  const checks = flat.checks || store.checks.data;
  const hasChecks =
    checks &&
    ((Array.isArray(checks.statuses) && checks.statuses.length > 0) ||
      (Array.isArray(checks.checkRuns) && checks.checkRuns.length > 0) ||
      (Array.isArray(checks.check_runs) && checks.check_runs.length > 0));
  store.checks = {
    data: checks || store.checks.data,
    settled: Boolean(settled.checks) || Boolean(hasChecks),
  };

  store.development = {
    linkedIssues: Array.isArray(flat.linkedIssues)
      ? flat.linkedIssues.slice()
      : [],
    developmentIssues: Array.isArray(flat.developmentIssues)
      ? flat.developmentIssues.slice()
      : [],
    projects: Array.isArray(flat.projects) ? flat.projects.slice() : [],
    settled:
      Boolean(settled.development) ||
      (Array.isArray(flat.developmentIssues) &&
        flat.developmentIssues.length > 0) ||
      (Array.isArray(flat.linkedIssues) && flat.linkedIssues.length > 0),
  };

  const hasThreads =
    (Array.isArray(flat.reviewThreads) && flat.reviewThreads.length > 0) ||
    (Array.isArray(flat.reviewComments) && flat.reviewComments.length > 0);
  store.threads = {
    reviewThreads: Array.isArray(flat.reviewThreads)
      ? flat.reviewThreads.slice()
      : [],
    reviewComments: Array.isArray(flat.reviewComments)
      ? flat.reviewComments.slice()
      : [],
    reviewThreadsMeta: flat.reviewThreadsMeta || null,
    reviewCommentsMeta: flat.reviewCommentsMeta || null,
    settled: hasThreads,
  };

  store.pendingReview = flat.viewerPendingReview || null;
  return store;
}

/**
 * Project store → flat app-detail for React UI / cache (read model only).
 * Always returns a projection for a valid store object so progressive open
 * never nulls `current.detail` while side slices settle before meta identity.
 * Returns null only for missing/invalid store arguments.
 */
export function toAppDetail(store) {
  if (!store || typeof store !== 'object') return null;
  const m = store.meta && typeof store.meta === 'object' ? store.meta : {};
  const sideSettled = {
    files: Boolean(store.files?.settled),
    commits: Boolean(store.commits?.settled),
    comments: Boolean(store.comments?.settled),
    reviews: Boolean(store.reviews?.settled),
    checks: Boolean(store.checks?.settled),
    development: Boolean(store.development?.settled),
  };
  return {
    ...m,
    files: Array.isArray(store.files?.items) ? store.files.items : [],
    commits: Array.isArray(store.commits?.items) ? store.commits.items : [],
    comments: Array.isArray(store.comments?.items) ? store.comments.items : [],
    commentsMeta: store.comments?.pageMeta || null,
    timelineEvents: Array.isArray(store.comments?.timelineEvents)
      ? store.comments.timelineEvents
      : [],
    // Survives applyThreads / publishDetailFromStore (comments slice, not meta).
    timelineMeta:
      store.comments?.timelineMeta != null &&
      typeof store.comments.timelineMeta === 'object'
        ? { ...store.comments.timelineMeta }
        : null,
    reviews: Array.isArray(store.reviews?.items) ? store.reviews.items : [],
    checks: store.checks?.data || {
      state: 'unknown',
      totalCount: 0,
      statuses: [],
      checkRuns: [],
    },
    linkedIssues: Array.isArray(store.development?.linkedIssues)
      ? store.development.linkedIssues
      : [],
    developmentIssues: Array.isArray(store.development?.developmentIssues)
      ? store.development.developmentIssues
      : [],
    projects: Array.isArray(store.development?.projects)
      ? store.development.projects
      : [],
    reviewThreads: Array.isArray(store.threads?.reviewThreads)
      ? store.threads.reviewThreads
      : [],
    reviewComments: Array.isArray(store.threads?.reviewComments)
      ? store.threads.reviewComments
      : [],
    reviewThreadsMeta: store.threads?.reviewThreadsMeta || null,
    reviewCommentsMeta: store.threads?.reviewCommentsMeta || null,
    viewerPendingReview: store.pendingReview || null,
    _sideSettled: sideSettled,
    _sketch: store.flags?.sketch ? true : undefined,
    _source: store.flags?.source || undefined,
    _cacheFull: store.flags?.cacheFull ? true : undefined,
    _incompleteIdentity:
      m.owner == null || m.repo == null || m.number == null ? true : undefined,
  };
}

export function sidePendingFlags(store) {
  if (!store) {
    return {
      files: false,
      commits: false,
      comments: false,
      reviews: false,
      checks: false,
      development: false,
    };
  }
  return {
    files: !store.files?.settled,
    commits: !store.commits?.settled,
    comments: !store.comments?.settled,
    reviews: !store.reviews?.settled,
    checks: !store.checks?.settled,
    development: !store.development?.settled,
  };
}

export function sideSettledFlags(store) {
  const p = sidePendingFlags(store);
  return {
    files: !p.files,
    commits: !p.commits,
    comments: !p.comments,
    reviews: !p.reviews,
    checks: !p.checks,
    development: !p.development,
  };
}

// ── Slice writers (only touch their domain) ────────────────────────

/** Core / list / cache meta. Never writes files/commits/reviews/threads. */
export function applyMeta(store, metaPartial, opts: ApplyOpts = {}) {
  if (!store || !metaPartial || typeof metaPartial !== 'object') return store;
  const next = { ...store.meta };
  for (const k of META_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(metaPartial, k)) continue;
    const v = metaPartial[k];
    // Skip undefined; allow null / empty arrays (authoritative meta write)
    if (v === undefined) continue;
    if (k === 'avatarUrls' && v && typeof v === 'object') {
      next.avatarUrls = mergeAvatarMaps(next.avatarUrls, v);
      continue;
    }
    if (k === 'actorIsBot' && v && typeof v === 'object') {
      next.actorIsBot = { ...(next.actorIsBot || {}), ...v };
      continue;
    }
    // Progressive: empty people lists do not wipe existing unless trustEmpty
    if (
      !opts.trustEmpty &&
      (k === 'assignees' ||
        k === 'requestedReviewers' ||
        k === 'requestedTeams' ||
        k === 'labels') &&
      Array.isArray(v) &&
      v.length === 0 &&
      Array.isArray(next[k]) &&
      next[k].length > 0
    ) {
      continue;
    }
    // Lagging network core often reports milestone:null right after a modal set.
    // Keep a non-null store milestone unless the write is an explicit App patch
    // clear (source=patch with null). Soft reopen: GH has board, pull lags.
    if (
      k === 'milestone' &&
      v == null &&
      next[k] != null &&
      opts.trustEmpty &&
      opts.source &&
      String(opts.source).startsWith('network')
    ) {
      continue;
    }
    next[k] = v;
  }
  store.meta = next;
  if (opts.source) store.flags.source = opts.source;
  if (opts.sketch === false) store.flags.sketch = false;
  if (opts.sketch === true) store.flags.sketch = true;
  if (opts.cacheFull === true) store.flags.cacheFull = true;
  return store;
}

export function applyFiles(store, files, opts: ApplyOpts = {}) {
  if (!store) return store;
  store.files = {
    items: Array.isArray(files) ? files.slice() : [],
    settled: opts.settled !== false,
  };
  if (opts.gitattributesText != null) {
    store.meta = {
      ...store.meta,
      gitattributesText: opts.gitattributesText,
    };
  }
  return store;
}

export function applyCommits(store, commits, opts: ApplyOpts = {}) {
  if (!store) return store;
  store.commits = {
    items: Array.isArray(commits) ? commits.slice() : [],
    settled: opts.settled !== false,
  };
  return store;
}

export function applyComments(store, comments, opts: ApplyOpts = {}) {
  if (!store) return store;
  const prevEvents = Array.isArray(store.comments?.timelineEvents)
    ? store.comments.timelineEvents
    : [];
  const prevItems = Array.isArray(store.comments?.items)
    ? store.comments.items
    : [];
  // Union by id: meta refresh / local optimistics must not be wiped by a
  // lagging comments side-fetch that still has the pre-write event list.
  let timelineEvents = prevEvents;
  if (opts.timelineEvents != null) {
    const incoming = Array.isArray(opts.timelineEvents)
      ? opts.timelineEvents
      : [];
    const byId = new Map<string, any>();
    for (const e of prevEvents) {
      if (e && e.id != null) byId.set(String(e.id), e);
    }
    for (const e of incoming) {
      if (e && e.id != null) byId.set(String(e.id), e);
    }
    timelineEvents =
      byId.size > 0
        ? [...byId.values()]
        : incoming.length
          ? incoming.slice()
          : prevEvents.slice();
  }
  const incomingItems = Array.isArray(comments) ? comments : [];
  // Progressive isolation: lagging empty page must not wipe painted issue
  // comments (or invent permanent empty via IDB) unless caller trusts empty.
  let items = incomingItems.slice();
  if (
    !opts.trustEmpty &&
    incomingItems.length === 0 &&
    prevItems.length > 0
  ) {
    items = prevItems.slice();
  }
  // GraphQL timelineItems pagination meta — keep prior when omit / null patch.
  let timelineMeta =
    store.comments?.timelineMeta != null &&
    typeof store.comments.timelineMeta === 'object'
      ? store.comments.timelineMeta
      : null;
  if (
    Object.prototype.hasOwnProperty.call(opts, 'timelineMeta') &&
    opts.timelineMeta != null &&
    typeof opts.timelineMeta === 'object'
  ) {
    timelineMeta = { ...opts.timelineMeta };
  }
  store.comments = {
    items,
    pageMeta: opts.pageMeta != null ? opts.pageMeta : store.comments.pageMeta,
    timelineEvents,
    timelineMeta,
    settled: opts.settled !== false,
  };
  return store;
}

/**
 * When replacing the detail store with a full flat snapshot (list sketch / IDB
 * upgrade mid-open), keep progressive side slices that are already richer on
 * the live detail. Side-fetch uses claim() once per open — wiping painted
 * issue comments/reviews without re-fetch would permanently omit them from the
 * conversation timeline (seen on long PRs e.g. callabo-server#2424).
 *
 * @param prevFlat live `current.detail` before reset (may be null)
 * @param nextFlat incoming snapshot (sketch / IDB / cache)
 * @returns flat suitable for fromAppDetail
 */
export function mergeProgressiveSidesIntoFlat(prevFlat: any, nextFlat: any): any {
  if (!nextFlat || typeof nextFlat !== 'object') return prevFlat || nextFlat;
  if (!prevFlat || typeof prevFlat !== 'object') return nextFlat;
  const out: any = { ...nextFlat };
  const prevSettled =
    prevFlat._sideSettled && typeof prevFlat._sideSettled === 'object'
      ? prevFlat._sideSettled
      : {};
  const nextSettled =
    nextFlat._sideSettled && typeof nextFlat._sideSettled === 'object'
      ? { ...nextFlat._sideSettled }
      : {};

  const prevComments = Array.isArray(prevFlat.comments) ? prevFlat.comments : [];
  const nextComments = Array.isArray(nextFlat.comments) ? nextFlat.comments : [];
  if (prevComments.length > nextComments.length) {
    out.comments = prevComments.slice();
    if (prevFlat.commentsMeta != null) out.commentsMeta = prevFlat.commentsMeta;
    nextSettled.comments = true;
  }
  // Prefer longer system-events list when we already fetched them
  const prevEvents = Array.isArray(prevFlat.timelineEvents)
    ? prevFlat.timelineEvents
    : [];
  const nextEvents = Array.isArray(nextFlat.timelineEvents)
    ? nextFlat.timelineEvents
    : [];
  if (prevEvents.length > nextEvents.length) {
    out.timelineEvents = prevEvents.slice();
  }
  // Keep GraphQL timelineItems cursors when next sketch lacks them
  if (
    (out.timelineMeta == null || typeof out.timelineMeta !== 'object') &&
    prevFlat.timelineMeta != null &&
    typeof prevFlat.timelineMeta === 'object'
  ) {
    out.timelineMeta = { ...prevFlat.timelineMeta };
  }

  const prevReviews = Array.isArray(prevFlat.reviews) ? prevFlat.reviews : [];
  const nextReviews = Array.isArray(nextFlat.reviews) ? nextFlat.reviews : [];
  if (prevReviews.length > nextReviews.length) {
    out.reviews = prevReviews.slice();
    nextSettled.reviews = true;
  }

  const prevTh = Array.isArray(prevFlat.reviewThreads)
    ? prevFlat.reviewThreads
    : [];
  const nextTh = Array.isArray(nextFlat.reviewThreads)
    ? nextFlat.reviewThreads
    : [];
  const prevRc = Array.isArray(prevFlat.reviewComments)
    ? prevFlat.reviewComments
    : [];
  const nextRc = Array.isArray(nextFlat.reviewComments)
    ? nextFlat.reviewComments
    : [];
  if (prevTh.length > nextTh.length || prevRc.length > nextRc.length) {
    if (prevTh.length >= nextTh.length) out.reviewThreads = prevTh.slice();
    // Prefer longer prev for progressive incomplete next — but never re-win
    // IDB/cache empty "user"/No content ghosts over a cleaner network snapshot.
    if (prevRc.length >= nextRc.length) {
      const remoteAuth =
        nextRc.length > 0 ||
        Boolean(nextSettled.reviews) ||
        Boolean(nextSettled.comments) ||
        nextTh.length > 0 ||
        (nextFlat.reviewThreadsMeta != null &&
          nextFlat.reviewThreadsMeta.totalCount != null);
      out.reviewComments = reconcileReviewCommentsAgainstRemote(
        prevRc,
        nextRc,
        { remoteAuthoritative: remoteAuth }
      );
    }
    if (prevFlat.reviewThreadsMeta != null) {
      out.reviewThreadsMeta = prevFlat.reviewThreadsMeta;
    }
    if (prevFlat.reviewCommentsMeta != null) {
      out.reviewCommentsMeta = prevFlat.reviewCommentsMeta;
    }
    if (prevFlat.viewerPendingReview !== undefined) {
      out.viewerPendingReview = prevFlat.viewerPendingReview;
    }
  }

  const prevFiles = Array.isArray(prevFlat.files) ? prevFlat.files : [];
  const nextFiles = Array.isArray(nextFlat.files) ? nextFlat.files : [];
  if (prevFiles.length > nextFiles.length) {
    out.files = prevFiles.slice();
    nextSettled.files = Boolean(prevSettled.files) || nextSettled.files;
  }
  const prevCommits = Array.isArray(prevFlat.commits) ? prevFlat.commits : [];
  const nextCommits = Array.isArray(nextFlat.commits) ? nextFlat.commits : [];
  if (prevCommits.length > nextCommits.length) {
    out.commits = prevCommits.slice();
    nextSettled.commits = Boolean(prevSettled.commits) || nextSettled.commits;
  }

  out._sideSettled = {
    ...prevSettled,
    ...nextSettled,
    // Explicitly keep comments/reviews settled when we preserved longer lists
    comments:
      Boolean(nextSettled.comments) ||
      (prevComments.length > nextComments.length && Boolean(prevSettled.comments)),
    reviews:
      Boolean(nextSettled.reviews) ||
      (prevReviews.length > nextReviews.length && Boolean(prevSettled.reviews)),
  };
  return out;
}

export function applyReviews(store, reviews, opts: ApplyOpts = {}) {
  if (!store) return store;
  store.reviews = {
    items: Array.isArray(reviews) ? reviews.slice() : [],
    settled: opts.settled !== false,
  };
  // Merge bot map / avatars from review authors without touching meta people lists
  if (opts.avatarUrls) {
    store.meta = {
      ...store.meta,
      avatarUrls: mergeAvatarMaps(store.meta.avatarUrls, opts.avatarUrls),
    };
  }
  return store;
}

export function applyChecks(store, checks, opts: ApplyOpts = {}) {
  if (!store) return store;
  store.checks = {
    data: checks || {
      state: 'unknown',
      totalCount: 0,
      statuses: [],
      checkRuns: [],
    },
    settled: opts.settled !== false,
  };
  return store;
}

export function applyDevelopment(store, dev, opts: ApplyOpts = {}) {
  if (!store) return store;
  const d = dev && typeof dev === 'object' ? dev : {};
  store.development = {
    linkedIssues: Array.isArray(d.linkedIssues) ? d.linkedIssues.slice() : [],
    developmentIssues: Array.isArray(d.developmentIssues)
      ? d.developmentIssues.slice()
      : [],
    projects: Array.isArray(d.projects) ? d.projects.slice() : [],
    settled: opts.settled !== false,
  };
  return store;
}

/**
 * Replace or merge thread window into threads slice only.
 * `mergeFn(detail, page, dir)` can be provided for dual-window semantics —
 * we project to flat, merge, then write threads slice back (meta untouched).
 */
export function applyThreadsFromMergedDetail(store, mergedFlat) {
  if (!store || !mergedFlat) return store;
  store.threads = {
    reviewThreads: Array.isArray(mergedFlat.reviewThreads)
      ? mergedFlat.reviewThreads.slice()
      : store.threads.reviewThreads,
    reviewComments: Array.isArray(mergedFlat.reviewComments)
      ? mergedFlat.reviewComments.slice()
      : store.threads.reviewComments,
    reviewThreadsMeta:
      mergedFlat.reviewThreadsMeta != null
        ? mergedFlat.reviewThreadsMeta
        : store.threads.reviewThreadsMeta,
    reviewCommentsMeta:
      mergedFlat.reviewCommentsMeta != null
        ? mergedFlat.reviewCommentsMeta
        : store.threads.reviewCommentsMeta,
    settled:
      store.threads.settled ||
      (Array.isArray(mergedFlat.reviewThreads) &&
        mergedFlat.reviewThreads.length > 0) ||
      (Array.isArray(mergedFlat.reviewComments) &&
        mergedFlat.reviewComments.length > 0),
  };
  if (mergedFlat.viewerPendingReview !== undefined) {
    store.pendingReview = mergedFlat.viewerPendingReview;
  }
  return store;
}

export function applyPendingReview(store, pending) {
  if (!store) return store;
  store.pendingReview = pending || null;
  return store;
}

/**
 * Apply core fetchPrDetail payload: meta + pendingReview only.
 * Empty side placeholders on the payload are ignored (isolation).
 *
 * Meta people/label arrays use trustEmpty: REST core always includes
 * labels/assignees/reviewers on the PR object. Empty means cleared on
 * GitHub — must overwrite list-sketch / cache so deleted labels do not
 * resurrect on reopen (applyMeta otherwise keeps non-empty previous).
 */
export function applyCorePayload(store, coreFlat, opts: ApplyOpts = {}) {
  if (!store || !coreFlat) return store;
  let metaSrc = opts.skipSupersedeMeta
    ? stripSupersededMetaFields(coreFlat)
    : coreFlat;
  // Branch identity is often missing from list-sketch. Even when supersede strip
  // removes baseRef (post base-change write-through), fill empty store slots from
  // network so the header never sticks on "— —".
  if (opts.skipSupersedeMeta && coreFlat && store?.meta) {
    const branchKeys = [
      'baseRef',
      'headRef',
      'baseSha',
      'headSha',
      'baseOwner',
      'baseRepo',
      'headOwner',
      'headRepo',
    ] as const;
    const restored: Record<string, any> = { ...metaSrc };
    let filled = false;
    for (const k of branchKeys) {
      const cur = store.meta[k];
      const next = (coreFlat as any)[k];
      const curEmpty = cur == null || String(cur).trim() === '';
      const nextOk = next != null && String(next).trim() !== '';
      if (curEmpty && nextOk) {
        restored[k] = next;
        filled = true;
      }
    }
    if (filled) metaSrc = restored;
  }
  applyMeta(store, pickMeta(metaSrc), {
    source: coreFlat._source || 'network',
    sketch: false,
    trustEmpty: true,
  });
  // Always force non-empty branch refs from network core (authoritative REST).
  // Covers cold open from URL (no list sketch branches) and failed soft-refresh.
  try {
    const branchForce: Record<string, any> = {};
    for (const k of [
      'baseRef',
      'headRef',
      'baseSha',
      'headSha',
      'baseOwner',
      'baseRepo',
      'headOwner',
      'headRepo',
    ] as const) {
      const v = (coreFlat as any)[k];
      if (v != null && String(v).trim() !== '') branchForce[k] = v;
    }
    if (Object.keys(branchForce).length) {
      applyMeta(store, branchForce, {
        source: 'network-core-branches',
        sketch: false,
        trustEmpty: true,
      });
    }
  } catch {
    /* ignore */
  }
  if (coreFlat.viewerPendingReview !== undefined) {
    applyPendingReview(store, coreFlat.viewerPendingReview);
  }
  // Core may include first-page threads when not skipped — optional
  if (
    (Array.isArray(coreFlat.reviewThreads) && coreFlat.reviewThreads.length) ||
    (Array.isArray(coreFlat.reviewComments) && coreFlat.reviewComments.length)
  ) {
    applyThreadsFromMergedDetail(store, coreFlat);
  }
  return store;
}

