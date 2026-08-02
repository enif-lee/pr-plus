/**
 * Fetch feature unit: misc
 */
export const REST_TO_GQL_REACTION = {
  '+1': 'THUMBS_UP',
  '-1': 'THUMBS_DOWN',
  laugh: 'LAUGH',
  hooray: 'HOORAY',
  confused: 'CONFUSED',
  heart: 'HEART',
  rocket: 'ROCKET',
  eyes: 'EYES',
};

/**
 * Toggle a reaction on an issue comment, PR body, or pull-review comment.
 * Prefers GraphQL addReaction/removeReaction when `nodeId` is known (accurate).
 * Falls back to REST create + list/delete when only database id / PR number is available.
 *
 * @param {'issue'|'review'|'pr'} kind  `pr` = reactions on the pull request body
 * @param {{ content: string, viewerHasReacted?: boolean, nodeId?: string|null, commentId?: number|string, number?: number|string }} opts
 * @returns {Promise<{ content: string, reacted: boolean }>}
 */
