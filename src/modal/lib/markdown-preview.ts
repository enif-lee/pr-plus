/** @module modal/lib/markdown-preview */
/**
 * Diff overlay helpers for markdown files: path detect, old/new sides,
 * word-level ins/del, and show-diff off/on render input.
 */
import { buildGithubRawUrl } from './diff-rows';

/** Common markdown extensions (GitHub previewable). */
const MARKDOWN_EXT_RE = /\.(md|markdown|mdown|mkdn|mkd|mdx)$/i;

/** Skip word-level work past this combined size so the overlay stays usable. */
export const MD_PREVIEW_MAX_CHARS = 250_000;

/** Cap DP cells (n+1)*(m+1). ~16MB at 4e6 Uint32 cells. */
const DP_CELL_CAP = 4_000_000;

export const MD_DIFF_DEL_CLASS = 'prp-md-diff-del';
export const MD_DIFF_INS_CLASS = 'prp-md-diff-ins';

export type MarkdownDiffKind = 'eq' | 'del' | 'ins';

export type MarkdownDiffOp = {
  kind: MarkdownDiffKind;
  text: string;
};

/** @deprecated Use MarkdownDiffOp — kept for the first preview landing. */
export type LetterDiffKind = MarkdownDiffKind;
/** @deprecated Use MarkdownDiffOp */
export type LetterDiffOp = MarkdownDiffOp;

export type MarkdownSideRef = {
  path: string;
  ref: string;
};

/**
 * @param {unknown} path
 * @returns {boolean}
 */
export function isMarkdownPath(path: unknown): boolean {
  const p = String(path || '')
    .split('?')[0]
    .split('#')[0];
  return MARKDOWN_EXT_RE.test(p);
}

export function markdownPreviewExceedsCap(
  oldText: unknown,
  newText: unknown
): boolean {
  return String(oldText ?? '').length + String(newText ?? '').length > MD_PREVIEW_MAX_CHARS;
}

/**
 * Normalize old/new sides from PR file status. Added → empty old; deleted → empty new.
 */
export function resolveMarkdownSides(input: {
  status?: string;
  oldText?: string | null;
  newText?: string | null;
} = {}): { oldText: string; newText: string } {
  const status = String(input.status || '').toLowerCase();
  const added = status === 'added' || status === 'add';
  const deleted =
    status === 'removed' || status === 'deleted' || status === 'del';
  return {
    oldText: added ? '' : String(input.oldText ?? ''),
    newText: deleted ? '' : String(input.newText ?? ''),
  };
}

/**
 * Which blob refs to fetch for a full-file overlay (patches are hunk-only).
 * `old` is null for added files; `new` is null for deleted files.
 */
export function markdownPreviewLoadPlan(
  file: {
    path?: string;
    filename?: string;
    status?: string;
    previous_filename?: string;
    previousFilename?: string;
  } = {},
  refs: {
    baseSha?: string;
    baseRef?: string;
    headSha?: string;
    headRef?: string;
  } = {}
): { old: MarkdownSideRef | null; new: MarkdownSideRef | null } {
  const path = String(file.filename || file.path || '').trim();
  const status = String(file.status || 'modified').toLowerCase();
  const prev = String(
    file.previous_filename || file.previousFilename || path
  ).trim();
  const added = status === 'added' || status === 'add';
  const deleted =
    status === 'removed' || status === 'deleted' || status === 'del';
  const headRef = String(refs.headSha || refs.headRef || '').trim();
  const baseRef = String(refs.baseSha || refs.baseRef || '').trim();
  return {
    old: added || !path ? null : { path: prev || path, ref: baseRef },
    new: deleted || !path ? null : { path, ref: headRef },
  };
}

/** Keep trailing newlines on each line token so join('') restores the file. */
export function splitLinesKeep(text: string): string[] {
  const s = String(text ?? '');
  if (s === '') return [];
  const parts = s.split('\n');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1) {
      out.push(`${parts[i]}\n`);
    } else if (parts[i] !== '') {
      out.push(parts[i]);
    }
  }
  return out;
}

function concatOps(ops: MarkdownDiffOp[]): MarkdownDiffOp[] {
  const out: MarkdownDiffOp[] = [];
  for (const op of ops) {
    if (!op || !op.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === op.kind) last.text += op.text;
    else out.push({ kind: op.kind, text: op.text });
  }
  return out;
}

type TokenOp = { kind: MarkdownDiffKind; token: string };

/**
 * Word / whitespace / punctuation tokens. Letter+number runs stay one token
 * so `world` → `word` marks the whole word, not a single letter.
 */
export function splitWordsKeep(text: string): string[] {
  const s = String(text ?? '');
  if (s === '') return [];
  const out: string[] = [];
  const re = /(\s+)|([\p{L}\p{N}_]+)|([^\s\p{L}\p{N}_]+)/gu;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function diffTokenArraysUnmerged(a: string[], b: string[]): TokenOp[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((token) => ({ kind: 'ins' as const, token }));
  if (m === 0) return a.map((token) => ({ kind: 'del' as const, token }));

  const cols = m + 1;
  const cells = (n + 1) * cols;
  if (cells > DP_CELL_CAP) {
    return [
      ...a.map((token) => ({ kind: 'del' as const, token })),
      ...b.map((token) => ({ kind: 'ins' as const, token })),
    ];
  }

  const dp = new Uint32Array(cells);
  const at = (i: number, j: number) => i * cols + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] =
        a[i] === b[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const raw: TokenOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ kind: 'eq', token: a[i] });
      i += 1;
      j += 1;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      raw.push({ kind: 'del', token: a[i] });
      i += 1;
    } else {
      raw.push({ kind: 'ins', token: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ kind: 'del', token: a[i] });
    i += 1;
  }
  while (j < m) {
    raw.push({ kind: 'ins', token: b[j] });
    j += 1;
  }
  return raw;
}

/** True when an equal run is only whitespace/punctuation (same line). */
export function isMarkdownDiffGlue(text: string): boolean {
  const s = String(text ?? '');
  if (!s || s.includes('\n') || s.includes('\r')) return false;
  return !/[\p{L}\p{N}_]/u.test(s);
}

/**
 * On one line, merge consecutive del/ins separated only by glue (spaces,
 * punctuation) into one replacement group. A real equal word splits groups.
 */
