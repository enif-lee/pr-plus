/** @module modal/lib/graphql-cost-log */
/**
 * Pure helpers for GraphQL primary-point cost observation.
 * Used by fetch-api apiGraphql + e2e dumps (not a re-implementation of cost math).
 */

/**
 * Inject root `rateLimit { cost remaining used limit }` so each response
 * reports this query's primary point cost (GitHub docs).
 * @param {string} query
 * @returns {string}
 */
export function injectRateLimitCostField(query: any): string {
  const q = String(query || '');
  if (!q.trim()) return q;
  if (/rateLimit\s*\{/.test(q)) return q;
  // GitHub GraphQL: rateLimit lives on Query only — never inject into mutations
  // (resolveReviewThread / unresolve / addReaction / … fail with field errors).
  if (/\bmutation\b/i.test(q)) return q;
  const trimmed = q.replace(/\s+$/, '');
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace < 0) return q;
  return (
    trimmed.slice(0, lastBrace) +
    '\n  rateLimit { cost remaining used limit resetAt }\n' +
    trimmed.slice(lastBrace)
  );
}

/**
 * Human/op label for a GraphQL document (named op, root field, or heuristics).
 * @param {string} query
 * @param {object} [variables]
 * @returns {string}
 */
export function labelGraphqlOperation(query: any, variables: any = null): string {
  const q = String(query || '');

  // Prefer stable cost-log labels for review-thread shell / by-id before named-op passthrough
  if (/ReviewThreadsLastShell/.test(q)) return 'reviewThreads.last.shell';
  if (/ReviewThreadsFirstShell/.test(q)) return 'reviewThreads.first.shell';
  if (/ReviewThreadsByIdsFull/.test(q)) return 'reviewThreads.byIds';
  if (/TimelineItemsPage/.test(q) || /timelineItems\s*\(/.test(q)) {
    return 'timelineItems.page';
  }
  // legacy name + CostFlat rename both map to byIds
  if (/reviewThreads\s*\(/.test(q) && /last\s*:/.test(q)) {
    // Nested comments(first:100) on window = legacy full; else shell-like
    if (/comments\s*\(\s*first\s*:\s*100/.test(q)) return 'reviewThreads.last';
    return 'reviewThreads.last.shell';
  }
  if (/reviewThreads\s*\(/.test(q) && /first\s*:/.test(q)) {
    if (/comments\s*\(\s*first\s*:\s*100/.test(q)) return 'reviewThreads.first';
    return 'reviewThreads.first.shell';
  }
  if (/PullRequestReviewThread/.test(q) && /nodes\s*\(\s*ids/.test(q)) {
    return 'reviewThreads.byIds';
  }

  const named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (named?.[2]) return named[2];
  if (/viewerViewedState|ViewerViewedFiles/.test(q)) return 'viewerViewedFiles';
  if (/projectItems|closingIssuesReferences|sidebar/i.test(q)) return 'sidebarMeta';
  if (/viewerSubscription|mergeStateStatus|updateSubscription/.test(q)) {
    return /updateSubscription/.test(q) ? 'subscription.update' : 'subscription.read';
  }
  if (/markFileAsViewed/.test(q)) return 'markFileAsViewed';
  if (/unmarkFileAsViewed/.test(q)) return 'unmarkFileAsViewed';
  if (/addPullRequestReviewThread/.test(q)) return 'addReviewThread';
  if (/resolveReviewThread|unresolveReviewThread/.test(q)) return 'resolveThread';
  if (/reactionGroups|Reactable/.test(q) && /nodes\s*\(\s*ids/.test(q)) {
    return 'reactableReactions';
  }
  if (/addReaction|removeReaction/.test(q)) return 'reaction.mutate';
  if (/issueOrPullRequest/.test(q)) return 'issueOrPrSummaries';

  const root = q.match(
    /\b(?:query|mutation)\b[^{]*\{\s*([A-Za-z_][A-Za-z0-9_]*)/
  );
  if (root?.[1] && root[1] !== 'rateLimit') return root[1];

  const kind = /\bmutation\b/.test(q) ? 'mutation' : 'query';
  return kind;
}

/**
 * Compact variables for logs (no tokens/bodies).
 * @param {object|null|undefined} variables
 * @returns {object}
 */
export function sanitizeGraphqlVariables(variables: any): Record<string, any> {
  if (!variables || typeof variables !== 'object') return {};
  const out: Record<string, any> = {};
  for (const k of [
    'owner',
    'name',
    'repo',
    'number',
    'n',
    'cursor',
    'ids',
    'first',
    'last',
    'since',
    'before',
    'after',
  ]) {
    if (variables[k] === undefined) continue;
    if (k === 'ids' && Array.isArray(variables[k])) {
      out.idsCount = variables[k].length;
      out.idsSample = variables[k].slice(0, 3).map(String);
      continue;
    }
    const v = variables[k];
    if (v == null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else {
      out[k] = String(v).slice(0, 48);
    }
  }
  return out;
}

/**
 * Aggregate cost entries by operation label.
 * @param {Array<{ op?: string, cost?: number|null, ms?: number, ok?: boolean }>} entries
 * @returns {{
 *   totalCalls: number,
 *   totalCost: number,
 *   unknownCostCalls: number,
 *   byOp: Array<{ op: string, calls: number, cost: number, avgCost: number, maxCost: number, avgMs: number }>,
 * }}
 */
export function summarizeGraphqlCostEntries(entries: any) {
  const list = Array.isArray(entries) ? entries : [];
  const map = new Map();
  let totalCost = 0;
  let unknownCostCalls = 0;
  for (const e of list) {
    const op = String(e?.op || 'unknown');
    const cost =
      e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null;
    const ms =
      e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
    if (!map.has(op)) {
      map.set(op, {
        op,
        calls: 0,
        cost: 0,
        maxCost: 0,
        msSum: 0,
        knownCostCalls: 0,
      });
    }
    const row = map.get(op);
    row.calls += 1;
    row.msSum += ms;
    if (cost != null) {
      row.cost += cost;
      row.knownCostCalls += 1;
      row.maxCost = Math.max(row.maxCost, cost);
      totalCost += cost;
    } else {
      unknownCostCalls += 1;
    }
  }
  const byOp = [...map.values()]
    .map((r) => ({
      op: r.op,
      calls: r.calls,
      cost: r.cost,
      avgCost:
        r.knownCostCalls > 0
          ? Math.round((r.cost / r.knownCostCalls) * 100) / 100
          : 0,
      maxCost: r.maxCost,
      avgMs: r.calls > 0 ? Math.round(r.msSum / r.calls) : 0,
    }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  return {
    totalCalls: list.length,
    totalCost,
    unknownCostCalls,
    byOp,
  };
}
