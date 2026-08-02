import {
  normalizeReviewCommentId,
} from './review-threads-group';

/** Split from review-threads.ts: review-threads-build */
/** @module modal/lib/review-threads */
/**
 * Pure review-thread grouping, counts, resolve/reply request builders.
 */

/**
 * Group review comments into threads by root (in_reply_to_id).
 * @param {Array} comments
 * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
 */
export function buildReplyReviewThreadGraphql(threadNodeId, body) {
  return {
    method: 'POST',
    url: 'https://api.github.com/graphql',
    body: {
      query: `mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
    comment { databaseId body }
  }
}`,
      variables: {
        id: String(threadNodeId || ''),
        body: String(body || '').trim(),
      },
    },
  };
}

/**
 * Shape REST fallback reply (no pending review only).
 * POST /repos/{owner}/{repo}/pulls/{pull}/comments/{id}/replies
 */
export function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
  const parentId = normalizeReviewCommentId(commentId);
  const text = String(body || '').trim();
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${parentId ?? commentId}/replies`,
    body: { body: text },
  };
}

/**
 * GraphQL resolve / unresolve review thread.
 * @param {string} threadNodeId GraphQL node id (PRRT_…)
 * @param {boolean} resolved
 */
export function buildResolveThreadGraphql(threadNodeId, resolved = true) {
  const mutation = resolved
    ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
    : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return {
    method: 'POST',
    url: 'https://api.github.com/graphql',
    body: {
      query: mutation,
      variables: { id: threadNodeId },
    },
  };
}

/**
 * Filter files by path query (case-insensitive substring).
 */
