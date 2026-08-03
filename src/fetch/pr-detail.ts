/**
 * Fetch feature unit: pr-detail
 */
import {
  COMMENT_PAGE_SIZE,
  fetchPrCommentsPage,
  fetchPrReviews,
  resolvePrMergeability,
} from './detail-sides-comments';
import {
  fetchPrDevelopment,
  fetchPrFiles,
} from './detail-sides-files';
import {
  apiJson,
  fetchNowMs,
  githubRestUrl,
  logParallelRestSummary,
  normalizeApiCtx,
  timedFetch,
} from './http';
import {
  extractRepoMergeMethodFlags,
  extractViewerCanMergeAsAdmin,
  mapRestReactions,
} from './mappers';
import {
  fetchViewerPendingReviewBundle,
  mergePendingReviewComments,
} from './pending-review';
import {
  fetchRepoAutolinks,
  matchAutolinksInText,
  prMatchText,
} from './pulls';
import { fetchReactableReactionGroups } from './reactions';
import {
  emptyReviewThreadsMeta,
  fetchPullReviewThreadsBundle,
} from './review-threads-bulk';
import {
  fetchReviewThreadsPage,
} from './review-threads-page';
import {
  fetchPullRequestSubscription,
  fetchViewerLogin,
} from './viewer';

