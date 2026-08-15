/**
 * GraphQL-first conversation timeline via PullRequest.timelineItems.
 * Hybrid: issue comments + system events here; review threads stay on
 * reviewThreads connection (PRRT not on timelineItems).
 *
 * GitHub docs constraints (verified against official docs):
 * - GraphQL connections: first/last MUST be 1–100; no higher page size.
 *   docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
 * - No published hard cap on timelineItems.totalCount for an issue/PR.
 * - Activity Events REST "300 events / last 30 days" applies ONLY to the
 *   activity feed (/events, /repos/.../events user streams) — NOT to
 *   PullRequest.timelineItems or issue events/timeline. Do not conflate.
 *   docs.github.com/en/rest/activity/events
 *
 * Undocumented platform behavior (observed on dense/spam PRs, e.g. former #7 / DEMO_PR):
 * - Unfiltered timelineItems may omit newer renames/labels while the same
 *   nodes still appear under itemTypes: [RENAMED_TITLE] / REST gaps vs
 *   totalCount. Not a client bug; prefer itemTypes streams if product needs
 *   complete system-event coverage on pathological PRs.
 */
import {
  apiGraphql,
  normalizeApiCtx,
} from './http';
import { mapIssueComment } from './mappers';

/** GitHub GraphQL connection max (docs: first/last within 1–100). */
export const TIMELINE_ITEMS_PAGE_SIZE = 100;

/** Light shell: no nested full review-thread comments (cost-safe). */
const TIMELINE_ITEMS_QUERY = `
query TimelineItemsPage(
  $owner: String!
  $name: String!
  $number: Int!
  $first: Int
  $last: Int
  $after: String
  $before: String
  $since: DateTime
) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(
        first: $first
        last: $last
        after: $after
        before: $before
        since: $since
      ) {
        totalCount
        filteredCount
        updatedAt
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          __typename
          ... on IssueComment {
            id
            databaseId
            createdAt
            body
            author { login avatarUrl }
            isMinimized
            minimizedReason
            viewerCanMinimize
            reactionGroups {
              content
              viewerHasReacted
              reactors { totalCount }
            }
          }
          ... on PullRequestReview {
            id
            databaseId
            state
            submittedAt
            body
            author { login avatarUrl }
            comments { totalCount }
          }
          ... on LabeledEvent {
            id
            createdAt
            label { name color description }
            actor { login avatarUrl }
          }
          ... on UnlabeledEvent {
            id
            createdAt
            label { name color description }
            actor { login avatarUrl }
          }
          ... on RenamedTitleEvent {
            id
            createdAt
            previousTitle
            currentTitle
            actor { login avatarUrl }
          }
          ... on AssignedEvent {
            id
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login } ... on Bot { login } }
          }
          ... on UnassignedEvent {
            id
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login } ... on Bot { login } }
          }
          ... on ReviewRequestedEvent {
            id
            createdAt
            actor { login avatarUrl }
            requestedReviewer {
              ... on User { login }
              ... on Team { name slug }
              ... on Bot { login }
            }
          }
          ... on ReviewRequestRemovedEvent {
            id
            createdAt
            actor { login avatarUrl }
            requestedReviewer {
              ... on User { login }
              ... on Team { name slug }
              ... on Bot { login }
            }
          }
          ... on MilestonedEvent {
            id
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on DemilestonedEvent {
            id
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on ReadyForReviewEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ConvertToDraftEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ClosedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ReopenedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on MergedEvent {
            id
            createdAt
            actor { login avatarUrl }
            commit { oid }
          }
          ... on CrossReferencedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ReferencedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on LockedEvent {
            id
            createdAt
            actor { login avatarUrl }
            lockReason
          }
          ... on UnlockedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on HeadRefForcePushedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on BaseRefChangedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on PullRequestCommit {
            id
            commit {
              oid
              abbreviatedOid
              messageHeadline
              committedDate
              author { user { login avatarUrl } name }
            }
          }
        }
      }
    }
  }
}`;

const SKIP_TYPENAMES = new Set([
  'SubscribedEvent',
  'UnsubscribedEvent',
  'MentionedEvent',
  'CommentDeletedEvent',
]);

function actorLogin(node: any): string {
  return (
    node?.actor?.login ||
    node?.author?.login ||
    ''
  );
}

function actorAvatar(node: any): string {
  return node?.actor?.avatarUrl || node?.author?.avatarUrl || '';
}

function mapReactionGroups(groups: any): any[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => {
      const content = String(g?.content || '');
      const count = Number(g?.reactors?.totalCount) || 0;
      if (!content || count <= 0) return null;
      return {
        content,
        count,
        viewerHasReacted: Boolean(g?.viewerHasReacted),
      };
    })
    .filter(Boolean);
}

/**
 * Map a GraphQL timeline node → REST-shaped issue comment or system event.
 * Returns { kind: 'comment'|'event'|'review'|null, value }.
 */
