async function fetchPullReviewThreads(owner, repo, pullNumber, fetchImpl, token) {
  try {
    const bundle = await fetchPullReviewThreadsBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    return bundle.threads || [];
  } catch {
    return [];
  }
}

/**
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 *
 * Partial by default: only the **first GraphQL page** of review threads
 * (see opts.threadsMaxPages / opts.skipReviewThreads). More pages load via
 * fetchReviewThreadsPage + mergeReviewThreadsPageIntoDetail.
 *
 * @param {{ skipReviewThreads?: boolean, threadsMaxPages?: number, threadsCursor?: string|null }} [opts]
 */
function fetchNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Time an async fetch and record ms into `timings[name]`.
 * Always logs to console for SW / page debugging.
 *
 * When `opts.batchStart` is set (ms from fetchNowMs), also records
 * `timings[name_start]` = offset from batch start (for parallel REST fan-out).
 *
 * @template T
 * @param {Record<string, number|string>} timings
 * @param {string} name
 * @param {Promise<T>} promise
 * @param {(result: T) => string} [extra]
 * @param {{ batchStart?: number }} [opts]
 * @returns {Promise<T>}
 */
async function timedFetch(timings, name, promise, extra, opts = {}) {
  const t0 = fetchNowMs();
  const batchStart =
    opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  if (batchStart != null) {
    timings[`${name}_start`] = Math.round(t0 - batchStart);
  }
  try {
    const result = await promise;
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = '';
    try {
      if (typeof extra === 'function') suffix = extra(result) || '';
    } catch {
      /* ignore extra formatting errors */
    }
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel}${
        suffix ? ` ${suffix}` : ''
      }`
    );
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel} ERROR ${msg}`
    );
    throw err;
  }
}

/**
 * Pretty-print parallel REST timings after Promise.all settles.
 * @param {Record<string, number|string>} timings
 * @param {string[]} names keys that participated in the batch
 * @param {number} wallMs wall-clock for Promise.all
 */
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : [])
    .map((name) => {
      const ms = Number(timings[name]);
      const start = Number(timings[`${name}_start`]);
      const err = timings[`${name}_error`];
      return {
        name,
        ms: Number.isFinite(ms) ? ms : null,
        start: Number.isFinite(start) ? start : null,
        error: err ? String(err) : null,
      };
    })
    .filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0];
  const sum = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const lines = rows.map((r) => {
    const bar =
      wallMs > 0 && r.ms != null
        ? '█'.repeat(Math.max(1, Math.round((r.ms / wallMs) * 20)))
        : '';
    const start = r.start != null ? `+${r.start}ms`.padStart(7) : '   n/a';
    const dur = r.ms != null ? `${r.ms}ms`.padStart(6) : '   n/a';
    const err = r.error ? ` ERR:${r.error.slice(0, 40)}` : '';
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  console.log(
    `[pr-plus] fetchPrDetail parallel REST summary\n` +
      `  wall=${Math.round(wallMs)}ms  sum=${sum}ms  ` +
      `slowest=${slowest ? `${slowest.name}@${slowest.ms}ms` : 'n/a'}\n` +
      (lines.length ? lines.join('\n') : '  (no rows)')
  );
  timings.coreParallel = {
    wallMs: Math.round(wallMs),
    sumMs: sum,
    slowest: slowest ? { name: slowest.name, ms: slowest.ms } : null,
    byName: Object.fromEntries(rows.map((r) => [r.name, r.ms])),
  };
}

/**
 * Sleep helper for mergeability re-fetch (GitHub starts compute on first GET).
 * @param {number} ms
 */
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
}

/**
 * Dual-modified paths since merge-base (base tip ∩ head) ≈ conflict file list.
 * Uses current base-branch tip (not stale pr.base.sha) so behind PRs work.
 * Soft-fails to [] on any error.
 *
 * @returns {Promise<string[]>}
 */
