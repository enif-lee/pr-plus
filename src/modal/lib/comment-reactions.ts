/**
 * GitHub comment reactions — pure helpers (REST + GraphQL shapes).
 *
 * Content keys match REST (`+1`, `heart`, …). GraphQL uses THUMBS_UP, etc.
 * @see https://docs.github.com/en/rest/reactions/reactions
 */

/**
 * True when a comment/PR reaction emoji picker is open in `root`.
 * Used by modal Escape: dismiss picker before closing the shell (window
 * capture runs before CommentReactions' document listener).
 */
export function isCommentReactionPickerOpen(
  root: ParentNode | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): boolean {
  if (!root || typeof (root as ParentNode).querySelector !== 'function') {
    return false;
  }
  try {
    return Boolean(
      root.querySelector(
        '[data-prp-reaction-picker="1"], .prp-reactions__picker, .prp-reactions__add[aria-expanded="true"]'
      )
    );
  } catch {
    return false;
  }
}

/**
 * Close an open reaction picker via the expanded ☺ control (toggles
 * CommentReactions local state). Returns true when a close click was fired.
 */
export function dismissCommentReactionPicker(
  root: ParentNode | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): boolean {
  if (!root || typeof (root as ParentNode).querySelector !== 'function') {
    return false;
  }
  try {
    const add = root.querySelector(
      '.prp-reactions__add[aria-expanded="true"]'
    ) as HTMLElement | null;
    if (add && !(add as HTMLButtonElement).disabled) {
      add.click();
      return true;
    }
    // Picker portaled without expanded add (edge): remove is wrong for React —
    // rely on isCommentReactionPickerOpen gate so shell stays open; next click
    // outside closes via CommentReactions mousedown.
    return isCommentReactionPickerOpen(root);
  } catch {
    return false;
  }
}

export type ReactionPickerPlacement = 'above' | 'below';

export type ReactionPickerRect = {
  top: number;
  bottom: number;
  left: number;
  right?: number;
  width: number;
  height: number;
};

/**
 * Viewport-fixed coords for the reaction emoji menu (portaled to body).
 * Uses explicit top (no translateY) so height estimates never leave the
 * menu floating away from the ☺ button. Prefers above when it fits.
 */
export function placeReactionPicker(opts: {
  button: ReactionPickerRect;
  picker: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
}): { top: number; left: number; placement: ReactionPickerPlacement } {
  const gap = Number.isFinite(opts.gap as number) ? Number(opts.gap) : 8;
  const margin = Number.isFinite(opts.margin as number)
    ? Number(opts.margin)
    : 8;
  const r = opts.button;
  const vp = opts.viewport;
  const pw = Math.max(1, Number(opts.picker?.width) || 280);
  const ph = Math.max(1, Number(opts.picker?.height) || 44);
  const vw = Math.max(1, Number(vp?.width) || 800);
  const vh = Math.max(1, Number(vp?.height) || 600);

  const btnTop = Number(r.top) || 0;
  const btnBottom =
    Number.isFinite(r.bottom as number) && r.bottom != null
      ? Number(r.bottom)
      : btnTop + (Number(r.height) || 0);
  const btnLeft = Number(r.left) || 0;

  const spaceAbove = btnTop - margin;
  const spaceBelow = vh - btnBottom - margin;

  let placement: ReactionPickerPlacement;
  if (spaceAbove >= ph + gap) {
    placement = 'above';
  } else if (spaceBelow >= ph + gap) {
    placement = 'below';
  } else {
    placement = spaceAbove >= spaceBelow ? 'above' : 'below';
  }

  // Explicit top of the menu box (FinishReview-style — no CSS translate)
  let top =
    placement === 'above' ? btnTop - gap - ph : btnBottom + gap;
  top = Math.max(margin, Math.min(top, vh - ph - margin));

  let left = btnLeft;
  left = Math.max(margin, Math.min(left, vw - pw - margin));

  return { top, left, placement };
}

/**
 * True when the ☺ add-reaction control is a live layout anchor (not a
 * keep-alive inactive panel clone / zero-size / fully off-screen).
 */
export function isReactionPickerAnchorLive(
  el: Element | null | undefined,
  viewport?: { width: number; height: number }
): boolean {
  if (!el || !(el as HTMLElement).getBoundingClientRect) return false;
  const btn = el as HTMLElement;
  try {
    const panel = btn.closest?.('.prp-body-panel') as HTMLElement | null;
    if (panel && !panel.classList.contains('prp-body-panel--active')) {
      return false;
    }
  } catch {
    /* ignore */
  }
  if (typeof (btn as any).checkVisibility === 'function') {
    try {
      if (
        !(btn as any).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      ) {
        return false;
      }
    } catch {
      /* older engines */
    }
  }
  try {
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(btn);
      if (
        cs.visibility === 'hidden' ||
        cs.display === 'none' ||
        Number(cs.opacity) === 0
      ) {
        return false;
      }
    }
  } catch {
    /* ignore */
  }
  const r = btn.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const vw =
    viewport?.width ??
    (typeof window !== 'undefined' ? window.innerWidth : 0);
  const vh =
    viewport?.height ??
    (typeof window !== 'undefined' ? window.innerHeight : 0);
  if (vh > 0 && (r.bottom < 0 || r.top > vh)) return false;
  if (vw > 0 && (r.right < 0 || r.left > vw)) return false;
  return true;
}

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