export function mapGraphqlTimelineNode(node: any): {
  kind: 'comment' | 'event' | 'review' | null;
  value: any;
} {
  if (!node || typeof node !== 'object') return { kind: null, value: null };
  const tn = String(node.__typename || '');
  if (SKIP_TYPENAMES.has(tn)) return { kind: null, value: null };

  if (tn === 'IssueComment') {
    const comment = mapIssueComment({
      id: node.databaseId,
      node_id: node.id,
      body: node.body || '',
      user: {
        login: node.author?.login || '',
        avatar_url: node.author?.avatarUrl || '',
      },
      created_at: node.createdAt,
      updated_at: node.createdAt,
      isMinimized: node.isMinimized,
      minimizedReason: node.minimizedReason,
      viewerCanMinimize: node.viewerCanMinimize,
    });
    const reactions = mapReactionGroups(node.reactionGroups);
    if (reactions.length) comment.reactions = reactions;
    comment.nodeId = node.id || comment.nodeId;
    return { kind: 'comment', value: comment };
  }

  if (tn === 'PullRequestReview') {
    return {
      kind: 'review',
      value: {
        id: node.databaseId,
        nodeId: node.id,
        author: node.author?.login || '',
        avatarUrl: node.author?.avatarUrl || '',
        state: node.state || '',
        body: node.body || '',
        submittedAt: node.submittedAt || null,
        commentCount:
          typeof node.comments?.totalCount === 'number'
            ? node.comments.totalCount
            : null,
        isBot: /\[bot\]$/i.test(String(node.author?.login || '')),
      },
    };
  }

  // System events → REST-like shape for timelineEventToItem
  const base = {
    id: node.id || null,
    actor: actorLogin(node),
    avatarUrl: actorAvatar(node),
    at: node.createdAt || null,
    source: 'graphql',
  };

  switch (tn) {
    case 'LabeledEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'labeled',
          label: node.label
            ? {
                name: String(node.label.name || ''),
                color: String(node.label.color || ''),
                description: String(node.label.description || ''),
              }
            : null,
        },
      };
    case 'UnlabeledEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'unlabeled',
          label: node.label
            ? {
                name: String(node.label.name || ''),
                color: String(node.label.color || ''),
                description: String(node.label.description || ''),
              }
            : null,
        },
      };
    case 'RenamedTitleEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'renamed',
          rename: {
            from: String(node.previousTitle || ''),
            to: String(node.currentTitle || ''),
          },
        },
      };
    case 'AssignedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'assigned',
          assignee: node.assignee?.login || null,
        },
      };
    case 'UnassignedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'unassigned',
          assignee: node.assignee?.login || null,
        },
      };
    case 'ReviewRequestedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'review_requested',
          requestedReviewer:
            node.requestedReviewer?.login ||
            node.requestedReviewer?.slug ||
            node.requestedReviewer?.name ||
            null,
          requestedTeam: node.requestedReviewer?.slug || null,
        },
      };
    case 'ReviewRequestRemovedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'review_request_removed',
          requestedReviewer:
            node.requestedReviewer?.login ||
            node.requestedReviewer?.slug ||
            node.requestedReviewer?.name ||
            null,
        },
      };
    case 'MilestonedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'milestoned',
          milestone: { title: String(node.milestoneTitle || ''), number: null },
        },
      };
    case 'DemilestonedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'demilestoned',
          milestone: { title: String(node.milestoneTitle || ''), number: null },
        },
      };
    case 'ReadyForReviewEvent':
      return { kind: 'event', value: { ...base, event: 'ready_for_review' } };
    case 'ConvertToDraftEvent':
      return { kind: 'event', value: { ...base, event: 'convert_to_draft' } };
    case 'ClosedEvent':
      return { kind: 'event', value: { ...base, event: 'closed' } };
    case 'ReopenedEvent':
      return { kind: 'event', value: { ...base, event: 'reopened' } };
    case 'MergedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'merged',
          commitId: node.commit?.oid || null,
        },
      };
    case 'CrossReferencedEvent':
      return { kind: 'event', value: { ...base, event: 'cross-referenced' } };
    case 'ReferencedEvent':
      return { kind: 'event', value: { ...base, event: 'referenced' } };
    case 'LockedEvent':
      return {
        kind: 'event',
        value: {
          ...base,
          event: 'locked',
          lockReason: node.lockReason || null,
        },
      };
    case 'UnlockedEvent':
      return { kind: 'event', value: { ...base, event: 'unlocked' } };
    case 'HeadRefForcePushedEvent':
      return {
        kind: 'event',
        value: { ...base, event: 'head_ref_force_pushed' },
      };
    case 'BaseRefChangedEvent':
      return {
        kind: 'event',
        value: { ...base, event: 'base_ref_changed' },
      };
    case 'PullRequestCommit':
      return {
        kind: 'event',
        value: {
          ...base,
          at: node.commit?.committedDate || base.at,
          actor:
            node.commit?.author?.user?.login ||
            node.commit?.author?.name ||
            base.actor,
          event: 'committed',
          commitId: node.commit?.oid || null,
          commitMessage: node.commit?.messageHeadline || '',
        },
      };
    default:
      return { kind: null, value: null };
  }
}

