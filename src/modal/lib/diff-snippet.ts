/** @module modal/lib/diff-snippet */
/** GitHub conversation hunks: a range, or up to four rows ending at a comment. */

export function parsePatchLines(patch: any) {
  const out: any[] = [];
  if (!patch || typeof patch !== 'string') return out;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.replace(/\n$/, '').split('\n')) {
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      inHunk = true;
      out.push({ oldLine: null, newLine: null, type: 'hunk', text: line });
      continue;
    }
    // File headers and "No newline" markers do not consume code line numbers.
    if (!inHunk || !/^[ +\-]/.test(line)) continue;
    const type = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context';
    out.push({
      oldLine: type === 'add' ? null : oldLine++,
      newLine: type === 'del' ? null : newLine++,
      type,
      text: line,
    });
  }
  return out;
}

export function extractDiffSnippet(patch: any, anchor: any, opts: any = {}) {
  if (anchor?.line == null) return null;
  const lines = parsePatchLines(patch);
  const side = String(anchor.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const end = Number(anchor.line);
  const start = anchor.startLine != null ? Number(anchor.startLine) : end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  const numberFor = (line: any) => side === 'LEFT' ? line.oldLine : line.newLine;
  const endIdx = lines.findIndex((line) => numberFor(line) === end);
  if (endIdx < 0) return null;
  let hunkStart = endIdx;
  while (hunkStart > 0 && lines[hunkStart].type !== 'hunk') hunkStart--;
  let from: number;
  if (anchor.startLine != null) {
    from = lines.findIndex((line, i) => i > hunkStart && numberFor(line) === start);
    if (from < 0 || from > endIdx) return null;
  } else {
    const context = Number.isFinite(opts.context) ? Math.max(0, opts.context) : 3;
    from = Math.max(hunkStart, endIdx - context);
  }
  return { lines: lines.slice(from, endIdx + 1), startLine: start, endLine: end, side };
}

export function snippetFromDiffHunk(diffHunk: any, anchor: any = {}, opts: any = {}) {
  // diffHunk belongs to the comment's original commit, even if live line numbers move.
  return extractDiffSnippet(diffHunk, {
    line: anchor.originalLine ?? anchor.line,
    startLine: anchor.originalStartLine ?? anchor.startLine,
    side: anchor.side,
  }, opts);
}

export function snippetForComment(comment: any, files: any) {
  if (!comment || String(comment.subjectType || '').toLowerCase() === 'file') return null;
  const path = comment.path || '';
  const anchor = {
    line: comment.line,
    startLine: comment.startLine ?? comment.start_line,
    originalLine: comment.originalLine ?? comment.original_line,
    originalStartLine: comment.originalStartLine ?? comment.original_start_line,
    side: comment.side,
  };
  const hunk = comment.diffHunk || comment.diff_hunk;
  const file = !hunk && Array.isArray(files)
    ? files.find((f) => (f.filename || f.path || '') === path)
    : null;
  const snippet = hunk
    ? snippetFromDiffHunk(hunk, anchor)
    : extractDiffSnippet(file?.patch, anchor);
  return snippet ? { ...snippet, path, filePath: path } : null;
}
