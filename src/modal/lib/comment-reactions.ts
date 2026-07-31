/**
 * GitHub comment reactions — pure helpers (REST + GraphQL shapes).
 *
 * Content keys match REST (`+1`, `heart`, …). GraphQL uses THUMBS_UP, etc.
 * @see https://docs.github.com/en/rest/reactions/reactions
 */

export type ReactionContent =
  | '+1'
  | '-1'
  | 'laugh'
  | 'hooray'
  | 'confused'
  | 'heart'
  | 'rocket'
  | 'eyes';

export type ReactionGroup = {
  content: ReactionContent;
  count: number;
  viewerHasReacted: boolean;
  /** Logins who reacted (for hover tooltips; may be partial). */
  users?: string[];
};

export type ReactionDef = {
  content: ReactionContent;
  /** GraphQL ReactionContent enum value */
  gql: string;
  emoji: string;
  label: string;
};

/** Official GitHub order (picker + pills). */
export const REACTION_DEFS: readonly ReactionDef[] = [
  { content: '+1', gql: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
  { content: '-1', gql: 'THUMBS_DOWN', emoji: '👎', label: 'Thumbs down' },
  { content: 'laugh', gql: 'LAUGH', emoji: '😄', label: 'Laugh' },
  { content: 'hooray', gql: 'HOORAY', emoji: '🎉', label: 'Hooray' },
  { content: 'confused', gql: 'CONFUSED', emoji: '😕', label: 'Confused' },
  { content: 'heart', gql: 'HEART', emoji: '❤️', label: 'Heart' },
  { content: 'rocket', gql: 'ROCKET', emoji: '🚀', label: 'Rocket' },
  { content: 'eyes', gql: 'EYES', emoji: '👀', label: 'Eyes' },
] as const;

const BY_CONTENT = new Map(REACTION_DEFS.map((d) => [d.content, d]));
const BY_GQL = new Map(
  REACTION_DEFS.map((d) => [d.gql.toUpperCase(), d] as const)
);

export function reactionDef(content: unknown): ReactionDef | null {
  const key = String(content || '').trim() as ReactionContent;
  return BY_CONTENT.get(key) || null;
}

export function reactionContentToGql(content: unknown): string | null {
  return reactionDef(content)?.gql || null;
}

export function gqlReactionToContent(gql: unknown): ReactionContent | null {
  const key = String(gql || '')
    .trim()
    .toUpperCase();
  // GraphQL sometimes returns the REST alias (+1) on older payloads
  if (BY_CONTENT.has(key as ReactionContent)) return key as ReactionContent;
  return BY_GQL.get(key)?.content || null;
}

/**
 * Map REST comment `reactions` summary object → groups with counts.
 * REST summary has no viewerHasReacted / users — default false / [].
 */
export function mapRestReactionsSummary(raw: unknown): ReactionGroup[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const out: ReactionGroup[] = [];
  for (const d of REACTION_DEFS) {
    const count = Number(o[d.content]) || 0;
    if (count <= 0) continue;
    out.push({
      content: d.content,
      count,
      viewerHasReacted: false,
      users: [],
    });
  }
  return out;
}

function extractReactorLogins(reactors: unknown): string[] {
  const nodes =
    reactors && typeof reactors === 'object'
      ? (reactors as any).nodes || (reactors as any).edges || []
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const node = n?.node || n;
    const login = String(node?.login || '').trim();
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(login);
  }
  return out;
}

/**
 * Map GraphQL `reactionGroups` nodes → app groups.
 * Empty/zero groups are omitted (GitHub UI only shows active ones).
 * Includes reactor logins when reactors.nodes are present.
 */
export function mapGraphqlReactionGroups(groups: unknown): ReactionGroup[] {
  if (!Array.isArray(groups)) return [];
  const byContent = new Map<ReactionContent, ReactionGroup>();
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    const content = gqlReactionToContent((g as any).content);
    if (!content) continue;
    const users = extractReactorLogins((g as any).reactors);
    const count = Number(
      (g as any).reactors?.totalCount ??
        (g as any).users?.totalCount ??
        users.length ??
        0
    );
    const viewerHasReacted = Boolean((g as any).viewerHasReacted);
    if (count <= 0 && !viewerHasReacted) continue;
    byContent.set(content, {
      content,
      count: Math.max(0, count, users.length),
      viewerHasReacted,
      users,
    });
  }
  // Stable official order
  return REACTION_DEFS.map((d) => byContent.get(d.content)).filter(
    Boolean
  ) as ReactionGroup[];
}

/**
 * Hover label: who reacted (GitHub-style).
 * e.g. "alice, bob and you reacted with 👍"
 */