export function mapGraphqlTimelineNodes(nodes: any[]) {
  const comments: any[] = [];
  const timelineEvents: any[] = [];
  const reviews: any[] = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const { kind, value } = mapGraphqlTimelineNode(node);
    if (!value) continue;
    if (kind === 'comment') comments.push(value);
    else if (kind === 'event') timelineEvents.push(value);
    else if (kind === 'review') reviews.push(value);
  }
  return { comments, timelineEvents, reviews };
}

/**
 * Fetch one page of PullRequest.timelineItems (unfiltered — no itemTypes).
 *
 * Unfiltered by design: tip filters (events/comments/…) are client-only.
 * Schema also supports itemTypes + since; we use since for incremental only.
 * pageSize is clamped to TIMELINE_ITEMS_PAGE_SIZE (GitHub max 100).
 *
 * @param opts.direction 'newest' | 'oldest'
 * @param opts.cursor after/before cursor
 * @param opts.since ISO DateTime for newest-only incremental
 * @param opts.pageSize max 100 (GitHub GraphQL connection limit)
 */
export async function fetchPrTimelineItemsPage(
  owner: any,
  repo: any,
  number: any,
  opts: any = {},
  fetchImpl: any = null,
  token: any = null,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx || opts?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const empty = {
    comments: [] as any[],
    timelineEvents: [] as any[],
    reviews: [] as any[],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null as any,
      endCursor: null as any,
    },
    totalCount: 0,
    filteredCount: 0,
    updatedAt: null as any,
    direction: 'newest',
    hasMore: false,
    source: 'graphql',
  };
  if (!o || !r || !Number.isFinite(n) || !token) return empty;

  const pageSize = Math.min(
    TIMELINE_ITEMS_PAGE_SIZE,
    Math.max(1, Number(opts.pageSize) || TIMELINE_ITEMS_PAGE_SIZE)
  );
  const direction =
    String(opts.direction || 'newest').toLowerCase() === 'oldest'
      ? 'oldest'
      : 'newest';
  const cursor = opts.cursor != null ? String(opts.cursor) : null;
  const since = opts.since ? String(opts.since) : null;

  // Only send defined connection args — null first/last can confuse some
  // GraphQL servers / validators.
  const variables: any = {
    owner: o,
    name: r,
    number: n,
  };
  if (since) variables.since = String(since);
  if (since && direction === 'newest') {
    // Incremental: walk forward from since with first:N
    variables.first = pageSize;
    if (cursor) variables.after = cursor;
  } else if (direction === 'newest') {
    variables.last = pageSize;
    if (cursor) variables.before = cursor;
  } else {
    variables.first = pageSize;
    if (cursor) variables.after = cursor;
  }

  try {
    const data = await apiGraphql(
      TIMELINE_ITEMS_QUERY,
      variables,
      fetchImpl || fetch,
      token,
      { ...ctx, qName: 'TimelineItemsPage' }
    );
    const conn = data?.repository?.pullRequest?.timelineItems;
    const nodes = Array.isArray(conn?.nodes) ? conn.nodes : [];
    const mapped = mapGraphqlTimelineNodes(nodes);
    const pageInfo = conn?.pageInfo || empty.pageInfo;
    // since + first:N walks *forward* — only hasNextPage means more newer pages.
    // Do not OR hasPreviousPage (that points at pre-since older history).
    // newest + last:N walks older — hasPreviousPage means more older pages.
    // oldest + first:N walks newer — hasNextPage means more newer pages.
    const hasMore = since
      ? Boolean(pageInfo.hasNextPage)
      : direction === 'newest'
        ? Boolean(pageInfo.hasPreviousPage)
        : Boolean(pageInfo.hasNextPage);

    return {
      ...mapped,
      pageInfo: {
        hasNextPage: Boolean(pageInfo.hasNextPage),
        hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
        startCursor: pageInfo.startCursor || null,
        endCursor: pageInfo.endCursor || null,
      },
      totalCount:
        typeof conn?.totalCount === 'number' ? conn.totalCount : nodes.length,
      filteredCount:
        typeof conn?.filteredCount === 'number'
          ? conn.filteredCount
          : nodes.length,
      updatedAt: conn?.updatedAt || null,
      direction,
      hasMore,
      source: 'graphql',
      since: since || null,
    };
  } catch (err: any) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    // Soft-fail empty — caller may fall back to REST
    return { ...empty, error: String(err?.message || err || 'timeline failed') };
  }
}

/**
 * High-level: first timeline page for openModal (newest, 100).
 * Falls back to empty; host may call REST helpers if needed.
 */
export async function fetchPrTimelineShell(
  owner: any,
  repo: any,
  number: any,
  opts: any = {},
  fetchImpl: any = null,
  token: any = null,
  ctx: any = null
) {
  return fetchPrTimelineItemsPage(
    owner,
    repo,
    number,
    {
      direction: opts.direction || 'newest',
      pageSize: opts.pageSize || TIMELINE_ITEMS_PAGE_SIZE,
      since: opts.since || null,
      cursor: opts.cursor || null,
    },
    fetchImpl,
    token,
    ctx
  );
}
