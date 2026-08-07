/** SW unit: sw-handle-a.ts — message handlers part A */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

import {
  MSG,
  apiCtxFromMessage,
  tokenForMessage,
  requestEnterprisePermissions,
  syncEnterpriseContentScripts,
  ENTERPRISE_CS_ID,
  CONTENT_SCRIPT_JS,
} from './sw-enterprise';
import { clearDetailCacheOnGithubTabs } from './sw-broadcast';
import {
  beginTrackedFetch,
  endTrackedFetch,
  cancelTrackedFetches,
  cancelAllTrackedFetches,
  fetchImpl,
  ensureRateLimitMem,
  rateLimitApi,
  isAbortError,
  rlMem,
} from './sw-rate-limit';

export async function handleMessagePartA(message: any): Promise<any> {
  const apiCtx = apiCtxFromMessage(message || {});

  // Per-message API ctx (stateless). Propagate into PRTreeFetch*; never set global.

  switch (message.type) {
    case MSG.PING: {
      return {
        ok: true,
        pong: true,
        hasFetch: typeof PRTreeFetch?.fetchPrDetail === 'function',
        hasTimelineItems:
          typeof PRTreeFetch?.fetchPrTimelineItemsPage === 'function',
        hasMinimize: typeof PRTreeFetch?.minimizeComment === 'function',
        hasUnminimize: typeof PRTreeFetch?.unminimizeComment === 'function',
        hasStorage: typeof PRTreeStorage?.getGithubTokenStatus === 'function',
        hasEndpoints: typeof PRGithubEndpoints?.resolveGithubEndpoints === 'function',
      };
    }
    case MSG.TOKEN_STATUS: {
      // Host-scoped: enterprise pages report configured when that host has a PAT.
      // Popup (no webHost / github.com) reports the default github.com PAT only.
      const webHost = message.webHost || message.webOrigin || 'github.com';
      const sel = await PRTreeStorage.getTokenForWebHost(webHost);
      if (!sel.token) {
        return {
          ok: true,
          configured: false,
          mask: '',
          source: null,
          host: sel.host,
        };
      }
      return {
        ok: true,
        configured: true,
        mask: PRTreeStorage.maskGithubToken(sel.token),
        source: sel.source,
        host: sel.host,
      };
    }
    case MSG.TOKEN_SET: {
      await PRTreeStorage.setGithubToken(message.token || '');
      const status = await PRTreeStorage.getGithubTokenStatus();
      return { ok: true, ...(status as any) };
    }
    case MSG.TOKEN_CLEAR: {
      await PRTreeStorage.setGithubToken('');
      return { ok: true, configured: false, mask: '' };
    }
    case MSG.PREFS_GET: {
      const prefs = await PRTreeStorage.getExtensionPrefs();
      const hostAccounts = await PRTreeStorage.getHostAccountsPublic();
      let endpoints = null;
      try {
        endpoints = PRGithubEndpoints.resolveGithubEndpoints({
          webHost: message.webHost || 'github.com',
        });
      } catch {
        endpoints = null;
      }
      let rateLimit = null;
      try {
        await ensureRateLimitMem();
        rateLimit = rlMem.state;
      } catch {
        rateLimit = null;
      }
      return {
        ok: true,
        prefs,
        hostAccounts,
        endpoints,
        rateLimit,
        pluginEnabled: prefs?.pluginEnabled !== false,
      };
    }
    case MSG.PREFS_SET: {
      const patch = message.prefs || message.patch || {};
      // Drop legacy host-list-only field; host+PAT pairs use HOST_ACCOUNT_* messages.
      if (patch && typeof patch === 'object' && 'enterpriseWebHosts' in patch) {
        delete patch.enterpriseWebHosts;
      }
      // Manual re-enable after rate-limit: clear expired/all disable clocks
      if (patch && patch.pluginEnabled === true) {
        try {
          await ensureRateLimitMem();
          const RL = rateLimitApi();
          if (typeof RL?.clearExpiredRateDisables === 'function') {
            rlMem.state = RL.clearExpiredRateDisables(rlMem.state, Date.now(), {
              clearAll: true,
            });
            await PRTreeStorage.setRateLimitState(rlMem.state);
          }
        } catch {
          /* ignore */
        }
      }
      const prefs = await PRTreeStorage.setExtensionPrefs(patch);
      rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
      rlMem.loaded = true;
      return { ok: true, prefs, rateLimit: rlMem.state };
    }
    case MSG.RATE_LIMIT_GET: {
      await ensureRateLimitMem();
      const RL = rateLimitApi();
      if (typeof RL?.clearExpiredRateDisables === 'function') {
        rlMem.state = RL.clearExpiredRateDisables(rlMem.state, Date.now());
      }
      // Also return GraphQL cost observation (same payload as GQL_COST_LOG_GET)
      // so clients can read costs without a dedicated message if SW was mid-upgrade.
      const gqlLog =
        typeof PRTreeFetch?.getGraphqlCostLog === 'function'
          ? PRTreeFetch.getGraphqlCostLog()
          : [];
      const gqlSummary =
        typeof PRTreeFetch?.summarizeGraphqlCostLog === 'function'
          ? PRTreeFetch.summarizeGraphqlCostLog()
          : { totalCalls: 0, totalCost: 0, unknownCostCalls: 0, byOp: [] };
      return {
        ok: true,
        state: rlMem.state,
        pluginEnabled: rlMem.pluginEnabled,
        gqlCostLog: gqlLog,
        gqlCostSummary: gqlSummary,
        gqlCostBuild: 'gql-cost-v1',
      };
    }
    case MSG.GQL_COST_LOG_GET: {
      const log =
        typeof PRTreeFetch?.getGraphqlCostLog === 'function'
          ? PRTreeFetch.getGraphqlCostLog()
          : [];
      const summary =
        typeof PRTreeFetch?.summarizeGraphqlCostLog === 'function'
          ? PRTreeFetch.summarizeGraphqlCostLog()
          : { totalCalls: 0, totalCost: 0, unknownCostCalls: 0, byOp: [] };
      return { ok: true, log, summary, gqlCostBuild: 'gql-cost-v1' };
    }
    case MSG.GQL_COST_LOG_CLEAR: {
      if (typeof PRTreeFetch?.clearGraphqlCostLog === 'function') {
        PRTreeFetch.clearGraphqlCostLog();
      }
      return { ok: true };
    }
    case MSG.ONBOARDING_GET: {
      const completed = await PRTreeStorage.getOnboardingCompleted();
      return { ok: true, completed: Boolean(completed) };
    }
    case MSG.ONBOARDING_SET: {
      const completed = await PRTreeStorage.setOnboardingCompleted(
        message.completed !== false && message.completed !== 0
      );
      return { ok: true, completed: Boolean(completed) };
    }
    case MSG.HOST_ACCOUNTS_LIST: {
      const accounts = await PRTreeStorage.getHostAccountsPublic();
      return {
        ok: true,
        accounts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.HOST_ACCOUNT_ADD: {
      const result = await PRTreeStorage.registerHostAccount(
        message.host,
        message.token
      );
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          accounts: (result.accounts || []).map((a) => ({
            host: a.host,
            mask: PRTreeStorage.maskGithubToken(a.token),
          })),
        };
      }
      const hosts = result.accounts.map((a) => a.host);
      const permission = await requestEnterprisePermissions(hosts);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token),
        })),
        permission,
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.HOST_ACCOUNT_REMOVE: {
      const result = await PRTreeStorage.unregisterHostAccount(message.host);
      const hosts = result.accounts.map((a) => a.host);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token),
        })),
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.CLEAR_DETAIL_CACHE: {
      const result = await clearDetailCacheOnGithubTabs();
      return { ok: true, ...(result as any) };
    }
    case MSG.FETCH_OPEN_PULLS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchOpenPulls(
          message.owner,
          message.repo,
          tracked.fetch,
          {
            token,
            pagePrNumbers: Array.isArray(message.pagePrNumbers)
              ? message.pagePrNumbers
              : [],
            ctx: apiCtx,
          }
        );
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_DANGLING: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchDanglingPulls(
          message.owner,
          message.repo,
          Array.isArray(message.numbers) ? message.numbers : [],
          tracked.fetch,
          token, apiCtx);
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CANCEL_FETCH: {
      const ids = Array.isArray(message.requestIds)
        ? message.requestIds
        : message.requestId != null
          ? [message.requestId]
          : [];
      // cancelAll: kill whatever is mid-GitHub-fetch even if requestId tracking missed
      const cancelled =
        (message.cancelAll ? cancelAllTrackedFetches() : 0) +
        cancelTrackedFetches(ids);
      return { ok: true, cancelled };
    }
    case MSG.FETCH_PR_DETAIL: { const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        // Partial by default: core + first GraphQL threads page (not all pages)
        const detail = await PRTreeFetch.fetchPrDetail(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            skipReviewThreads: Boolean(message.skipReviewThreads),
            threadsMaxPages:
              message.threadsMaxPages != null ? Number(message.threadsMaxPages) : 1, ctx: apiCtx }
        );
        return { ok: true, detail };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: {
              threads: [],
              comments: [],
              hasMore: false,
              endCursor: null,
              pageCount: 0,
            },
          };
        }
        const page = await PRTreeFetch.fetchReviewThreadsPage(
          message.owner,
          message.repo,
          message.number,
          {
            direction: message.direction || 'newest',
            cursor: message.cursor || null,
            pageSize: message.pageSize != null ? Number(message.pageSize) : undefined,
            preferRest:
              message.preferRest !== undefined ? message.preferRest : null,
            forceGraphql: Boolean(message.forceGraphql),
            forceFull: Boolean(message.forceFull),
            skipEagerComments: Boolean(message.skipEagerComments),
            reviewCommentsCount:
              message.reviewCommentsCount != null
                ? Number(message.reviewCommentsCount)
                : null,
            restPage:
              message.restPage != null ? Number(message.restPage) : 1,
          },
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {

        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_BY_IDS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: { threads: [], comments: [], pageCount: 0, direction: 'refresh' },
          };
        }
        const page = await PRTreeFetch.fetchReviewThreadsByIds(message.threadNodeIds || message.ids || [], tracked.fetch, token, apiCtx);
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMMENTS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrCommentsPage(
          message.owner,
          message.repo,
          message.number,
          message.kind === 'review' ? 'review' : 'issue',
          {
            page: message.page,
            perPage: message.perPage,
            since: message.since || null,
            preferNewest: Boolean(message.preferNewest),
          },
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMPARE_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const result = await PRTreeFetch.fetchCompareFiles(
          message.owner,
          message.repo,
          message.base,
          message.head,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return { ok: true, result };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.POST_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to post comments');
      const result = await PRTreeFetch.postIssueComment(
        message.owner,
        message.repo,
        message.number,
        message.body,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SUBMIT_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to submit reviews');
      const result = await PRTreeFetch.submitPullReview(
        message.owner,
        message.repo,
        message.number,
        {
          event: message.event,
          body: message.body || '',
          commitId: message.commitId,
          comments: Array.isArray(message.comments) ? message.comments : undefined,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SUBMIT_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to submit pending reviews');
      const result = await PRTreeFetch.submitPendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        { event: message.event || 'COMMENT', body: message.body || '' },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to discard pending reviews');
      const result = await PRTreeFetch.deletePendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.POST_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to post review comments');
      const result = await PRTreeFetch.postReviewComment(
        message.owner,
        message.repo,
        message.number,
        {
          body: message.body,
          path: message.path,
          line: message.line,
          side: message.side || 'RIGHT',
          commitId: message.commitId,
          startLine: message.startLine,
          startSide: message.startSide,
          asPending: Boolean(message.asPending),
          subjectType: message.subjectType || message.subject_type || 'line',
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REPLY_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to reply to review comments');
      const result = await PRTreeFetch.replyToReviewComment(
        message.owner,
        message.repo,
        message.number,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        {
          mode: message.mode || 'comment',
          threadNodeId: message.threadNodeId || null,
          parentNodeId: message.parentNodeId || null,
          path: message.path || null,
          line: message.line ?? null,
          side: message.side || null,
          commitId: message.commitId || null,
        },
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.RESOLVE_REVIEW_THREAD: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to resolve review threads');
      const result = await PRTreeFetch.resolveReviewThread(
        message.threadNodeId,
        message.resolved !== false,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL_STATE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to close or reopen pull requests');
      const result = await PRTreeFetch.updatePullState(
        message.owner,
        message.repo,
        message.number,
        message.state === 'closed' ? 'closed' : 'open',
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to delete review comments');
      const result = await PRTreeFetch.deleteReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to delete comments');
      const result = await PRTreeFetch.deleteIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.MINIMIZE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to hide comments');
      if (typeof PRTreeFetch.minimizeComment !== 'function') {
        throw new Error('Hide comment API unavailable');
      }
      const result = await PRTreeFetch.minimizeComment(
        message.subjectNodeId || message.nodeId,
        message.classifier || message.reason || 'OFF_TOPIC',
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UNMINIMIZE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to unhide comments');
      if (typeof PRTreeFetch.unminimizeComment !== 'function') {
        throw new Error('Unhide comment API unavailable');
      }
      const result = await PRTreeFetch.unminimizeComment(
        message.subjectNodeId || message.nodeId,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.TOGGLE_COMMENT_REACTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to react on comments');
      if (typeof PRTreeFetch.toggleCommentReaction !== 'function') {
        throw new Error('Reaction API unavailable');
      }
      const result = await PRTreeFetch.toggleCommentReaction(
        message.owner,
        message.repo,
        message.kind || 'issue',
        message.opts || {},
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_REACTABLE_REACTORS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to load reaction users');
      if (typeof PRTreeFetch.fetchReactableReactors !== 'function') {
        throw new Error('Reaction reactors API unavailable');
      }
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const groups = await PRTreeFetch.fetchReactableReactors(
          message.nodeId,
          tracked.fetch,
          token,
          apiCtx,
          { first: message.first != null ? Number(message.first) : 5 }
        );
        return { ok: true, groups };
      } catch (err) {
        if (isAbortError(err)) {
          return { ok: false, aborted: true, error: 'aborted' };
        }
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.UPDATE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to update pull request');
      const result = await PRTreeFetch.updatePullRequest(
        message.owner,
        message.repo,
        message.number,
        message.fields || {},
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    default:
      return undefined;
  }
}
