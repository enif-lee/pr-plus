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

/**
 * Issue REST is the people-meta identity for labels/assignees (and a non-null
 * milestone). Pull can lag a non-empty stale list after an external clear or
 * replacement — only filling when pull was empty left those edits stuck.
 */
export function mergeIssueIdentityIntoPull(pr: any, issue: any): any {
  if (!pr || !issue || typeof issue !== 'object') return pr;
  let next = pr;
  if (issue.milestone) {
    next = { ...next, milestone: issue.milestone };
  }
  if (Array.isArray(issue.labels)) {
    next = { ...next, labels: issue.labels };
  }
  if (Array.isArray(issue.assignees)) {
    next = { ...next, assignees: issue.assignees };
  }
  return next;
}

const stage1CoalesceMap = new Map<
  string,
  {
    promise: Promise<[any, any, any, any]>;
    timings: Record<string, any>;
    timer: any;
  }
>();

export async function fetchPrDetail(
  owner: any,
  repo: any,
  pullNumber: any,
  fetchImpl: any,
  token: any = null,
  opts: any = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const base = githubRestUrl(`/repos/${owner}/${repo}`, ctx);
  const n = Number(pullNumber);
  const fastIdentityOnly = Boolean(opts?.fastIdentityOnly);
  const retryMilestone = Boolean(opts?.retryMilestone);
  const coalesceKey =
    opts?.coalesceKey && !retryMilestone ? String(opts.coalesceKey) : '';
  const skipReviewThreads = fastIdentityOnly || Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads
    ? 0
    : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  /** @type {Record<string, number|string>} */
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n}` +
      ` skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}` +
      (fastIdentityOnly ? ' fastIdentityOnly=true' : '')
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
  const runStage1 = (tBag: Record<string, any>) =>
    Promise.all([
      timedFetch(
        tBag,
        'pull',
        // Bust intermediary caches so hard-reopen after modal meta writes sees
        // the same milestone/title as authenticated `gh api` (e2e MB3/MB7).
        apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
        null,
        batchOpt
      ),
      token
        ? timedFetch(
            tBag,
            'issue',
            apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache).catch(
              (err): any => {
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
        tBag,
        'viewerLogin',
        fetchViewerLogin(fetchImpl, token, ctx),
        null,
        batchOpt
      ),
      timedFetch(
        tBag,
        'autolinks',
        fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx),
        (r: any) => `(${Array.isArray(r) ? r.length : 0} links)`,
        batchOpt
      ),
    ]);

  let stage1Promise: Promise<[any, any, any, any]>;
  let stage1Timings: Record<string, any> = timings;
  if (coalesceKey && stage1CoalesceMap.has(coalesceKey)) {
    const entry = stage1CoalesceMap.get(coalesceKey)!;
    stage1Promise = entry.promise;
    stage1Timings = entry.timings;
  } else if (coalesceKey) {
    stage1Timings = {};
    const p = runStage1(stage1Timings);
    const timer = setTimeout(() => {
      stage1CoalesceMap.delete(coalesceKey);
    }, 5000);
    try {
      if (timer && typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    } catch {
      /* ignore */
    }
    stage1CoalesceMap.set(coalesceKey, {
      promise: p,
      timings: stage1Timings,
      timer,
    });
    p.catch(() => {
      clearTimeout(timer);
      stage1CoalesceMap.delete(coalesceKey);
    });
    stage1Promise = p;
  } else {
    stage1Promise = runStage1(timings);
  }

  let [pr, issue, viewerLogin, autolinks] = await stage1Promise;
  if (stage1Timings !== timings) {
    Object.assign(timings, stage1Timings);
  }
  // Prefer issue REST for people-meta identity when present (milestone/labels/
  // assignees). Pull can lag or omit milestone after modal set (soft/hard reopen).
  if (pr && issue && typeof issue === 'object') {
    pr = mergeIssueIdentityIntoPull(pr, issue);
  }
  // Only re-GET milestone when parallel issue request soft-failed (issue == null)
  // or caller explicitly requested retryMilestone (background recovery poll).
  // Avoids 2 extra serial REST round-trips on every milestone-less PR open.
  if (pr && !pr.milestone && token && (issue == null || retryMilestone)) {
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
  const commentsPage = {
    items: [] as any[],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null as any,
      order: 'from-end',
      loadedCount: 0,
    },
  };
  const reviews: any[] = [];
  const comments = commentsPage?.items || [];

  let repoMergeFlags =
    extractRepoMergeMethodFlags(pr?.base?.repo) ||
    extractRepoMergeMethodFlags(pr?.head?.repo) ||
    null;
  let viewerCanMergeAsAdmin =
    extractViewerCanMergeAsAdmin(pr?.base?.repo) ??
    extractViewerCanMergeAsAdmin(pr?.head?.repo) ??
    null;
  let subscription: any = null;
  let reviewThreadBundle = {
    threads: [] as any[],
    comments: [] as any[],
    hasMore: false,
    endCursor: null as any,
    pageCount: 0,
  };
  let pendingBundle = { comments: [] as any[], review: null as any };
  let bodyReactions = mapRestReactions(pr.reactions);

  if (!fastIdentityOnly) {
    // Run all secondary core enrichments in parallel rather than 6 serial waves:
    // 1. resolvePrMergeability (includes 350ms poll when mergeable is null/unknown)
    // 2. repoMergeSettings (GET /repos/{owner}/{repo} for admin/merge method flags)
    // 3. subscription (GraphQL viewerSubscription + mergeStateStatus)
    // 4. reviewThreads (when threadsMaxPages > 0)
    // 5. pendingReview (viewer's PENDING review bundle)
    // 6. bodyReactions (GraphQL reactionGroups when total_count !== 0)
    const mergeabilityP = resolvePrMergeability(
      pr,
      base,
      n,
      fetchImpl,
      token,
      timings,
      {
        owner,
        repo,
        apiCtx: ctx,
      }
    );

    const repoSettingsP = (async () => {
      if (!repoMergeFlags || viewerCanMergeAsAdmin == null) {
        try {
          const repoJson = await timedFetch(
            timings,
            'repoMergeSettings',
            apiJson(base, fetchImpl, token),
            (r: any) =>
              `(merge=${r?.allow_merge_commit} squash=${r?.allow_squash_merge} rebase=${r?.allow_rebase_merge} admin=${r?.permissions?.admin})`
          );
          if (!repoMergeFlags) {
            repoMergeFlags = extractRepoMergeMethodFlags(repoJson);
          }
          if (viewerCanMergeAsAdmin == null) {
            viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(repoJson);
          }
        } catch (err: any) {
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
    })();

    const subscriptionP = timedFetch(
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

    const reviewThreadsP = (async () => {
      if (token && threadsMaxPages > 0) {
        reviewThreadBundle = await timedFetch(
          timings,
          'reviewThreads',
          fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
            cursor: opts.threadsCursor || null,
            maxPages: threadsMaxPages,
            ctx,
          }).catch((err) => {
            if (
              err?.name === 'AbortError' ||
              /aborted|AbortError/i.test(String(err?.message || ''))
            ) {
              throw err;
            }
            return reviewThreadBundle;
          }),
          (b: any) =>
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

      if (
        token &&
        threadsMaxPages > 0 &&
        !(
          Array.isArray(reviewThreadBundle?.comments) &&
          reviewThreadBundle.comments.length > 0
        )
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
            ).catch((err): any => {
              if (
                err?.name === 'AbortError' ||
                /aborted|AbortError/i.test(String(err?.message || ''))
              ) {
                throw err;
              }
              return null;
            }),
            (p: any) => `(${(p?.items || []).length} rest review comments)`
          );
          const items = Array.isArray(restPage?.items) ? restPage.items : [];
          if (items.length) {
            const byId = new Map();
            for (const c of items) {
              if (c && c.id != null) byId.set(String(c.id), c);
            }
            const roots = items.filter((c: any) => {
              if (!c || c.id == null) return false;
              const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
              return parent == null || !byId.has(String(parent));
            });
            const threads = roots.map((r: any) => {
              const replyIds = items
                .filter(
                  (c: any) =>
                    c &&
                    String(c.inReplyToId ?? c.in_reply_to_id ?? '') ===
                      String(r.id)
                )
                .map((c: any) => c.id);
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
            } as any;
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
    })();

    const pendingReviewP = token
      ? timedFetch(
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
            if (
              err?.name === 'AbortError' ||
              /aborted|AbortError/i.test(String(err?.message || ''))
            ) {
              throw err;
            }
            return { comments: [] as any[], review: null as any };
          }),
          (b: any) => `(${(b?.comments || []).length} pending comments)`
        )
      : (() => {
          // @ts-expect-error classic fetch dynamic shapes
          timings.pendingReview = 0;
          console.log(
            '[pr-plus] fetchPrDetail pendingReview: skipped (no token)'
          );
          return Promise.resolve({ comments: [] as any[], review: null as any });
        })();

    const hasZeroBodyReactions =
      pr?.reactions &&
      typeof pr.reactions === 'object' &&
      pr.reactions.total_count !== undefined &&
      Number(pr.reactions.total_count) === 0;
    const bodyReactionsP = (async () => {
      if (pr?.node_id && token && !hasZeroBodyReactions) {
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
    })();

    const [resolvedPr, resolvedSub, resolvedPending] = await Promise.all([
      mergeabilityP,
      subscriptionP,
      pendingReviewP,
      repoSettingsP,
      reviewThreadsP,
      bodyReactionsP,
    ]);
    pr = resolvedPr;
    subscription = resolvedSub;
    pendingBundle = resolvedPending;
  }

  const reviewThreads = reviewThreadBundle?.threads || [];
  const pendingReviewComments = pendingBundle.comments || [];
  const reviewComments = mergePendingReviewComments(
    reviewThreadBundle?.comments || [],
    pendingReviewComments
  );
  const viewerPendingReview = fastIdentityOnly
    ? (undefined as any)
    : pendingBundle.review || null;
  const reviewCommentsMeta = {
    page: 1,
    perPage: (reviewThreadBundle?.comments || []).length || COMMENT_PAGE_SIZE,
    hasMore: Boolean(reviewThreadBundle?.hasMore),
    nextPage: null as any,
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
  const checks = { state: 'unknown', totalCount: 0, statuses: [] as any[], checkRuns: [] as any[] };
  const commits: any[] = [];
  let linkedIssues = [];
  const developmentIssues: any[] = [];
  const projects: any[] = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? (globalThis as any).PRModalPrEditApi : null;
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
  const filesOut: any[] = [];
  // @ts-expect-error classic fetch dynamic shapes
  timings.mapAnnotateFiles = 0;

  const subscribed = fastIdentityOnly
    ? (undefined as any)
    : subscription && typeof subscription.subscribed === 'boolean'
      ? Boolean(subscription.subscribed)
      : null;
  // subscription.viewerSubscription kept for debugging / future UI (IGNORED)
  const mergeStateStatus = fastIdentityOnly
    ? (undefined as any)
    : subscription && subscription.mergeStateStatus
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

  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || '',
    bodyReactions:
      fastIdentityOnly &&
      pr?.reactions &&
      Number(pr.reactions.total_count) > 0
        ? (undefined as any)
        : bodyReactions,
    _fastCore: fastIdentityOnly ? true : undefined,
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
        : fastIdentityOnly
          ? (undefined as any)
          : null,
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles)
      ? pr._conflictFiles
      : fastIdentityOnly
        ? (undefined as any)
        : [],
    rebaseable: pr.rebaseable ?? null,
    /**
     * Repository Settings → Pull Requests merge methods.
     * null when unknown (token/public payload omitted flags).
     */
    allowMergeCommit: repoMergeFlags
      ? repoMergeFlags.allowMergeCommit
      : fastIdentityOnly
        ? (undefined as any)
        : null,
    allowSquashMerge: repoMergeFlags
      ? repoMergeFlags.allowSquashMerge
      : fastIdentityOnly
        ? (undefined as any)
        : null,
    allowRebaseMerge: repoMergeFlags
      ? repoMergeFlags.allowRebaseMerge
      : fastIdentityOnly
        ? (undefined as any)
        : null,
    /**
     * True when REST repo.permissions.admin — enables GitHub-style bypass-rules
     * opt-in on policy-blocked PRs. false/null → no bypass checkbox.
     */
    viewerCanMergeAsAdmin:
      viewerCanMergeAsAdmin === true
        ? true
        : viewerCanMergeAsAdmin === false
          ? false
          : fastIdentityOnly
            ? (undefined as any)
            : null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    /** Total commits on the PR (REST field); may exceed first page of commits[]. */
    commitsCount: pr.commits != null ? Number(pr.commits) : null,
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((l: any) => ({
          name: l.name || '',
          color: l.color || '',
          description: l.description || '',
        }))
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((u: any) => u.login || u).filter(Boolean)
      : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map: Record<string, string> = {};
      const putUser = (u: any) => {
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
      const map: Record<string, boolean> = {};
      const put = (u: any) => {
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
      ? pr.requested_reviewers.map((u: any) => u.login || u).filter(Boolean)
      : [],
    requestedTeams: Array.isArray(pr.requested_teams)
      ? pr.requested_teams.map((t: any) => t.slug || t.name).filter(Boolean)
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
      nextPage: null as any,
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

