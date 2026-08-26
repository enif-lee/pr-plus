/** @module modal/lib/intra-line-diff */
/**
 * Intra-line word-diff marks for split-mode paired change rows.
 * Ops reuse markdown-preview `wordDiff`; HTML wrap is offset-safe on
 * already-highlighted (or escaped) markup, same decoded-text walk as search.
 */

import { wordDiff, type MarkdownDiffOp } from './markdown-preview';

export const INTRA_LINE_DEL_CLASS = 'prp-intra-del';
export const INTRA_LINE_INS_CLASS = 'prp-intra-ins';

export type IntraLineOp = MarkdownDiffOp;

export type IntraLineRange = {
  start: number;
  end: number;
  kind: 'del' | 'ins';
};

export type SplitIntraLineRow = {
  lineType?: string | null;
  leftType?: string | null;
  rightType?: string | null;
  leftCode?: string | null;
  rightCode?: string | null;
};

/** Same word-level del/eq/ins ops the split-mode code-line HTML path uses. */
export function intraLineWordDiff(
  oldLine: unknown,
  newLine: unknown
): IntraLineOp[] {
  return wordDiff(oldLine, newLine);
}

/** Paired split change: both panes have text (not unpaired whole-line add/del). */
export function isPairedSplitChange(
  row: SplitIntraLineRow | null | undefined
): row is SplitIntraLineRow {
  if (!row) return false;
  const left = String(row.leftCode ?? '');
  const right = String(row.rightCode ?? '');
  if (!left || !right) return false;
  if (row.lineType === 'change') return true;
  return row.leftType === 'del' && row.rightType === 'add';
}

/**
 * Map ops onto one split side: left keeps del (skips ins); right keeps ins
 * (skips del). Equal prefix/suffix are not ranges.
 */
export function intraLineRangesForSide(
  ops: IntraLineOp[] | null | undefined,
  side: 'left' | 'right'
): IntraLineRange[] {
  const want: IntraLineRange['kind'] = side === 'left' ? 'del' : 'ins';
  const skip: IntraLineOp['kind'] = side === 'left' ? 'ins' : 'del';
  const ranges: IntraLineRange[] = [];
  let offset = 0;
  for (const op of ops || []) {
    if (!op || !op.text) continue;
    if (op.kind === skip) continue;
    if (op.kind === want) {
      ranges.push({
        start: offset,
        end: offset + op.text.length,
        kind: want,
      });
    }
    offset += op.text.length;
  }
  return ranges;
}

function decodeEntityAt(
  html: string,
  i: number
): { ch: string; end: number } | null {
  if (html[i] !== '&') return null;
  const semi = html.indexOf(';', i + 1);
  if (semi < 0 || semi - i > 12) return null;
  const body = html.slice(i + 1, semi);
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    const num = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(num)) return null;
    try {
      return { ch: String.fromCodePoint(num), end: semi + 1 };
    } catch {
      return null;
    }
  }
  const map: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
  };
  const ch = map[body.toLowerCase()];
  if (!ch) return null;
  return { ch, end: semi + 1 };
}

type HtmlWrapRange = {
  start: number;
  end: number;
  open: string;
  close: string;
};

/**
 * Inject wrappers at decoded-text offsets without breaking tags/entities.
 * Same walk as `markSearchInHtml` (close across tags, reopen in the next text run).
 */
export function wrapPlainRangesInHtml(
  html: string,
  rangesIn: HtmlWrapRange[] | null | undefined
): string {
  const src = html == null ? '' : String(html);
  const ranges = (rangesIn || []).filter(
    (r) =>
      r &&
      Number.isFinite(r.start) &&
      Number.isFinite(r.end) &&
      r.end > r.start &&
      r.open
  );
  if (!src || !ranges.length) return src;

  const plainChars: string[] = [];
  const plainToHtml: Array<{ hStart: number; hEnd: number }> = [];
  let i = 0;
  let inTag = false;
  while (i < src.length) {
    const c = src[i];
    if (inTag) {
      if (c === '>') inTag = false;
      i += 1;
      continue;
    }
    if (c === '<') {
      inTag = true;
      i += 1;
      continue;
    }
    if (c === '&') {
      const ent = decodeEntityAt(src, i);
      if (ent) {
        plainChars.push(ent.ch);
        plainToHtml.push({ hStart: i, hEnd: ent.end });
        i = ent.end;
        continue;
      }
    }
    plainChars.push(c);
    plainToHtml.push({ hStart: i, hEnd: i + 1 });
    i += 1;
  }

  const plainLen = plainChars.length;
  const active = ranges
    .map((r) => ({
      start: Math.max(0, r.start),
      end: Math.min(plainLen, r.end),
      open: r.open,
      close: r.close || '',
    }))
    .filter((r) => r.end > r.start);
  if (!active.length) return src;

  let out = '';
  let plainIdx = 0;
  let htmlIdx = 0;
  inTag = false;

  const rangeAt = (p: number) => {
    for (const r of active) {
      if (p >= r.start && p < r.end) return r;
    }
    return null;
  };

  let openRange: HtmlWrapRange | null = null;
  while (htmlIdx < src.length) {
    const c = src[htmlIdx];
    if (inTag) {
      out += c;
      if (c === '>') inTag = false;
      htmlIdx += 1;
      continue;
    }
    if (c === '<') {
      if (openRange) {
        out += openRange.close;
        openRange = null;
      }
      inTag = true;
      out += c;
      htmlIdx += 1;
      continue;
    }

    const map = plainToHtml[plainIdx];
    if (!map || map.hStart !== htmlIdx) {
      out += src.slice(htmlIdx);
      break;
    }
    const r = rangeAt(plainIdx);
    if (r && (!openRange || openRange.start !== r.start)) {
      if (openRange) out += openRange.close;
      out += r.open;
      openRange = r;
    } else if (!r && openRange) {
      out += openRange.close;
      openRange = null;
    }
    out += src.slice(map.hStart, map.hEnd);
    htmlIdx = map.hEnd;
    plainIdx += 1;
    if (openRange && plainIdx >= openRange.end) {
      out += openRange.close;
      openRange = null;
    }
  }
  if (openRange) out += openRange.close;
  return out;
}

export function wrapIntraLineMarksInHtml(
  html: string,
  ranges: IntraLineRange[] | null | undefined
): string {
  const src = html == null ? '' : String(html);
  const list = (ranges || []).filter((r) => r && r.end > r.start);
  if (!src || !list.length) return src;
  return wrapPlainRangesInHtml(
    src,
    list.map((r) => ({
      start: r.start,
      end: r.end,
      open:
        r.kind === 'del'
          ? `<del class="${INTRA_LINE_DEL_CLASS}">`
          : `<ins class="${INTRA_LINE_INS_CLASS}">`,
      close: r.kind === 'del' ? '</del>' : '</ins>',
    }))
  );
}

/**
 * Thin helper `renderSearchableHtml` / split `DiffCodeLineBody` call after
 * syntax highlight. Unpaired whole-line add/del stay pane-wash only.
 */
export function applySplitIntraLineHtml(
  html: string,
  row: SplitIntraLineRow | null | undefined,
  side: 'left' | 'right'
): string {
  const src = html == null ? '' : String(html);
  if (!src || (side !== 'left' && side !== 'right')) return src;
  if (!isPairedSplitChange(row)) return src;
  const ops = intraLineWordDiff(row.leftCode ?? '', row.rightCode ?? '');
  return wrapIntraLineMarksInHtml(src, intraLineRangesForSide(ops, side));
}
