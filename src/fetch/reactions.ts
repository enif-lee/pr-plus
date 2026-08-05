/**
 * Fetch feature unit: reactions
 */
import {
  apiGraphql,
  apiJson,
  apiSend,
  githubRestUrl,
  normalizeApiCtx,
} from './http';
import {
  mapGraphqlReactionGroups,
} from './mappers';
import {
  REST_TO_GQL_REACTION,
} from './misc';
import { fetchViewerLogin } from './viewer';

export async function fetchReactableReactionGroups(
  nodeIds: any,
  fetchImpl: any,
  token: any,
  ctx: any = null,
  opts: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const ids = [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ].slice(0, 100);
  const out = new Map();
  if (!ids.length || !token) return out;
  const reactorsFirst = Math.max(
    0,
    Math.min(20, Number(opts?.reactorsFirst) || 0)
  );
  // Count-only: reactors { totalCount } (no first) is cost-flat; first:N only when
  // loading who-reacted logins for a small set of comments.
  const reactorsSel =
    reactorsFirst > 0
      ? `reactors(first:${reactorsFirst}){
            totalCount
            nodes{
              ... on User { login }
              ... on Bot { login }
            }
          }`
      : `reactors { totalCount }`;
  const query = `query($ids:[ID!]!){
    nodes(ids:$ids){
      ... on Reactable {
        id
        reactionGroups {
          content
          viewerHasReacted
          ${reactorsSel}
        }
      }
    }
  }`;
  try {
    const data = await apiGraphql(query, { ids }, fetchImpl, token, ctx);
    for (const node of data?.nodes || []) {
      if (!node?.id) continue;
      out.set(String(node.id), mapGraphqlReactionGroups(node.reactionGroups));
    }
  } catch {
    /* soft — keep REST summary */
  }
  return out;
}

/**
 * On-demand reactor logins for one Reactable (hover tooltips).
 * Caps nodes at `first` (default 5).
 * @returns ReactionGroup[] with users filled when available
 */
export async function fetchReactableReactors(
  nodeId: any,
  fetchImpl: any,
  token: any,
  ctx: any = null,
  opts: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const id = String(nodeId || '').trim();
  if (!id || !token) return [];
  const first = Math.max(1, Math.min(10, Number(opts?.first) || 5));
  const map = await fetchReactableReactionGroups(
    [id],
    fetchImpl,
    token,
    ctx,
    { reactorsFirst: first }
  );
  return map.get(id) || [];
}

export async function toggleCommentReaction(
  owner: any,
  repo: any,
  kind: any,
  opts: any,
  fetchImpl: any,
  token: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const content = String(opts?.content || '').trim();
  const gqlContent = REST_TO_GQL_REACTION[content];
  if (!gqlContent) {
    throw new Error(`Unsupported reaction: ${content || '(empty)'}`);
  }
  const nodeId = String(opts?.nodeId || '').trim();
  const currently = Boolean(opts?.viewerHasReacted);
  const nextReacted = !currently;
  const kRaw = String(kind || 'issue').toLowerCase();
  const k = kRaw === 'review' ? 'review' : kRaw === 'pr' ? 'pr' : 'issue';

  if (nodeId) {
    const mutation = nextReacted
      ? `mutation($id:ID!,$content:ReactionContent!){
          addReaction(input:{subjectId:$id, content:$content}) {
            reaction { content }
          }
        }`
      : `mutation($id:ID!,$content:ReactionContent!){
          removeReaction(input:{subjectId:$id, content:$content}) {
            reaction { content }
          }
        }`;
    try {
      await apiGraphql(
        mutation,
        { id: nodeId, content: gqlContent },
        fetchImpl,
        token,
        ctx
      );
      return { content, reacted: nextReacted };
    } catch {
      // GraphQL can fail when nodeId is a PullRequest id the schema rejects,
      // or reaction already exists — fall through to REST issue reactions.
      // Without this, optimistic body pills flash then vanish (e2e MB6).
    }
  }

  // REST fallback
  let basePath = '';
  let deletePath = (reactionId: any) => '';
  if (k === 'review') {
    const commentId = opts?.commentId;
    if (commentId == null || commentId === '') {
      throw new Error('Reaction toggle needs nodeId or commentId');
    }
    basePath = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions/${rid}`;
  } else if (k === 'pr') {
    const num = opts?.number ?? opts?.commentId;
    if (num == null || num === '') {
      throw new Error('Reaction toggle needs nodeId or PR number');
    }
    basePath = `/repos/${owner}/${repo}/issues/${num}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/issues/${num}/reactions/${rid}`;
  } else {
    const commentId = opts?.commentId;
    if (commentId == null || commentId === '') {
      throw new Error('Reaction toggle needs nodeId or commentId');
    }
    basePath = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions/${rid}`;
  }

  if (nextReacted) {
    await apiSend(
      githubRestUrl(basePath, ctx),
      fetchImpl,
      token,
      { method: 'POST', body: { content } }
    );
    return { content, reacted: true };
  }

  // Remove: list reactions of this content for the viewer, then DELETE
  const listed = await apiJson(
    githubRestUrl(
      `${basePath}?content=${encodeURIComponent(content)}&per_page=100`,
      ctx
    ),
    fetchImpl,
    token
  );
  const rows = Array.isArray(listed) ? listed : [];
  let target = rows[0] || null;
  try {
    const me = await fetchViewerLogin(fetchImpl, token, ctx);
    const login = String(me || '').toLowerCase();
    if (login) {
      const mine = rows.find(
        (r) => String(r?.user?.login || '').toLowerCase() === login
      );
      if (mine) target = mine;
    }
  } catch {
    /* keep first */
  }
  if (!target?.id) {
    return { content, reacted: false };
  }
  await apiSend(
    githubRestUrl(deletePath(target.id), ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
  return { content, reacted: false };
}