async function fetchConflictFilePaths(
  owner,
  repo,
  baseRef,
  headSha,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const ref = String(baseRef || '').trim();
  const head = String(headSha || '').trim();
  if (!o || !r || !ref || !head) return [];
  try {
    const baseUrl = githubRestUrl(`/repos/${o}/${r}`, ctx);
    const refJson = await apiJson(
      `${baseUrl}/git/ref/heads/${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    );
    const baseTip = String(refJson?.object?.sha || '').trim();
    if (!baseTip) return [];
    const headVsBase = await apiJson(
      `${baseUrl}/compare/${encodeURIComponent(baseTip)}...${encodeURIComponent(head)}`,
      fetchImpl,
      token
    );
    const mergeBase = String(headVsBase?.merge_base_commit?.sha || '').trim();
    if (!mergeBase) return [];
    const [baseSide, headSide] = await Promise.all([
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(baseTip)}?per_page=100`,
        fetchImpl,
        token
      ),
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(head)}?per_page=100`,
        fetchImpl,
        token
      ),
    ]);
    const onBase = new Set(
      (Array.isArray(baseSide?.files) ? baseSide.files : [])
        .map((f) => String(f?.filename || f?.previous_filename || '').trim())
        .filter(Boolean)
    );
    const conflicts = [];
    for (const f of Array.isArray(headSide?.files) ? headSide.files : []) {
      const path = String(f?.filename || '').trim();
      if (path && onBase.has(path)) conflicts.push(path);
    }
    return conflicts;
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchConflictFilePaths: soft-fail ${err?.message || err}`
    );
    return [];
  }
}

/**
 * Ensure mergeable/mergeable_state are computed; when dirty, attach conflict paths.
 * @returns {Promise<object>} pr with optional `_conflictFiles`
 */
