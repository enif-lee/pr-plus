/**
 * Pure gates for deferring expensive Conversation body work (Mermaid, etc.)
 * until the virtual scroller is idle.
 *
 * Matches VirtualConversationList's `prp-is-scrolling` debounce (700ms after
 * last scroll event). Keep this constant shared so unit tests and UI agree.
 */

/** Debounce after last scroll before treating the scroller as idle. */
export const CONVERSATION_SCROLL_IDLE_MS = 700;

/**
 * Whether a heavy render path (e.g. ensureMermaid + eng.render) may start.
 *
 * - While scrolling: never start new heavy work (placeholder stays).
 * - When idle: allow start (unless caller has a valid cache for current input).
 */
export function shouldStartHeavyRender(opts: {
  isScrolling?: boolean | null;
}): boolean {
  return !Boolean(opts?.isScrolling);
}

/**
 * Whether Mermaid should invoke ensureMermaid + eng.render for this effect tick.
 *
 * Blocks while scrolling. When idle, skips re-render if a result is already
 * cached for the same source key (code+theme) — scroll end must not flash
 * or re-stampede diagrams.
 */
export function shouldRunMermaidHeavyWork(opts: {
  isScrolling?: boolean | null;
  /** True when component already holds a non-empty SVG (or equivalent). */
  hasCachedResult?: boolean | null;
  /** Current diagram identity, e.g. `${code}\0${theme}`. */
  sourceKey?: string | null;
  /** Key last successfully rendered into the cache. */
  cachedSourceKey?: string | null;
}): boolean {
  if (!shouldStartHeavyRender({ isScrolling: opts?.isScrolling })) {
    return false;
  }
  const source = opts?.sourceKey != null ? String(opts.sourceKey) : '';
  const cached =
    opts?.cachedSourceKey != null ? String(opts.cachedSourceKey) : '';
  if (opts?.hasCachedResult && source && cached && source === cached) {
    return false;
  }
  return true;
}

/** Stable identity for a mermaid fence + theme (cache key). */
export function mermaidSourceKey(
  code: string | null | undefined,
  theme: string | null | undefined
): string {
  return `${String(code || '').trim()}\0${String(theme || '')}`;
}

/**
 * True when the scroller should show the loading/deferred chrome for a
 * Mermaid block that has no SVG yet.
 */
export function shouldShowHeavyPlaceholder(opts: {
  isScrolling?: boolean | null;
  hasResult?: boolean | null;
  busy?: boolean | null;
}): boolean {
  if (opts?.hasResult) return false;
  if (opts?.isScrolling) return true;
  return Boolean(opts?.busy);
}
