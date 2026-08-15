/** @module modal/lib/diff-snippet */
/**
 * Extract a small unified-diff snippet around a review comment line from a file patch,
 * or from a review comment's own `diffHunk` (preferred — no files[] dependency).
 */

/**
 * Parse patch into line records with old/new numbers.
 * @param {string} patch
 * @returns {Array<{ oldLine: number|null, newLine: number|null, type: string, text: string }>}
 */
export function parsePatchLines(patch: any) {
  const out: any[] = [];
  if (!patch || typeof patch !== 'string') return out;
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split('\n')) {
    let type = 'context';
    if (line.startsWith('+++') || line.startsWith('---')) {
      type = 'meta';
    } else if (line.startsWith('@@')) {
      type = 'hunk';
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      out.push({ oldLine: null, newLine: null, type, text: line });
      continue;
    } else if (line.startsWith('+')) type = 'add';
    else if (line.startsWith('-')) type = 'del';

    let o = null;
    let n = null;
    if (type === 'context') {
      o = oldLine++;
      n = newLine++;
    } else if (type === 'del') {
      o = oldLine++;
    } else if (type === 'add') {
      n = newLine++;
    }
    out.push({ oldLine: o, newLine: n, type, text: line });
  }
  return out;
}

/**
 * @param {string} patch
 * @param {{ line?: number|null, startLine?: number|null, side?: string }} anchor
 * @param {{ context?: number }} [opts]
 * @returns {{ lines: Array, startLine: number|null, endLine: number|null, side?: string }|null}
 */
export function extractDiffSnippet(patch: any, anchor: any, opts: any = {}) {
  const lines = parsePatchLines(patch);
  if (!lines.length || !anchor || anchor.line == null) return null;
  const side = (anchor.side || 'RIGHT').toUpperCase();
  const end = Number(anchor.line);
  const start =
    anchor.startLine != null && Number(anchor.startLine) <= end
      ? Number(anchor.startLine)
      : end;
  const ctx = Number.isFinite(opts.context) ? opts.context : 2;

  // Find indices covering [start, end] on the chosen side
  const matchIdx = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.type === 'hunk' || L.type === 'meta') continue;
    const n = side === 'LEFT' ? L.oldLine : L.newLine;
    if (n != null && n >= start && n <= end) matchIdx.push(i);
  }
  if (!matchIdx.length) {
    // Fallback: any side
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const n = L.newLine ?? L.oldLine;
      if (n != null && n >= start && n <= end) matchIdx.push(i);
    }
  }
  if (!matchIdx.length) return null;

  let from = Math.max(0, matchIdx[0] - ctx);
  let to = Math.min(lines.length - 1, matchIdx[matchIdx.length - 1] + ctx);
  // Prefer including preceding hunk header if nearby
  for (let i = from; i >= Math.max(0, from - 5); i--) {
    if (lines[i].type === 'hunk') {
      from = i;
      break;
    }
  }

  const slice = lines.slice(from, to + 1).map((L) => ({
    type: L.type,
    text: L.text,
    oldLine: L.oldLine,
    newLine: L.newLine,
    highlight:
      (side === 'LEFT' ? L.oldLine : L.newLine) != null &&
      (side === 'LEFT' ? L.oldLine : L.newLine) >= start &&
      (side === 'LEFT' ? L.oldLine : L.newLine) <= end,
  }));

  return { lines: slice, startLine: start, endLine: end, side };
}

/**
 * Build a preview from a review comment's `diffHunk` (GitHub stores a focused
 * unified-diff slice on every review comment — works even when files[] lacks patch).
 * @param {string} diffHunk
 * @param {{ line?: number|null, startLine?: number|null, originalLine?: number|null, side?: string }} [anchor]
 * @param {{ context?: number, maxLines?: number }} [opts]
 */
export function snippetFromDiffHunk(diffHunk: any, anchor: any = {}, opts: any = {}) {
  if (!diffHunk || typeof diffHunk !== 'string') return null;
  const lines = parsePatchLines(diffHunk);
  if (!lines.length) return null;

  const side = String(anchor.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const end =
    anchor.line != null
      ? Number(anchor.line)
      : anchor.originalLine != null
        ? Number(anchor.originalLine)
        : null;
  const start =
    anchor.startLine != null && end != null && Number(anchor.startLine) <= end
      ? Number(anchor.startLine)
      : end;

  // Prefer extractDiffSnippet when we have a line anchor inside the hunk
  if (end != null) {
    const focused = extractDiffSnippet(
      diffHunk,
      { line: end, startLine: start, side },
      { context: opts.context ?? 3 }
    );
    if (focused?.lines?.length) return focused;
  }

  // Whole hunk as preview (already short). Cap very long hunks.
  const maxLines =
    Number.isFinite(opts.maxLines) && opts.maxLines > 0 ? Math.floor(opts.maxLines) : 40;
  const body = lines.filter((L) => L.type !== 'meta');
  const slice = (body.length > maxLines ? body.slice(0, maxLines) : body).map((L) => ({
    type: L.type,
    text: L.text,
    oldLine: L.oldLine,
    newLine: L.newLine,
    highlight:
      end != null &&
      ((side === 'LEFT' ? L.oldLine : L.newLine) === end ||
        (start != null &&
          end != null &&
          (side === 'LEFT' ? L.oldLine : L.newLine) != null &&
          (side === 'LEFT' ? L.oldLine : L.newLine)! >= start &&
          (side === 'LEFT' ? L.oldLine : L.newLine)! <= end)),
  }));
  if (!slice.length) return null;
  // If no line matched, highlight last code line as anchor
  if (!slice.some((L) => L.highlight)) {
    for (let i = slice.length - 1; i >= 0; i--) {
      if (slice[i].type === 'add' || slice[i].type === 'context' || slice[i].type === 'del') {
        slice[i] = { ...slice[i], highlight: true };
        break;
      }
    }
  }
  return {
    lines: slice,
    startLine: start,
    endLine: end,
    side,
  };
}

/**
 * Attach snippet to a comment/thread.
 * Prefer comment.diffHunk (GraphQL/REST), then files[] patch.
 * @param {object} comment { path, line, startLine, side, originalLine, diffHunk }
 * @param {Array<{ filename?: string, path?: string, patch?: string }>} files
 */
export function snippetForComment(comment: any, files: any) {
  if (!comment) return null;
  const path = comment.path || '';
  const line =
    comment.line != null
      ? Number(comment.line)
      : comment.originalLine != null
        ? Number(comment.originalLine)
        : comment.original_line != null
          ? Number(comment.original_line)
          : null;
  const startLine = comment.startLine ?? comment.start_line ?? null;
  const side = comment.side || 'RIGHT';
  const hunk = comment.diffHunk || comment.diff_hunk || '';

  if (hunk) {
    const fromHunk = snippetFromDiffHunk(
      hunk,
      { line, startLine, originalLine: comment.originalLine ?? comment.original_line, side },
      { context: 3, maxLines: 40 }
    );
    if (fromHunk?.lines?.length) {
      return { ...fromHunk, path, filePath: path };
    }
  }

  if (!path || !Array.isArray(files)) return null;
  const file = files.find((f) => (f.filename || f.path || '') === path);
  if (!file?.patch) return null;
  const snippet = extractDiffSnippet(
    file.patch,
    { line, startLine, side },
    { context: 2 }
  );
  if (!snippet) return null;
  return { ...snippet, path, filePath: path };
}
