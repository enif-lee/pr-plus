/** @module modal/lib/markdown-preview */
/**
 * Diff overlay helpers for markdown files: path detect, old/new sides,
 * word-level ins/del, and show-diff off/on render input.
 */

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

function diffWordsInLine(a: string, b: string): MarkdownDiffOp[] {
  if (a === b) return a ? [{ kind: 'eq', text: a }] : [];
  const ops = diffTokenArraysUnmerged(splitWordsKeep(a), splitWordsKeep(b));
  return concatOps(ops.map((op) => ({ kind: op.kind, text: op.token })));
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
 * changed lines are diffed by word / whitespace / punctuation tokens (not
 * whole-line −/+ blocks, and not intra-word letters).
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
 * Show-diff off → new-side document with no ins/del wrappers.
 * Show-diff on → same document with word-level `<del>` / `<ins>` marks.
 *
 * Entire-file adds keep the new markdown unwrapped so it still renders;
 * the overlay paints those via a CSS class.
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
  if (sides.oldText && !sides.newText) {
    return wrapChangedRun('del', sides.oldText);
  }
  return wordDiff(sides.oldText, sides.newText)
    .map(wrapMarkdownDiffOp)
    .join('');
}
