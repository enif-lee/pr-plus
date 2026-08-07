/**
 * Copy plain text to the system clipboard.
 * Pure-ish: injectable clipboard / document for tests.
 */

export type ClipboardLike = {
  writeText?: (text: string) => Promise<void>;
};

/**
 * Normalize a branch ref for copy (trim; empty → '').
 */
export function branchRefCopyText(refName: unknown): string {
  return String(refName ?? '').trim();
}

/**
 * Write `text` to the clipboard. Prefers `navigator.clipboard.writeText`,
 * falls back to a temporary textarea + execCommand('copy').
 * @returns true when the write likely succeeded
 */
/**
 * Stamp comment body/link copy results for e2e (page-readable attributes).
 * Mirrors data-prp-last-copied-pr-url used by header PR-link copy.
 */
export function stampCommentCopyResult(opts: {
  kind: 'body' | 'link';
  ok: boolean;
  text?: string | null;
  url?: string | null;
  /** Coerced via String(); callers pass raw comment ids from props. */
  commentId?: string | number | null | unknown;
}): void {
  try {
    const doc =
      typeof document !== 'undefined' ? document : null;
    const root = doc?.documentElement;
    if (!root) return;
    if (opts.kind === 'body') {
      const t = String(opts.text ?? '');
      root.setAttribute('data-prp-last-copied-comment-body', t);
      try {
        (globalThis as any).__prpLastCopiedCommentBody = t;
      } catch {
        /* ignore */
      }
    } else {
      const u = String(opts.url ?? '');
      root.setAttribute('data-prp-last-copied-comment-url', u);
      try {
        (globalThis as any).__prpLastCopiedCommentUrl = u;
      } catch {
        /* ignore */
      }
    }
    if (opts.commentId != null && String(opts.commentId) !== '') {
      const id = String(opts.commentId);
      root.setAttribute('data-prp-last-copied-comment-id', id);
      try {
        (globalThis as any).__prpLastCopiedCommentId = id;
      } catch {
        /* ignore */
      }
    }
    root.setAttribute(
      'data-prp-last-copy-comment-ok',
      opts.ok ? '1' : '0'
    );
  } catch {
    /* ignore */
  }
}

export async function copyTextToClipboard(
  text: string,
  opts: {
    clipboard?: ClipboardLike | null;
    doc?: Document | null;
  } = {}
): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  const clip =
    opts.clipboard !== undefined
      ? opts.clipboard
      : typeof navigator !== 'undefined'
        ? (navigator as Navigator & { clipboard?: ClipboardLike }).clipboard
        : null;

  if (clip && typeof clip.writeText === 'function') {
    try {
      await clip.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }

  const doc =
    opts.doc !== undefined
      ? opts.doc
      : typeof document !== 'undefined'
        ? document
        : null;
  if (!doc?.body) return false;

  try {
    const ta = doc.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok =
      typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
    doc.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}
