/**
 * Isolated progressive PR detail store (TypeScript ESM).
 * Source of truth for slice isolation; content-script pure twin stays for MV3 order.
 */
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
  'conflictFiles',
  'rebaseable',
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
    comments: { items: [], pageMeta: null, settled: false },
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
    settled:
      Boolean(settled.comments) ||
      (Array.isArray(flat.comments) && flat.comments.length > 0),
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
  store.comments = {
    items: Array.isArray(comments) ? comments.slice() : [],
    pageMeta: opts.pageMeta != null ? opts.pageMeta : store.comments.pageMeta,
    settled: opts.settled !== false,
  };
  return store;
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
 */
export function applyCorePayload(store, coreFlat) {
  if (!store || !coreFlat) return store;
  applyMeta(store, pickMeta(coreFlat), {
    source: coreFlat._source || 'network',
    sketch: false,
  });
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

