/** @module modal/lib/avatar-image-cache */
/**
 * Session-scoped warm/failed sets for avatar (and peer list-avatar) image URLs.
 * Virtual scroll remounts reuse eager + decoding=sync for warm URLs so paint
 * hits browser/memory cache without re-scheduling loading="lazy".
 *
 * Pure: no React, no chrome.*. Free of DOM except optional Image() preload.
 */

const warm = new Set<string>();
const failed = new Set<string>();

/** Soft cap — unique logins per session stay small; guard pathological churn. */
const MAX_ENTRIES = 512;

function normalizeUrl(url: unknown): string {
  return String(url ?? '').trim();
}

function cap(set: Set<string>) {
  if (set.size <= MAX_ENTRIES) return;
  // Drop oldest insertion order entries (Set iterates insert order)
  const drop = set.size - MAX_ENTRIES;
  let i = 0;
  for (const key of set) {
    set.delete(key);
    i += 1;
    if (i >= drop) break;
  }
}

/** True when this URL already loaded successfully this session. */
export function isAvatarImageWarm(url: unknown): boolean {
  const u = normalizeUrl(url);
  if (!u) return false;
  return warm.has(u);
}

/** True when this URL previously failed (use initials; skip retries thrash). */
export function isAvatarImageFailed(url: unknown): boolean {
  const u = normalizeUrl(url);
  if (!u) return false;
  return failed.has(u);
}

/** Mark URL as successfully decoded/loaded. */
export function markAvatarImageWarm(url: unknown): void {
  const u = normalizeUrl(url);
  if (!u) return;
  failed.delete(u);
  warm.add(u);
  cap(warm);
}

/** Mark URL as failed so remounts skip broken img and show initials. */
export function markAvatarImageFailed(url: unknown): void {
  const u = normalizeUrl(url);
  if (!u) return;
  warm.delete(u);
  failed.add(u);
  cap(failed);
}

/**
 * img loading attribute for a given URL:
 * - warm → eager (paint from HTTP/memory cache without lazy scheduler)
 * - cold → lazy (first paint deferred until near viewport)
 */
export function avatarImageLoadingAttr(
  url: unknown
): 'eager' | 'lazy' {
  return isAvatarImageWarm(url) ? 'eager' : 'lazy';
}

/**
 * img decoding attribute:
 * - warm → sync (decode immediately for remount paint)
 * - cold → async (default; don't block first layout)
 */
export function avatarImageDecodingAttr(
  url: unknown
): 'sync' | 'async' {
  return isAvatarImageWarm(url) ? 'sync' : 'async';
}

/**
 * Optional fire-and-forget preload. Marks warm on successful load.
 * Safe in browsers with Image; no-ops when Image is missing (SSR/tests).
 */
export function preloadAvatarImage(url: unknown): void {
  const u = normalizeUrl(url);
  if (!u || isAvatarImageWarm(u) || isAvatarImageFailed(u)) return;
  try {
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => markAvatarImageWarm(u);
    img.onerror = () => markAvatarImageFailed(u);
    img.src = u;
  } catch {
    /* ignore */
  }
}

/** Test / session reset only — not used in product UI. */
export function clearAvatarImageCacheForTests(): void {
  warm.clear();
  failed.clear();
}

/** Snapshot sizes for diagnostics/tests. */
export function avatarImageCacheStats(): {
  warm: number;
  failed: number;
} {
  return { warm: warm.size, failed: failed.size };
}