export function coalesceAdjacentChangeGroups(
  ops: MarkdownDiffOp[]
): MarkdownDiffOp[] {
  const a = concatOps(ops);
  const out: MarkdownDiffOp[] = [];
  let i = 0;
  while (i < a.length) {
    const cur = a[i];
    if (cur.kind === 'eq') {
      out.push(cur);
      i += 1;
      continue;
    }
    let del = '';
    let ins = '';
    while (i < a.length) {
      const op = a[i];
      if (op.kind === 'del') {
        del += op.text;
        i += 1;
        continue;
      }
      if (op.kind === 'ins') {
        ins += op.text;
        i += 1;
        continue;
      }
      const next = a[i + 1];
      if (
        isMarkdownDiffGlue(op.text) &&
        next &&
        (next.kind === 'del' || next.kind === 'ins')
      ) {
        del += op.text;
        ins += op.text;
        i += 1;
        continue;
      }
      break;
    }
    if (del) out.push({ kind: 'del', text: del });
    if (ins) out.push({ kind: 'ins', text: ins });
  }
  return concatOps(out);
}

function diffWordsInLine(a: string, b: string): MarkdownDiffOp[] {
  if (a === b) return a ? [{ kind: 'eq', text: a }] : [];
  const ops = diffTokenArraysUnmerged(splitWordsKeep(a), splitWordsKeep(b));
  return coalesceAdjacentChangeGroups(
    ops.map((op) => ({ kind: op.kind, text: op.token }))
  );
}

function expandLineOpsWithWordDiff(ops: TokenOp[]): MarkdownDiffOp[] {
  const out: MarkdownDiffOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind === 'eq') {
      out.push({ kind: 'eq', text: ops[i].token });
      i += 1;
      continue;
    }
    const hunk: TokenOp[] = [];
    while (i < ops.length && ops[i].kind !== 'eq') {
      hunk.push(ops[i]);
      i += 1;
    }
    const dels = hunk.filter((op) => op.kind === 'del').map((op) => op.token);
    const ins = hunk.filter((op) => op.kind === 'ins').map((op) => op.token);
    const pairCount = Math.min(dels.length, ins.length);
    for (let p = 0; p < pairCount; p++) {
      out.push(...diffWordsInLine(dels[p], ins[p]));
    }
    for (let p = pairCount; p < dels.length; p++) {
      out.push({ kind: 'del', text: dels[p] });
    }
    for (let p = pairCount; p < ins.length; p++) {
      out.push({ kind: 'ins', text: ins[p] });
    }
  }
  return out;
}

/**
 * Word-level diff of two documents. Lines are aligned first, then paired
 * changed lines are diffed by word tokens. Consecutive del/ins on one line
 * with only space/punct between them become one replacement group.
 */
export function wordDiff(
  oldText: unknown,
  newText: unknown
): MarkdownDiffOp[] {
  const oldT = String(oldText ?? '');
  const newT = String(newText ?? '');
  if (oldT === newT) return oldT ? [{ kind: 'eq', text: oldT }] : [];
  const lineOps = diffTokenArraysUnmerged(
    splitLinesKeep(oldT),
    splitLinesKeep(newT)
  );
  return concatOps(expandLineOpsWithWordDiff(lineOps));
}

/** @deprecated Use wordDiff */
export const letterDiff = wordDiff;

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapChangedRun(kind: 'del' | 'ins', text: string): string {
  if (!text) return '';
  const cls = kind === 'del' ? MD_DIFF_DEL_CLASS : MD_DIFF_INS_CLASS;
  const tag = kind === 'del' ? 'del' : 'ins';
  const open = `<${tag} class="${cls}">`;
  const close = `</${tag}>`;
  const parts = text.split('\n');
  return parts
    .map((part, idx) => {
      const wrapped = part ? `${open}${escapeHtmlText(part)}${close}` : '';
      return idx < parts.length - 1 ? `${wrapped}\n` : wrapped;
    })
    .join('');
}

export function wrapMarkdownDiffOp(op: MarkdownDiffOp): string {
  if (!op || !op.text) return '';
  if (op.kind === 'eq') return op.text;
  if (op.kind === 'del' || op.kind === 'ins') {
    return wrapChangedRun(op.kind, op.text);
  }
  return op.text;
}

/**
 * Show-diff injects `<del>`/`<ins>` before marked (gfm + breaks). Pipes are
 * word-diff glue, so a cell edit swallows `|`, and a wrapped delimiter row or
 * inserted table is no longer a GFM table (marked emits the raw pipes, and an
 * inserted row can drop a cell). Tables are rendered to HTML here: pipes and
 * delimiter rows stay structure, and the same diff classes sit on changed
 * cell text. Inline code and links are rendered first so the wrappers do not
 * land inside a code span or split `](url)`. Prose with no table still uses
 * `wordDiff` unchanged.
 */
type TableAlign = 'left' | 'center' | 'right' | null;

type TableBlock = {
  kind: 'table';
  raw: string;
  header: string[];
  align: TableAlign[];
  rows: string[][];
};

type ProseBlock = { kind: 'prose'; text: string };

type MdBlock = TableBlock | ProseBlock;

type AlignSlot =
  | { kind: 'pair'; oi: number; ni: number }
  | { kind: 'del'; oi: number }
  | { kind: 'ins'; ni: number };

type InlineTok =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'strike'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'image'; alt: string; href: string };

type LinkDefs = Map<string, string>;

const NO_LINK_DEFS: LinkDefs = new Map();

const TABLE_DELIM_RE =
  /^ {0,3}(?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?$/;

/**
 * Marked's GFM table regex stops the body at these HTML starts.
 * Case-sensitive and only at column 0. `<preface>` matches `<pre`;
 * `</pre>` and ` <div>` stay rows.
 */
const TABLE_HTML_END_RE =
  /^<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: +|\/?>|$)|^<(?:script|pre|style|textarea|!--)/;

function lineBody(token: string): string {
  let s = token;
  if (s.endsWith('\n')) s = s.slice(0, -1);
  if (s.endsWith('\r')) s = s.slice(0, -1);
  return s;
}

function openFence(line: string): { ch: string; len: number } | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  // A backtick info string cannot itself contain a backtick.
  if (m[1][0] === '`' && m[2].includes('`')) return null;
  return { ch: m[1][0], len: m[1].length };
}

