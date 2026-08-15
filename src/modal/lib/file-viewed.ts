/**
 * Server + local Mark file Viewed helpers (GraphQL markFileAsViewed).
 * Pure builders/parsers for unit tests; network lives in fetch-api.
 */

export type ViewerViewedState = 'VIEWED' | 'UNVIEWED' | 'DISMISSED' | string;

/**
 * Parse GraphQL PR files connection into path set that are VIEWED.
 * Accepts several nesting shapes used by our fetch helpers.
 */
export function parseViewedPathsFromGraphql(data: any): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const push = (p: unknown) => {
    const s = String(p || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    paths.push(s);
  };

  const root = data?.repository?.pullRequest || data?.pullRequest || data || {};
  const filesConn = root.files || root.viewerViewedFiles || null;
  const nodes = Array.isArray(filesConn)
    ? filesConn
    : Array.isArray(filesConn?.nodes)
      ? filesConn.nodes
      : Array.isArray(filesConn?.edges)
        ? filesConn.edges.map((e: any) => e?.node).filter(Boolean)
        : [];

  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const path = n.path || n.filename || n.name;
    const state = String(
      n.viewerViewedState || n.viewer_viewed_state || n.viewedState || ''
    )
      .trim()
      .toUpperCase();
    if (state === 'VIEWED') push(path);
  }

  // Flat list of paths (already filtered server-side)
  if (Array.isArray(root.viewedPaths)) {
    for (const p of root.viewedPaths) push(p);
  }
  return paths;
}

/** Merge server viewed paths with a local Set (server wins on conflict when provided). */
export function mergeViewedPathSets(
  local: Iterable<string> | null | undefined,
  server: Iterable<string> | null | undefined,
  opts: { preferServer?: boolean } = {}
): Set<string> {
  const preferServer = opts.preferServer !== false;
  const out = new Set<string>();
  if (preferServer) {
    for (const p of server || []) {
      const s = String(p || '').trim();
      if (s) out.add(s);
    }
    // Keep local-only paths that server did not yet list (optimistic) only when
    // server payload was empty/unknown — caller passes empty server to keep local.
    if (!server || (Array.isArray(server) && server.length === 0 && !(server instanceof Set))) {
      // empty array means "server said none viewed"
      return out;
    }
    if (server instanceof Set && server.size === 0) return out;
    return out;
  }
  for (const p of local || []) {
    const s = String(p || '').trim();
    if (s) out.add(s);
  }
  for (const p of server || []) {
    const s = String(p || '').trim();
    if (s) out.add(s);
  }
  return out;
}

/**
 * After a mark/unmark, apply optimistic result to a Set.
 */
export function applyViewedToggle(
  viewed: Iterable<string> | null | undefined,
  path: string,
  markAsViewed: boolean
): Set<string> {
  const next = new Set<string>();
  for (const p of viewed || []) {
    const s = String(p || '').trim();
    if (s) next.add(s);
  }
  const p = String(path || '').trim();
  if (!p) return next;
  if (markAsViewed) next.add(p);
  else next.delete(p);
  return next;
}

export function buildMarkFileAsViewedGraphql(
  pullRequestId: string,
  path: string
) {
  return {
    query: `mutation MarkFileAsViewed($input: MarkFileAsViewedInput!) {
  markFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    variables: {
      input: {
        pullRequestId: String(pullRequestId || ''),
        path: String(path || ''),
      },
    },
  };
}

export function buildUnmarkFileAsViewedGraphql(
  pullRequestId: string,
  path: string
) {
  return {
    query: `mutation UnmarkFileAsViewed($input: UnmarkFileAsViewedInput!) {
  unmarkFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    variables: {
      input: {
        pullRequestId: String(pullRequestId || ''),
        path: String(path || ''),
      },
    },
  };
}

/** Query PR file viewerViewedState (paginated first page; caller may page). */
export function buildFetchViewerViewedFilesGraphql(
  owner: string,
  repo: string,
  number: number,
  cursor: string | null = null
) {
  return {
    query: `query ViewerViewedFiles($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      id
      files(first:100, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}`,
    variables: {
      owner: String(owner || ''),
      repo: String(repo || ''),
      number: Number(number) || 0,
      cursor: cursor || null,
    },
  };
}

/**
 * Whether a GraphQL mark/unmark payload indicates success.
 */
export function isViewedMutationOk(data: any, mark: boolean): boolean {
  if (!data || typeof data !== 'object') return false;
  const key = mark ? 'markFileAsViewed' : 'unmarkFileAsViewed';
  const node = data[key];
  return Boolean(node?.pullRequest?.id || node?.pullRequest);
}

/**
 * Apply server viewedPaths only when the fetch was authorized and returned a
 * PR id. Empty `viewedPaths: []` without `pullRequestId` means no-token stub
 * and must not wipe session/local cache.
 */
export function shouldApplyServerViewedPaths(res: any): boolean {
  if (!res || typeof res !== 'object') return false;
  const id = res.pullRequestId ?? res.pullRequest?.id ?? null;
  return Boolean(id && String(id).trim());
}
