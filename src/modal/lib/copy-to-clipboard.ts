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
