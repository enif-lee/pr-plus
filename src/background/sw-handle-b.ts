/** SW unit: sw-handle-b.ts — message handlers part B */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

import {
  MSG,
  apiCtxFromMessage,
  tokenForMessage,
  ENTERPRISE_CS_ID,
  CONTENT_SCRIPT_JS,
} from './sw-enterprise';
import {
  beginTrackedFetch,
  endTrackedFetch,
  fetchImpl,
  isAbortError,
} from './sw-rate-limit';

export async function handleMessagePartB(message: any): Promise<any> {
  const apiCtx = apiCtxFromMessage(message || {});
  switch (message.type) {

    case MSG.EDIT_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to edit comments');
      const result = await PRTreeFetch.editIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.EDIT_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to edit review comments');
      const result = await PRTreeFetch.editReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        apiCtx,
        {
          nodeId: message.nodeId || null,
          pullNumber: message.pullNumber ?? message.number ?? null,
        }
      );
      return { ok: true, result };
    }
    case MSG.REQUEST_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to request reviewers');
      const result = await PRTreeFetch.requestReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || [],
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REMOVE_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to remove reviewers');
      const result = await PRTreeFetch.removeReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || [],
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.ADD_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to add assignees');
      const result = await PRTreeFetch.addAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REMOVE_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to remove assignees');
      const result = await PRTreeFetch.removeAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SET_LABELS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to set labels');
      const result = await PRTreeFetch.setIssueLabels(
        message.owner,
        message.repo,
        message.number,
        message.labels || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_LABELS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const labels = await PRTreeFetch.fetchRepoLabels(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, labels };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_LABEL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to create labels');
      const result = await PRTreeFetch.createRepoLabel(
        message.owner,
        message.repo,
        {
          name: message.name,
          color: message.color,
          description: message.description,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_MILESTONES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const milestones = await PRTreeFetch.fetchRepoMilestones(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            state: message.state || 'all',
            ctx: apiCtx,
          }
        );
        return { ok: true, milestones };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to create milestones');
      const result = await PRTreeFetch.createRepoMilestone(
        message.owner,
        message.repo,
        {
          title: message.title,
          description: message.description,
          state: message.state,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_TAGS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchRepoTags(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_TAGS_FOR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchTagsForCommits(
          message.owner,
          message.repo,
          message.shas || [],
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchAllPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const pack = await PRTreeFetch.fetchPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            headSha: message.headSha || null,
            gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return {
          ok: true,
          files: Array.isArray(pack?.files) ? pack.files : [],
          gitattributesText:
            typeof pack?.gitattributesText === 'string'
              ? pack.gitattributesText
              : '',
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_ISSUE_COMMENTS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrIssueComments(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_TIMELINE_EVENTS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        // GraphQL-first page (comments + events) when bridge asks via mode/source.
        // Uses the established TIMELINE_EVENTS message type so SW routing is
        // guaranteed after rebuild (new message keys can miss hot-reload).
        const wantGraphqlPage =
          message.mode === 'graphql' ||
          message.source === 'graphql' ||
          message.graphql === true ||
          message.pageSize != null ||
          message.direction != null ||
          // Explicit product path: always prefer GraphQL when pageSize/direction set
          message.type === MSG.FETCH_PR_TIMELINE_ITEMS ||
          message.type === 'PR_TREE_FETCH_PR_TIMELINE_ITEMS';
        const hasTimelineFn =
          typeof PRTreeFetch?.fetchPrTimelineItemsPage === 'function';
        if (wantGraphqlPage && hasTimelineFn) {
          const page = await PRTreeFetch.fetchPrTimelineItemsPage(
            message.owner,
            message.repo,
            message.number,
            {
              direction: message.direction || 'newest',
              cursor: message.cursor || null,
              since: message.since || null,
              pageSize: message.pageSize || 100,
            },
            tracked.fetch,
            token,
            apiCtx
          );
          const p = page || {
            comments: [],
            timelineEvents: [],
            reviews: [],
            hasMore: false,
            source: 'graphql',
            error: 'empty-page',
          };
          return {
            ok: true,
            page: p,
            timelinePage: p,
            // Keep events alias for older callers
            events: Array.isArray(p?.timelineEvents) ? p.timelineEvents : [],
          };
        }
        // REST fallback path — include diag so bridge can report why GraphQL was skipped
        const events =
          typeof PRTreeFetch.fetchPrTimelineEvents === 'function'
            ? await PRTreeFetch.fetchPrTimelineEvents(
                message.owner,
                message.repo,
                message.number,
                tracked.fetch,
                token,
                apiCtx
              )
            : [];
        return {
          ok: true,
          events: Array.isArray(events) ? events : [],
          page: null,
          timelinePage: null,
          _diag: {
            wantGraphqlPage,
            hasTimelineFn,
            mode: message.mode || null,
            pageSize: message.pageSize ?? null,
            direction: message.direction || null,
          },
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    // Dedicated type (also kept for forward-compat).
    case MSG.FETCH_PR_TIMELINE_ITEMS:
    case 'PR_TREE_FETCH_PR_TIMELINE_ITEMS': {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: {
              comments: [],
              timelineEvents: [],
              reviews: [],
              hasMore: false,
              source: 'graphql',
              error: 'no-token',
            },
          };
        }
        if (typeof PRTreeFetch.fetchPrTimelineItemsPage !== 'function') {
          return {
            ok: true,
            page: {
              comments: [],
              timelineEvents: [],
              reviews: [],
              hasMore: false,
              source: 'graphql',
              error: 'no-fetchPrTimelineItemsPage',
            },
          };
        }
        const page = await PRTreeFetch.fetchPrTimelineItemsPage(
          message.owner,
          message.repo,
          message.number,
          {
            direction: message.direction || 'newest',
            cursor: message.cursor || null,
            since: message.since || null,
            pageSize: message.pageSize || 100,
          },
          tracked.fetch,
          token,
          apiCtx
        );
        const p = page || {
          comments: [],
          timelineEvents: [],
          reviews: [],
          hasMore: false,
          source: 'graphql',
          error: 'empty-page',
        };
        return {
          ok: true,
          page: p,
          timelinePage: p,
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_HEAD_PROBE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const probe =
          typeof PRTreeFetch.fetchPrHeadProbe === 'function'
            ? await PRTreeFetch.fetchPrHeadProbe(
                message.owner,
                message.repo,
                message.number,
                tracked.fetch,
                token,
                apiCtx
              )
            : {
                headSha: '',
                baseSha: '',
                updatedAt: null,
                draft: false,
                state: '',
                number: Number(message.number) || 0,
              };
        return { ok: true, probe: probe || null };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_REVIEWS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const reviews = await PRTreeFetch.fetchPrReviews(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, reviews: Array.isArray(reviews) ? reviews : [] };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_CHECKS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const checks = await PRTreeFetch.fetchPrChecks(
          message.owner,
          message.repo,
          message.headSha,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, checks };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_DEVELOPMENT: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const development = await PRTreeFetch.fetchPrDevelopment(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { body: message.body || '', ctx: apiCtx }
        );
        return { ok: true, development };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const files = await PRTreeFetch.fetchAllPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return { ok: true, files };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.UPLOAD_REPO_FILE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to upload files');
      const result = await PRTreeFetch.uploadRepoFile(
        message.owner,
        message.repo,
        {
          path: message.path,
          contentBase64: message.contentBase64,
          message: message.message,
          branch: message.branch,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.APPLY_SUGGESTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to apply suggestions');
      const result = await PRTreeFetch.applyReviewSuggestion(
        message.owner,
        message.repo,
        {
          path: message.path,
          headRef: message.headRef,
          startLine: message.startLine,
          endLine: message.endLine,
          suggestion: message.suggestion,
          message: message.commitMessage,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.GET_REPO_FILE_TEXT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to read files');
      const result = await PRTreeFetch.getRepoFileText(
        message.owner,
        message.repo,
        {
          path: message.path,
          ref: message.ref || message.headRef || message.headSha,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.MERGE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to merge');
      const result = await PRTreeFetch.mergePullRequest(
        message.owner,
        message.repo,
        message.number,
        {
          mergeMethod: message.mergeMethod || 'merge',
          commitTitle: message.commitTitle,
          commitMessage: message.commitMessage,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.UPDATE_BRANCH: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to update branch');
      const result = await PRTreeFetch.updatePullBranch(
        message.owner,
        message.repo,
        message.number,
        { expectedHeadSha: message.expectedHeadSha },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_HEAD_BRANCH: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to delete branch');
      const result = await PRTreeFetch.deleteHeadBranch(
        message.owner,
        message.repo,
        message.branch,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_VIEWER_VIEWED_PATHS: {
      const token = await tokenForMessage(message);
      if (!token) {
        return {
          ok: true,
          result: { pullRequestId: null, viewedPaths: [], unauthorized: true },
        };
      }
      const result = await PRTreeFetch.fetchViewerViewedPaths(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        { maxPages: message.maxPages, ctx: apiCtx }
      );
      return { ok: true, result };
    }
    case MSG.MARK_FILE_VIEWED: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to mark file viewed');
      const result = await PRTreeFetch.markFileAsViewed(
        message.pullRequestId,
        message.path,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UNMARK_FILE_VIEWED: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to unmark file viewed');
      const result = await PRTreeFetch.unmarkFileAsViewed(
        message.pullRequestId,
        message.path,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SET_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.setIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        {
          subscribed: message.subscribed !== false,
          ignored: Boolean(message.ignored),
          nodeId: message.nodeId || null,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.deleteIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        message.nodeId || null
      );
      return { ok: true, result };
    }
    case MSG.SET_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to set milestone');
      const result = await PRTreeFetch.setIssueMilestone(
        message.owner,
        message.repo,
        message.number,
        message.milestone,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SET_DRAFT_STAGE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to change draft stage');
      const result = await PRTreeFetch.setPullRequestDraftStage(
        message.owner,
        message.repo,
        message.number,
        message.stage === 'ready' ? 'ready' : 'draft',
        fetchImpl(),
        token,
        message.nodeId || null,
        apiCtx
      );
      return { ok: true, result };
    }
    default:
      return { ok: false, error: `unknown type: ${message.type}` };
  }
  }

