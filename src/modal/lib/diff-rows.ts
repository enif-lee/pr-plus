/** @module modal/lib/diff-rows */
/**
 * Flatten PR files + patches into virtual table rows.
 * mode: 'unified' | 'split'
 * Supports default-collapsed files and inline review comments.
 */

/** Default chunk when expanding from one edge of a gap (GitHub uses 20). */
export const DIFF_EXPAND_CHUNK = 20;

/**
 * @param {Array<{ filename: string, status?: string, additions?: number, deletions?: number, patch?: string, defaultCollapsed?: boolean }>} files
 * @param {'unified'|'split'} [mode='unified']
 * @param {{
 *   collapsedPaths?: Set<string>|string[],
 *   viewedPaths?: Set<string>|string[],
 *   reviewComments?: Array,
 *   expandAll?: boolean,
 *   expandedRanges?: Map<string, Array<{start:number,end:number}>>|Record<string, Array<{start:number,end:number}>>,
 *   fileLineTexts?: Map<string, string[]>|Record<string, string[]>,
 *   expandChunk?: number,
 * }} [options]
 * @returns {Array<object>}
 */
export function flattenFilesToVirtualRows(files, mode = 'unified', options: any = {}) {
  const rows = [];
  if (!Array.isArray(files)) return rows;
  const split = mode === 'split';
  const collapsedSet = toSet(options.collapsedPaths);
  const viewedSet = toSet(options.viewedPaths);
  const commentsByKey = groupComments(options.reviewComments || []);
  const rootsByPath = rootCommentsByPath(options.reviewComments || []);
  const expandedByPath = toRangeMap(options.expandedRanges);
  const fileLinesByPath = toLinesMap(options.fileLineTexts);
  const expandChunk =
    Number.isFinite(options.expandChunk) && options.expandChunk > 0
      ? Math.floor(options.expandChunk)
      : DIFF_EXPAND_CHUNK;
  const placedIds = new Set();
  let index = 0;

  const pushInline = (path, c, n, o) => {
    if (!c || c.id == null) return;
    const id = String(c.id);
    if (placedIds.has(id)) return;
    placedIds.add(id);
    rows.push({
      kind: 'inline-comment',
      filePath: path,
      text: `${c.author || 'user'}: ${c.body || ''}`,
      body: c.body || '',
      author: c.author || '',
      avatarUrl: c.avatarUrl || c.avatar_url || '',
      commentId: c.id,
      threadNodeId: c.threadNodeId || null,
      resolved: Boolean(c.resolved),
      outdated: Boolean(c.outdated),
      pending: Boolean(c.pending),
      rowIndex: index++,
      lineType: 'comment',
      newLine: n,
      oldLine: o,
      side: String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
    });
  };
  for (const file of files) {
    const path = file.filename || file.path || 'unknown';
    const status = file.status || 'modified';
    const stats = `+${file.additions ?? 0} −${file.deletions ?? 0}`;
    // Empty collapsedSet → honor defaultCollapsed + viewed.
    // Non-empty → explicit list only (after first toggle materializes defaults).
    const isCollapsed =
      !options.expandAll &&
      (collapsedSet.has(path) ||
        (collapsedSet.size === 0 &&
          (file.defaultCollapsed === true || viewedSet.has(path))));

    const additions = Number(file.additions) || 0;
    const deletions = Number(file.deletions) || 0;
    rows.push({
      kind: 'file-header',
      filePath: path,
      status,
      additions,
      deletions,
      // Fully closed when collapsed — no "(collapsed)" label text
      text: `${status} ${path} ${stats}`,
      rowIndex: index++,
      lineType: 'header',
      collapsed: isCollapsed,
    });

    // Collapsed files expose only the header (toggle to expand) — no meta row.
    if (isCollapsed) {
      continue;
    }

    const patch = file.patch || '';
    if (!patch) {
      rows.push({
        kind: 'diff-meta',
        filePath: path,
        text: '(no textual patch — binary or too large)',
        rowIndex: index++,
        lineType: 'meta',
      });
      // Still surface review threads so Diff nav can land on them.
      for (const c of rootsByPath.get(path) || []) {
        pushInline(path, c, c.line ?? null, c.originalLine ?? null);
      }
      continue;
    }

    let oldLine = 0;
    let newLine = 0;
    let seenHunk = false;
    /** @type {any} last @@ row — trailing expandBelow attaches here */
    let lastHunkRow = null;
    const fileLines = fileLinesByPath.get(path) || null;
    const expandedRanges = expandedByPath.get(path) || [];
    const lines = patch.split('\n');

    const pushDiffLine = (lineType, line, o, n) => {
      if (split && (lineType === 'add' || lineType === 'del' || lineType === 'context')) {
        const left =
          lineType === 'add' ? '' : lineType === 'del' ? line.slice(1) : line.slice(1);
        const right =
          lineType === 'del' ? '' : lineType === 'add' ? line.slice(1) : line.slice(1);
        const text = `${String(o ?? '').padStart(4)} │ ${left} │ ${String(n ?? '').padStart(4)} │ ${right}`;
        rows.push({
          kind: 'diff-line',
          filePath: path,
          text,
          code: right || left || line.slice(1) || line,
          leftCode: left,
          rightCode: right,
          split: true,
          raw: line,
          rowIndex: index++,
          lineType,
          oldLine: o,
          newLine: n,
        });
      } else {
        rows.push({
          kind: 'diff-line',
          filePath: path,
          text: line,
          code:
            lineType === 'add' || lineType === 'del' || lineType === 'context'
              ? line.slice(1)
              : line,
          split: false,
          raw: line,
          rowIndex: index++,
          lineType,
          oldLine: o,
          newLine: n,
        });
      }
      if (n != null) {
        for (const c of commentsByKey.get(commentLineKey(path, 'RIGHT', n)) || []) {
          pushInline(path, c, n, o);
        }
      }
      if (o != null) {
        for (const c of commentsByKey.get(commentLineKey(path, 'LEFT', o)) || []) {
          pushInline(path, c, n, o);
        }
      }
    };

    /**
     * Emit already-expanded context lines in a gap; return remaining unexpanded
     * meta for the @@ hunk control (no separate expand row).
     */
    const materializeGap = (gapStartNew, gapEndNew, gapStartOld) => {
      if (
        !Number.isFinite(gapStartNew) ||
        !Number.isFinite(gapEndNew) ||
        gapEndNew < gapStartNew
      ) {
        return null;
      }
      let firstUncovered = null;
      let lastUncovered = null;
      let cursor = gapStartNew;
      while (cursor <= gapEndNew) {
        const cover = coveringRange(expandedRanges, cursor);
        if (cover && fileLines) {
          const end = Math.min(cover.end, gapEndNew);
          for (let n = cursor; n <= end; n++) {
            const o = gapStartOld + (n - gapStartNew);
            const code = fileLines[n - 1] ?? '';
            pushDiffLine('context', ` ${code}`, o, n);
          }
          cursor = end + 1;
          continue;
        }
        let end = gapEndNew;
        if (cover && !fileLines) {
          end = Math.min(cover.end, gapEndNew);
        } else {
          for (const r of expandedRanges) {
            if (r.start > cursor && r.start - 1 < end) end = r.start - 1;
          }
        }
        if (firstUncovered == null) firstUncovered = cursor;
        lastUncovered = end;
        cursor = end + 1;
      }
      if (firstUncovered == null || lastUncovered == null) return null;
      const count = lastUncovered - firstUncovered + 1;
      const oldStart = gapStartOld + (firstUncovered - gapStartNew);
      return {
        gapStartNew: firstUncovered,
        gapEndNew: lastUncovered,
        gapStartOld: oldStart,
        gapEndOld: oldStart + count - 1,
        hiddenCount: count,
        expandChunk,
        hasFileText: Boolean(fileLines),
      };
    };

    for (const line of lines) {
      let lineType = 'context';
      let expandAbove = null;
      /** True for @@ -N,M +N,M @@ (identical range both sides) */
      let hideHunkHeader = false;
      if (line.startsWith('+++') || line.startsWith('---')) lineType = 'meta';
      else if (line.startsWith('@@')) {
        lineType = 'hunk';
        // Capture counts so we can hide @@ when both sides match (e.g. -7,11 +7,11)
        const m = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (m) {
          const nextOld = Number(m[1]);
          const oldCount = m[2] != null ? Number(m[2]) : 1;
          const nextNew = Number(m[3]);
          const newCount = m[4] != null ? Number(m[4]) : 1;
          if (!seenHunk) {
            // Leading omitted context (before first hunk) → controls on this @@
            if (nextNew > 1) {
              const leadOldStart = nextOld > 1 ? 1 : nextOld;
              expandAbove = materializeGap(1, nextNew - 1, leadOldStart);
            }
            seenHunk = true;
          } else if (newLine > 0 && nextNew > newLine) {
            // Middle gap → expand controls live on the following @@ row
            expandAbove = materializeGap(newLine, nextNew - 1, oldLine);
          }
          oldLine = nextOld;
          newLine = nextNew;
          hideHunkHeader =
            Number.isFinite(nextOld) &&
            Number.isFinite(nextNew) &&
            nextOld === nextNew &&
            oldCount === newCount;
        }
      } else if (line.startsWith('+')) lineType = 'add';
      else if (line.startsWith('-')) lineType = 'del';

      if (lineType === 'hunk' || lineType === 'meta') {
        const row: any = {
          kind: 'diff-line',
          filePath: path,
          text: line,
          code: line,
          split: false,
          raw: line,
          rowIndex: index++,
          lineType,
          oldLine: null,
          newLine: null,
        };
        if (lineType === 'hunk') {
          if (expandAbove) row.expandAbove = expandAbove;
          if (hideHunkHeader) row.hidden = true;
          lastHunkRow = row;
        }
        // Fully-hidden @@ without expand UI: keep lastHunkRow for expandBelow,
        // but don't insert a visual row unless expandBelow is set later.
        if (lineType === 'hunk' && row.hidden && !row.expandAbove) {
          continue;
        }
        rows.push(row);
        continue;
      }

      let o = null;
      let n = null;
      if (lineType === 'context') {
        o = oldLine++;
        n = newLine++;
      } else if (lineType === 'del') {
        o = oldLine++;
      } else if (lineType === 'add') {
        n = newLine++;
      }

      pushDiffLine(lineType, line, o, n);
    }

    // Trailing omitted context → expand on the last @@ row (right side)
    if (
      lastHunkRow &&
      fileLines &&
      fileLines.length &&
      newLine > 0 &&
      newLine <= fileLines.length
    ) {
      const below = materializeGap(newLine, fileLines.length, oldLine);
      if (below) {
        lastHunkRow.expandBelow = below;
        // Hidden last @@ was not pushed — insert now so expand controls render
        if (lastHunkRow.hidden && !rows.includes(lastHunkRow)) {
          rows.push(lastHunkRow);
        }
      }
    }

    // Outdated / line-missing roots: keep under this file so nav can still jump
    for (const c of rootsByPath.get(path) || []) {
      if (c?.id != null && !placedIds.has(String(c.id))) {
        pushInline(path, c, c.line ?? null, c.originalLine ?? null);
      }
    }
  }

  return rows;
}

