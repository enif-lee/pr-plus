import { languageFromPath } from '../../lib/diff-rows';
import { enhanceMarkdownHtml } from '../../lib/ui-polish';

export const ROW_HEIGHT = 22;
/**
 * Estimated height for expanded inline review threads in the virtualized list.
 * Must not under-estimate: short spacer clips bottom content (threads + reply UI).
 */
/** Virtual-list estimate for expanded threads (not forced CSS min-height). */
export const COMMENT_ROW_HEIGHT = 220;
/**
 * @deprecated Same as COMMENT_ROW_HEIGHT — pending must not under-estimate or
 * the virtual list clips the card (composer / collapse toggle mis-hit).
 */
export const COMMENT_ROW_HEIGHT_PENDING = COMMENT_ROW_HEIGHT;
/** Collapsed thread chrome (filebar + 3-line preview) — keep tight to avoid dead space. */
export const COMMENT_ROW_HEIGHT_COLLAPSED = 76;

/**
 * @param {any} row
 * @param {{ isCollapsed?: (row: any) => boolean } | null | undefined} [opts]
 */
export function rowHeightFor(row, opts: any = null) {
  if (row?.kind === 'inline-comment') {
    const collapsed =
      typeof opts?.isCollapsed === 'function' ? Boolean(opts.isCollapsed(row)) : false;
    if (collapsed) return COMMENT_ROW_HEIGHT_COLLAPSED;
    // Pending and submitted threads share the same estimate so virtual offsets
    // match real card height (under-estimate clips bottom + breaks toggles).
    return COMMENT_ROW_HEIGHT;
  }
  // Symmetric @@ -N,M +N,M @@ headers are hidden unless they carry expand controls
  if (
    row?.lineType === 'hunk' &&
    row.hidden &&
    !row.expandAbove &&
    !row.expandBelow
  ) {
    return 0;
  }
  return ROW_HEIGHT;
}

export function averageRowHeight(rows, opts: any = null) {
  if (!rows?.length) return ROW_HEIGHT;
  let sum = 0;
  for (const r of rows) sum += rowHeightFor(r, opts);
  return sum / rows.length;
}

/**
 * Prefix offsets [0, h0, h0+h1, ...] for variable-height virtualization.
 * @returns {number[]} length = rows.length + 1; last entry is total height
 */
export function rowOffsets(rows: any[] | null | undefined, opts: any = null): number[] {
  const list = Array.isArray(rows) ? rows : [];
  const offsets = new Array(list.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < list.length; i++) {
    offsets[i + 1] = offsets[i] + rowHeightFor(list[i], opts);
  }
  return offsets;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Syntax-highlight cache: scroll re-renders the same visible lines repeatedly.
 * Key = language + code; bound size to avoid unbounded growth on huge PRs.
 */
const HIGHLIGHT_CACHE_MAX = 4000;
const highlightCache = new Map<string, string>();

/** @internal test/diag — clear cached hljs HTML */
export function clearHighlightCodeCache() {
  highlightCache.clear();
}

/** @internal test/diag */
export function highlightCodeCacheSize() {
  return highlightCache.size;
}

export function highlightCode(code, filePath) {
  const text = code == null ? '' : String(code);
  if (!text) return '';
  try {
    const eng = (globalThis as any).hljs;
    if (!eng) return escapeHtml(text);
    const lang = languageFromPath(filePath) || '';
    const cacheKey = `${lang}\0${text}`;
    const cached = highlightCache.get(cacheKey);
    if (cached != null) {
      // LRU-ish: re-insert so hot lines stay during scroll
      highlightCache.delete(cacheKey);
      highlightCache.set(cacheKey, cached);
      return cached;
    }
    let html: string;
    if (lang && eng.getLanguage?.(lang)) {
      html = eng.highlight(text, { language: lang, ignoreIllegals: true }).value;
    } else {
      // Avoid highlightAuto on every empty/tiny line — escape is enough
      if (text.length < 2 || !/\S/.test(text)) {
        html = escapeHtml(text);
      } else {
        html = eng.highlightAuto(text).value;
      }
    }
    if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
      // Drop oldest ~12.5%
      const drop = Math.ceil(HIGHLIGHT_CACHE_MAX / 8);
      let i = 0;
      for (const k of highlightCache.keys()) {
        highlightCache.delete(k);
        if (++i >= drop) break;
      }
    }
    highlightCache.set(cacheKey, html);
    return html;
  } catch {
    return escapeHtml(text);
  }
}

export function renderMdHtml(raw, linkCtx) {
  try {
    const md = (globalThis as any).marked;
    const purify = (globalThis as any).DOMPurify;
    if (!md) return escapeHtml(raw).replace(/\n/g, '<br/>');
    let parsed =
      typeof md.parse === 'function' ? md.parse(raw) : typeof md === 'function' ? md(raw) : raw;
    const html = typeof parsed === 'string' ? parsed : String(parsed);
    const clean = purify?.sanitize ? purify.sanitize(html) : html;
    if (typeof enhanceMarkdownHtml === 'function') {
      return enhanceMarkdownHtml(clean, linkCtx || {});
    }
    return clean;
  } catch {
    return escapeHtml(raw).replace(/\n/g, '<br/>');
  }
}

export function avatarInitials(login) {
  const s = String(login || '?').trim();
  if (!s) return '?';
  return s.slice(0, 2).toUpperCase();
}

export function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export function reviewStatusTone(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return 'ok';
  if (s === 'CHANGES_REQUESTED') return 'danger';
  if (s === 'PENDING' || s === 'REVIEW_REQUIRED') return 'warn';
  return 'muted';
}
