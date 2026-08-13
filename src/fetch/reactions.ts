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
/**
 * Batch-load Minimizable fields for IssueComment / ReviewComment node ids.
 * REST list comments omit isMinimized — this restores hide state after refresh.
 * @returns Map<nodeId, { isMinimized, minimizedReason, viewerCanMinimize }>
 */
export async function fetchMinimizableStates(
  nodeIds: any,
  fetchImpl: any,
  token: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const ids = [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ].slice(0, 100);
  const out = new Map<
    string,
    {
      isMinimized: boolean;
      minimizedReason: string | null;
      viewerCanMinimize: boolean | null;
    }
  >();
  if (!ids.length || !token) return out;
  // Use concrete types (not `... on Minimizable { id }`) — Minimizable has no
  // `id`, and a bare Minimizable spread used to fail GraphQL validation so the
  // soft catch returned an empty map and REST comments painted un-hidden.
  const query = `query($ids:[ID!]!){
    nodes(ids:$ids){
      ... on IssueComment {
        id
        isMinimized
        minimizedReason
        viewerCanMinimize
      }
      ... on PullRequestReviewComment {
        id
        isMinimized
        minimizedReason
        viewerCanMinimize
      }
    }
  }`;
  try {
    const data = await apiGraphql(query, { ids }, fetchImpl, token, ctx);
    for (const node of data?.nodes || []) {
      if (!node?.id) continue;
      // isMinimized is Boolean! on these types — always present when type matches.
      out.set(String(node.id), {
        isMinimized: Boolean(node.isMinimized),
        minimizedReason: node.minimizedReason ?? null,
        viewerCanMinimize:
          node.viewerCanMinimize != null
            ? Boolean(node.viewerCanMinimize)
            : null,
      });
    }
  } catch {
    /* soft */
  }
  return out;
}

/**
 * Apply Minimizable map onto comment-like objects (mutates items).
 */
export function applyMinimizableStates(items: any[], byId: Map<string, any>) {
  if (!byId?.size || !Array.isArray(items)) return items;
  for (const c of items) {
    const id = c?.nodeId || c?.node_id || c?.id;
    if (id == null) continue;
    const m = byId.get(String(id));
    if (!m) continue;
    c.isMinimized = Boolean(m.isMinimized);
    c.minimizedReason = m.minimizedReason ?? null;
    if (m.viewerCanMinimize != null) {
      c.viewerCanMinimize = Boolean(m.viewerCanMinimize);
    }
  }
  return items;
}

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

/**
 * GraphQL global id usable as addReaction subjectId.
 * Rejects bare REST database ids and review-**thread** ids (PRRT_…).
 */
export function isReactableGraphqlId(id: unknown): boolean {
  const s = String(id || '').trim();
  if (!s || /^\d+$/.test(s)) return false;
  // Client-only / non-reactable ids (shell placeholders, synthetic rows)
  if (/^shell:/i.test(s) || /^rest-thread-/i.test(s)) return false;
  // PullRequestReviewThread is not a Reactable for comment emoji
  if (/^PRRT_/i.test(s) || /PullRequestReviewThread/i.test(s)) return false;
  // Common reactable prefixes (issue comment, review comment, issue/PR body)
  if (/^(PRRC_|IC_|I_|PR_)/i.test(s)) return true;
  // Opaque base64-style global ids only if they look like GitHub node ids
  // (contain underscore or are long base64) — never free-form strings
  if (/^[A-Za-z0-9_=-]{12,}$/.test(s) && /_/.test(s)) return true;
  return false;
}

function isGraphqlPermissionError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /INSUFFICIENT|insufficient scopes|Resource not accessible|forbidden|HTTP 403|403:/i.test(
    msg
  );
}

function isGraphqlNotFoundError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /Could not resolve|NOT_FOUND|does not exist|invalid.*id/i.test(msg);
}