/**
 * Merge inclusive 1-based line ranges for a file (expand-gap state).
 * @param {Array<{start:number,end:number}>} ranges
 * @param {number} start
 * @param {number} end
 */
export function mergeLineRanges(ranges, start, end) {
  const s = Math.min(Number(start), Number(end));
  const e = Math.max(Number(start), Number(end));
  if (!Number.isFinite(s) || !Number.isFinite(e)) {
    return Array.isArray(ranges) ? ranges.slice() : [];
  }
  const list = [...(Array.isArray(ranges) ? ranges : []), { start: s, end: e }].sort(
    (a, b) => a.start - b.start
  );
  const out = [];
  for (const r of list) {
    if (!out.length || r.start > out[out.length - 1].end + 1) {
      out.push({ start: r.start, end: r.end });
    } else {
      out[out.length - 1].end = Math.max(out[out.length - 1].end, r.end);
    }
  }
  return out;
}

/**
 * Resolve which inclusive new-file lines to expand for a gap control click.
 * @param {'all'|'down'|'up'} direction
 * @param {{ gapStartNew: number, gapEndNew: number, expandChunk?: number }} gap
 */
export function resolveExpandRange(direction, gap) {
  const start = Number(gap?.gapStartNew);
  const end = Number(gap?.gapEndNew);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const chunk =
    Number.isFinite(gap?.expandChunk) && gap.expandChunk > 0
      ? Math.floor(gap.expandChunk)
      : DIFF_EXPAND_CHUNK;
  const dir = String(direction || 'all');
  if (dir === 'down') {
    return { start, end: Math.min(end, start + chunk - 1) };
  }
  if (dir === 'up') {
    return { start: Math.max(start, end - chunk + 1), end };
  }
  return { start, end };
}