export async function fetchPrDetail(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token = null,
  opts: any = {}
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

  // Lean core: pull + issue identity + viewer + autolinks.
  // Issue REST is fetched in parallel with pull — pulls occasionally omit or
  // lag milestone/labels after modal writes; hard/soft reopen must match `gh api`.
  // files / issue comments / reviews / commits / checks / development are
  // independent host fetches (do not block header + description paint).
  const PARALLEL_REST_KEYS = ['pull', 'issue', 'viewerLogin', 'autolinks'];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  // cache: 'no-store' + URL bust: hard reopen after modal milestone must not
  // paint a stale HTTP cache. Do NOT send Cache-Control / Pragma — GitHub API
  // CORS rejects them (preflight → Failed to fetch from extension origin).
  const bust = () =>
    `_prp=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const noCache = {
    cache: 'no-store' as RequestCache,
  };
  let [pr, issue, viewerLogin, autolinks] = await Promise.all([
    timedFetch(
      timings,
      'pull',
      // Bust intermediary caches so hard-reopen after modal meta writes sees
      // the same milestone/title as authenticated `gh api` (e2e MB3/MB7).
      apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
      null,
      batchOpt
    ),
    token
      ? timedFetch(
          timings,
          'issue',
          apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache).catch(
            (err) => {
              if (
                err?.name === 'AbortError' ||
                /aborted|AbortError/i.test(String(err?.message || ''))
              ) {
                throw err;
              }
              return null;
            }
          ),
          null,
          batchOpt
        )
      : Promise.resolve(null),
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
  // Prefer issue REST for people-meta identity when present (milestone/labels/
  // assignees). Pull can lag or omit milestone after modal set (soft/hard reopen).
  if (pr && issue && typeof issue === 'object') {
    if (issue.milestone) {
      pr = { ...pr, milestone: issue.milestone };
    }
    // Labels/assignees: prefer issue arrays when pull omitted them.
    if (
      Array.isArray(issue.labels) &&
      (!Array.isArray(pr.labels) || pr.labels.length === 0) &&
      issue.labels.length > 0
    ) {
      pr = { ...pr, labels: issue.labels };
    }
    if (
      Array.isArray(issue.assignees) &&
      (!Array.isArray(pr.assignees) || pr.assignees.length === 0) &&
      issue.assignees.length > 0
    ) {
      pr = { ...pr, assignees: issue.assignees };
    }
  }
  // One immediate re-GET when parallel path missed milestone (soft-fail / race).
  // Further host-side polls happen only when openModal expects a board (authority).
  // Always no-store + bust so hard reopen cannot stick on a pre-write HTTP cache.
  if (pr && !pr.milestone && token) {
    try {
      const issueRetry = await timedFetch(
        timings,
        'issueMilestoneRetry',
        apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache),
        null,
        batchOpt
      );
      if (issueRetry?.milestone) {
        pr = { ...pr, milestone: issueRetry.milestone };
        console.log(
          `[pr-plus] fetchPrDetail issue milestone retry: #${issueRetry.milestone.number || '?'} ${issueRetry.milestone.title || ''}`
        );
      } else {
        const pullRetry = await timedFetch(
          timings,
          'pullMilestoneRetry',
          apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
          null,
          batchOpt
        );
        if (pullRetry?.milestone) {
          pr = { ...pr, milestone: pullRetry.milestone };
          console.log(
            `[pr-plus] fetchPrDetail pull milestone retry: #${pullRetry.milestone.number || '?'} ${pullRetry.milestone.title || ''}`
          );
        }
      }
    } catch (err: any) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      /* soft */
    }
  }
  const parallelWall = fetchNowMs() - tParallel0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.coreParallelWall = Math.round(parallelWall);
  logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall);
  // @ts-expect-error classic fetch dynamic shapes
  timings.files = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.issueComments = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.reviews = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.commits = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.commitStatus = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.checkRuns = 0;
  // @ts-expect-error classic fetch dynamic shapes
  timings.sidebarMeta = 0;
  // @ts-expect-error classic fetch dynamic shapes
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

  // Repo Settings → Pull Requests merge method toggles (drive merge-box menu).
  // Prefer nested base.repo from the PR payload; fall back to GET /repos when missing.
  // Also resolve viewer admin (bypass-rules); nested PR repo objects usually omit permissions.
  let repoMergeFlags =
    extractRepoMergeMethodFlags(pr?.base?.repo) ||
    extractRepoMergeMethodFlags(pr?.head?.repo) ||
    null;
  let viewerCanMergeAsAdmin =
    extractViewerCanMergeAsAdmin(pr?.base?.repo) ??
    extractViewerCanMergeAsAdmin(pr?.head?.repo) ??
    null;
  if (!repoMergeFlags || viewerCanMergeAsAdmin == null) {
    try {
      const repoJson = await timedFetch(
        timings,
        'repoMergeSettings',
        apiJson(base, fetchImpl, token),
        (r) =>
          `(merge=${r?.allow_merge_commit} squash=${r?.allow_squash_merge} rebase=${r?.allow_rebase_merge} admin=${r?.permissions?.admin})`
      );
      if (!repoMergeFlags) {
        repoMergeFlags = extractRepoMergeMethodFlags(repoJson);
      }
      if (viewerCanMergeAsAdmin == null) {
        viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(repoJson);
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      // @ts-expect-error classic fetch dynamic shapes
      timings.repoMergeSettings = timings.repoMergeSettings || 0;
      console.log(
        `[pr-plus] fetchPrDetail repoMergeSettings: soft-fail ${err?.message || err}`
      );
      if (!repoMergeFlags) repoMergeFlags = null;
    }
  } else {
    // @ts-expect-error classic fetch dynamic shapes
    timings.repoMergeSettings = 0;
  }

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
  // @ts-expect-error classic fetch dynamic shapes
    timings.reviewThreads = 0;
    console.log(
      `[pr-plus] fetchPrDetail reviewThreads: skipped (token=${Boolean(
        token
      )} maxPages=${threadsMaxPages})`
    );
  }

  // REST fallback when GraphQL is rate-limited or returns empty. Diff inline
  // threads group from reviewComments; without this, ⌥J/K nav has zero threads
  // after GraphQL exhaustion while REST core quota remains.
  if (
    token &&
    threadsMaxPages > 0 &&
    !(Array.isArray(reviewThreadBundle?.comments) && reviewThreadBundle.comments.length > 0)
  ) {
    try {
      const restPage = await timedFetch(
        timings,
        'reviewThreadsRest',
        fetchPrCommentsPage(
          owner,
          repo,
          n,
          'review',
          { page: 1, perPage: 100, preferNewest: true },
          fetchImpl,
          token,
          ctx
        ).catch((err) => {
          if (
            err?.name === 'AbortError' ||
            /aborted|AbortError/i.test(String(err?.message || ''))
          ) {
            throw err;
          }
          return null;
        }),
        (p) => `(${(p?.items || []).length} rest review comments)`
      );
      const items = Array.isArray(restPage?.items) ? restPage.items : [];
      if (items.length) {
        const byId = new Map();
        for (const c of items) {
          if (c && c.id != null) byId.set(String(c.id), c);
        }
        const roots = items.filter((c) => {
          if (!c || c.id == null) return false;
          const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
          return parent == null || !byId.has(String(parent));
        });
        const threads = roots.map((r) => {
          const replyIds = items
            .filter(
              (c) =>
                c &&
                String(c.inReplyToId ?? c.in_reply_to_id ?? '') === String(r.id)
            )
            .map((c) => c.id);
          const threadNodeId = r.nodeId || `rest-thread-${r.id}`;
          const commentIds = [r.id, ...replyIds];
          for (const cid of commentIds) {
            const row = byId.get(String(cid));
            if (row) row.threadNodeId = threadNodeId;
          }
          return {
            threadNodeId,
            resolved: false,
            outdated: Boolean(r.outdated),
            path: r.path || '',
            line: r.line ?? r.originalLine ?? null,
            startLine: r.startLine ?? null,
            side: r.side || 'RIGHT',
            commentIds,
          };
        });
        reviewThreadBundle = {
          threads,
          comments: items,
          hasMore: Boolean(restPage?.meta?.hasMore ?? restPage?.hasMore),
          endCursor: null,
          pageCount: 1,
          totalCount: items.length,
        };
        console.log(
          `[pr-plus] fetchPrDetail reviewThreads: REST fallback ` +
            `${threads.length} threads, ${items.length} comments`
        );
      }
    } catch (err: any) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      console.log(
        `[pr-plus] fetchPrDetail reviewThreads REST fallback soft-fail: ${
          err?.message || err
        }`
      );
    }
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
  // @ts-expect-error classic fetch dynamic shapes
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
  // @ts-expect-error classic fetch dynamic shapes
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta
  // @ts-expect-error classic fetch dynamic shapes
    ? { ...reviewThreadBundle.reviewThreadsMeta }
    : {
        ...emptyReviewThreadsMeta(),
        hasMore: Boolean(reviewThreadBundle?.hasMore),
        endCursor: reviewThreadBundle?.endCursor || null,
        loadedThreadCount: (reviewThreads || []).length,
        loadedCommentCount: (reviewThreadBundle?.comments || []).length,
        pagesLoaded: reviewThreadBundle?.pageCount || (threadsMaxPages > 0 ? 1 : 0),
  // @ts-expect-error classic fetch dynamic shapes
        totalCount: Number(reviewThreadBundle?.totalCount) || (reviewThreads || []).length,
        hiddenCount: Math.max(
          0,
  // @ts-expect-error classic fetch dynamic shapes
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
  // @ts-expect-error classic fetch dynamic shapes
  timings.mapAnnotateFiles = 0;

  const subscribed =
    subscription && typeof subscription.subscribed === 'boolean'
      ? Boolean(subscription.subscribed)
      : null;
  // subscription.viewerSubscription kept for debugging / future UI (IGNORED)
  const mergeStateStatus =
    subscription && subscription.mergeStateStatus
      ? String(subscription.mergeStateStatus)
      : null;

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

  // @ts-expect-error classic fetch dynamic shapes
  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
  // @ts-expect-error classic fetch dynamic shapes
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

  // PR body reactions (issue reactions on the PR number)
  let bodyReactions = mapRestReactions(pr.reactions);
  if (pr.node_id && token) {
    try {
      const byId = await fetchReactableReactionGroups(
        [pr.node_id],
        fetchImpl,
        token,
        ctx
      );
      const enriched = byId.get(String(pr.node_id));
      if (enriched && enriched.length) bodyReactions = enriched;
    } catch {
      /* keep REST summary */
    }
  }

  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || '',
    bodyReactions,
    // Merged PRs are closed on GitHub; never leave state=open with merged flag.
    state:
      Boolean(pr.merged) || Boolean(pr.merged_at)
        ? pr.state === 'open'
          ? 'closed'
          : pr.state || 'closed'
        : pr.state,
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
    // merged_at alone is enough when `merged` is omitted on slim payloads.
    merged: Boolean(pr.merged) || Boolean(pr.merged_at),
    mergedAt: pr.merged_at || null,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state || null,
    /** GraphQL mergeStateStatus when available (BEHIND / CLEAN / BLOCKED / …). */
    mergeStateStatus,
    /**
     * How many base commits the head is behind (0 = up to date).
     * Used to show "Update branch" only when GitHub can actually update.
     */
    behindBy:
      pr.behind_by != null && Number.isFinite(Number(pr.behind_by))
        ? Number(pr.behind_by)
        : null,
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles) ? pr._conflictFiles : [],
    rebaseable: pr.rebaseable ?? null,
    /**
     * Repository Settings → Pull Requests merge methods.
     * null when unknown (token/public payload omitted flags).
     */
    allowMergeCommit: repoMergeFlags ? repoMergeFlags.allowMergeCommit : null,
    allowSquashMerge: repoMergeFlags ? repoMergeFlags.allowSquashMerge : null,
    allowRebaseMerge: repoMergeFlags ? repoMergeFlags.allowRebaseMerge : null,
    /**
     * True when REST repo.permissions.admin — enables GitHub-style bypass-rules
     * opt-in on policy-blocked PRs. false/null → no bypass checkbox.
     */
    viewerCanMergeAsAdmin:
      viewerCanMergeAsAdmin === true
        ? true
        : viewerCanMergeAsAdmin === false
          ? false
          : null,
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
    // Official REST PR.review_comments count (for empty short-circuit / paging)
    reviewCommentsCount:
      pr.review_comments != null && Number.isFinite(Number(pr.review_comments))
        ? Number(pr.review_comments)
        : null,
    // REST/GraphQL threads window — more via fetchReviewThreadsPage
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

