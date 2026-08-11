/**
 * Layout isolation for side-chrome shortcuts (Conversation aside meta vs Diff file chrome).
 * Shared product chords (toggleDiff, palette, merge, refresh, …) are not listed here
 * and remain allowed on both surfaces.
 */

export type LayoutSurface = 'conversation' | 'diff';

/**
 * Conversation sidebar / people-meta actions. Must not run or appear as active
 * chrome while Diff layout is live.
 */
export const CONVERSATION_SIDE_META_ACTIONS = [
  'promptLabels',
  'promptMilestone',
  'clearMilestone',
  'promptAddReviewer',
  'promptAddAssignee',
  'promptRemoveReviewer',
  'promptRemoveAssignee',
  'rerequestReview',
] as const;

/**
 * Diff file / selection / filter chrome. Must not run while Conversation layout
 * is live.
 */
export const DIFF_SIDE_ACTIONS = [
  'navFilePrev',
  'navFileNext',
  'toggleViewedActiveFile',
  'toggleActiveFileCollapse',
  'collapseActiveFile',
  'expandActiveFile',
  'filterUnresolved',
  'filterResolved',
  'filterPending',
  'moveSelectionUp',
  'moveSelectionDown',
  'extendSelectionUp',
  'extendSelectionDown',
  'openSelectionComment',
  'copySelectionCode',
  'copySelectionUrl',
  'dismissSelectionIsland',
  'openDiffGoto',
] as const;

const CONV_SET = new Set<string>(CONVERSATION_SIDE_META_ACTIONS as readonly string[]);
const DIFF_SET = new Set<string>(DIFF_SIDE_ACTIONS as readonly string[]);

/** Normalize store/layout ids to a surface key. */
export function normalizeLayoutSurface(
  layout: string | null | undefined
): LayoutSurface {
  const s = String(layout || '')
    .trim()
    .toLowerCase();
  return s === 'diff' ? 'diff' : 'conversation';
}

/**
 * Whether a product action id may run on the given layout surface.
 * Unknown / shared actions default to allowed.
 */
export function isSideActionAllowedOnLayout(
  action: string | null | undefined,
  layout: string | null | undefined
): boolean {
  const a = String(action || '').trim();
  if (!a) return true;
  const surface = normalizeLayoutSurface(layout);
  if (CONV_SET.has(a)) return surface === 'conversation';
  if (DIFF_SET.has(a)) return surface === 'diff';
  return true;
}

/** True when action is Conversation-sidebar meta (people/labels/milestone). */
export function isConversationSideMetaAction(
  action: string | null | undefined
): boolean {
  return CONV_SET.has(String(action || '').trim());
}

/** True when action is Diff-only side chrome. */
export function isDiffSideAction(action: string | null | undefined): boolean {
  return DIFF_SET.has(String(action || '').trim());
}
