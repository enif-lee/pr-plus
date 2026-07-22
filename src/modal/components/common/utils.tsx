import { languageFromPath } from '../../lib/diff-rows';
import { enhanceMarkdownHtml } from '../../lib/ui-polish';

export const ROW_HEIGHT = 22;
/**
 * Estimated height for inline review threads in the virtualized list.
 * Must not under-estimate: short spacer clips bottom content (threads + reply UI).
 */
export const COMMENT_ROW_HEIGHT = 280;

export function rowHeightFor(row) {
  return row?.kind === 'inline-comment' ? COMMENT_ROW_HEIGHT : ROW_HEIGHT;
}

export function averageRowHeight(rows) {
  if (!rows?.length) return ROW_HEIGHT;
  let sum = 0;
  for (const r of rows) sum += rowHeightFor(r);
  return sum / rows.length;
}

/**
 * Prefix offsets [0, h0, h0+h1, ...] for variable-height virtualization.
 * @returns {number[]} length = rows.length + 1; last entry is total height
 */
export function rowOffsets(rows: any[] | null | undefined): number[] {
  const list = Array.isArray(rows) ? rows : [];
  const offsets = new Array(list.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < list.length; i++) {
    offsets[i + 1] = offsets[i] + rowHeightFor(list[i]);
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

export function highlightCode(code, filePath) {
  const text = code == null ? '' : String(code);
  try {
    const eng = (globalThis as any).hljs;
    if (!eng) return escapeHtml(text);
    const lang = languageFromPath(filePath);
    if (lang && eng.getLanguage?.(lang)) {
      return eng.highlight(text, { language: lang, ignoreIllegals: true }).value;
    }
    return eng.highlightAuto(text).value;
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
