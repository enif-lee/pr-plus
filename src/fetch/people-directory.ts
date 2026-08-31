/**
 * Repo assignable / mentionable people directory (GitHub permission search).
 * Query-scoped GraphQL first; REST assignees list as fallback.
 */
import {
  apiGraphql,
  apiJson,
  githubRestUrl,
  normalizeApiCtx,
} from './http';

export const PEOPLE_DIRECTORY_PAGE_SIZE = 20;

export const ASSIGNABLE_USERS_QUERY = `
query AssignableUsers($owner:String!,$name:String!,$query:String,$n:Int!){
  repository(owner:$owner,name:$name){
    assignableUsers(first:$n,query:$query){
      nodes{ login name avatarUrl }
    }
  }
}`;

export const MENTIONABLE_USERS_QUERY = `
query MentionableUsers($owner:String!,$name:String!,$query:String,$n:Int!){
  repository(owner:$owner,name:$name){
    mentionableUsers(first:$n,query:$query){
      nodes{ login name avatarUrl }
    }
  }
}`;

/** Request-review only allows repo collaborators (GitHub 422 otherwise). */
export const COLLABORATORS_QUERY = `
query RepoCollaborators($owner:String!,$name:String!,$query:String,$n:Int!){
  repository(owner:$owner,name:$name){
    collaborators(first:$n,query:$query){
      nodes{ login name avatarUrl }
    }
  }
}`;

export type PeopleDirectoryKind = 'assignable' | 'mentionable' | 'collaborator';

export function normalizePeopleDirectoryKind(kind: any): PeopleDirectoryKind {
  if (kind === 'mentionable') return 'mentionable';
  if (kind === 'collaborator') return 'collaborator';
  return 'assignable';
}

export function mapDirectoryPeopleNodes(nodes: any): Array<{
  login: string;
  name: string;
  avatarUrl: string;
}> {
  const out: Array<{ login: string; name: string; avatarUrl: string }> = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const login = String(n?.login || '').trim();
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      login,
      name: String(n?.name || '').trim(),
      avatarUrl: String(n?.avatarUrl || n?.avatar_url || '').trim(),
    });
  }
  return out;
}

function directoryPageSize(first: any): number {
  const n = Number(first);
  if (!Number.isFinite(n) || n <= 0) return PEOPLE_DIRECTORY_PAGE_SIZE;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

function mapRestUserList(batch: any) {
  return mapDirectoryPeopleNodes(
    Array.isArray(batch)
      ? batch.map((u: any) => ({
          login: u?.login,
          name: u?.name,
          avatarUrl: u?.avatar_url || u?.avatarUrl,
        }))
      : []
  );
}

async function searchRepoPeopleRestFallback(
  owner: any,
  repo: any,
  kind: PeopleDirectoryKind,
  fetchImpl: any,
  token: any,
  ctx: any
) {
  if (kind === 'collaborator') {
    const collabUrl = githubRestUrl(
      `/repos/${owner}/${repo}/collaborators?per_page=100&affiliation=all`,
      ctx
    );
    try {
      return mapRestUserList(await apiJson(collabUrl, fetchImpl, token));
    } catch {
      /* fall through to assignees */
    }
  }
  const url = githubRestUrl(
    `/repos/${owner}/${repo}/assignees?per_page=100`,
    ctx
  );
  return mapRestUserList(await apiJson(url, fetchImpl, token));
}

function gqlForKind(kind: PeopleDirectoryKind) {
  if (kind === 'collaborator') return COLLABORATORS_QUERY;
  if (kind === 'mentionable') return MENTIONABLE_USERS_QUERY;
  return ASSIGNABLE_USERS_QUERY;
}

function nodesForKind(kind: PeopleDirectoryKind, data: any) {
  if (kind === 'collaborator') return data?.repository?.collaborators?.nodes;
  if (kind === 'mentionable') return data?.repository?.mentionableUsers?.nodes;
  return data?.repository?.assignableUsers?.nodes;
}

/**
 * Search users who can be assigned, mentioned, or requested as reviewers.
 * Reviewer picker must use `collaborator` — GitHub 422s non-collaborators.
 */
export async function searchRepoPeople(
  owner: any,
  repo: any,
  opts: {
    query?: string;
    kind?: PeopleDirectoryKind;
    first?: number;
  } = {},
  fetchImpl?: any,
  token?: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const q = String(opts.query || '').trim();
  const n = directoryPageSize(opts.first);
  const kind = normalizePeopleDirectoryKind(opts.kind);
  try {
    const data = await apiGraphql(
      gqlForKind(kind),
      {
        owner: String(owner || ''),
        name: String(repo || ''),
        query: q || null,
        n,
      },
      fetchImpl,
      token,
      ctx
    );
    return mapDirectoryPeopleNodes(nodesForKind(kind, data));
  } catch {
    try {
      return await searchRepoPeopleRestFallback(
        owner,
        repo,
        kind,
        fetchImpl,
        token,
        ctx
      );
    } catch {
      return [];
    }
  }
}
