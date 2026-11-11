/** Count review conversations once per thread, independently of loaded replies. */
export function summarizeCommentThreads(detail: any) {
  const meta = detail?.reviewThreadsMeta;
  const threads = new Map<string, any>();
  const comments = new Map<string, any[]>();
  for (const comment of detail?.reviewComments || []) {
    const id = String(comment?.threadNodeId || '');
    if (!id) continue;
    const rows = comments.get(id) || [];
    rows.push(comment);
    comments.set(id, rows);
  }
  let pending = 0;
  for (const thread of detail?.reviewThreads || []) {
    const id = String(thread?.threadNodeId || '');
    if (!id || threads.has(id)) continue;
    threads.set(id, thread);
  }
  let resolved = 0;
  let unresolved = 0;
  for (const [id, thread] of threads) {
    const rows = comments.get(id) || [];
    if (thread.pending || (rows.length > 0 && rows.every(c => c.pending))) {
      pending++;
      continue;
    }
    // REST synthetic threads cannot report GitHub's resolution state.
    if (!id.startsWith('PRRT_') || typeof thread.resolved !== 'boolean') continue;
    if (thread.resolved) resolved++;
    else unresolved++;
  }
  const loaded = resolved + unresolved;
  const hasMore = Boolean(meta?.hasMore || meta?.hasOlder || meta?.hasNewerFromOldest);
  const graphql = meta?.source === 'graphql';
  const reported = meta?.totalCount;
  const hasTotal = graphql && Number.isInteger(reported) && reported >= 0;
  // A REST total is an estimate derived from comment pages, not a PRRT count.
  const total = hasTotal ? Math.max(loaded, reported - pending) : null;
  return {
    resolved, unresolved, loaded, total,
    unknown: total == null ? 0 : total - loaded,
    partial: total == null || hasMore || total > loaded,
    available: (graphql && hasTotal) || loaded > 0,
  };
}