async function resolvePrMergeability(
  pr,
  base,
  pullNumber,
  fetchImpl,
  token,
  timings,
  /** @type {{ owner?: string, repo?: string, apiCtx?: object }} */
  meta = {}
) {
  if (!pr || typeof pr !== 'object') return pr;
  let out = pr;
  const apiCtx = normalizeApiCtx(meta?.apiCtx || meta?.ctx);
  const needsCompute =
    out.mergeable == null ||
    out.mergeable === undefined ||
    !String(out.mergeable_state || '').trim() ||
    String(out.mergeable_state || '').toLowerCase() === 'unknown';

  if (needsCompute) {
    try {
      // Brief pause so GitHub's background job can finish after the first GET
      await sleepMs(350);
      const again = await timedFetch(
        timings,
        'pullMergeable',
        apiJson(`${base}/pulls/${pullNumber}`, fetchImpl, token),
        (p) =>
          `(mergeable=${p?.mergeable} state=${p?.mergeable_state || '?'})`
      );
      if (again && typeof again === 'object') {
        out = {
          ...out,
          mergeable: again.mergeable,
          mergeable_state: again.mergeable_state,
          rebaseable:
            again.rebaseable != null ? again.rebaseable : out.rebaseable,
          merge_commit_sha: again.merge_commit_sha || out.merge_commit_sha,
        };
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      console.log(
        `[pr-plus] resolvePrMergeability re-fetch: soft-fail ${err?.message || err}`
      );
    }
  }

  const state = String(out.mergeable_state || '').toLowerCase();
  const isDirty =
    state === 'dirty' ||
    (out.mergeable === false && state !== 'blocked' && state !== 'clean');

  if (isDirty) {
    const baseOwner =
      out.base?.repo?.owner?.login ||
      String(meta.owner || '').trim() ||
      null;
    const baseRepo =
      out.base?.repo?.name || String(meta.repo || '').trim() || null;
    const conflictFiles = await timedFetch(
      timings,
      'conflictFiles',
      fetchConflictFilePaths(
        baseOwner,
        baseRepo,
        out.base?.ref || '',
        out.head?.sha || '',
        fetchImpl,
        token,
        apiCtx
      ).catch(() => []),
      (list) => `(${Array.isArray(list) ? list.length : 0} paths)`
    );
    out = {
      ...out,
      _conflictFiles: Array.isArray(conflictFiles) ? conflictFiles : [],
    };
  } else {
    out = { ...out, _conflictFiles: [] };
  }
  return out;
}

async function fetchPrDetail(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token = null,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const base = githubRestUrl(`/repos/${owner}/${repo}`, ctx);
  const n = Number(pullNumber);
  const skipReviewThreads = Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads
    ? 0
    : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  /** @type {Record<string, number|string>} */
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n}` +
      ` skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}`
  );

  // Lean core: pull identity + viewer + autolinks only.
  // files / issue comments / reviews / commits / checks / development are
  // independent host fetches (do not block header + description paint).
  const PARALLEL_REST_KEYS = ['pull', 'viewerLogin', 'autolinks'];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  let [pr, viewerLogin, autolinks] = await Promise.all([
    timedFetch(
      timings,
      'pull',
      apiJson(`${base}/pulls/${n}`, fetchImpl, token),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      'viewerLogin',
      fetchViewerLogin(fetchImpl, token, ctx),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      'autolinks',
      fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx),
      (r) => `(${Array.isArray(r) ? r.length : 0} links)`,
      batchOpt
    ),
  ]);
  const parallelWall = fetchNowMs() - tParallel0;
  timings.coreParallelWall = Math.round(parallelWall);
  logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall);
  timings.files = 0;
  timings.issueComments = 0;
  timings.reviews = 0;
  timings.commits = 0;
  timings.commitStatus = 0;
  timings.checkRuns = 0;
  timings.sidebarMeta = 0;
  timings.gitattributes = 0;
  console.log(
    '[pr-plus] fetchPrDetail files/comments/reviews/commits/checks/development: deferred (independent fetches)'
  );
  const files = [];
  const commentsPage = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: 'from-end',
      loadedCount: 0,
    },
  };
  const reviews = [];

  // GitHub computes mergeable async on first GET (often null/unknown).
  // Re-fetch once so conflict (dirty) is not mislabeled as "still calculating".
  pr = await resolvePrMergeability(pr, base, n, fetchImpl, token, timings, {
    owner,
    repo,
    apiCtx: ctx,
  });

  // GraphQL viewerSubscription (REST issues/.../subscription is 404 / dead)
  const subscription = await timedFetch(
    timings,
    'subscription',
    token
      ? fetchPullRequestSubscription(
          owner,
          repo,
          n,
          fetchImpl,
          token,
          pr?.node_id || null,
          ctx
        )
      : Promise.resolve(null)
  );
  const comments = commentsPage?.items || [];

  // First page (or zero) of review threads — not the full 500+ dump
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    pageCount: 0,
  };
  if (token && threadsMaxPages > 0) {
    reviewThreadBundle = await timedFetch(
      timings,
      'reviewThreads',
      fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
        cursor: opts.threadsCursor || null,
        maxPages: threadsMaxPages,
        ctx,
      }).catch((err) => {
        if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
          throw err;
        }
        return reviewThreadBundle;
      }),
      (b) =>
        `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
    );
  } else {
    timings.reviewThreads = 0;
    console.log(
      `[pr-plus] fetchPrDetail reviewThreads: skipped (token=${Boolean(
        token
      )} maxPages=${threadsMaxPages})`
    );
  }

  const reviewThreads = reviewThreadBundle?.threads || [];
  // PENDING-only REST rows when GraphQL misses them (reviews list is independent;
  // pending bundle finds PENDING via its own lookup when preloaded reviews empty).
  let pendingBundle = { comments: [], review: null };
  if (token) {
    pendingBundle = await timedFetch(
      timings,
      'pendingReview',
      fetchViewerPendingReviewBundle(
        owner,
        repo,
        n,
        fetchImpl,
        token,
        {
          reviews: [],
          login: viewerLogin,
        },
        ctx
      ).catch((err) => {
        if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
          throw err;
        }
        return { comments: [], review: null };
      }),
      (b) => `(${(b?.comments || []).length} pending comments)`
    );
  } else {
    timings.pendingReview = 0;
    console.log('[pr-plus] fetchPrDetail pendingReview: skipped (no token)');
  }
  const pendingReviewComments = pendingBundle.comments || [];
  const reviewComments = mergePendingReviewComments(
    reviewThreadBundle?.comments || [],
    pendingReviewComments
  );
  const viewerPendingReview = pendingBundle.review || null;
  const reviewCommentsMeta = {
    page: 1,
    perPage: (reviewThreadBundle?.comments || []).length || COMMENT_PAGE_SIZE,
    hasMore: Boolean(reviewThreadBundle?.hasMore),
    nextPage: null,
    loadedCount: (reviewComments || []).length,
  };
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta
    ? { ...reviewThreadBundle.reviewThreadsMeta }
    : {
        ...emptyReviewThreadsMeta(),
        hasMore: Boolean(reviewThreadBundle?.hasMore),
        endCursor: reviewThreadBundle?.endCursor || null,
        loadedThreadCount: (reviewThreads || []).length,
        loadedCommentCount: (reviewThreadBundle?.comments || []).length,
        pagesLoaded: reviewThreadBundle?.pageCount || (threadsMaxPages > 0 ? 1 : 0),
        totalCount: Number(reviewThreadBundle?.totalCount) || (reviewThreads || []).length,
        hiddenCount: Math.max(
          0,
          (Number(reviewThreadBundle?.totalCount) || 0) - (reviewThreads || []).length
        ),
      };

  const headSha = pr.head?.sha || '';
  // files / comments / reviews / checks / commits / development: independent host fetches
  const checks = { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  const commits = [];
  let linkedIssues = [];
  const developmentIssues = [];
  const projects = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === 'function') {
      try {
        editApi = require('./modal/pure/pr-edit-api.js');
      } catch {
        editApi = null;
      }
    }
    // Sync body #N only — GraphQL Development is independent (fetchPrDevelopment)
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || '');
    }
  } catch {
    linkedIssues = [];
  }

  // gitattributes + file annotate moved to fetchPrFiles (independent)
  const gitattributesText = '';
  const filesOut = [];
  timings.mapAnnotateFiles = 0;

  const subscribed =
    subscription && typeof subscription.subscribed === 'boolean'
      ? Boolean(subscription.subscribed)
      : null;
  // subscription.viewerSubscription kept for debugging / future UI (IGNORED)

  // Magic links from title/body/branch (body-only tokens e.g. ENG-99 must match)
  const magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || '',
      headRef: pr.head?.ref || '',
      baseRef: pr.base?.ref || '',
      author: pr.user?.login || '',
    }),
    Array.isArray(autolinks) ? autolinks : []
  );

  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
    `[pr-plus] fetchPrDetail total: ${timings.total}ms`,
    JSON.stringify(timings)
  );
  if (typeof console.table === 'function') {
    try {
      console.table(timings);
    } catch {
      /* ignore */
    }
  }

  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login || '',
    authorAvatarUrl: pr.user?.avatar_url || '',
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || '',
    headRef: pr.head?.ref || '',
    baseSha: pr.base?.sha || '',
    /** Repo that owns the base ref (usually same as PR repo). */
    baseOwner: pr.base?.repo?.owner?.login || owner,
    baseRepo: pr.base?.repo?.name || repo,
    /** Head may be a fork — prefer head.repo when present. */
    headOwner: pr.head?.repo?.owner?.login || pr.head?.user?.login || owner,
    headRepo: pr.head?.repo?.name || repo,
    headSha,
    magicLinks,
    htmlUrl: pr.html_url,
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state || null,
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles) ? pr._conflictFiles : [],
    rebaseable: pr.rebaseable ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    /** Total commits on the PR (REST field); may exceed first page of commits[]. */
    commitsCount: pr.commits != null ? Number(pr.commits) : null,
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((l) => ({
          name: l.name || '',
          color: l.color || '',
          description: l.description || '',
        }))
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((u) => u.login || u).filter(Boolean)
      : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map = {};
      const putUser = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        const url = u?.avatar_url || '';
        if (login && url) map[String(login).toLowerCase()] = url;
      };
      putUser(pr.user);
      for (const u of pr.assignees || []) putUser(u);
      for (const u of pr.requested_reviewers || []) putUser(u);
      for (const c of comments || []) putUser(c?.user);
      for (const r of reviews || []) putUser(r?.user);
      for (const c of reviewComments || []) putUser(c?.user);
      return map;
    })(),
    /**
     * login (lower) → true when GitHub user.type is Bot (or [bot] login).
     * Used to hide re-request / remove for bot reviewers & assignees.
     */
    actorIsBot: (() => {
      const map = {};
      const put = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        if (!login) return;
        const key = String(login).toLowerCase();
        const type = String(u?.type || '').toLowerCase();
        if (type === 'bot' || /\[bot\]$/i.test(String(login))) map[key] = true;
      };
      for (const u of pr.assignees || []) put(u);
      for (const u of pr.requested_reviewers || []) put(u);
      for (const r of reviews || []) put(r?.user);
      for (const c of comments || []) put(c?.user);
      for (const c of reviewComments || []) put(c?.user);
      return map;
    })(),
    requestedReviewers: Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((u) => u.login || u).filter(Boolean)
      : [],
    requestedTeams: Array.isArray(pr.requested_teams)
      ? pr.requested_teams.map((t) => t.slug || t.name).filter(Boolean)
      : [],
    milestone: pr.milestone
      ? {
          number: pr.milestone.number,
          title: pr.milestone.title || '',
          state: pr.milestone.state || '',
          dueOn: pr.milestone.due_on || null,
        }
      : null,
    linkedIssues,
    /** Issues linked for Development (closing refs / body #N). */
    developmentIssues,
    /** ProjectV2 boards this PR is on. */
    projects,
    subscribed,
    locked: Boolean(pr.locked),
    gitattributesText,
    files: filesOut,
    comments: Array.isArray(comments) ? comments : [],
    commentsMeta: commentsPage?.meta || {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      loadedCount: Array.isArray(comments) ? comments.length : 0,
    },
    // Populated by independent fetchPrReviews
    reviews: Array.isArray(reviews) ? reviews : [],
    // GraphQL first page (or empty if skipReviewThreads) — more via fetchReviewThreadsPage
    reviewComments: Array.isArray(reviewComments) ? reviewComments : [],
    reviewCommentsMeta,
    reviewThreads: Array.isArray(reviewThreads) ? reviewThreads : [],
    reviewThreadsMeta,
    /**
     * Viewer's unsubmitted PENDING review (if any), including replies that only
     * appear via GET /reviews/{id}/comments.
     */
    viewerPendingReview,
    // Populated by independent side fetches (host)
    commits: Array.isArray(commits) ? commits : [],
    checks,
    /** Debug: per-request ms from this fetchPrDetail call */
    _fetchTimings: timings,
  };
}

