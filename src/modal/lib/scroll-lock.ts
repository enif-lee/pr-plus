/**
 * Page scroll lock while the PR modal overlay is open.
 * Prevents nested scrolling (document + overlay) especially for side sheet.
 * Pure helpers — inject document/window for tests.
 */

export const SCROLL_LOCK_CLASS = 'prp-scroll-lock';

export type ScrollLockSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
  htmlHadClass: boolean;
  bodyHadClass: boolean;
};

/**
 * Width of the vertical scrollbar (0 when overlay scrollbars or none).
 */
export function measureScrollbarWidth(
  win: { innerWidth?: number; document?: Document } | null | undefined
): number {
  if (!win || typeof win.innerWidth !== 'number') return 0;
  const doc = win.document;
  const client = doc?.documentElement?.clientWidth;
  if (!Number.isFinite(client as number)) return 0;
  return Math.max(0, win.innerWidth - (client as number));
}

/**
 * Lock document scroll. Returns a snapshot for restoreScrollLock.
 * Compensates body padding-right for scrollbar width to reduce layout jump.
 */
export function applyScrollLock(
  doc: Document | null | undefined,
  opts: { scrollbarWidth?: number } = {}
): ScrollLockSnapshot | null {
  if (!doc?.documentElement || !doc.body) return null;
  const html = doc.documentElement;
  const body = doc.body;
  const snap: ScrollLockSnapshot = {
    htmlOverflow: html.style.overflow || '',
    bodyOverflow: body.style.overflow || '',
    bodyPaddingRight: body.style.paddingRight || '',
    htmlHadClass: html.classList.contains(SCROLL_LOCK_CLASS),
    bodyHadClass: body.classList.contains(SCROLL_LOCK_CLASS),
  };

  html.classList.add(SCROLL_LOCK_CLASS);
  body.classList.add(SCROLL_LOCK_CLASS);
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';

  const sbw = Number(opts.scrollbarWidth);
  if (Number.isFinite(sbw) && sbw > 0) {
    const existing = parseFloat(snap.bodyPaddingRight) || 0;
    body.style.paddingRight = `${existing + sbw}px`;
  }

  return snap;
}

/**
 * Restore scroll after applyScrollLock. Safe if snap is null.
 */
export function restoreScrollLock(
  doc: Document | null | undefined,
  snap: ScrollLockSnapshot | null | undefined
): void {
  if (!doc?.documentElement || !doc.body || !snap) return;
  const html = doc.documentElement;
  const body = doc.body;

  html.style.overflow = snap.htmlOverflow;
  body.style.overflow = snap.bodyOverflow;
  body.style.paddingRight = snap.bodyPaddingRight;

  if (!snap.htmlHadClass) html.classList.remove(SCROLL_LOCK_CLASS);
  if (!snap.bodyHadClass) body.classList.remove(SCROLL_LOCK_CLASS);
}
