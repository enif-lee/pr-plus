async function fetchViewerPendingReviewComments(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token
) {
  const { comments } = await fetchViewerPendingReviewBundle(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  return comments;
}

/**
 * Create an empty PENDING review (no event). Required before attaching
 * "Start review" replies when none exists yet.
 */
async function createPendingPullReview(
  owner,
  repo,
  pullNumber,
  { commitId } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (commitId) body.commit_id = commitId;
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
}

/**
 * Submit an existing PENDING review.
 * POST /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}/events
 */
async function submitPendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  { event = 'COMMENT', body = '' } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  const ev = String(event || 'COMMENT').toUpperCase();
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(ev)) {
    throw new Error('Invalid review event');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { event: ev, body: body || '' } }
  );
}

/**
 * Delete a PENDING review (discards all pending comments/replies on it).
 * DELETE /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}
 */
async function deletePendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Paginated issue or pull review comments.
 * Supports page/per_page offset and since= (ISO8601) incremental windows.
 *
 * @param {'issue'|'review'} kind
 * @param {{ page?: number, perPage?: number, since?: string|null }} [opts]
 */
async function fetchPrCommentsPage(
  owner,
  repo,
  pullNumber,
  kind,
  opts,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const helpers = commentsPageHelpers();
  const perPage =
    helpers?.clampPerPage?.(opts?.perPage) ||
    Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null;
  // Prefer newest-first: review API supports direction=desc; issue comments
  // are ascending-only so we jump to Link rel=last on the first preferNewest fetch.
  const preferNewest = Boolean(opts?.preferNewest) && !since;
  const orderHint = opts?.order || null;

  async function fetchPage(pageNum, listOpts = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
    const sort =
      listOpts.sort != null
        ? listOpts.sort
        : kind === 'review'
          ? 'created'
          : undefined;
    const direction =
      listOpts.direction != null
        ? listOpts.direction
        : kind === 'review'
          ? preferNewest || orderHint === 'desc'
            ? 'desc'
            : 'asc'
          : undefined;
    const url = helpers?.buildCommentsListUrl
      ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
          page: pageNum,
          perPage,
          since,
          sort,
          direction,
        })
      : (() => {
          const base =
            kind === 'review'
              ? githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx)
              : githubRestUrl(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, ctx);
          const q = new URLSearchParams({
            per_page: String(perPage),
            page: String(pageNum),
          });
          if (since) q.set('since', since);
          if (sort) q.set('sort', sort);
          if (direction) q.set('direction', direction);
          return `${base}?${q}`;
        })();
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    const raw = Array.isArray(data) ? data : [];
    const items =
      kind === 'review' ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    return { items, raw, link, pageNum };
  }

  // Issue comments: ascending only → first paint from last page (newest), then page-1…
  if (kind === 'issue' && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1);
    const lastPage =
      (helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link)) ||
      null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage);
      const meta = helpers?.buildCommentsPageMeta
        ? helpers.buildCommentsPageMeta(newest.items, {
            page: lastPage,
            perPage,
            linkHeader: newest.link,
            since,
            order: 'from-end',
          })
        : {
            page: lastPage,
            perPage,
            hasMore: lastPage > 1,
            nextPage: lastPage > 1 ? lastPage - 1 : null,
            order: 'from-end',
            since,
            loadedCount: newest.items.length,
          };
      return { items: newest.items, meta, kind };
    }
    // Only one page — already the full set (oldest=newest window)
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(probe.items, {
          page: 1,
          perPage,
          linkHeader: probe.link,
          since,
          order: 'from-end',
        })
      : {
          page: 1,
          perPage,
          hasMore: false,
          nextPage: null,
          order: 'from-end',
          since,
          loadedCount: probe.items.length,
        };
    return { items: probe.items, meta, kind };
  }

  // Continuing from-end (older pages) for issue comments
  if (kind === 'issue' && (orderHint === 'from-end' || opts?.order === 'from-end')) {
    const res = await fetchPage(page);
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(res.items, {
          page,
          perPage,
          linkHeader: res.link,
          since,
          order: 'from-end',
        })
      : {
          page,
          perPage,
          hasMore: page > 1,
          nextPage: page > 1 ? page - 1 : null,
          order: 'from-end',
          since,
          loadedCount: res.items.length,
        };
    return { items: res.items, meta, kind };
  }

  // Review comments (and default issue): page 1 = newest when preferNewest
  const res = await fetchPage(page, {
    direction: kind === 'review' ? (preferNewest || orderHint === 'desc' ? 'desc' : 'asc') : undefined,
    sort: kind === 'review' ? 'created' : undefined,
  });
  const meta = helpers?.buildCommentsPageMeta
    ? helpers.buildCommentsPageMeta(res.items, {
        page,
        perPage,
        linkHeader: res.link,
        since,
        order: kind === 'review' && (preferNewest || orderHint === 'desc') ? 'desc' : 'asc',
      })
    : {
        page,
        perPage,
        hasMore: res.raw.length >= perPage,
        nextPage: res.raw.length >= perPage ? page + 1 : null,
        since,
        loadedCount: res.items.length,
      };
  return { items: res.items, meta, kind };
}