function closesFence(line: string, open: { ch: string; len: number }): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!m && m[1][0] === open.ch && m[1].length >= open.len;
}

/**
 * A line marked will not swallow into an open GFM table body.
 * List interrupt is only `*+-` or `1.` / `1)` — `2. second` stays a row.
 * Four-space / tab lines are indented code, not another row.
 */
function endsTableBody(line: string): boolean {
  if (line.trim() === '') return true;
  if (/^(?: {4}|\t)/.test(line)) return true;
  if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (
    /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})[ \t]*$/.test(
      line
    )
  ) {
    return true;
  }
  if (/^ {0,3}(?:[*+-]|1[.)])[ \t]/.test(line)) return true;
  if (TABLE_HTML_END_RE.test(line)) return true;
  return false;
}

/** Marked `splitCells`: unescaped pipes separate cells. */
function splitCells(row: string, count?: number): string[] {
  const replaced = row.replace(/\|/g, (ch, offset: number, str: string) => {
    let escaped = false;
    for (let i = offset - 1; i >= 0 && str[i] === '\\'; i--) {
      escaped = !escaped;
    }
    return escaped ? ch : ' |';
  });
  const cells = replaced.split(' |');
  if (!cells[0]?.trim()) cells.shift();
  if (cells.length > 0 && !cells[cells.length - 1]?.trim()) cells.pop();
  if (count != null) {
    if (cells.length > count) cells.splice(count);
    else while (cells.length < count) cells.push('');
  }
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isDelimiterLine(line: string): boolean {
  if (!/[:|]/.test(line)) return false;
  return TABLE_DELIM_RE.test(line);
}

function delimiterAligns(line: string): TableAlign[] {
  return splitCells(line).map((cell) => {
    if (/^-+:$/.test(cell)) return 'right';
    if (/^:-+:$/.test(cell)) return 'center';
    if (/^:-+$/.test(cell)) return 'left';
    return null;
  });
}

function tryParseTable(
  lines: string[],
  start: number
): { block: TableBlock; next: number } | null {
  if (start + 1 >= lines.length) return null;
  const headerLine = lineBody(lines[start]);
  const delimLine = lineBody(lines[start + 1]);
  if (/^ {4,}|\t/.test(headerLine) || /^ {4,}|\t/.test(delimLine)) return null;
  if (endsTableBody(headerLine)) return null;
  if (!isDelimiterLine(delimLine)) return null;
  const header = splitCells(headerLine);
  const align = delimiterAligns(delimLine);
  if (header.length === 0 || header.length !== align.length) return null;
  const rows: string[][] = [];
  let j = start + 2;
  while (j < lines.length) {
    const body = lineBody(lines[j]);
    if (endsTableBody(body)) break;
    rows.push(splitCells(body, header.length));
    j += 1;
  }
  return {
    next: j,
    block: {
      kind: 'table',
      raw: lines.slice(start, j).join(''),
      header,
      align,
      rows,
    },
  };
}

function segmentDocument(text: string): MdBlock[] {
  const lines = splitLinesKeep(text);
  const blocks: MdBlock[] = [];
  let prose: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  const flush = () => {
    if (!prose.length) return;
    blocks.push({ kind: 'prose', text: prose.join('') });
    prose = [];
  };
  for (let i = 0; i < lines.length; ) {
    const body = lineBody(lines[i]);
    if (fence) {
      prose.push(lines[i]);
      if (closesFence(body, fence)) fence = null;
      i += 1;
      continue;
    }
    const opened = openFence(body);
    if (opened) {
      fence = opened;
      prose.push(lines[i]);
      i += 1;
      continue;
    }
    const table = tryParseTable(lines, i);
    if (table && table.next > i) {
      flush();
      blocks.push(table.block);
      i = table.next;
      continue;
    }
    prose.push(lines[i]);
    i += 1;
  }
  flush();
  return blocks;
}

function documentHasGfmTable(text: string): boolean {
  return segmentDocument(text).some((block) => block.kind === 'table');
}

/** Index-pair fallback compares nothing. Callers must still diff unequal pairs. */
function alignUntrimmed(
  n: number,
  m: number,
  eq: (i: number, j: number) => boolean
): AlignSlot[] {
  if (n === 0 && m === 0) return [];
  if (n === 0) {
    return Array.from({ length: m }, (_, j) => ({ kind: 'ins' as const, ni: j }));
  }
  if (m === 0) {
    return Array.from({ length: n }, (_, i) => ({ kind: 'del' as const, oi: i }));
  }
  const cols = m + 1;
  if ((n + 1) * cols > DP_CELL_CAP) {
    const slots: AlignSlot[] = [];
    const k = Math.min(n, m);
    for (let i = 0; i < k; i++) slots.push({ kind: 'pair', oi: i, ni: i });
    for (let i = k; i < n; i++) slots.push({ kind: 'del', oi: i });
    for (let j = k; j < m; j++) slots.push({ kind: 'ins', ni: j });
    return slots;
  }
  const dp = new Uint32Array((n + 1) * cols);
  const at = (i: number, j: number) => i * cols + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = eq(i, j)
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const raw: AlignSlot[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(i, j)) {
      raw.push({ kind: 'pair', oi: i, ni: j });
      i += 1;
      j += 1;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      raw.push({ kind: 'del', oi: i });
      i += 1;
    } else {
      raw.push({ kind: 'ins', ni: j });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ kind: 'del', oi: i });
    i += 1;
  }
  while (j < m) {
    raw.push({ kind: 'ins', ni: j });
    j += 1;
  }
  return raw;
}

/**
 * A shared head or tail is a real match. Trimming it keeps a one-block
 * insert in a long file from index-pairing every later line once the
 * DP cap trips.
 */
