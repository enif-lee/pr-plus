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

/**
 * Product virtual / panel scrollers (Diff list, Conversation timeline, etc.).
 * Used after focus moves into a composer so the input is not left off-screen.
 */
export const PRODUCT_SCROLLER_SELECTOR =
  '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll';

/**
 * Nearest product scroller ancestor of `from` (or null).
 */
export function queryProductScroller(
  from: Element | null | undefined
): HTMLElement | null {
  if (!from || typeof (from as Element).closest !== 'function') return null;
  try {
    return (from as Element).closest(
      PRODUCT_SCROLLER_SELECTOR
    ) as HTMLElement | null;
  } catch {
    return null;
  }
}

/**
 * Vertical overlap (px) of `child` with the padded visible band of `scroller`.
 * 0 when missing nodes or fully outside the band.
 */
export function verticalOverlapInScroller(
  scroller: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: { padTop?: number; padBottom?: number } | null
): number {
  if (!scroller || !child) return 0;
  try {
    const sRect = scroller.getBoundingClientRect();
    const cRect = child.getBoundingClientRect();
    const vh = scroller.clientHeight || 0;
    if (vh <= 0) return 0;
    const padTop = Number.isFinite(opts?.padTop as number)
      ? Number(opts?.padTop)
      : 0;
    const padBottom = Number.isFinite(opts?.padBottom as number)
      ? Number(opts?.padBottom)
      : 0;
    const maxInset = Math.max(0, Math.floor(vh / 2) - 1);
    const topInset = Math.min(Math.max(0, padTop), maxInset);
    const bottomInset = Math.min(Math.max(0, padBottom), maxInset);
    const viewTop = sRect.top + topInset;
    const viewBottom = sRect.top + vh - bottomInset;
    const top = Math.max(viewTop, cRect.top);
    const bottom = Math.min(viewBottom, cRect.bottom);
    return Math.max(0, bottom - top);
  } catch {
    return 0;
  }
}

/**
 * True when `child` has meaningful vertical overlap with `scroller`'s viewport.
 * Default min overlap 24px — enough to count an input as "on screen".
 */
export function isElementSubstantiallyVisibleInScroller(
  scroller: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: {
    padTop?: number;
    padBottom?: number;
    minOverlapPx?: number;
  } | null
): boolean {
  const min = Number.isFinite(opts?.minOverlapPx as number)
    ? Number(opts?.minOverlapPx)
    : 24;
  return (
    verticalOverlapInScroller(scroller, child, {
      padTop: opts?.padTop,
      padBottom: opts?.padBottom,
    }) >= min
  );
}

/**
 * Adjust scrollTop so `child` is **as fully visible as possible** in `scroller`.
 * Prefer whole-card visibility when height fits; otherwise pin top (max fraction).
 * Used for Conversation keyboard focus on tall / bottom threads.
 *
 * @returns delta applied (0 if no-op / missing nodes)
 */