export function formatReactionUsersTooltip(
  group: ReactionGroup | null | undefined,
  opts: { viewerLogin?: string | null; emoji?: string; label?: string } = {}
): string {
  if (!group) return '';
  const def = reactionDef(group.content);
  const emoji = opts.emoji || def?.emoji || '';
  const label = opts.label || def?.label || String(group.content);
  const viewer = String(opts.viewerLogin || '').trim();
  const viewerKey = viewer.toLowerCase();
  const users = Array.isArray(group.users)
    ? group.users.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const others = users.filter((u) => u.toLowerCase() !== viewerKey);
  const names: string[] = [];
  if (group.viewerHasReacted && viewer) names.push('you');
  for (const u of others) {
    if (names.length >= 10) break;
    names.push(u);
  }
  const extra = Math.max(0, Number(group.count) || 0) - names.length;
  let who: string;
  if (names.length === 0) {
    const n = Number(group.count) || 0;
    who = n <= 0 ? 'No one' : n === 1 ? '1 person' : `${n} people`;
  } else if (names.length === 1) {
    who = names[0];
  } else if (names.length === 2) {
    who = `${names[0]} and ${names[1]}`;
  } else {
    who = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  if (extra > 0 && names.length > 0) {
    who = `${who} and ${extra} more`;
  }
  const verb = names.length <= 1 && !group.viewerHasReacted ? 'reacted' : 'reacted';
  return `${who} ${verb} with ${emoji || label}`.trim();
}

/** Groups to render as pills (count > 0). */
export function activeReactionGroups(
  groups: unknown
): ReactionGroup[] {
  const list = Array.isArray(groups) ? (groups as ReactionGroup[]) : [];
  return list.filter((g) => g && (Number(g.count) > 0 || g.viewerHasReacted));
}

/**
 * Optimistic toggle of one reaction content.
 * @param viewerLogin When set, updates `users` list for tooltips.
 * @returns next groups (zeros dropped)
 */
export function applyReactionToggle(
  groups: unknown,
  content: unknown,
  nextViewerReacted?: boolean,
  viewerLogin?: string | null
): ReactionGroup[] {
  const key = String(content || '').trim() as ReactionContent;
  if (!BY_CONTENT.has(key)) {
    return activeReactionGroups(groups);
  }
  const prev = Array.isArray(groups) ? (groups as ReactionGroup[]).slice() : [];
  const idx = prev.findIndex((g) => g.content === key);
  const cur = idx >= 0 ? prev[idx] : null;
  const currently = Boolean(cur?.viewerHasReacted);
  const nextReacted =
    typeof nextViewerReacted === 'boolean' ? nextViewerReacted : !currently;
  let count = Number(cur?.count) || 0;
  if (nextReacted && !currently) count += 1;
  if (!nextReacted && currently) count = Math.max(0, count - 1);

  let users = Array.isArray(cur?.users)
    ? cur!.users!.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const login = String(viewerLogin || '').trim();
  if (login) {
    const lk = login.toLowerCase();
    if (nextReacted && !users.some((u) => u.toLowerCase() === lk)) {
      users = [login, ...users];
    }
    if (!nextReacted) {
      users = users.filter((u) => u.toLowerCase() !== lk);
    }
  }

  if (idx >= 0) {
    if (count <= 0 && !nextReacted) {
      prev.splice(idx, 1);
    } else {
      prev[idx] = {
        content: key,
        count,
        viewerHasReacted: nextReacted,
        users,
      };
    }
  } else if (nextReacted || count > 0) {
    prev.push({
      content: key,
      count: Math.max(count, nextReacted ? 1 : 0),
      viewerHasReacted: nextReacted,
      users,
    });
  }

  // Official order
  const map = new Map(prev.map((g) => [g.content, g]));
  return REACTION_DEFS.map((d) => map.get(d.content)).filter(
    (g): g is ReactionGroup => Boolean(g && (g.count > 0 || g.viewerHasReacted))
  );
}

/**
 * Patch reactions on a comment list (issue or review) by id.
 */
export function patchCommentReactionsInList(
  list: unknown,
  commentId: unknown,
  reactions: ReactionGroup[]
): any[] {
  const arr = Array.isArray(list) ? list : [];
  const id = String(commentId);
  return arr.map((c) => {
    if (!c || String(c.id) !== id) return c;
    return { ...c, reactions };
  });
}

/**
 * GraphQL selection for reactionGroups on the hot path (timeline load).
 * Count + viewerHasReacted only — no reactor login nodes (hover loads those).
 */
export const REACTION_GROUPS_GQL = `
  reactionGroups {
    content
    viewerHasReacted
    reactors(first: 1) {
      totalCount
    }
  }
`.trim();

/** Hover / on-demand: include up to N reactor logins per group. */
export const REACTION_GROUPS_WITH_REACTORS_GQL = `
  reactionGroups {
    content
    viewerHasReacted
    reactors(first: 5) {
      totalCount
      nodes {
        ... on User { login }
        ... on Bot { login }
      }
    }
  }
`.trim();

/** Default reactor list cap for tooltips (query-level first:N). */
export const REACTION_REACTORS_FIRST = 5;