async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { body } }
  );
}

/**
 * @param {'APPROVE'|'REQUEST_CHANGES'|'COMMENT'} event
 * @param {Array} [comments] pending inline comments for bulk submit
 */
async function submitPullReview(
  owner,
  repo,
  pullNumber,
  { event, body = '', commitId, comments },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload = { event, body: body || '' };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || 'RIGHT',
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
          row.start_line = Number(sl);
          row.start_side = c.start_side || c.startSide || c.side || 'RIGHT';
        }
      }
      return row;
    });
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * GraphQL: add a new review *thread* (line or file comment) onto an existing PENDING review.
 * REST POST /comments creates a second pending review → 422.
 */
async function postReviewCommentViaPendingGraphql(
  pendingReviewNodeId,
  { body, path, line, side = 'RIGHT', startLine, startSide, subjectType = 'line' },
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  const hasRange =
    !isFile &&
    startLine != null &&
    Number.isFinite(Number(startLine)) &&
    Number(startLine) !== Number(line);
  const variables = {
    review: String(pendingReviewNodeId),
    body: String(body || '').trim(),
    path: String(path || ''),
  };
  let query;
  if (isFile) {
    query = `mutation($review:ID!,$body:String!,$path:String!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        subjectType:FILE
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else if (hasRange) {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    variables.startLine = Number(startLine);
    variables.startSide =
      String(startSide || side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!,$startLine:Int!,$startSide:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
        startLine:$startLine
        startSide:$startSide
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  }
  const data = await apiGraphql(query, variables, fetchImpl, token, ctx);
  const thread = data?.addPullRequestReviewThread?.thread;
  const node = thread?.comments?.nodes?.[0];
  if (!node) {
    throw new Error(
      isFile
        ? `Could not add pending file comment on ${path}.`
        : `Could not add pending comment on ${path}:${line} (${side || 'RIGHT'}). ` +
            `The line may be outside the diff or on the wrong side.`
    );
  }
  const threadNodeId = thread?.id || null;
  const rest = mapGraphqlReviewCommentToRest(node, {
    body,
    path,
    line: isFile ? null : line,
    startLine: hasRange ? Number(startLine) : null,
    side,
    inReplyToId: null,
  });
  return {
    ...rest,
    // GraphQL/REST often omit line on pending comments — keep selection line for UI
    line: isFile ? null : rest.line ?? Number(line),
    path: rest.path || path,
    side: side || 'RIGHT',
    start_line: hasRange ? Number(startLine) : null,
    start_side: hasRange ? startSide || side || 'RIGHT' : null,
    subject_type: isFile ? 'file' : 'line',
    pending: true,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    threadNodeId,
  };
}

/**
 * Resolve the viewer's PENDING review, creating one if needed (asPending).
 * Recovers from 422 "one pending review" by re-fetching the existing review.
 * Always re-GETs the review so discarded/stale list entries (with a dead
 * node_id) are not returned after Discard.
 */
async function ensureViewerPendingReview(
  owner,
  repo,
  pullNumber,
  { commitId = null, createIfMissing = false } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  /** Re-fetch review; return null if missing or no longer PENDING. */
  const hydrateNodeId = async (pending) => {
    if (!pending?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending.id}`, ctx),
        fetchImpl,
        token
      );
      if (!full || String(full.state || '').toUpperCase() !== 'PENDING') {
        return null;
      }
      return {
        id: Number(pending.id),
        node_id: full.node_id || pending.node_id || null,
      };
    } catch (err) {
      // 404 after discard — list can briefly still show the dead PENDING row
      if (err?.status === 404) return null;
      // Keep list node_id only when re-GET is unavailable (network); prefer null
      // over a known-dead id when status is 4xx.
      if (err?.status >= 400 && err?.status < 500) return null;
      return pending?.node_id
        ? { id: Number(pending.id), node_id: pending.node_id }
        : null;
    }
  };

  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  pending = await hydrateNodeId(pending);
  if (pending?.node_id) return pending;
  if (!createIfMissing) return pending;

  try {
    const created = await createPendingPullReview(
      owner,
      repo,
      pullNumber,
      { commitId },
      fetchImpl,
      token
    );
    return {
      id: Number(created?.id),
      node_id: created?.node_id || null,
    };
  } catch (err) {
    // Already have a PENDING review (race or find missed it) — attach to it
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      pending = await findViewerPendingReview(
        owner,
        repo,
        pullNumber,
        fetchImpl,
        token
      );
      pending = await hydrateNodeId(pending);
      if (pending?.node_id) return pending;
    }
    throw err;
  }
}