async function apiSend(url, fetchImpl, token, { method = 'GET', body } = {}) {
  const headers = buildApiHeaders(token);
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
      // Surface field-level validation (common on 422 replies / review comments)
      if (Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors
          .map((e) => {
            if (!e || typeof e !== 'object') return String(e);
            if (e.message) return e.message;
            const field = e.field || e.resource || '';
            const code = e.code || '';
            return [field, code].filter(Boolean).join(' ') || null;
          })
          .filter(Boolean);
        if (bits.length) detail = `${detail}: ${bits.join('; ')}`;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Pull request sidebar meta for conversation rail:
 * - ProjectV2 items (Projects section)
 * - Closing-linked issues (Development section)
 * Soft fields only — failures return empty arrays.
 *
 * @returns {Promise<{ projects: Array, developmentIssues: Array }>}
 */
async function fetchPrSidebarMeta(owner, repo, number, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0 || !token) {
    return { projects: [], developmentIssues: [] };
  }
  const query = `
    query($owner:String!,$repo:String!,$number:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$number) {
          projectItems(first: 20) {
            nodes {
              id
              project {
                title
                number
                url
              }
            }
          }
          closingIssuesReferences(first: 20) {
            nodes {
              number
              title
              url
              state
            }
          }
        }
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r, number: n },
      fetchImpl,
      token,
      ctx
    );
    const prNode = data?.repository?.pullRequest || null;
    const projects = [];
    for (const node of prNode?.projectItems?.nodes || []) {
      const p = node?.project;
      if (!p) continue;
      const title = String(p.title || '').trim();
      if (!title) continue;
      projects.push({
        id: String(node.id || `${p.number}:${title}`),
        title,
        number: p.number != null ? Number(p.number) : null,
        url: String(p.url || '').trim(),
      });
    }
    const developmentIssues = [];
    for (const node of prNode?.closingIssuesReferences?.nodes || []) {
      const num = Number(node?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      developmentIssues.push({
        number: num,
        title: String(node?.title || '').trim(),
        url: String(node?.url || '').trim(),
        state: String(node?.state || '').trim().toLowerCase(),
      });
    }
    return { projects, developmentIssues };
  } catch (err) {
    // Soft: missing ProjectV2 scope / org policy / etc.
    if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
      throw err;
    }
    return { projects: [], developmentIssues: [] };
  }
}

/**
 * Resolve title/url/state for issue or PR numbers (body-linked Development rows).
 * Soft-fail: empty Map when GraphQL unavailable.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number[]} numbers
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 * @returns {Promise<Map<number, { number: number, title: string, url: string, state: string, kind: string }>>}
 */
async function fetchIssueOrPrSummaries(owner, repo, numbers, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const nums = [
    ...new Set(
      (Array.isArray(numbers) ? numbers : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ].slice(0, 30);
  /** @type {Map<number, { number: number, title: string, url: string, state: string, kind: string }>} */
  const out = new Map();
  if (!o || !r || !nums.length || !token) return out;

  // Alias each number — GraphQL has no list-of-numbers helper for issueOrPullRequest.
  const fields = nums
    .map(
      (n, i) => `
      n${i}: issueOrPullRequest(number: ${n}) {
        __typename
        ... on Issue { number title url state }
        ... on PullRequest { number title url state }
      }`
    )
    .join('\n');
  const query = `
    query($owner:String!,$repo:String!) {
      repository(owner:$owner, name:$repo) {
        ${fields}
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r },
      fetchImpl,
      token,
      ctx
    );
    const repoNode = data?.repository || {};
    for (let i = 0; i < nums.length; i++) {
      const node = repoNode[`n${i}`];
      if (!node || node.number == null) continue;
      const num = Number(node.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      out.set(num, {
        number: num,
        title: String(node.title || '').trim(),
        url: String(node.url || '').trim(),
        state: String(node.state || '').trim().toLowerCase(),
        kind: node.__typename === 'PullRequest' ? 'pull' : 'issue',
      });
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    // Soft-fail: keep empty map
  }
  return out;
}

/**
 * GraphQL client: HTTP 200 can still carry body.errors — treat those as failures.
 * @returns {Promise<object>} data field only
 */
async function apiGraphql(query, variables, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const json = await apiSend(
    githubGraphqlUrl(ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { query, variables: variables || {} } }
  );
  if (json?.errors?.length) {
    const msg = json.errors
      .map((e) => e?.message || String(e))
      .filter(Boolean)
      .join('; ');
    const err = new Error(`GitHub GraphQL: ${msg || 'unknown error'}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  return json?.data ?? null;
}

/** Thread node fields shared by first/last pagination queries. */
const REVIEW_THREAD_NODE_FIELDS = `
  id
  isResolved
  isOutdated
  path
  line
  originalLine
  startLine
  originalStartLine
  diffSide
  startDiffSide
  subjectType
  comments(first:100){
    nodes{
      id
      databaseId
      body
      path
      line
      originalLine
      startLine
      originalStartLine
      outdated
      diffHunk
      createdAt
      author { login avatarUrl }
      replyTo { databaseId }
      pullRequestReview { databaseId state }
    }
  }
`;

/** Oldest → newer (forward). */
const REVIEW_THREADS_FIRST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:$n, after:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** Newest ← older (backward). */
const REVIEW_THREADS_LAST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(last:$n, before:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** GraphQL connection / nodes(ids) hard cap. */
const REVIEW_THREADS_API_MAX = 100;
/** Default page size for dual-window expand (Load more / Load all). Matches API max. */
const REVIEW_THREADS_PAGE_SIZE = REVIEW_THREADS_API_MAX;

/**
 * Map GraphQL reviewThreads.nodes → { threads, comments }.
 */
function mapReviewThreadNodes(allNodes) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || '',
      diffSide: t.diffSide || 'RIGHT',
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null,
    };
    const commentIds = [];
    for (const node of t.comments?.nodes || []) {
      const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
      if (!mapped) continue;
      comments.push(mapped);
      commentIds.push(mapped.id);
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || '',
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || 'RIGHT',
      commentIds,
    });
  }
  return { threads, comments };
}

/**
 * Single GraphQL page of review threads.
 * @param {'newest'|'older'|'oldest'|'newer'} direction
 *   - newest: last:N (connection end = most recent)
 *   - older:  last:N before startCursor (expand newest window into older)
 *   - oldest: first:N (connection start = earliest)
 *   - newer:  first:N after endCursor (expand oldest window into newer)
 */
async function fetchReviewThreadsPage(
  owner,
  repo,
  pullNumber,
  { direction = 'newest', cursor = null, pageSize = REVIEW_THREADS_PAGE_SIZE } = {},
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    startCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: null,
    pageCount: 0,
    direction,
  };
  if (!token) return empty;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || 'newest');
  const useLast = dir === 'newest' || dir === 'older';
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  // newest: last:N, cursor=null
  // older:  last:N, before=cursor (start of current newest window)
  // oldest: first:N, cursor=null
  // newer:  first:N, after=cursor (end of current oldest window)
  const data = await apiGraphql(
    query,
    {
      owner,
      name: repo,
      number: n,
      n: size,
      cursor: cursor || null,
    },
    fetchImpl,
    token,
    ctx
  );
  const conn = data?.repository?.pullRequest?.reviewThreads;
  const nodes = conn?.nodes || [];
  const pageInfo = conn?.pageInfo || {};
  const mapped = mapReviewThreadNodes(nodes);
  // Tag threads with load window for UI gap split
  const windowTag =
    dir === 'newest' || dir === 'older' ? 'newest' : 'oldest';
  for (const t of mapped.threads) {
    t.loadWindow = windowTag;
  }
  return {
    threads: mapped.threads,
    comments: mapped.comments,
    totalCount:
      typeof conn?.totalCount === 'number' ? conn.totalCount : null,
    startCursor: pageInfo.startCursor || null,
    endCursor: pageInfo.endCursor || null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
    // Convenience for dual-window UI
    hasMore:
      useLast
        ? Boolean(pageInfo.hasPreviousPage)
        : Boolean(pageInfo.hasNextPage),
    pageCount: 1,
    direction: dir,
    window: windowTag,
  };
}

/**
 * Collect GraphQL thread node ids (PRRT_…) that are unresolved in a detail snapshot.
 * Used for cache revalidate bulk refresh.
 * @param {object|null} detail
 * @returns {string[]}
 */
function collectUnresolvedThreadNodeIds(detail) {
  const dropped =
    detail?._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : new Set(
          Array.isArray(detail?._droppedThreadNodeIds)
            ? detail._droppedThreadNodeIds.map(String)
            : []
        );
  const ids = new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    // Prefer roots (or orphans) — replies inherit resolved from thread meta anyway
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

/**
 * Fetch specific review threads by GraphQL global ids (PRRT_…).
 * Batches in chunks of REVIEW_THREADS_API_MAX (100).
 * @param {string[]} threadNodeIds
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 */
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: [],
    missingThreadIds: [],
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return empty;

  const query = `
query($ids:[ID!]!){
  nodes(ids:$ids){
    ... on PullRequestReviewThread {
      ${REVIEW_THREAD_NODE_FIELDS}
    }
  }
}`;

  const allThreads = [];
  const allComments = [];
  const foundIds = new Set();
  let pages = 0;
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx);
      // nodes[] is parallel to requested ids; deleted/not-found → null
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || 'refresh';
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      // Also mark any non-null node id from raw (even if mapping skipped)
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
    } catch (err) {
      // One bad chunk must not block the rest — treat whole chunk as unknown
      // (not missing) so we don't mass-drop on transient GraphQL errors.
      console.warn(
        '[pr-plus] fetchReviewThreadsByIds chunk failed',
        err?.message || err
      );
    }
  }
  const missingThreadIds = ids.filter((id) => !foundIds.has(String(id)));
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: ids,
    missingThreadIds,
  };
}

/**
 * Drop review threads (and their comments) that no longer exist remotely.
 * Records comment id tombstones so App mergeDetailPreserveOptimistic cannot
 * resurrect them across a racey host→local merge.
 *
 * @param {object|null} detail
 * @param {Iterable<string>|string[]|null|undefined} threadNodeIds
 * @returns {object|null}
 */
function dropReviewThreadsFromDetail(detail, threadNodeIds) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;

  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : '';
    if (tid && drop.has(tid)) {
      if (c.id != null) droppedCommentIds.push(String(c.id));
      return false;
    }
    return true;
  });
  const reviewThreads = prevTh.filter(
    (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  );

  const deleted = new Set(
    [
      ...(detail._deletedReviewCommentIds instanceof Set
        ? detail._deletedReviewCommentIds
        : Array.isArray(detail._deletedReviewCommentIds)
          ? detail._deletedReviewCommentIds
          : []),
      ...droppedCommentIds,
    ].map(String)
  );

  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  // Prefer shrinking total when we know threads vanished (never inflate)
  const nextTotal =
    Number.isFinite(Number(prevMeta.totalCount)) &&
    Number(prevMeta.totalCount) >= drop.size
      ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size)
      : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);

  const prevDroppedThreads =
    detail._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : Array.isArray(detail._droppedThreadNodeIds)
        ? detail._droppedThreadNodeIds
        : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));

  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: reviewComments.length,
    },
    reviewThreadsMeta: {
      ...prevMeta,
      totalCount: nextTotal,
      hiddenCount,
      loadedThreadCount,
      loadedCommentCount: reviewComments.length,
      newestThreadIds: filterIdList(prevMeta.newestThreadIds),
      oldestThreadIds: filterIdList(prevMeta.oldestThreadIds),
      hasMore: hiddenCount > 0,
      hasOlder: hiddenCount > 0 && Boolean(prevMeta.hasOlder),
      hasNewerFromOldest:
        hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest),
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads,
  };
}

/**
 * Initial dual-window load: last:100 first, then start:20 only when total ≥ 100.
 * Small PRs (total < 100) load a single last window covering everything.
 */
async function fetchPullReviewThreadsBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  if (!token) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta(),
    };
  }
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_API_MAX
  );
  const startPageSize = Math.min(
    20,
    Number(opts.startPageSize) || 20
  );
  // Last (newest) first
  const newest = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    { direction: 'newest', cursor: null, pageSize: lastPageSize },
    fetchImpl,
    token,
    ctx
  );
  const totalCount = Number(newest.totalCount) || newest.threads.length;
  let oldest = null;
  // total < 100 → last page already covers all; skip start window
  if (totalCount >= REVIEW_THREADS_API_MAX && newest.hasPreviousPage) {
    try {
      oldest = await fetchReviewThreadsPage(
        owner,
        repo,
        pullNumber,
        {
          direction: 'oldest',
          cursor: null,
          pageSize: startPageSize,
        },
        fetchImpl,
        token,
        ctx
      );
    } catch {
      oldest = null;
    }
  }

  const threads = [...(newest.threads || [])];
  const comments = [...(newest.comments || [])];
  const newestIds = newest.threads.map((t) => t.threadNodeId).filter(Boolean);
  const oldestIds = [];
  if (oldest) {
    for (const t of oldest.threads || []) {
      if (!newestIds.includes(t.threadNodeId)) {
        threads.push(t);
        oldestIds.push(t.threadNodeId);
      }
    }
    for (const c of oldest.comments || []) {
      if (!comments.some((x) => String(x.id) === String(c.id))) comments.push(c);
    }
  }

  const loaded = threads.length;
  const hiddenCount = Math.max(0, totalCount - loaded);
  const meta = {
    totalCount,
    hiddenCount,
    loadedThreadCount: loaded,
    loadedCommentCount: comments.length,
    pagesLoaded: 1 + (oldest ? 1 : 0),
    // Newest window cursors (expand older with before: startCursor)
    newestStartCursor: newest.startCursor || null,
    newestEndCursor: newest.endCursor || null,
    hasOlder: Boolean(newest.hasPreviousPage),
    // Oldest window cursors (expand newer with after: endCursor)
    oldestStartCursor: oldest?.startCursor || null,
    oldestEndCursor: oldest?.endCursor || null,
    hasNewerFromOldest: Boolean(oldest?.hasNextPage),
    newestThreadIds: newestIds,
    oldestThreadIds: oldestIds,
    hasMore: hiddenCount > 0,
    endCursor: newest.startCursor || null, // legacy: load-more-older
  };

  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: newest.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta,
  };
}

function emptyReviewThreadsMeta() {
  return {
    totalCount: 0,
    hiddenCount: 0,
    loadedThreadCount: 0,
    loadedCommentCount: 0,
    pagesLoaded: 0,
    newestStartCursor: null,
    newestEndCursor: null,
    hasOlder: false,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: false,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: false,
    endCursor: null,
  };
}

/**
 * Merge a dual-window page (or bulk refresh) into detail.reviewThreadsMeta + comments.
 * @param {'older'|'newer'|'newest'|'oldest'|'refresh'} direction
 *   - refresh: update thread/comment bodies only; keep dual-window cursors/id sets
 */
function mergeReviewThreadsPageIntoDetail(detail, page, direction = 'older') {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || 'older');
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

  // Explicit missing list from nodes(ids:) bulk fetch (remote-deleted threads)
  const explicitMissing = Array.isArray(page?.missingThreadIds)
    ? page.missingThreadIds.map(String).filter(Boolean)
    : [];
  // Or derive: requested − returned
  const requested = Array.isArray(page?.requestedThreadIds)
    ? page.requestedThreadIds.map(String).filter(Boolean)
    : [];
  const returnedIds = new Set(
    (page?.threads || [])
      .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
      .filter(Boolean)
  );
  const derivedMissing =
    requested.length > 0
      ? requested.filter((id) => !returnedIds.has(id))
      : [];
  const missingIds = [
    ...new Set([...explicitMissing, ...derivedMissing]),
  ];

  // refresh/ids: replace comments for updated threads so new replies land and deleted ones drop
  let baseRc = prevRc;
  if ((dir === 'refresh' || dir === 'ids') && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || [])
        .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
        .filter(Boolean)
    );
    if (refreshed.size) {
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
    }
  }
  const reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  // When GraphQL thread meta updates resolved, stamp onto all comments in those threads
  const resolvedByThread = new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedComments =
    resolvedByThread.size === 0
      ? reviewComments
      : reviewComments.map((c) => {
          if (!c?.threadNodeId) return c;
          const key = String(c.threadNodeId);
          if (!resolvedByThread.has(key)) return c;
          return { ...c, resolved: resolvedByThread.get(key) };
        });

  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== 'undefined')
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      thById.set(String(t.threadNodeId), {
        ...(thById.get(String(t.threadNodeId)) || {}),
        ...t,
      });
    }
  }
  const reviewThreads = [...thById.values()];

  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  let oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || [])
    .map((t) => t.threadNodeId)
    .filter(Boolean)
    .map(String);

  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;

  if (dir === 'refresh' || dir === 'ids') {
    // Bulk / targeted revalidate — preserve dual-window pagination state
  } else if (dir === 'newest' || dir === 'older') {
    for (const id of pageIds) newestIds.add(id);
    // Expanding older moves the "start" of newest window further back
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === 'newest' && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    // oldest | newer — expand oldest window toward the middle
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === 'oldest' && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }

  // Windows meet when no hidden left or cursors exhausted both ways
  const totalCount =
    typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);

  // Drop ids from oldest that are now in newest (overlap)
  for (const id of newestIds) oldestIds.delete(id);

  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded:
      dir === 'refresh' || dir === 'ids'
        ? Number(prevMeta.pagesLoaded) || 0
        : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: hiddenCount > 0,
    endCursor: newestStartCursor,
  };

  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore,
    },
    reviewThreadsMeta: meta,
  };

  // Remote-deleted threads: GraphQL nodes(ids:) returns null — strip local zombies
  // so revalidate does not keep re-requesting dead PRRT ids forever.
  if ((dir === 'refresh' || dir === 'ids') && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}

/**
 * Fetch PR review threads (ids + isResolved) for resolve UI / legacy callers.
 * Returns [] on failure so REST detail still loads.
 */
