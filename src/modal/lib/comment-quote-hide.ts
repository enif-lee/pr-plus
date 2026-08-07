/**
 * Pure helpers for GitHub-style Quote reply markdown and hide/minimize state.
 */

/** GitHub ReportedContentClassifiers for minimizeComment */
export const HIDE_REASONS = [
  'SPAM',
  'ABUSE',
  'OFF_TOPIC',
  'OUTDATED',
  'DUPLICATE',
  'RESOLVED',
] as const;

export type HideReason = (typeof HIDE_REASONS)[number];

export const DEFAULT_HIDE_REASON: HideReason = 'OFF_TOPIC';

const REASON_LABELS: Record<string, string> = {
  SPAM: 'spam',
  ABUSE: 'abuse',
  OFF_TOPIC: 'off-topic',
  OUTDATED: 'outdated',
  DUPLICATE: 'duplicate',
  RESOLVED: 'resolved',
};

export function normalizeHideReason(raw: unknown): HideReason {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
  if ((HIDE_REASONS as readonly string[]).includes(s)) return s as HideReason;
  // GraphQL sometimes returns human labels
  const key = Object.keys(REASON_LABELS).find(
    (k) => REASON_LABELS[k] === String(raw || '').toLowerCase()
  );
  return (key as HideReason) || DEFAULT_HIDE_REASON;
}

export function hideReasonLabel(raw: unknown): string {
  const r = normalizeHideReason(raw);
  return REASON_LABELS[r] || String(raw || 'hidden').toLowerCase();
}

/**
 * GitHub Quote reply: each line of body prefixed with `> `.
 * Optional author attribution line before the quote.
 */
export function quoteReplyMarkdown(
  body: unknown,
  author?: string | null
): string {
  const text = String(body ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.length ? text.split('\n') : [''];
  const quoted = lines.map((line) => `> ${line}`).join('\n');
  const login = String(author || '')
    .trim()
    .replace(/^@+/, '');
  const head = login ? `**@${login}** wrote:\n` : '';
  // Trailing blank line so the caret sits ready to type a reply
  return `${head}${quoted}\n\n`;
}

/**
 * Insert quote into an existing draft (prepend when empty/non-empty).
 * Avoids double-blank gaps when draft already starts with content.
 */
export function insertQuoteIntoDraft(
  draft: unknown,
  quote: string
): string {
  const q = String(quote || '');
  const d = String(draft ?? '');
  if (!q) return d;
  if (!d.trim()) return q;
  // Quote first, then existing draft
  return `${q.replace(/\n+$/, '\n\n')}${d.replace(/^\n+/, '')}`;
}

export function isCommentMinimized(comment: any): boolean {
  if (!comment || typeof comment !== 'object') return false;
  return Boolean(
    comment.isMinimized ??
      comment.minimized ??
      comment.is_minimized ??
      false
  );
}

export function commentMinimizedReason(comment: any): string | null {
  if (!isCommentMinimized(comment)) return null;
  const r =
    comment.minimizedReason ??
    comment.minimized_reason ??
    comment.classifier ??
    null;
  return r != null && String(r).trim() ? String(r) : 'OFF_TOPIC';
}

export function viewerCanMinimizeComment(comment: any): boolean {
  if (!comment || typeof comment !== 'object') return false;
  if (comment.viewerCanMinimize != null) {
    return Boolean(comment.viewerCanMinimize);
  }
  // Fallback: nodeId present → show Hide or Unhide; API will reject if unauthorized.
  // Still show when already minimized so Unhide remains available.
  return Boolean(comment.nodeId || comment.node_id);
}

/**
 * Optimistic stamp after hide/unhide mutation.
 */
export function stampCommentMinimized(
  comment: any,
  next: { isMinimized: boolean; minimizedReason?: string | null }
): any {
  if (!comment || typeof comment !== 'object') return comment;
  return {
    ...comment,
    isMinimized: Boolean(next.isMinimized),
    minimizedReason: next.isMinimized
      ? next.minimizedReason || comment.minimizedReason || DEFAULT_HIDE_REASON
      : null,
  };
}

/**
 * Patch issue + review comment lists in a detail snapshot after hide/unhide.
 */
export function patchDetailCommentMinimized(
  detail: any,
  commentId: unknown,
  next: { isMinimized: boolean; minimizedReason?: string | null }
): any {
  if (!detail || commentId == null) return detail;
  const id = String(commentId);
  const mapList = (list: any[]) =>
    (Array.isArray(list) ? list : []).map((c) =>
      c && String(c.id) === id ? stampCommentMinimized(c, next) : c
    );
  return {
    ...detail,
    comments: mapList(detail.comments),
    reviewComments: mapList(detail.reviewComments),
  };
}

/** E2E / debug stamps for quote-reply. */
export function stampQuoteReplyResult(opts: {
  ok: boolean;
  text?: string;
  commentId?: unknown;
  target?: string;
}): void {
  try {
    const r = document.documentElement;
    const text = String(opts.text || '');
    r.setAttribute('data-prp-last-quote-ok', opts.ok ? '1' : '0');
    r.setAttribute('data-prp-last-quote-body', text.slice(0, 500));
    if (opts.commentId != null) {
      r.setAttribute('data-prp-last-quote-comment-id', String(opts.commentId));
    }
    if (opts.target) {
      r.setAttribute('data-prp-last-quote-target', String(opts.target));
    }
    try {
      (window as any).__prpLastQuoteBody = text;
      (window as any).__prpLastQuoteOk = opts.ok;
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

/** E2E / debug stamps for hide/unhide. */
export function stampHideCommentResult(opts: {
  ok: boolean;
  commentId?: unknown;
  isMinimized?: boolean;
  reason?: string | null;
  action?: 'hide' | 'unhide';
}): void {
  try {
    const r = document.documentElement;
    r.setAttribute('data-prp-last-hide-ok', opts.ok ? '1' : '0');
    r.setAttribute(
      'data-prp-last-hide-minimized',
      opts.isMinimized ? '1' : '0'
    );
    if (opts.commentId != null) {
      r.setAttribute('data-prp-last-hide-comment-id', String(opts.commentId));
    }
    if (opts.reason != null) {
      r.setAttribute('data-prp-last-hide-reason', String(opts.reason));
    }
    if (opts.action) {
      r.setAttribute('data-prp-last-hide-action', opts.action);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Focus a MarkdownComposer root (opens collapsed write surface + focuses ta).
 */
export function focusComposerRoot(root: Element | null | undefined): void {
  if (!root) return;
  try {
    root.dispatchEvent(
      new CustomEvent('prp-composer-focus-input', {
        bubbles: true,
        cancelable: true,
      })
    );
  } catch {
    /* ignore */
  }
  try {
    const ta =
      (root as HTMLElement).querySelector?.(
        '[data-prp-composer-input], textarea'
      ) || null;
    (ta as HTMLTextAreaElement | null)?.focus?.();
    (root as HTMLElement).scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth',
    });
  } catch {
    /* ignore */
  }
}

/** Focus the main conversation composer (bottom of conversation). */
export function focusMainConversationComposer(): void {
  try {
    const root =
      document.querySelector(
        '[data-prp-composer-kind="conversation"][data-prp-composer-root="1"]'
      ) ||
      document.querySelector('[data-prp-composer-kind="conversation"]') ||
      document.querySelector(
        '.prp-composer-focus-host [data-prp-composer-root="1"]'
      );
    focusComposerRoot(root);
  } catch {
    /* ignore */
  }
}
