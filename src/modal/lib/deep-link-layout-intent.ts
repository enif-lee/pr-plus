/** @module modal/lib/deep-link-layout-intent */
/**
 * Conversation position deep-link layout ownership.
 *
 * Deep-link restore is a *consumable intent*, not a durable layout veto:
 * applied | abandoned (user opened Diff) | soft-exhausted.
 * User-driven Diff must win over pending conversation position restore.
 */

export type ConversationDeepLinkLayoutDecision =
  | 'noop'
  | 'proceed'
  | 'force_leave_diff'
  | 'abandon';

/**
 * Decide what a conversation-position deep-link should do with layout.
 *
 * @param {{
 *   applyKey: string,
 *   liveLayout: string | null | undefined,
 *   appliedKey?: string | null,
 *   dismissedKey?: string | null,
 *   inFlightKey?: string | null,
 *   convDeepLinkKey?: string | null,
 *   exhaustedKey?: string | null,
 *   layoutDiff?: string,
 * }} s
 * @returns {ConversationDeepLinkLayoutDecision}
 */
export function decideConversationDeepLinkLayout(s: {
  applyKey: string;
  liveLayout: string | null | undefined;
  appliedKey?: string | null;
  dismissedKey?: string | null;
  inFlightKey?: string | null;
  convDeepLinkKey?: string | null;
  exhaustedKey?: string | null;
  layoutDiff?: string;
}): ConversationDeepLinkLayoutDecision {
  const key = String(s?.applyKey || '');
  if (!key) return 'noop';
  if (s.dismissedKey === key || s.appliedKey === key) return 'noop';

  const layoutDiff = s.layoutDiff || 'diff';
  const onDiff = s.liveLayout === layoutDiff;
  if (onDiff) {
    // First attempt while Diff keep-alive is active: leave Diff once so the
    // conversation scroller can mount. Re-entry after try / exhaust / mid-loop
    // must not reclaim layout (user may have opened Diff intentionally).
    const alreadyTried =
      s.inFlightKey === key ||
      s.exhaustedKey === key ||
      s.convDeepLinkKey === key;
    if (alreadyTried) return 'abandon';
    return 'force_leave_diff';
  }
  return 'proceed';
}

/**
 * Whether expandDiff should abandon conversation-position deep-link ownership.
 * Diff-path jumps (jumpToReviewComment → expandDiff) leave convDeepLinkKey
 * null and route page !== 'conversation' — those must not be treated as abandon
 * of an unrelated Diff deep-link verify loop.
 *
 * @param {{
 *   convDeepLinkKey?: string | null,
 *   routePage?: string | null,
 *   position?: string | null,
 * }} s
 * @returns {boolean}
 */
export function shouldAbandonConversationDeepLinkOnExpandDiff(s: {
  convDeepLinkKey?: string | null;
  routePage?: string | null;
  position?: string | null;
}): boolean {
  if (s?.convDeepLinkKey) return true;
  const page = String(s?.routePage || '')
    .trim()
    .toLowerCase();
  const pos =
    s?.position != null && String(s.position).trim() !== '';
  return page === 'conversation' && pos;
}

/**
 * Apply-key for a PR open + position (matches shell `${number}:${pos}`).
 * @param {string|number|null|undefined} number
 * @param {string|null|undefined} position
 * @returns {string|null}
 */
export function conversationDeepLinkApplyKey(
  number: string | number | null | undefined,
  position: string | null | undefined
): string | null {
  if (number == null || number === '') return null;
  if (position == null || String(position).trim() === '') return null;
  return `${number}:${String(position).trim()}`;
}
