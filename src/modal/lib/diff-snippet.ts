/** @module modal/lib/diff-snippet */
/**
 * Extract a small unified-diff snippet around a review comment line from a file patch.
 */

/**
 * Parse patch into line records with old/new numbers.
 * @param {string} patch
 * @returns {Array<{ oldLine: number|null, newLine: number|null, type: string, text: string }>}
 */
export function parsePatchLines(patch) {
  const out = [];
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
 * @returns {{ lines: Array, startLine: number|null, endLine: number|null }|null}
 */
export function extractDiffSnippet(patch, anchor, opts: any = {}) {
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
 * Attach snippet to a comment/thread using files[] patches.
 * @param {object} comment { path, line, startLine, side }
 * @param {Array<{ filename?: string, path?: string, patch?: string }>} files
 */
export function snippetForComment(comment, files) {
  if (!comment?.path || !Array.isArray(files)) return null;
  const file = files.find(
    (f) => (f.filename || f.path || '') === comment.path
  );
  if (!file?.patch) return null;
  const snippet = extractDiffSnippet(file.patch, {
    line: comment.line,
    startLine: comment.startLine ?? comment.start_line,
    side: comment.side,
  });
  if (!snippet) return null;
  return { ...snippet, path: comment.path, filePath: comment.path };
}