function alignSequences(
  n: number,
  m: number,
  eq: (i: number, j: number) => boolean
): AlignSlot[] {
  if (n === 0 && m === 0) return [];
  if (n === 0) {
    return Array.from({ length: m }, (_, j) => ({ kind: 'ins' as const, ni: j }));
  }
  if (m === 0) {
    return Array.from({ length: n }, (_, i) => ({ kind: 'del' as const, oi: i }));
  }
  let prefix = 0;
  while (prefix < n && prefix < m && eq(prefix, prefix)) prefix += 1;
  let oi = n;
  let ni = m;
  while (oi > prefix && ni > prefix && eq(oi - 1, ni - 1)) {
    oi -= 1;
    ni -= 1;
  }
  const mid = alignUntrimmed(oi - prefix, ni - prefix, (i, j) =>
    eq(i + prefix, j + prefix)
  );
  const slots: AlignSlot[] = [];
  for (let k = 0; k < prefix; k++) slots.push({ kind: 'pair', oi: k, ni: k });
  for (const slot of mid) {
    if (slot.kind === 'pair') {
      slots.push({ kind: 'pair', oi: slot.oi + prefix, ni: slot.ni + prefix });
    } else if (slot.kind === 'del') {
      slots.push({ kind: 'del', oi: slot.oi + prefix });
    } else {
      slots.push({ kind: 'ins', ni: slot.ni + prefix });
    }
  }
  for (let k = 0; k < n - oi; k++) {
    slots.push({ kind: 'pair', oi: oi + k, ni: ni + k });
  }
  return slots;
}

/**
 * Exact LCS matches stay put. A gap of only inserts/deletes is zipped by
 * index so a renamed column stays one cell (`Name`/`Title`) while a column
 * that lines up with an equal neighbor stays a pure insert.
 */
function zipUnmatchedGaps(slots: AlignSlot[]): AlignSlot[] {
  const out: AlignSlot[] = [];
  let i = 0;
  while (i < slots.length) {
    if (slots[i].kind === 'pair') {
      out.push(slots[i]);
      i += 1;
      continue;
    }
    const dels: Array<{ kind: 'del'; oi: number }> = [];
    const ins: Array<{ kind: 'ins'; ni: number }> = [];
    while (i < slots.length && slots[i].kind !== 'pair') {
      const slot = slots[i];
      if (slot.kind === 'del') dels.push(slot);
      else if (slot.kind === 'ins') ins.push(slot);
      i += 1;
    }
    const paired = Math.min(dels.length, ins.length);
    for (let k = 0; k < paired; k++) {
      out.push({ kind: 'pair', oi: dels[k].oi, ni: ins[k].ni });
    }
    for (let k = paired; k < dels.length; k++) out.push(dels[k]);
    for (let k = paired; k < ins.length; k++) out.push(ins[k]);
  }
  return out;
}

function wrapMark(kind: 'del' | 'ins', html: string): string {
  if (!html) return '';
  const tag = kind === 'del' ? 'del' : 'ins';
  const cls = kind === 'del' ? MD_DIFF_DEL_CLASS : MD_DIFF_INS_CLASS;
  return `<${tag} class="${cls}">${html}</${tag}>`;
}

function renderWordDiffHtml(oldText: string, newText: string): string {
  return wordDiff(oldText, newText)
    .map((op) => {
      if (!op.text) return '';
      if (op.kind === 'eq') return escapeHtmlText(op.text);
      return wrapChangedRun(op.kind, op.text);
    })
    .join('');
}

function readCode(
  src: string,
  i: number
): { v: string; next: number } | null {
  if (src[i] !== '`') return null;
  let n = 0;
  while (src[i + n] === '`') n += 1;
  const fence = '`'.repeat(n);
  const close = src.indexOf(fence, i + n);
  if (close < 0) return null;
  return { v: src.slice(i + n, close), next: close + n };
}

/** Destination only: drop a following `"title"` so the URL stays the src/href. */
function destinationHref(raw: string): string {
  const trimmed = raw.trim();
  const angled = /^<([^>\n]+)>/.exec(trimmed);
  if (angled) return angled[1];
  const bare = /^(\S+)/.exec(trimmed);
  return bare ? bare[1] : '';
}

/**
 * Link/image destination inside `(...)`. Parentheses in the URL count when
 * they are balanced (`Foo_(bar)`); the first `)` only closes the wrapper.
 */
function readParenDestination(
  src: string,
  open: number
): { href: string; next: number } | null {
  if (src[open] !== '(') return null;
  let i = open + 1;
  while (src[i] === ' ' || src[i] === '\t') i += 1;
  let href = '';
  if (src[i] === '<') {
    const end = src.indexOf('>', i + 1);
    if (end < 0) return null;
    href = src.slice(i + 1, end);
    i = end + 1;
  } else {
    const start = i;
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '(') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === ')') {
        if (depth === 0) break;
        depth -= 1;
        i += 1;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\n') break;
      i += 1;
    }
    href = src.slice(start, i);
  }
  if (!href || href.includes('\n')) return null;
  while (src[i] === ' ' || src[i] === '\t') i += 1;
  if (src[i] === '"' || src[i] === "'") {
    const quote = src[i];
    const end = src.indexOf(quote, i + 1);
    if (end < 0) return null;
    i = end + 1;
    while (src[i] === ' ' || src[i] === '\t') i += 1;
  }
  if (src[i] !== ')') return null;
  return { href, next: i + 1 };
}

function readLink(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  if (src[i] !== '[') return null;
  const endText = src.indexOf(']', i + 1);
  if (endText < 0 || src[endText + 1] !== '(') return null;
  const dest = readParenDestination(src, endText + 1);
  if (!dest) return null;
  const label = src.slice(i + 1, endText);
  if (!label || label.includes('\n')) return null;
  return {
    tok: { t: 'link', v: label, href: dest.href },
    next: dest.next,
  };
}

function lookupDef(label: string, defs: LinkDefs): string | null {
  const href = defs.get(label.trim().toLowerCase());
  return href || null;
}

/** `[label]: url` lines outside fences, so cell reference links still resolve. */
function collectLinkDefs(text: string): LinkDefs {
  const defs: LinkDefs = new Map();
  const lines = splitLinesKeep(text);
  let fence: { ch: string; len: number } | null = null;
  for (const token of lines) {
    const body = lineBody(token);
    if (fence) {
      if (closesFence(body, fence)) fence = null;
      continue;
    }
    const opened = openFence(body);
    if (opened) {
      fence = opened;
      continue;
    }
    const m = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]+>|\S+)/.exec(body);
    if (!m) continue;
    const href = destinationHref(m[2]);
    if (href) defs.set(m[1].trim().toLowerCase(), href);
  }
  return defs;
}

