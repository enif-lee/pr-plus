/**
 * Module-level LRU for rendered Mermaid SVG strings.
 *
 * MermaidBlock keeps a component-local ref cache for scroll-while-mounted,
 * but Conversation virtual list unmounts off-screen rows — refs die. This
 * store survives remount so ensureMermaid + eng.render need not re-run for
 * the same code+theme identity.
 *
 * Key: mermaidSourceKey(code, theme) from scroll-idle-render.
 */

export type MermaidSvgCacheEntry = {
  /** Conversation card SVG (height-fitted). */
  svgFitted: string;
  /** Full-resolution SVG for fullscreen viewer. */
  svgFull: string;
  at: number;
};

/** Default max diagrams retained (SVG strings can be large). */
export const MERMAID_SVG_CACHE_MAX = 48;

const store = new Map<string, MermaidSvgCacheEntry>();

function touch(key: string, entry: MermaidSvgCacheEntry) {
  // Map preserves insertion order — re-insert for LRU recency.
  store.delete(key);
  store.set(key, entry);
}

/**
 * Look up a cached SVG pair. Returns null on miss / empty key.
 * Hits are moved to most-recent for LRU.
 */
export function getMermaidSvgCache(
  sourceKey: string | null | undefined
): MermaidSvgCacheEntry | null {
  const k = sourceKey != null ? String(sourceKey) : '';
  if (!k) return null;
  const hit = store.get(k);
  if (!hit || !hit.svgFitted) return null;
  touch(k, hit);
  return hit;
}

/**
 * Store a successful render. Evicts oldest entries past maxSize.
 */
export function setMermaidSvgCache(
  sourceKey: string | null | undefined,
  entry: {
    svgFitted?: string | null;
    svgFull?: string | null;
  },
  opts: { maxSize?: number } = {}
): void {
  const k = sourceKey != null ? String(sourceKey) : '';
  const fitted = String(entry?.svgFitted || '');
  if (!k || !fitted) return;
  const full = String(entry?.svgFull || fitted);
  const max =
    Number.isFinite(opts.maxSize) && Number(opts.maxSize) > 0
      ? Math.floor(Number(opts.maxSize))
      : MERMAID_SVG_CACHE_MAX;
  touch(k, {
    svgFitted: fitted,
    svgFull: full,
    at: Date.now(),
  });
  while (store.size > max) {
    const oldest = store.keys().next().value;
    if (oldest == null) break;
    store.delete(oldest);
  }
}

/** Test / modal-close helper. */
export function clearMermaidSvgCache(): void {
  store.clear();
}

/** Test helper — current entry count. */
export function mermaidSvgCacheSize(): number {
  return store.size;
}

/**
 * Whether module cache has a usable hit for this source key.
 * Pure read (still touches LRU via get).
 */
export function hasMermaidSvgCache(
  sourceKey: string | null | undefined
): boolean {
  return getMermaidSvgCache(sourceKey) != null;
}
