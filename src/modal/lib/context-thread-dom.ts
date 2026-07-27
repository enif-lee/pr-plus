/** @module modal/lib/context-thread-dom */
/**
 * DOM helpers for context-thread shortcuts (Conversation + Diff).
 * Hosts carry data-thread-focus-anchor and/or data-search-anchor.
 *
 * Conversation + Diff stay keep-alive mounted — always prefer the *active*
 * body panel so queries do not hit the hidden panel first.
 */

function escapeCssAttr(a: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(a)
    : a.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Align `child` to the top of `scroller` by adjusting scrollTop only.
 * Used for in-group thread hops that share one virtual row index
 * (row jump alone would leave scrollTop unchanged).
 * @returns delta applied (0 if no-op / missing nodes)
 */
export function scrollChildToScrollerTop(
  scroller: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: { pad?: number; minDelta?: number } | null
): number {
  if (!scroller || !child) return 0;
  const pad = Number.isFinite(opts?.pad as number) ? Number(opts?.pad) : 0;
  const minDelta = Number.isFinite(opts?.minDelta as number)
    ? Number(opts?.minDelta)
    : 1;
  try {
    const sRect = scroller.getBoundingClientRect();
    const cRect = child.getBoundingClientRect();
    const delta = cRect.top - sRect.top - pad;
    if (Math.abs(delta) <= minDelta) return 0;
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const next = Math.min(max, Math.max(0, scroller.scrollTop + delta));
    const applied = next - scroller.scrollTop;
    if (Math.abs(applied) <= minDelta) return 0;
    scroller.scrollTop = next;
    return applied;
  } catch {
    return 0;
  }
}

/** Query anchor node inside a scroller (thread-focus, then search). */
export function queryAnchorInScroller(
  scroller: HTMLElement | null | undefined,
  anchor: string
): HTMLElement | null {
  if (!scroller) return null;
  const a = String(anchor || '').trim();
  if (!a) return null;
  const esc = escapeCssAttr(a);
  return queryInScope(scroller, esc);
}

function queryInScope(
  scope: ParentNode,
  esc: string
): HTMLElement | null {
  try {
    return (
      (scope.querySelector(
        `[data-thread-focus-anchor="${esc}"]`
      ) as HTMLElement | null) ||
      (scope.querySelector(
        `[data-search-anchor="${esc}"]`
      ) as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

/**
 * Find the thread host for a review-comment:… / review-group:… anchor.
 * Prefers `.prp-body-panel--active` so Diff nav does not hit Conversation keep-alive.
 */
export function queryContextThreadHost(
  anchor: string,
  root: ParentNode | null = null
): HTMLElement | null {
  const a = String(anchor || '').trim();
  if (!a) return null;
  const overlay =
    root ||
    (typeof document !== 'undefined'
      ? document.querySelector('.prp-overlay') || document
      : null);
  if (!overlay) return null;
  const esc = escapeCssAttr(a);

  // 1) Active layout panel (conversation or diff)
  try {
    const active = (overlay as ParentNode).querySelector?.(
      '.prp-body-panel--active'
    ) as HTMLElement | null;
    if (active) {
      const hit = queryInScope(active, esc);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }

  // 2) Explicit layout roots
  for (const sel of [
    '.prp-body-panel--diff.prp-body-panel--active',
    '.prp-body-panel--conversation.prp-body-panel--active',
    '.prp-diff',
    '.prp-conversation',
  ]) {
    try {
      const sub = (overlay as ParentNode).querySelector?.(sel) as HTMLElement | null;
      if (!sub) continue;
      const hit = queryInScope(sub, esc);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }

  // 3) Fallback whole overlay
  return queryInScope(overlay, esc);
}

/**
 * Reply textarea inside a thread host (InlineThread MarkdownComposer).
 * When collapsed to ghost, no textarea yet — caller should open first.
 */
export function queryContextThreadReply(
  host: HTMLElement | null
): HTMLTextAreaElement | null {
  if (!host) return null;
  return (
    (host.querySelector(
      '[data-context-reply="1"] textarea.prp-mdc__ta'
    ) as HTMLTextAreaElement | null) ||
    (host.querySelector(
      'textarea.prp-mdc__ta'
    ) as HTMLTextAreaElement | null) ||
    (host.querySelector(
      '.prp-inline-thread__composer textarea'
    ) as HTMLTextAreaElement | null) ||
    (host.querySelector('textarea') as HTMLTextAreaElement | null)
  );
}

/** Ghost "Reply" control when MarkdownComposer is collapsed. */
export function queryContextThreadGhost(
  host: HTMLElement | null
): HTMLButtonElement | null {
  if (!host) return null;
  return (
    (host.querySelector(
      '[data-context-reply="1"] button.prp-mdc__ghost'
    ) as HTMLButtonElement | null) ||
    (host.querySelector(
      'button.prp-mdc__ghost'
    ) as HTMLButtonElement | null)
  );
}

export function isContextThreadReplyFocused(anchor: string): boolean {
  if (typeof document === 'undefined') return false;
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return false;
  const tag = String(ae.tagName || '').toUpperCase();
  if (tag !== 'TEXTAREA' && tag !== 'INPUT' && !ae.isContentEditable) {
    return false;
  }
  const host = queryContextThreadHost(anchor);
  return Boolean(host && host.contains(ae));
}

function focusTextarea(ta: HTMLTextAreaElement): boolean {
  if (ta.disabled) return false;
  try {
    ta.focus({ preventScroll: false } as FocusOptions);
    const len = String(ta.value || '').length;
    ta.setSelectionRange?.(len, len);
    return typeof document !== 'undefined' && document.activeElement === ta;
  } catch {
    try {
      ta.focus();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Focus the reply composer for `anchor`.
 * Opens MarkdownComposer ghost if needed, then focuses the textarea.
 */
export function focusContextThreadReply(anchor: string): boolean {
  const host = queryContextThreadHost(anchor);
  if (!host) return false;

  // Skip hosts in inactive keep-alive panels
  const panel = host.closest?.('.prp-body-panel') as HTMLElement | null;
  if (panel && !panel.classList.contains('prp-body-panel--active')) {
    return false;
  }

  const ta = queryContextThreadReply(host);
  if (ta) return focusTextarea(ta);

  // Collapsed to ghost — open then caller retries for textarea mount
  const ghost = queryContextThreadGhost(host);
  if (ghost && !ghost.disabled) {
    try {
      ghost.click();
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * After expand/open, retry until the textarea is focused.
 */
export function focusContextThreadReplyAfterPaint(
  anchor: string,
  attempts = 20
): void {
  let left = Math.max(1, attempts);
  const tryFocus = () => {
    if (focusContextThreadReply(anchor)) return;
    left -= 1;
    if (left <= 0) return;
    window.requestAnimationFrame(() => {
      window.setTimeout(tryFocus, 48);
    });
  };
  window.requestAnimationFrame(() => {
    window.setTimeout(tryFocus, 48);
  });
}

/**
 * True when this review comment id is the active context-thread target
 * (Conversation kb focus or Diff comment nav).
 */
export function isContextThreadCommentActive(
  commentId: string | number | null | undefined,
  state: {
    focusedConversationAnchor?: string | null;
    pendingConversationNavAnchor?: string | null;
    activeDiffCommentId?: string | number | null;
  }
): boolean {
  if (commentId == null || commentId === '') return false;
  const id = String(commentId);
  const anchor = `review-comment:${id}`;
  const focused = String(state.focusedConversationAnchor || '').trim();
  const pending = String(state.pendingConversationNavAnchor || '').trim();
  if (focused === anchor || pending === anchor) return true;
  const diffId = state.activeDiffCommentId;
  return diffId != null && String(diffId) === id;
}