/** Prefer numeric REST database id; reject GraphQL global ids as path segments. */
export function restReactionCommentId(id: unknown): string | number | null {
  if (id == null || id === '') return null;
  const s = String(id).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  // Never plug PRRC_/IC_ into /comments/{id}/reactions
  if (isReactableGraphqlId(s)) return null;
  return s;
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
  const gqlContent = (REST_TO_GQL_REACTION as Record<string, string>)[content];
  if (!gqlContent) {
    throw new Error(`Unsupported reaction: ${content || '(empty)'}`);
  }
  const rawNodeId = String(opts?.nodeId || '').trim();
  const nodeId = isReactableGraphqlId(rawNodeId) ? rawNodeId : '';
  const currently = Boolean(opts?.viewerHasReacted);
  const nextReacted = !currently;
  const kRaw = String(kind || 'issue').toLowerCase();
  const k = kRaw === 'review' ? 'review' : kRaw === 'pr' ? 'pr' : 'issue';

  // Prefer GraphQL when we have a real Reactable id.
  // With a valid subject id, do **not** fall through to REST on GraphQL failure:
  // REST often returns misleading 403s ("admin rights" / "insufficient scopes")
  // that hide the real GraphQL error (and classic `repo` PATs work via GraphQL).
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
      return { content, reacted: nextReacted, via: 'graphql' };
    } catch (err: any) {
      // Only fall through when the node truly cannot be resolved as a Reactable
      // and we still have a numeric REST id.
      const restId =
        k === 'pr'
          ? restReactionCommentId(opts?.number ?? opts?.commentId)
          : restReactionCommentId(opts?.commentId);
      if (isGraphqlNotFoundError(err) && restId != null) {
        // fall through to REST below
      } else {
        const msg = String(err?.message || err || 'GraphQL reaction failed');
        const e: any = new Error(
          `${msg} | rxv4 via=graphql nodeId=${nodeId} kind=${k}`
        );
        e.status = err?.status ?? 200;
        e.via = 'graphql';
        e.nodeId = nodeId;
        e.graphqlErrors = err?.graphqlErrors;
        throw e;
      }
    }
  }

  // REST only when GraphQL subject id is unavailable (or GraphQL not-found + numeric id).
  let basePath = '';
  let deletePath = (reactionId: any) => '';
  let restSubject: string | number | null = null;
  if (k === 'review') {
    const commentId = restReactionCommentId(opts?.commentId);
    restSubject = commentId;
    if (commentId == null) {
      throw new Error(
        'Reaction toggle needs a GraphQL comment nodeId (PRRC_…) or numeric comment id'
      );
    }
    basePath = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions/${rid}`;
  } else if (k === 'pr') {
    const num = restReactionCommentId(opts?.number ?? opts?.commentId);
    restSubject = num;
    if (num == null) {
      throw new Error('Reaction toggle needs PR GraphQL nodeId or PR number');
    }
    basePath = `/repos/${owner}/${repo}/issues/${num}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/issues/${num}/reactions/${rid}`;
  } else {
    const commentId = restReactionCommentId(opts?.commentId);
    restSubject = commentId;
    if (commentId == null) {
      throw new Error(
        'Reaction toggle needs a GraphQL comment nodeId (IC_…) or numeric comment id'
      );
    }
    basePath = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;
    deletePath = (rid) =>
      `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions/${rid}`;
  }

  if (nextReacted) {
    try {
      await apiSend(
        githubRestUrl(basePath, ctx),
        fetchImpl,
        token,
        { method: 'POST', body: { content } }
      );
      return { content, reacted: true, via: 'rest' };
    } catch (err: any) {
      const restMsg = String(err?.message || err || 'REST reaction failed');
      const e: any = new Error(
        `${restMsg} | rxv4 via=rest subject=${restSubject} path=${basePath}`
      );
      e.status = err?.status ?? 403;
      e.via = 'rest';
      e.restPath = basePath;
      throw e;
    }
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
    return { content, reacted: false, via: 'rest' };
  }
  await apiSend(
    githubRestUrl(deletePath(target.id), ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
  return { content, reacted: false, via: 'rest' };
}

