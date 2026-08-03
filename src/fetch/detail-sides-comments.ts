/** Detail sides: comments/timeline/reviews/sidebar */
import {
  apiGraphql,
  apiJson,
  apiJsonWithLink,
  decodeBase64Utf8,
  fetchRestCollectionAll,
  githubRestUrl,
  normalizeApiCtx,
  parseLinkNextUrl,
  parseLinkRelPage,
  sleepMs,
  timedFetch,
} from './http';
import {
  commentsPageHelpers,
  mapAndAnnotateFiles,
  mapIssueComment,
  mapPrCommitRow,
  mapReviewComment,
} from './mappers';
import {
  fetchPrCommits,
  fetchAllPrCommits,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchAllPrFiles,
  fetchPrFiles,
} from './detail-sides-files';
import { fetchReactableReactionGroups } from './reactions';

export async function fetchPrIssueComments(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const empty = {
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
  if (!o || !r || !Number.isFinite(n)) return empty;
  // Do not swallow network/auth errors into an empty page. Host failSide
  // must leave comments unsettled so IDB cannot persist authoritative empty
  // (seen on callabo-server#2424 — issue comments permanently omitted).
  return await fetchPrCommentsPage(
    o,
    r,
    n,
    'issue',
    { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
    fetchImpl,
    token,
    ctx
  );
}

/**
 * Issue timeline system events (title rename, draft/ready, labels, assignees, …).
 * GET /repos/{owner}/{repo}/issues/{number}/events — paginated, max 100/page.
 * Skips pure noise (subscribed/unsubscribed/mentioned); comments/reviews live elsewhere.
 * @returns {Promise<Array>}
 */
export async function fetchPrTimelineEvents(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];

  /** Events already covered by comments/reviews/aside, or pure noise. */
  const SKIP = new Set([
    'subscribed',
    'unsubscribed',
    'mentioned',
    'comment_deleted',
  ]);

  function mapEvent(raw: any) {
    if (!raw || typeof raw !== 'object') return null;
    const event = String(raw.event || '').trim();
    if (!event || SKIP.has(event)) return null;
    const actor = raw.actor || raw.user || null;
    const login = actor?.login || '';
    const label = raw.label
      ? {
          name: String(raw.label.name || ''),
          color: String(raw.label.color || ''),
          description: String(raw.label.description || ''),
        }
      : null;
    const assigneeLogin =
      typeof raw.assignee === 'string'
        ? raw.assignee
        : raw.assignee?.login || null;
    const requestedReviewer =
      raw.requested_reviewer?.login ||
      (typeof raw.requested_reviewer === 'string'
        ? raw.requested_reviewer
        : null);
    const requestedTeam =
      raw.requested_team?.slug ||
      raw.requested_team?.name ||
      (typeof raw.requested_team === 'string' ? raw.requested_team : null);
    const milestone = raw.milestone
      ? {
          number:
            raw.milestone.number != null ? Number(raw.milestone.number) : null,
          title: String(raw.milestone.title || ''),
        }
      : null;
    const rename =
      raw.rename && typeof raw.rename === 'object'
        ? {
            from: String(raw.rename.from || ''),
            to: String(raw.rename.to || ''),
          }
        : null;
    return {
      id: raw.id != null ? raw.id : null,
      event,
      actor: login,
      avatarUrl: actor?.avatar_url || actor?.avatarUrl || '',
      at: raw.created_at || raw.createdAt || null,
      rename,
      label: label && label.name ? label : null,
      assignee: assigneeLogin || null,
      requestedReviewer: requestedReviewer || null,
      requestedTeam: requestedTeam || null,
      milestone: milestone && (milestone.title || milestone.number != null)
        ? milestone
        : null,
      lockReason: raw.lock_reason || raw.lockReason || null,
      commitId: raw.commit_id || raw.commitId || null,
      dismissReason: raw.dismissed_review?.dismissal_message || null,
      reviewState: raw.dismissed_review?.state || raw.state || null,
    };
  }

  const out = [];
  try {
    const perPage = 100;
    // Cap pages so a very noisy issue cannot hang open (1000 events max).
    // Events API is ascending (oldest first). Prefer the *newest* pages so
    // labeled/milestoned writes land in conversation after meta refresh.
    const maxPages = 10;
    const pageUrl = (page: number) =>
      githubRestUrl(
        `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/${n}/events?per_page=${perPage}&page=${page}`,
        ctx
      );

    const first = await apiJsonWithLink(pageUrl(1), fetchImpl, token);
    const firstBatch = Array.isArray(first.data) ? first.data : [];
    const lastPage =
      parseLinkRelPage(first.link, 'last') ||
      (firstBatch.length < perPage ? 1 : null);

    // When Link has no last but page 1 is full, walk forward (legacy path).
    if (lastPage == null) {
      for (const raw of firstBatch) {
        const mapped = mapEvent(raw);
        if (mapped) out.push(mapped);
      }
      let page = 2;
      let link = first.link;
      while (page <= maxPages) {
        const next = parseLinkNextUrl(link);
        if (!next) break;
        const { data, link: nextLink } = await apiJsonWithLink(
          pageUrl(page),
          fetchImpl,
          token
        );
        link = nextLink;
        const batch = Array.isArray(data) ? data : [];
        for (const raw of batch) {
          const mapped = mapEvent(raw);
          if (mapped) out.push(mapped);
        }
        if (batch.length < perPage) break;
        page += 1;
      }
      return out;
    }

    const endPage = Math.max(1, Number(lastPage) || 1);
    const startPage = Math.max(1, endPage - maxPages + 1);
    // Reuse page-1 body when the newest window still includes it.
    const cachedPage1 = startPage === 1 ? firstBatch : null;

    for (let page = startPage; page <= endPage; page++) {
      let batch: any[];
      if (page === 1 && cachedPage1) {
        batch = cachedPage1;
      } else {
        const { data } = await apiJsonWithLink(pageUrl(page), fetchImpl, token);
        batch = Array.isArray(data) ? data : [];
      }
      for (const raw of batch) {
        const mapped = mapEvent(raw);
        if (mapped) out.push(mapped);
      }
    }
    return out;
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
}

/**
 * Submitted PR reviews list. Independent of fetchPrDetail.
 * @returns {Promise<Array>}
 */
export async function fetchPrReviews(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const data = await apiJson(
      githubRestUrl(
        `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`
      , ctx),
      fetchImpl,
      token
    );
    return (Array.isArray(data) ? data : []).map((rev) => ({
      id: rev.id,
      author: rev.user?.login || '',
      avatarUrl: rev.user?.avatar_url || '',
      type: rev.user?.type || '',
      isBot:
        String(rev.user?.type || '').toLowerCase() === 'bot' ||
        /\[bot\]$/i.test(String(rev.user?.login || '')),
      state: rev.state || '',
      body: rev.body || '',
      submittedAt: rev.submitted_at,
    }));
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
}

export const COMMENT_PAGE_SIZE = 50;

export async function fetchPrCommentsPage(owner: any, repo: any, pullNumber: any, kind: any, opts: any, fetchImpl: any, token: any, ctx: any = null) {
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
  // @ts-expect-error classic fetch dynamic shapes
      listOpts.sort != null
  // @ts-expect-error classic fetch dynamic shapes
        ? listOpts.sort
        : kind === 'review'
          ? 'created'
          : undefined;
    const direction =
  // @ts-expect-error classic fetch dynamic shapes
      listOpts.direction != null
  // @ts-expect-error classic fetch dynamic shapes
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
    // Enrich viewerHasReacted + reactor logins via GraphQL when nodeIds exist.
    // Soft-fail: missing reactions must never drop the comment bodies themselves.
    if (kind === 'issue' && token && items.length) {
      const ids = items.map((c) => c?.nodeId).filter(Boolean);
      if (ids.length) {
        try {
          const byId = await fetchReactableReactionGroups(
            ids,
            fetchImpl,
            token,
            ctx
          );
          for (const c of items) {
            if (!c?.nodeId) continue;
            const groups = byId.get(String(c.nodeId));
            if (groups && groups.length) c.reactions = groups;
          }
        } catch (err) {
          if (
            err?.name === 'AbortError' ||
            /aborted|AbortError/i.test(String(err?.message || ''))
          ) {
            throw err;
          }
          // keep REST reaction summary from mapIssueComment
        }
      }
    }
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

  // @ts-expect-error classic fetch dynamic shapes
export async function fetchPrSidebarMeta(owner: any, repo: any, number: any, fetchImpl: any, token: any, ctx: any = null) {
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
export async function fetchIssueOrPrSummaries(owner: any, repo: any, numbers: any, fetchImpl: any, token: any, ctx: any = null) {
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

// ── GraphQL primary-point cost observation (e2e / debugging) ───────────
export async function fetchConflictFilePaths(owner: any, repo: any, baseRef: any, headSha: any, fetchImpl: any, token: any, ctx: any = null) {
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
 * Extract repository merge-method toggles from a REST Repository object.
 * Returns null when the payload has none of the allow_* fields.
 * @returns {{ allowMergeCommit: boolean|null, allowSquashMerge: boolean|null, allowRebaseMerge: boolean|null } | null}
 */
export async function resolvePrMergeability(
  pr,
  base,
  pullNumber,
  fetchImpl,
  token,
  timings,
  /** @type {{ owner?: string, repo?: string, apiCtx?: object }} */
  meta: any = {}
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
  // Attach behind_by so the modal can hide "Update branch" when already current.
  // - behind → known out-of-date (no extra network)
  // - clean / unstable / has_hooks → current (no update)
  // - blocked / dirty / unknown → compare base...head for behind_by only
  try {
    if (state === 'behind') {
      out = { ...out, behind_by: Math.max(1, Number(out.behind_by) || 1) };
    } else if (state === 'clean' || state === 'unstable' || state === 'has_hooks') {
      out = { ...out, behind_by: 0 };
    } else {
      const baseOwner =
        out.base?.repo?.owner?.login ||
        String(meta.owner || '').trim() ||
        '';
      const baseRepo =
        out.base?.repo?.name || String(meta.repo || '').trim() || '';
      const baseRef = String(out.base?.ref || '').trim();
      const headSha = String(out.head?.sha || '').trim();
      if (baseOwner && baseRepo && baseRef && headSha) {
        const cmpUrl = githubRestUrl(
          `/repos/${encodeURIComponent(baseOwner)}/${encodeURIComponent(baseRepo)}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headSha)}`,
          apiCtx
        );
        const cmp = await timedFetch(
          timings,
          'branchBehind',
          apiJson(cmpUrl, fetchImpl, token),
          (c) =>
            `(behind=${c?.behind_by ?? '?'} status=${c?.status || '?'})`
        );
        if (cmp && typeof cmp === 'object' && cmp.behind_by != null) {
          out = { ...out, behind_by: Number(cmp.behind_by) || 0 };
        }
      }
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    console.log(
      `[pr-plus] resolvePrMergeability behind_by: soft-fail ${err?.message || err}`
    );
  }

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

export async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options: any = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const b = String(base || '').trim();
  const h = String(head || '').trim();
  if (!o || !r || !b || !h) {
    throw new Error('owner, repo, base, and head are required for compare');
  }
  const gitattributesText = String(options.gitattributesText || '');
  const url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`, ctx);
  const data = await apiJson(url, fetchImpl, token);
  const files = mapAndAnnotateFiles(data?.files || [], gitattributesText);
  return {
    files,
    base: b,
    head: h,
    status: data?.status || null,
    aheadBy: data?.ahead_by ?? null,
    behindBy: data?.behind_by ?? null,
    totalCommits: data?.total_commits ?? (Array.isArray(data?.commits) ? data.commits.length : null),
    truncated: Boolean(data?.files && data.files.length >= 300),
  };
}