function trimAutolink(raw: string): string {
  let s = raw;
  while (/[.,;:!?]$/.test(s)) s = s.slice(0, -1);
  let open = 0;
  for (const ch of s) {
    if (ch === '(') open += 1;
    else if (ch === ')') open -= 1;
  }
  while (s.endsWith(')') && open < 0) {
    s = s.slice(0, -1);
    open += 1;
  }
  return s;
}

function readAutolink(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  const angled = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(src.slice(i));
  if (angled) {
    return {
      tok: { t: 'link', v: angled[1], href: angled[1] },
      next: i + angled[0].length,
    };
  }
  if (i > 0 && /[\p{L}\p{N}_]/u.test(src[i - 1])) return null;
  const bare = /^https?:\/\/[^\s<]+/.exec(src.slice(i));
  if (!bare) return null;
  const href = trimAutolink(bare[0]);
  if (!href) return null;
  return { tok: { t: 'link', v: href, href }, next: i + href.length };
}

function readRefLink(
  src: string,
  i: number,
  defs: LinkDefs
): { tok: InlineTok; next: number } | null {
  if (src[i] !== '[') return null;
  const endText = src.indexOf(']', i + 1);
  if (endText < 0) return null;
  const label = src.slice(i + 1, endText);
  if (!label || label.includes('\n') || label.includes('[')) return null;
  if (src[endText + 1] === '(') return null;
  if (src[endText + 1] === '[') {
    const endRef = src.indexOf(']', endText + 2);
    if (endRef < 0) return null;
    const ref = src.slice(endText + 2, endRef).trim() || label;
    const href = lookupDef(ref, defs);
    if (!href || ref.includes('\n')) return null;
    return { tok: { t: 'link', v: label, href }, next: endRef + 1 };
  }
  const href = lookupDef(label, defs);
  if (!href) return null;
  return { tok: { t: 'link', v: label, href }, next: endText + 1 };
}

function readRefImage(
  src: string,
  i: number,
  defs: LinkDefs
): { tok: InlineTok; next: number } | null {
  if (!src.startsWith('![', i)) return null;
  const endAlt = src.indexOf(']', i + 2);
  if (endAlt < 0) return null;
  const alt = src.slice(i + 2, endAlt);
  if (alt.includes('\n')) return null;
  if (src[endAlt + 1] === '(') return null;
  if (src[endAlt + 1] === '[') {
    const endRef = src.indexOf(']', endAlt + 2);
    if (endRef < 0) return null;
    const ref = src.slice(endAlt + 2, endRef).trim() || alt;
    const href = lookupDef(ref, defs);
    if (!href) return null;
    return { tok: { t: 'image', alt, href }, next: endRef + 1 };
  }
  const href = lookupDef(alt, defs);
  if (!href) return null;
  return { tok: { t: 'image', alt, href }, next: endAlt + 1 };
}

function readImage(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  if (!src.startsWith('![', i)) return null;
  const endAlt = src.indexOf(']', i + 2);
  if (endAlt < 0 || src[endAlt + 1] !== '(') return null;
  const dest = readParenDestination(src, endAlt + 1);
  if (!dest) return null;
  const alt = src.slice(i + 2, endAlt);
  if (alt.includes('\n')) return null;
  return {
    tok: { t: 'image', alt, href: dest.href },
    next: dest.next,
  };
}

function readStrong(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  const marker = src.startsWith('**', i)
    ? '**'
    : src.startsWith('__', i)
      ? '__'
      : '';
  if (!marker) return null;
  const close = src.indexOf(marker, i + marker.length);
  if (close < 0) return null;
  const v = src.slice(i + marker.length, close);
  if (!v) return null;
  return { tok: { t: 'strong', v }, next: close + marker.length };
}

function readStrike(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  if (!src.startsWith('~~', i)) return null;
  const close = src.indexOf('~~', i + 2);
  if (close < 0) return null;
  const v = src.slice(i + 2, close);
  if (!v || v.includes('\n')) return null;
  return { tok: { t: 'strike', v }, next: close + 2 };
}

function readEm(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  if (src[i] !== '*' || src[i + 1] === '*') return null;
  const close = src.indexOf('*', i + 1);
  if (close <= i + 1 || src[close + 1] === '*') return null;
  const v = src.slice(i + 1, close);
  if (!v || v.includes('\n')) return null;
  return { tok: { t: 'em', v }, next: close + 1 };
}

/** Underscore emphasis, but not `snake_case` (flanks must not be a word char). */
function readEmUnderscore(
  src: string,
  i: number
): { tok: InlineTok; next: number } | null {
  if (src[i] !== '_' || src[i + 1] === '_') return null;
  if (i > 0 && /[\p{L}\p{N}_]/u.test(src[i - 1])) return null;
  const close = src.indexOf('_', i + 1);
  if (close <= i + 1 || src[close + 1] === '_') return null;
  if (/[\p{L}\p{N}_]/u.test(src[close + 1] || '')) return null;
  const v = src.slice(i + 1, close);
  if (!v || v.includes('\n') || /^\s|\s$/.test(v)) return null;
  return { tok: { t: 'em', v }, next: close + 1 };
}