/**
 * Review comment on a PR file (line-level or file-level).
 * Prefer commit_id + path + line (side RIGHT). Multi-line uses start_line/start_side.
 * File-level: subject_type: 'file' (line omitted).
 *
 * Unified pending model (single GitHub PENDING review):
 * - asPending: true → create PENDING review if needed, always attach via GraphQL
 * - existing PENDING (any path) → GraphQL attach (REST would 422)
 * - else → REST published single comment
 *
 * @param {object} fields
 * @param {boolean} [fields.asPending] Start review / Add comment — always pending
 * @param {'line'|'file'} [fields.subjectType]
 */
async function postReviewComment(
  owner,
  repo,
  pullNumber,
  {
    body,
    path,
    line,
    side = 'RIGHT',
    commitId,
    startLine,
    startSide,
    asPending = false,
    subjectType = 'line',
  },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment body is required');
  if (!path) throw new Error('path is required');
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  if (!isFile && line == null) throw new Error('path and line are required');

  // Unified PENDING: attach to existing, or create (asPending). Recover from 422.
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    {
      commitId: commitId || null,
      // Create only when caller wants pending; also create path recovers on 422
      createIfMissing: Boolean(asPending),
    },
    fetchImpl,
    token
  );

  const gqlFields = {
    body: text,
    path,
    line: isFile ? null : line,
    side,
    startLine: isFile ? null : startLine,
    startSide: isFile ? null : startSide,
    subjectType: isFile ? 'file' : 'line',
  };

  // Existing PENDING (or just created) → always GraphQL attach (REST 422s)
  if (pending?.node_id) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        pending.node_id,
        gqlFields,
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId: raw.pendingReviewId || pending.id || null,
      };
    } catch (err) {
      // Discarded review can linger in the list with a dead GraphQL node id.
      const msg = String(err?.message || err || '');
      if (
        asPending &&
        /Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)
      ) {
        // Force a fresh PENDING review and retry once
        try {
          const created = await createPendingPullReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null },
            fetchImpl,
            token,
            ctx
          );
          pending = {
            id: Number(created?.id),
            node_id: created?.node_id || null,
          };
        } catch (createErr) {
          if (
            createErr?.status === 422 ||
            /one pending review/i.test(String(createErr?.message || ''))
          ) {
            pending = await ensureViewerPendingReview(
              owner,
              repo,
              pullNumber,
              { commitId: commitId || null, createIfMissing: false },
              fetchImpl,
              token,
              ctx
            );
          } else {
            throw createErr;
          }
        }
        if (pending?.node_id) {
          const raw = await postReviewCommentViaPendingGraphql(
            pending.node_id,
            gqlFields,
            fetchImpl,
            token,
            ctx
          );
          return {
            ...raw,
            pending: true,
            pendingReviewId: raw.pendingReviewId || pending.id || null,
          };
        }
      }
      throw err;
    }
  }

  // asPending but still no node_id — cannot attach
  if (asPending) {
    throw new Error(
      'Could not start or find a pending review. Try Discard any leftover pending review, then retry.'
    );
  }

  // Published single comment (no PENDING review)
  const payload = isFile
    ? { body: text, path, subject_type: 'file' }
    : { body: text, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || 'RIGHT';
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * Viewer's PENDING review on a PR (at most one). Used because REST
 * POST /comments and /replies 422 with:
 * "user_id can only have one pending review per pull request".
 * @returns {Promise<{ id: number, node_id: string|null }|null>}
 */
async function findViewerPendingReview(owner, repo, pullNumber, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`, ctx),
        fetchImpl,
        token
      ).catch(() => []),
      fetchViewerLogin(fetchImpl, token).catch(() => null),
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}

/**
 * Map GraphQL review-comment payload → REST-like shape (mapRestReviewComment).
 */