export function scrollChildToMaximizeInScroller(
  scroller: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: {
    pad?: number;
    padTop?: number;
    padBottom?: number;
    minDelta?: number;
  } | null
): number {
  if (!scroller || !child) return 0;
  const padBoth = Number.isFinite(opts?.pad as number) ? Number(opts?.pad) : 0;
  const padTop = Number.isFinite(opts?.padTop as number)
    ? Number(opts?.padTop)
    : padBoth;
  const padBottom = Number.isFinite(opts?.padBottom as number)
    ? Number(opts?.padBottom)
    : padBoth;
  const minDelta = Number.isFinite(opts?.minDelta as number)
    ? Number(opts?.minDelta)
    : 1;
  try {
    const sRect = scroller.getBoundingClientRect();
    const cRect = child.getBoundingClientRect();
    const vh = scroller.clientHeight || 0;
    if (vh <= 0) return 0;
    const maxInset = Math.max(0, Math.floor(vh / 2) - 1);
    const topInset = Math.min(Math.max(0, padTop), maxInset);
    const bottomInset = Math.min(Math.max(0, padBottom), maxInset);
    const avail = Math.max(1, vh - topInset - bottomInset);
    const childTopInView = cRect.top - sRect.top;
    const childH = Math.max(1, cRect.height);
    const childBottomInView = childTopInView + childH;
    const viewTop = topInset;
    const viewBottom = vh - bottomInset;

    let delta = 0;
    if (childH > avail) {
      // Tall: pin top under pad so max visible slice starts at the root
      delta = childTopInView - topInset;
    } else if (childTopInView >= viewTop && childBottomInView <= viewBottom) {
      return 0;
    } else if (childTopInView < viewTop) {
      delta = childTopInView - topInset;
    } else {
      // Clipped at bottom — pull up so bottom sits at viewBottom
      delta = childBottomInView - viewBottom;
    }

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

/**
 * **Minimal** scroll so `child` is substantially visible — no re-center, no
 * forcing the whole parent thread into view. Already fully in the padded band
 * → 0. Clipped above → pin top; clipped below → pin bottom. Tall children only
 * bring the top edge under padTop (focus band, not the entire card).
 *
 * Prefer this for Diff ↑/↓ unit focus; use maximize when the product wants the
 * whole card visible (e.g. Conversation kb focus on a short card).
 */
export function scrollChildToRevealInScroller(
  scroller: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: {
    pad?: number;
    padTop?: number;
    padBottom?: number;
    minDelta?: number;
    /** Min px of child that must sit in the view band (default 48). */
    minVisiblePx?: number;
  } | null
): number {
  if (!scroller || !child) return 0;
  const padBoth = Number.isFinite(opts?.pad as number) ? Number(opts?.pad) : 0;
  const padTop = Number.isFinite(opts?.padTop as number)
    ? Number(opts?.padTop)
    : padBoth;
  const padBottom = Number.isFinite(opts?.padBottom as number)
    ? Number(opts?.padBottom)
    : padBoth;
  const minDelta = Number.isFinite(opts?.minDelta as number)
    ? Number(opts?.minDelta)
    : 1;
  const minVisible = Number.isFinite(opts?.minVisiblePx as number)
    ? Math.max(4, Number(opts?.minVisiblePx))
    : 16;
  try {
    const sRect = scroller.getBoundingClientRect();
    const cRect = child.getBoundingClientRect();
    const vh = scroller.clientHeight || 0;
    if (vh <= 0) return 0;
    const maxInset = Math.max(0, Math.floor(vh / 2) - 1);
    const topInset = Math.min(Math.max(0, padTop), maxInset);
    const bottomInset = Math.min(Math.max(0, padBottom), maxInset);
    const viewTop = topInset;
    const viewBottom = vh - bottomInset;
    const childTopInView = cRect.top - sRect.top;
    const childH = Math.max(1, cRect.height);
    const childBottomInView = childTopInView + childH;
    const overlapTop = Math.max(viewTop, childTopInView);
    const overlapBottom = Math.min(viewBottom, childBottomInView);
    const overlap = Math.max(0, overlapBottom - overlapTop);
    // Fully (or almost fully) in padded band — no jump. Use nearly full
    // height for short code rows (~22px) so a sliver at the edge still scrolls.
    const need = Math.min(minVisible, Math.max(8, childH * 0.85));
    if (
      overlap >= need &&
      childTopInView >= viewTop - 1 &&
      childBottomInView <= viewBottom + 1
    ) {
      return 0;
    }
    // Partial edge clip: still adjust so the whole short row fits when possible
    const fullyIn =
      childTopInView >= viewTop && childBottomInView <= viewBottom;
    if (fullyIn && overlap >= need) return 0;

    let delta = 0;
    if (childH > viewBottom - viewTop) {
      // Tall focus target: only ensure top edge is under pad (minimal)
      delta = childTopInView - topInset;
    } else if (childTopInView < viewTop) {
      delta = childTopInView - topInset;
    } else if (childBottomInView > viewBottom) {
      delta = childBottomInView - viewBottom;
    } else {
      return 0;
    }

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

/**
 * Outermost product form host for a focused input — mode tabs + textarea +
 * CTA row. Prefer outer card / thread composer over nested `.prp-mdc`.
 */
export function resolveComposerFormHost(
  el: HTMLElement | null | undefined
): HTMLElement | null {
  if (!el) return null;
  // Outer-first: Conversation card wraps [data-prp-composer-root]; Diff
  // inline thread puts root + context-reply on the same composer node.
  const selectors = [
    '.prp-card--composer',
    '.prp-inline-thread__composer',
    '.prp-selection-dock',
    '.prp-finish-review__composer',
    '[data-prp-composer-root]',
    '[data-context-reply="1"]',
    '.prp-mdc',
  ];
  try {
    for (const sel of selectors) {
      const hit = el.closest?.(sel) as HTMLElement | null;
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return el;
}

/**
 * After keyboard focus lands on a composer/input — or when the form grows while
 * typing — move the product scroller so the **whole form** (input + action
 * buttons) stays visible. Virtual lists ignore native focus scroll.
 *
 * When the form is taller than the viewport, prefer keeping the **bottom**
 * (CTAs) on-screen so Submit/Comment remain reachable.
 *
 * @returns scrollTop delta applied (0 if already visible / no scroller)
 */
export function scrollFocusedComposerIntoView(
  el: HTMLElement | null | undefined,
  opts?: {
    padTop?: number;
    padBottom?: number;
    minDelta?: number;
  } | null
): number {
  if (!el) return 0;
  const target = resolveComposerFormHost(el) || el;

  const scroller = queryProductScroller(target) || queryProductScroller(el);
  if (!scroller) {
    try {
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
    return 0;
  }
  // Host outside this scroller (keep-alive panel) — no-op
  try {
    if (!scroller.contains(target) && !scroller.contains(el)) return 0;
  } catch {
    /* ignore */
  }

  const padTop = Number.isFinite(opts?.padTop as number)
    ? Number(opts?.padTop)
    : 16;
  const padBottom = Number.isFinite(opts?.padBottom as number)
    ? Number(opts?.padBottom)
    : 24;
  const minDelta = Number.isFinite(opts?.minDelta as number)
    ? Number(opts?.minDelta)
    : 1;

  try {
    const sRect = scroller.getBoundingClientRect();
    const cRect = target.getBoundingClientRect();
    const vh = scroller.clientHeight || 0;
    if (vh <= 0) return 0;
    const maxInset = Math.max(0, Math.floor(vh / 2) - 1);
    const topInset = Math.min(Math.max(0, padTop), maxInset);
    const bottomInset = Math.min(Math.max(0, padBottom), maxInset);
    const avail = Math.max(1, vh - topInset - bottomInset);
    const childH = Math.max(1, cRect.height);

    // Tall form (grows past viewport): pin bottom so CTAs stay reachable
    if (childH > avail) {
      const childBottomInView = cRect.bottom - sRect.top;
      const viewBottom = vh - bottomInset;
      const delta = childBottomInView - viewBottom;
      if (Math.abs(delta) <= minDelta) return 0;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.min(max, Math.max(0, scroller.scrollTop + delta));
      const applied = next - scroller.scrollTop;
      if (Math.abs(applied) <= minDelta) return 0;
      scroller.scrollTop = next;
      return applied;
    }
  } catch {
    /* fall through to maximize */
  }

  return scrollChildToMaximizeInScroller(scroller, target, {
    padTop,
    padBottom,
    minDelta,
  });
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
  let ok = false;
  try {
    // preventScroll: native window scroll does not move product virtual lists
    ta.focus({ preventScroll: true } as FocusOptions);
    const len = String(ta.value || '').length;
    ta.setSelectionRange?.(len, len);
    ok = typeof document !== 'undefined' && document.activeElement === ta;
  } catch {
    try {
      ta.focus();
      ok = true;
    } catch {
      return false;
    }
  }
  if (ok) {
    // Virtual list scrollTop — same path for ⌥I Diff + Conversation
    try {
      scrollFocusedComposerIntoView(ta, { padTop: 24, padBottom: 48 });
    } catch {
      /* ignore */
    }
  }
  return ok;
}

/**
 * Prefer active-panel context-active thread when anchor lookup misses
 * (reply-unit focus vs root anchor, virtual remount lag).
 */
function queryContextThreadHostFallback(
  preferred: HTMLElement | null
): HTMLElement | null {
  // Prefer active panel even when preferred was found in keep-alive (inactive)
  try {
    if (typeof document === 'undefined') return preferred;
    const overlay =
      document.querySelector('.prp-overlay') ||
      document.querySelector('#prp-page-embed') ||
      document;
    const activePanel = (overlay as ParentNode).querySelector?.(
      '.prp-body-panel--active'
    ) as HTMLElement | null;
    if (preferred && activePanel && !activePanel.contains(preferred)) {
      preferred = null;
    }
    if (preferred) return preferred;
    const scope = activePanel || (overlay as ParentNode);
    return (
      (scope.querySelector(
        '.prp-inline-thread--context-active'
      ) as HTMLElement | null) ||
      (scope.querySelector(
        '.prp-inline-thread[data-context-active="1"]'
      ) as HTMLElement | null)
    );
  } catch {
    return preferred;
  }
}

/**
 * Focus the reply composer for `anchor`.
 * Opens MarkdownComposer ghost if needed, then focuses the textarea and
 * scrolls the product scroller so the input is visible.
 */
export function focusContextThreadReply(anchor: string): boolean {
  let host = queryContextThreadHost(anchor);
  host = queryContextThreadHostFallback(host);
  if (!host) return false;

  // Skip hosts in inactive keep-alive panels
  const panel = host.closest?.('.prp-body-panel') as HTMLElement | null;
  if (panel && !panel.classList.contains('prp-body-panel--active')) {
    // Still try active-panel fallback
    host = queryContextThreadHostFallback(null);
    if (!host) return false;
  }

  // Prefer composer host (includes CTAs) when anchor is the vline wrapper
  try {
    // Thread card collapsed → composer unmounted; expand first
    const threadCard =
      (host.closest?.('.prp-inline-thread') as HTMLElement | null) ||
      (host.matches?.('.prp-inline-thread') ? host : null) ||
      (host.querySelector?.('.prp-inline-thread') as HTMLElement | null);
    if (threadCard?.classList?.contains('prp-inline-thread--collapsed')) {
      const fold = threadCard.querySelector(
        'button[aria-expanded="false"], .prp-thread-toggle'
      ) as HTMLElement | null;
      try {
        fold?.click?.();
      } catch {
        /* ignore */
      }
    }

    const composer =
      (host.querySelector?.(
        '[data-context-reply="1"], .prp-inline-thread__composer, [data-prp-composer-root="1"]'
      ) as HTMLElement | null) || host;
    const ta = queryContextThreadReply(composer) || queryContextThreadReply(host);
    if (ta) return focusTextarea(ta);

    // Collapsed to ghost — open then caller retries for textarea mount
    const ghost =
      queryContextThreadGhost(composer) || queryContextThreadGhost(host);
    if (ghost && !ghost.disabled) {
      try {
        // openWriteSurface is on mousedown; synthetic click alone can miss in
        // some automation paths — fire both.
        ghost.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true })
        );
        ghost.click();
      } catch {
        try {
          ghost.click();
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * After expand/open, retry until the textarea is focused (and scrolled into view).
 */
export function focusContextThreadReplyAfterPaint(
  anchor: string,
  attempts = 28
): void {
  let left = Math.max(1, attempts);
  const tryFocus = () => {
    if (focusContextThreadReply(anchor)) {
      // Remount / virtual row settle can leave focus ok but still clipped —
      // one more maximize after layout.
      try {
        const host =
          queryContextThreadHost(anchor) ||
          queryContextThreadHostFallback(null);
        const ta = queryContextThreadReply(host);
        if (ta) scrollFocusedComposerIntoView(ta, { padTop: 24, padBottom: 48 });
      } catch {
        /* ignore */
      }
      return;
    }
    left -= 1;
    if (left <= 0) return;
    window.requestAnimationFrame(() => {
      window.setTimeout(tryFocus, 36);
    });
  };
  window.requestAnimationFrame(() => {
    window.setTimeout(tryFocus, 16);
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
    layoutMode?: string | null;
  }
): boolean {
  if (commentId == null || commentId === '') return false;
  const id = String(commentId);
  const anchor = `review-comment:${id}`;
  const layout = String(state.layoutMode || '').trim().toLowerCase();
  const diffId = state.activeDiffCommentId;
  if (layout === 'diff') {
    return diffId != null && String(diffId) === id;
  }
  const focused = String(state.focusedConversationAnchor || '').trim();
  const pending = String(state.pendingConversationNavAnchor || '').trim();
  if (focused === anchor || pending === anchor) return true;
  if (layout === 'conversation') return false;
  return diffId != null && String(diffId) === id;
}

/**
 * CustomEvent name: Tab past last / before first stop in a focused thread
 * composer. detail: `{ dir: 1 | -1, commentId?: string }`
 * App listens and runs step-nav (next/prev comment).
 */
export const PRP_CONTEXT_THREAD_TAB_LEAVE = 'prp-context-thread-tab-leave';

/**
 * Ordered Tab stops inside an InlineThread reply composer:
 * input → Comment → Start review → Resolve (if present).
 * Prefer `[data-prp-thread-tab-host]` wrappers so disabled buttons still focus.
 * When PENDING-only UI hides Comment, submit may live on Start review — de-dupe.
 */
export function listContextThreadComposerTabStops(
  composerRoot: HTMLElement | null | undefined
): HTMLElement[] {
  if (!composerRoot) return [];
  const stops: HTMLElement[] = [];
  const pushStop = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    if (stops.some((s) => s === el || s.contains(el) || el.contains(s))) return;
    stops.push(el);
  };
  try {
    const ta = composerRoot.querySelector(
      'textarea.prp-mdc__ta'
    ) as HTMLElement | null;
    if (ta) {
      pushStop(ta);
    } else {
      const ghost = composerRoot.querySelector(
        '.prp-mdc__ghost, button.prp-mdc__ghost'
      ) as HTMLElement | null;
      if (ghost) pushStop(ghost);
    }
    for (const role of ['comment', 'start-review', 'resolve'] as const) {
      const host = composerRoot.querySelector(
        `[data-prp-thread-tab-host="${role}"]`
      ) as HTMLElement | null;
      if (host) {
        pushStop(host);
        continue;
      }
      // Fallback: the control itself (when enabled)
      const sel =
        role === 'comment'
          ? '[data-prp-composer-submit]'
          : role === 'start-review'
            ? '[data-prp-composer-start-review]'
            : '[data-prp-composer-resolve]';
      const el = composerRoot.querySelector(sel) as HTMLButtonElement | null;
      if (el && !el.disabled) pushStop(el);
    }
  } catch {
    /* ignore */
  }
  return stops;
}

/**
 * Move Tab / Shift+Tab focus among composer stops for a focused thread.
 * @returns 'moved' | 'leave-next' | 'leave-prev' | 'ignore'
 */
export function stepContextThreadComposerTab(
  composerRoot: HTMLElement | null | undefined,
  dir: number,
  activeEl: Element | null = typeof document !== 'undefined'
    ? document.activeElement
    : null
): 'moved' | 'leave-next' | 'leave-prev' | 'ignore' {
  const stops = listContextThreadComposerTabStops(composerRoot);
  if (!stops.length) return 'ignore';
  const d = dir < 0 ? -1 : 1;
  let idx = -1;
  if (activeEl && composerRoot?.contains(activeEl)) {
    idx = stops.findIndex(
      (el) =>
        el === activeEl ||
        el.contains(activeEl as Node) ||
        (activeEl as HTMLElement).closest?.(
          '[data-prp-thread-tab-host], .prp-mdc'
        ) === el
    );
    // Textarea inside mdc — match first stop
    if (idx < 0 && activeEl instanceof HTMLTextAreaElement) {
      idx = stops.findIndex(
        (el) => el === activeEl || el.contains(activeEl)
      );
    }
  }
  const next = idx + d;
  if (next < 0) return 'leave-prev';
  if (next >= stops.length) return 'leave-next';
  const target = stops[next];
  try {
    // Ghost open → click first so textarea mounts
    if (
      target.classList?.contains?.('prp-mdc__ghost') ||
      target.matches?.('.prp-mdc__ghost, button.prp-mdc__ghost')
    ) {
      target.click?.();
      // Retry focus textarea shortly
      window.requestAnimationFrame(() => {
        const ta = composerRoot?.querySelector(
          'textarea.prp-mdc__ta'
        ) as HTMLTextAreaElement | null;
        try {
          ta?.focus?.();
        } catch {
          /* ignore */
        }
      });
      return 'moved';
    }
    target.focus?.({ preventScroll: true } as FocusOptions);
  } catch {
    /* ignore */
  }
  return 'moved';
}

/**
 * Dispatch leave event so App can step to next/prev comment.
 */
export function dispatchContextThreadTabLeave(
  dir: number,
  commentId?: string | number | null
): void {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(PRP_CONTEXT_THREAD_TAB_LEAVE, {
        detail: {
          dir: dir < 0 ? -1 : 1,
          commentId:
            commentId != null && commentId !== ''
              ? String(commentId)
              : null,
        },
        bubbles: true,
        composed: true,
      })
    );
  } catch {
    /* ignore */
  }
}