function tokenizeInline(src: string, defs: LinkDefs): InlineTok[] {
  const out: InlineTok[] = [];
  let text = '';
  const flush = () => {
    if (!text) return;
    out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const code = readCode(src, i);
    if (code) {
      flush();
      out.push({ t: 'code', v: code.v });
      i = code.next;
      continue;
    }
    const image = readImage(src, i) || readRefImage(src, i, defs);
    if (image) {
      flush();
      out.push(image.tok);
      i = image.next;
      continue;
    }
    const link = readLink(src, i) || readRefLink(src, i, defs);
    if (link) {
      flush();
      out.push(link.tok);
      i = link.next;
      continue;
    }
    const auto = readAutolink(src, i);
    if (auto) {
      flush();
      out.push(auto.tok);
      i = auto.next;
      continue;
    }
    const strike = readStrike(src, i);
    if (strike) {
      flush();
      out.push(strike.tok);
      i = strike.next;
      continue;
    }
    const strong = readStrong(src, i);
    if (strong) {
      flush();
      out.push(strong.tok);
      i = strong.next;
      continue;
    }
    const em = readEm(src, i) || readEmUnderscore(src, i);
    if (em) {
      flush();
      out.push(em.tok);
      i = em.next;
      continue;
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

function renderInlineTok(tok: InlineTok, defs: LinkDefs): string {
  if (tok.t === 'text') return escapeHtmlText(tok.v);
  if (tok.t === 'code') return `<code>${escapeHtmlText(tok.v)}</code>`;
  if (tok.t === 'strong') return `<strong>${inlineHtml(tok.v, defs)}</strong>`;
  if (tok.t === 'em') return `<em>${inlineHtml(tok.v, defs)}</em>`;
  if (tok.t === 'strike') return `<del>${inlineHtml(tok.v, defs)}</del>`;
  if (tok.t === 'image') {
    return `<img src="${escapeHtmlText(tok.href)}" alt="${escapeHtmlText(tok.alt)}">`;
  }
  // An autolink's label is the URL. Parsing it again finds the same autolink.
  const label =
    tok.v === tok.href ? escapeHtmlText(tok.v) : inlineHtml(tok.v, defs);
  return `<a href="${escapeHtmlText(tok.href)}">${label}</a>`;
}

function inlineHtml(src: string, defs: LinkDefs = NO_LINK_DEFS): string {
  return tokenizeInline(src, defs).map((tok) => renderInlineTok(tok, defs)).join('');
}

function diffInlineHtml(
  oldText: string,
  newText: string,
  oldDefs: LinkDefs = NO_LINK_DEFS,
  newDefs: LinkDefs = NO_LINK_DEFS
): string {
  if (oldText === newText) return inlineHtml(oldText, newDefs);
  const a = tokenizeInline(oldText, oldDefs);
  const b = tokenizeInline(newText, newDefs);
  const sameShape =
    a.length === b.length && a.every((tok, i) => tok.t === b[i].t);
  if (!sameShape) {
    return (
      wrapMark('del', inlineHtml(oldText, oldDefs)) +
      wrapMark('ins', inlineHtml(newText, newDefs))
    );
  }
  return a
    .map((tok, i) => {
      const next = b[i];
      if (tok.t === 'text' && next.t === 'text') {
        return renderWordDiffHtml(tok.v, next.v);
      }
      if (tok.t === 'code' && next.t === 'code') {
        if (tok.v === next.v) return renderInlineTok(tok, oldDefs);
        return (
          wrapMark('del', renderInlineTok(tok, oldDefs)) +
          wrapMark('ins', renderInlineTok(next, newDefs))
        );
      }
      if ((tok.t === 'strong' || tok.t === 'em') && next.t === tok.t) {
        const tag = tok.t === 'strong' ? 'strong' : 'em';
        if (tok.v === next.v) return renderInlineTok(tok, oldDefs);
        return `<${tag}>${diffInlineHtml(tok.v, next.v, oldDefs, newDefs)}</${tag}>`;
      }
      if (tok.t === 'strike' && next.t === 'strike') {
        if (tok.v === next.v) return renderInlineTok(tok, oldDefs);
        return `<del>${diffInlineHtml(tok.v, next.v, oldDefs, newDefs)}</del>`;
      }
      if (tok.t === 'link' && next.t === 'link') {
        if (tok.href === next.href && tok.v === next.v) return renderInlineTok(tok, newDefs);
        if (tok.href === next.href) {
          return `<a href="${escapeHtmlText(tok.href)}">${diffInlineHtml(tok.v, next.v, oldDefs, newDefs)}</a>`;
        }
        return (
          wrapMark('del', renderInlineTok(tok, oldDefs)) +
          wrapMark('ins', renderInlineTok(next, newDefs))
        );
      }
      if (
        tok.t === 'image' &&
        next.t === 'image' &&
        tok.href === next.href &&
        tok.alt === next.alt
      ) {
        return renderInlineTok(tok, newDefs);
      }
      return (
        wrapMark('del', renderInlineTok(tok, oldDefs)) +
        wrapMark('ins', renderInlineTok(next, newDefs))
      );
    })
    .join('');
}

function renderCell(
  oldText: string | null,
  newText: string | null,
  mode: 'del' | 'ins' | 'change',
  oldDefs: LinkDefs = NO_LINK_DEFS,
  newDefs: LinkDefs = NO_LINK_DEFS
): string {
  if (mode === 'del') return wrapMark('del', inlineHtml(oldText ?? '', oldDefs));
  if (mode === 'ins') return wrapMark('ins', inlineHtml(newText ?? '', newDefs));
  return diffInlineHtml(oldText ?? '', newText ?? '', oldDefs, newDefs);
}

function alignAttr(align: TableAlign): string {
  return align ? ` align="${align}"` : '';
}

function renderHtmlTable(
  header: string[],
  align: TableAlign[],
  rows: string[][]
): string {
  const ths = header
    .map((html, i) => `<th${alignAttr(align[i] ?? null)}>${html}</th>`)
    .join('');
  const body = rows
    .map((row) => {
      const tds = row
        .map((html, i) => `<td${alignAttr(align[i] ?? null)}>${html}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  // Marked treats `<table>` as an HTML block that runs until a blank line.
  // Without the extra break, the next heading, list, or fence stays raw text.
  return `<table><thead><tr>${ths}</tr></thead><tbody>${body}</tbody></table>\n\n`;
}

function renderWholeTable(
  table: TableBlock,
  mark: 'del' | 'ins',
  defs: LinkDefs
): string {
  const header = table.header.map((cell) =>
    renderCell(
      mark === 'del' ? cell : null,
      mark === 'ins' ? cell : null,
      mark,
      defs,
      defs
    )
  );
  const rows = table.rows.map((row) =>
    row.map((cell) =>
      renderCell(
        mark === 'del' ? cell : null,
        mark === 'ins' ? cell : null,
        mark,
        defs,
        defs
      )
    )
  );
  return renderHtmlTable(header, table.align, rows);
}

function slotAlign(slot: AlignSlot, oldA: TableAlign[], newA: TableAlign[]): TableAlign {
  if (slot.kind === 'del') return oldA[slot.oi] ?? null;
  return newA[slot.ni] ?? null;
}

function cellForSlot(
  oldRow: string[] | null,
  newRow: string[] | null,
  slot: AlignSlot,
  rowMode: 'pair' | 'ins' | 'del',
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  if (rowMode === 'ins') {
    if (slot.kind === 'del') return '';
    return renderCell(null, newRow?.[slot.ni] ?? '', 'ins', oldDefs, newDefs);
  }
  if (rowMode === 'del') {
    if (slot.kind === 'ins') return '';
    return renderCell(oldRow?.[slot.oi] ?? '', null, 'del', oldDefs, newDefs);
  }
  if (slot.kind === 'ins') {
    return renderCell(null, newRow?.[slot.ni] ?? '', 'ins', oldDefs, newDefs);
  }
  if (slot.kind === 'del') {
    return renderCell(oldRow?.[slot.oi] ?? '', null, 'del', oldDefs, newDefs);
  }
  return renderCell(
    oldRow?.[slot.oi] ?? '',
    newRow?.[slot.ni] ?? '',
    'change',
    oldDefs,
    newDefs
  );
}

function renderTableDiff(
  oldT: TableBlock,
  newT: TableBlock,
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  const colSlots = zipUnmatchedGaps(
    alignSequences(oldT.header.length, newT.header.length, (i, j) => {
      return oldT.header[i] === newT.header[j];
    })
  );
  const rowSlots = zipUnmatchedGaps(
    alignSequences(oldT.rows.length, newT.rows.length, (i, j) => {
      return oldT.rows[i].join('\u0000') === newT.rows[j].join('\u0000');
    })
  );
  const align = colSlots.map((slot) => slotAlign(slot, oldT.align, newT.align));
  const header = colSlots.map((slot) =>
    cellForSlot(oldT.header, newT.header, slot, 'pair', oldDefs, newDefs)
  );
  const rows = rowSlots.map((slot) => {
    if (slot.kind === 'ins') {
      return colSlots.map((col) =>
        cellForSlot(null, newT.rows[slot.ni], col, 'ins', oldDefs, newDefs)
      );
    }
    if (slot.kind === 'del') {
      return colSlots.map((col) =>
        cellForSlot(oldT.rows[slot.oi], null, col, 'del', oldDefs, newDefs)
      );
    }
    return colSlots.map((col) =>
      cellForSlot(oldT.rows[slot.oi], newT.rows[slot.ni], col, 'pair', oldDefs, newDefs)
    );
  });
  return renderHtmlTable(header, align, rows);
}

function joinWordDiff(oldText: string, newText: string): string {
  return wordDiff(oldText, newText).map(wrapMarkdownDiffOp).join('');
}

function emitRemovedBlock(block: MdBlock, oldDefs: LinkDefs): string {
  if (block.kind === 'table') return renderWholeTable(block, 'del', oldDefs);
  return wrapChangedRun('del', block.text);
}

function emitInsertedBlock(block: MdBlock, newDefs: LinkDefs): string {
  if (block.kind === 'table') return renderWholeTable(block, 'ins', newDefs);
  return wrapChangedRun('ins', block.text);
}

function emitPairedBlocks(
  oldB: MdBlock,
  newB: MdBlock,
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  if (oldB.kind === 'table' && newB.kind === 'table') {
    return renderTableDiff(oldB, newB, oldDefs, newDefs);
  }
  if (oldB.kind === 'prose' && newB.kind === 'prose') {
    return joinWordDiff(oldB.text, newB.text);
  }
  return emitRemovedBlock(oldB, oldDefs) + emitInsertedBlock(newB, newDefs);
}

function renderBlockHunk(
  hunk: Array<{ kind: 'del' | 'ins'; block: MdBlock }>,
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  const pending: MdBlock[] = [];
  let out = '';
  for (const op of hunk) {
    if (op.kind === 'del') {
      pending.push(op.block);
      continue;
    }
    const idx = pending.findIndex((block) => block.kind === op.block.kind);
    if (idx >= 0) {
      for (let k = 0; k < idx; k++) out += emitRemovedBlock(pending[k], oldDefs);
      out += emitPairedBlocks(pending[idx], op.block, oldDefs, newDefs);
      pending.splice(0, idx + 1);
    } else {
      for (const block of pending) out += emitRemovedBlock(block, oldDefs);
      pending.length = 0;
      out += emitInsertedBlock(op.block, newDefs);
    }
  }
  for (const block of pending) out += emitRemovedBlock(block, oldDefs);
  return out;
}

function sameBlock(a: MdBlock, b: MdBlock): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'prose' && b.kind === 'prose') return a.text === b.text;
  if (a.kind === 'table' && b.kind === 'table') return a.raw === b.raw;
  return false;
}

/** Line blocks only inside a hunk where a table sits between prose. */
function explodeProseLines(blocks: MdBlock[]): MdBlock[] {
  const out: MdBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== 'prose') {
      out.push(block);
      continue;
    }
    for (const line of splitLinesKeep(block.text)) {
      out.push({ kind: 'prose', text: line });
    }
  }
  return out;
}

function emitAlignedPair(
  oldB: MdBlock,
  newB: MdBlock,
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  if (sameBlock(oldB, newB)) {
    return oldB.kind === 'table' ? oldB.raw : oldB.text;
  }
  return emitPairedBlocks(oldB, newB, oldDefs, newDefs);
}

/** A table inserted or deleted between prose. Line alignment keeps the prose. */
function hunkSplitsProse(hunk: Array<{ kind: 'del' | 'ins'; block: MdBlock }>): boolean {
  let delProse = 0;
  let insProse = 0;
  let tables = 0;
  for (const op of hunk) {
    if (op.block.kind === 'table') tables += 1;
    else if (op.kind === 'del') delProse += 1;
    else insProse += 1;
  }
  return tables > 0 && delProse > 0 && insProse > 0;
}

function renderSplitProseHunk(
  hunk: Array<{ kind: 'del' | 'ins'; block: MdBlock }>,
  oldDefs: LinkDefs,
  newDefs: LinkDefs
): string {
  const oldParts: MdBlock[] = [];
  const newParts: MdBlock[] = [];
  for (const op of hunk) {
    const pieces =
      op.block.kind === 'prose' ? explodeProseLines([op.block]) : [op.block];
    if (op.kind === 'del') oldParts.push(...pieces);
    else newParts.push(...pieces);
  }
  return alignAndRender(oldParts, newParts, oldDefs, newDefs, false);
}

function alignAndRender(
  oldBlocks: MdBlock[],
  newBlocks: MdBlock[],
  oldDefs: LinkDefs,
  newDefs: LinkDefs,
  splitProse: boolean
): string {
  const slots = alignSequences(oldBlocks.length, newBlocks.length, (i, j) =>
    sameBlock(oldBlocks[i], newBlocks[j])
  );
  let out = '';
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (slot.kind === 'pair') {
      out += emitAlignedPair(
        oldBlocks[slot.oi],
        newBlocks[slot.ni],
        oldDefs,
        newDefs
      );
      i += 1;
      continue;
    }
    const hunk: Array<{ kind: 'del' | 'ins'; block: MdBlock }> = [];
    while (i < slots.length && slots[i].kind !== 'pair') {
      const cur = slots[i];
      if (cur.kind === 'del') hunk.push({ kind: 'del', block: oldBlocks[cur.oi] });
      else hunk.push({ kind: 'ins', block: newBlocks[cur.ni] });
      i += 1;
    }
    out +=
      splitProse && hunkSplitsProse(hunk)
        ? renderSplitProseHunk(hunk, oldDefs, newDefs)
        : renderBlockHunk(hunk, oldDefs, newDefs);
  }
  return out;
}

function diffMarkdownDocuments(oldText: string, newText: string): string {
  const oldDefs = collectLinkDefs(oldText);
  const newDefs = collectLinkDefs(newText);
  return alignAndRender(
    segmentDocument(oldText),
    segmentDocument(newText),
    oldDefs,
    newDefs,
    true
  );
}

/**
 * Show-diff off → new-side document with no ins/del wrappers.
 * Show-diff on → same document with word-level `<del>` / `<ins>` marks.
 *
 * Entire-file adds keep the new markdown unwrapped so it still renders;
 * the overlay paints those via a CSS class. GFM tables are rendered to HTML
 * so cell marks do not break the table, including a table that exists only
 * on the old side.
 */
export function buildMarkdownPreviewSource(input: {
  oldText?: string | null;
  newText?: string | null;
  showDiff?: boolean;
  status?: string;
} = {}): string {
  const sides = resolveMarkdownSides({
    status: input.status,
    oldText: input.oldText,
    newText: input.newText,
  });
  if (!input.showDiff) return sides.newText;
  if (!sides.oldText && sides.newText) return sides.newText;
  if (
    !documentHasGfmTable(sides.oldText) &&
    !documentHasGfmTable(sides.newText)
  ) {
    return joinWordDiff(sides.oldText, sides.newText);
  }
  return diffMarkdownDocuments(sides.oldText, sides.newText);
}

export type MarkdownMediaCtx = {
  owner?: string;
  repo?: string;
  ref?: string;
  filePath?: string;
  webOrigin?: string;
};

function decodeHtmlAttr(s: string): string {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function repoDirname(filePath: string): string {
  const p = String(filePath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const i = p.lastIndexOf('/');
  if (i <= 0) return '';
  return p.slice(0, i);
}

function normalizeRepoPath(p: string): string {
  const parts: string[] = [];
  for (const seg of String(p || '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Resolve a markdown/HTML media URL against the file's repo path.
 * Relative `assets/logo.jpeg` → GitHub `/raw/<ref>/assets/logo.jpeg`.
 * Absolute http(s) / data / blob URLs are left unchanged (return '').
 */
export function resolveMarkdownMediaUrl(
  src: unknown,
  ctx: MarkdownMediaCtx = {}
): string {
  let s = decodeHtmlAttr(String(src || '')).trim();
  if (!s) return '';
  const hashIdx = s.indexOf('#');
  if (hashIdx >= 0) s = s.slice(0, hashIdx);
  const qIdx = s.indexOf('?');
  const pathOnly = qIdx >= 0 ? s.slice(0, qIdx) : s;
  if (!pathOnly) return '';
  if (/^(data:|blob:|javascript:|mailto:)/i.test(pathOnly)) return '';
  if (pathOnly.startsWith('//')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathOnly)) return '';

  const owner = String(ctx.owner || '').trim();
  const repo = String(ctx.repo || '').trim();
  const ref = String(ctx.ref || '').trim();
  if (!owner || !repo || !ref) return '';

  const rel = pathOnly.trim();
  const joined = rel.startsWith('/')
    ? rel.replace(/^\/+/, '')
    : [repoDirname(String(ctx.filePath || '')), rel].filter(Boolean).join('/');
  const path = normalizeRepoPath(joined);
  if (!path) return '';
  return buildGithubRawUrl({
    webOrigin: ctx.webOrigin,
    owner,
    repo,
    ref,
    path,
  });
}

/**
 * Rewrite relative `src="..."` in rendered markdown HTML to repo raw URLs.
 * Shields / absolute CDN badges are unchanged.
 */
export function rewriteMarkdownMediaHtml(
  html: unknown,
  ctx: MarkdownMediaCtx = {}
): string {
  const input = String(html || '');
  if (!input || !ctx.owner || !ctx.repo || !ctx.ref) return input;
  return input.replace(
    /(\ssrc\s*=\s*)(["'])([^"']*)\2/gi,
    (full, pre: string, q: string, src: string) => {
      const next = resolveMarkdownMediaUrl(src, ctx);
      return next ? `${pre}${q}${next}${q}` : full;
    }
  );
}

/**
 * Keep GitHub-style `align="center|left|right"` as a class so CSS can honor
 * it even if presentational attributes are later stripped.
 */
export function stampMarkdownAlignAttrs(html: unknown): string {
  return String(html || '').replace(
    /<([a-zA-Z][\w:-]*)\b([^>]*?)\salign\s*=\s*(["']?)(center|left|right)\3([^>]*)>/gi,
    (full, tag: string, pre: string, _q: string, align: string, post: string) => {
      const cls = `prp-md-align-${align.toLowerCase()}`;
      if (full.includes(cls)) return full;
      if (/\sclass\s*=\s*(["'])/i.test(`${pre}${post}`)) {
        return full.replace(/\sclass\s*=\s*(["'])/i, ` class=$1${cls} `);
      }
      return `<${tag}${pre} class="${cls}" align="${align}"${post}>`;
    }
  );
}