function coveringRange(ranges, line) {
  if (!Array.isArray(ranges)) return null;
  for (const r of ranges) {
    if (r && line >= r.start && line <= r.end) return r;
  }
  return null;
}

function toRangeMap(input) {
  const map = new Map();
  if (!input) return map;
  if (input instanceof Map) {
    for (const [k, v] of input) {
      if (k != null && Array.isArray(v)) map.set(String(k), v);
    }
    return map;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (Array.isArray(v)) map.set(String(k), v);
    }
  }
  return map;
}

function toLinesMap(input) {
  const map = new Map();
  if (!input) return map;
  if (input instanceof Map) {
    for (const [k, v] of input) {
      if (k != null && Array.isArray(v)) map.set(String(k), v);
    }
    return map;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (Array.isArray(v)) map.set(String(k), v);
    }
  }
  return map;
}

function toSet(paths) {
  if (!paths) return new Set();
  if (paths instanceof Set) return paths;
  return new Set(Array.isArray(paths) ? paths : []);
}

/** Placement key for an inline review root: path + side + line. */
export function commentLineKey(path, side, line) {
  const s = String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  return `${path}:${s}:${Number(line)}`;
}

function commentSide(c) {
  return String(c?.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
}

/**
 * Line used for anchoring on the current diff.
 * Prefer live `line`; fall back to `originalLine` (outdated threads).
 */
function commentAnchorLine(c) {
  if (c == null) return null;
  if (c.line != null && Number.isFinite(Number(c.line))) return Number(c.line);
  if (c.originalLine != null && Number.isFinite(Number(c.originalLine))) {
    return Number(c.originalLine);
  }
  if (c.original_line != null && Number.isFinite(Number(c.original_line))) {
    return Number(c.original_line);
  }
  return null;
}

function isReplyComment(c, byId) {
  const parentId = c?.inReplyToId ?? c?.in_reply_to_id ?? null;
  return parentId != null && byId.has(String(parentId));
}

/**
 * Group review **roots** by path:SIDE:line for inline rows.
 * Replies (inReplyToId → known id) are nested under the root via InlineThread.
 *
 * Also indexes legacy key `path:line` for RIGHT-side only (older call sites/tests).
 */
export function groupComments(comments) {
  const map = new Map();
  if (!Array.isArray(comments)) return map;
  const byId = new Map();
  for (const c of comments) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of comments) {
    if (!c || !c.path) continue;
    if (isReplyComment(c, byId)) continue;
    const line = commentAnchorLine(c);
    if (line == null) continue;
    const side = commentSide(c);
    const key = commentLineKey(c.path, side, line);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
    // Legacy alias: RIGHT-only path:line (tests + older consumers)
    if (side === 'RIGHT') {
      map.set(`${c.path}:${line}`, map.get(key));
    }
  }
  return map;
}

/** Root review comments grouped by file path (for orphan / no-patch placement). */
export function rootCommentsByPath(comments) {
  const map = new Map();
  if (!Array.isArray(comments)) return map;
  const byId = new Map();
  for (const c of comments) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of comments) {
    if (!c || !c.path) continue;
    if (isReplyComment(c, byId)) continue;
    if (!map.has(c.path)) map.set(c.path, []);
    map.get(c.path).push(c);
  }
  return map;
}

/**
 * Map of filePath -> first rowIndex for file tree jump.
 */
export function fileStartIndexMap(virtualRows) {
  const map = new Map();
  if (!Array.isArray(virtualRows)) return map;
  for (const row of virtualRows) {
    if (row.kind === 'file-header' && row.filePath && !map.has(row.filePath)) {
      map.set(row.filePath, row.rowIndex);
    }
  }
  return map;
}

/**
 * Guess highlight language from path.
 * @param {string} filePath
 */
export function languageFromPath(filePath) {
  const p = (filePath || '').toLowerCase();
  const base = p.split('/').pop() || '';
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'xml',
    htm: 'xml',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'xml',
    svelte: 'xml',
  };
  return map[ext] || 'plaintext';
}
