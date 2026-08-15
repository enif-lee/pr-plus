/**
 * Diff code-line expand (long lines truncated with ellipsis).
 * Heights feed the existing variable-row virtualizer via rowHeightFor / rowOffsets.
 */

import { ROW_HEIGHT } from '../components/common/utils';

/** Soft threshold: lines at least this long get an expand affordance. */
export const LINE_EXPAND_CHAR_THRESHOLD = 96;

/** Approx monospace chars that fit one diff row at typical pane width. */
export const LINE_EXPAND_CHARS_PER_LINE = 100;

/** Cap expanded height so a mega-line does not dominate the list. */
export const LINE_EXPAND_MAX_LINES = 48;

/**
 * Stable key for a virtualized code row (unified or split visual row).
 * Prefer path + lineType + old/new line numbers so expand state survives
 * virtual-list rebuilds while Diff files are still streaming in (rowIndex shifts).
 */
export function diffLineExpandKey(row: any): string | null {
  if (!row || row.kind !== 'diff-line') return null;
  const t = row.lineType;
  if (t !== 'add' && t !== 'del' && t !== 'change' && t !== 'context') {
    return null;
  }
  const path = String(row.filePath || row.path || '');
  if (!path) return null;
  const oldL =
    row.oldLine != null && row.oldLine !== '' ? String(row.oldLine) : '';
  const newL =
    row.newLine != null && row.newLine !== '' ? String(row.newLine) : '';
  if (oldL || newL) {
    return `${path}#${t}:${oldL}:${newL}`;
  }
  // Fallback when line numbers are absent (rare context-only rows).
  const ri = Number(row.rowIndex);
  if (!Number.isFinite(ri)) return null;
  return `${path}#${t}:ri${ri}`;
}

/**
 * Longest textual content on the row (split uses max of both panes).
 */
export function diffLineTextLength(row: any): number {
  if (!row) return 0;
  const candidates = [
    row.text,
    row.code,
    row.leftCode,
    row.rightCode,
    row.raw,
  ];
  let max = 0;
  for (const c of candidates) {
    if (c == null) continue;
    const n = String(c).length;
    if (n > max) max = n;
  }
  return max;
}

export function isDiffLineExpandable(
  row: any,
  threshold = LINE_EXPAND_CHAR_THRESHOLD
): boolean {
  return diffLineExpandKey(row) != null && diffLineTextLength(row) >= threshold;
}

export function isDiffLineExpanded(
  expanded: Set<string> | Map<string, unknown> | null | undefined,
  row: any
): boolean {
  const key = diffLineExpandKey(row);
  if (!key || !expanded) return false;
  if (expanded instanceof Set) return expanded.has(key);
  if (expanded instanceof Map) return expanded.has(key);
  return false;
}

/**
 * Estimate multi-line height for an expanded code row before measure.
 */
export function estimateExpandedLineHeight(
  row: any,
  opts: {
    charsPerLine?: number;
    lineHeight?: number;
    maxLines?: number;
  } = {}
): number {
  const lh = Math.max(1, Number(opts.lineHeight) || ROW_HEIGHT);
  const cpl = Math.max(20, Number(opts.charsPerLine) || LINE_EXPAND_CHARS_PER_LINE);
  const maxLines = Math.max(2, Number(opts.maxLines) || LINE_EXPAND_MAX_LINES);
  const len = diffLineTextLength(row);
  // Account for hard newlines in the source string
  const hard = String(row?.text || row?.code || row?.leftCode || row?.rightCode || '')
    .split('\n').length;
  const soft = Math.ceil(len / cpl) || 1;
  const lines = Math.min(maxLines, Math.max(hard, soft, 1));
  return Math.max(lh, lines * lh);
}

/**
 * Toggle key in a Set (immutable).
 */
export function toggleExpandKey(
  prev: Set<string> | null | undefined,
  key: string
): Set<string> {
  const next = new Set(prev || []);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Resolve virtual height for a code line when expand state is provided.
 * @returns null if not an expanded code line (caller uses default ROW_HEIGHT)
 */
export function expandedCodeLineHeight(
  row: any,
  opts: {
    expandedKeys?: Set<string> | null;
    measuredHeights?: Map<string, number> | null;
  } | null
): number | null {
  if (!opts?.expandedKeys?.size) return null;
  const key = diffLineExpandKey(row);
  if (!key || !opts.expandedKeys.has(key)) return null;
  const measured = opts.measuredHeights?.get(key);
  if (measured != null && Number.isFinite(measured) && measured > 0) {
    return Math.max(ROW_HEIGHT, Math.ceil(measured));
  }
  return estimateExpandedLineHeight(row);
}
