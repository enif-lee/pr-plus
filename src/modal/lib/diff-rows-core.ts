/** Split from diff-rows.ts: diff-rows-core */
/** @module modal/lib/diff-rows */
/**
 * Flatten PR files + patches into virtual table rows.
 * mode: 'unified' | 'split'
 * Supports default-collapsed files and inline review comments.
 */
import { classifyDiffFile } from './collapse';


/** Default chunk when expanding from one edge of a gap (GitHub uses 20). */
export const DIFF_EXPAND_CHUNK = 20;

/**
 * Build a raw content URL for GitHub / GHE web UI.
 * @param {{ webOrigin?: string, owner?: string, repo?: string, ref?: string, path?: string }} opts
 */
export function buildGithubRawUrl(opts: any = {}) {
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const ref = String(opts.ref || '').trim();
  const path = String(opts.path || '').replace(/^\/+/, '');
  if (!owner || !repo || !ref || !path) return '';
  const origin = String(opts.webOrigin || 'https://github.com')
    .trim()
    .replace(/\/+$/, '');
  const encPath = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${origin}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/raw/${encodeURIComponent(ref)}/${encPath}`;
}

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
    const subjectType = isFileLevelComment(c) ? 'file' : 'line';
    rows.push({
      kind: 'inline-comment',
      filePath: path,
      text: `${c.author || 'user'}: ${c.body || ''}`,
      body: c.body || '',
      author: c.author || '',
      avatarUrl: c.avatarUrl || c.avatar_url || '',
      commentId: c.id,
      nodeId: c.nodeId || c.node_id || null,
      reactions: Array.isArray(c.reactions) ? c.reactions : [],
      threadNodeId: c.threadNodeId || null,
      resolved: Boolean(c.resolved),
      outdated: Boolean(c.outdated),
      pending: Boolean(c.pending),
      rowIndex: index++,
      lineType: 'comment',
      newLine: n,
      oldLine: o,
      side: String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
      subjectType,
      // Line threads in split mode dock under the matching pane (file-level spans full)
      split: Boolean(split && subjectType === 'line'),
    });
  };

  const pushFileLevelComments = (path) => {
    for (const c of rootsByPath.get(path) || []) {
      if (isFileLevelComment(c)) pushInline(path, c, null, null);
    }
  };

  for (const file of files) {
    const path = file.filename || file.path || 'unknown';
    const status = file.status || 'modified';
    const stats = `+${file.additions ?? 0} −${file.deletions ?? 0}`;
    const classified =
      file.fileKind && typeof file.openableAsText === 'boolean'
        ? {
            kind: file.fileKind,
            openableAsText: file.openableAsText,
            renderImage: Boolean(file.renderImage),
          }
        : classifyDiffFile(file);
    // Non-image binary never expands a text body (header-only, not toggle-openable).
    const openable = classified.kind === 'text' || classified.renderImage;
    // Empty collapsedSet → honor defaultCollapsed + viewed.
    // Non-empty → explicit list only (after first toggle materializes defaults).
    // Binary non-openable files stay header-only regardless of expandAll.
    const isCollapsed = !openable
      ? true
      : !options.expandAll &&
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
      openable,
      fileKind: classified.kind,
      renderImage: classified.renderImage,
    });

    // File-level threads sit under the header (even when collapsed).
    pushFileLevelComments(path);

    // Collapsed / non-openable: header + file comments only (binary never opens as text).
    // Still surface *line* threads so Diff thread nav / Resolve e2e can land on
    // them when the file is viewed/default-collapsed (demo PR #7: all threads on
    // a one-line file that is often marked viewed).
    if (isCollapsed || !openable) {
      for (const c of rootsByPath.get(path) || []) {
        if (!isFileLevelComment(c)) {
          pushInline(path, c, c.line ?? null, c.originalLine ?? null);
        }
      }
      continue;
    }

    const patch = file.patch || '';
    if (!patch) {
      if (classified.renderImage) {
        const headUrl =
          file.raw_url ||
          file.rawUrl ||
          file.headRawUrl ||
          buildGithubRawUrl({
            webOrigin: options.webOrigin,
            owner: options.owner,
            repo: options.repo,
            ref: options.headSha || options.headRef,
            path,
          });
        const prevPath = file.previous_filename || file.previousFilename || path;
        const statusLower = String(status).toLowerCase();
        const showBase =
          statusLower === 'modified' ||
          statusLower === 'renamed' ||
          statusLower === 'changed' ||
          statusLower === 'removed' ||
          statusLower === 'deleted';
        const baseUrl = showBase
          ? file.baseRawUrl ||
            file.previous_raw_url ||
            buildGithubRawUrl({
              webOrigin: options.webOrigin,
              owner: options.owner,
              repo: options.repo,
              ref: options.baseSha || options.baseRef,
              path: prevPath,
            })
          : '';
        rows.push({
          kind: 'diff-image',
          filePath: path,
          status,
          headUrl: headUrl || '',
          baseUrl: baseUrl || '',
          text: `image ${path}`,
          rowIndex: index++,
          lineType: 'image',
        });
      } else {
        // Should not reach for binary (openable=false), but keep a non-open meta.
        rows.push({
          kind: 'diff-meta',
          filePath: path,
          text: 'Binary file — not shown',
          rowIndex: index++,
          lineType: 'meta',
          openable: false,
        });
      }
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

    /**
     * Split mode: buffer consecutive del/add runs, then pair them onto the
     * same visual row (GitHub-style side-by-side). Context flushes first.
     * @type {Array<{ line: string, o: number|null, n: number|null }>}
     */
    const pendingDels = [];
    /** @type {Array<{ line: string, o: number|null, n: number|null }>} */
    const pendingAdds = [];

    const attachInlineComments = (o, n) => {
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

    const emitSplitRow = (leftType, left, o, rightType, right, n, raw) => {
      const text = `${String(o ?? '').padStart(4)} │ ${left} │ ${String(n ?? '').padStart(4)} │ ${right}`;
      let lineType = 'context';
      if (leftType === 'del' && rightType === 'add') lineType = 'change';
      else if (leftType === 'del') lineType = 'del';
      else if (rightType === 'add') lineType = 'add';
      rows.push({
        kind: 'diff-line',
        filePath: path,
        text,
        code: right || left || '',
        leftCode: left,
        rightCode: right,
        split: true,
        raw: raw || '',
        rowIndex: index++,
        lineType,
        leftType: leftType || null,
        rightType: rightType || null,
        oldLine: o,
        newLine: n,
      });
      attachInlineComments(o, n);
    };

    /** Pair buffered dels with adds onto shared rows (max(len) rows). */
    const flushSplitChangeGroup = () => {
      if (!pendingDels.length && !pendingAdds.length) return;
      const count = Math.max(pendingDels.length, pendingAdds.length);
      for (let i = 0; i < count; i++) {
        const d = pendingDels[i] || null;
        const a = pendingAdds[i] || null;
        const left = d ? d.line.slice(1) : '';
        const right = a ? a.line.slice(1) : '';
        const o = d ? d.o : null;
        const n = a ? a.n : null;
        emitSplitRow(
          d ? 'del' : null,
          left,
          o,
          a ? 'add' : null,
          right,
          n,
          (d && d.line) || (a && a.line) || ''
        );
      }
      pendingDels.length = 0;
      pendingAdds.length = 0;
    };

    const pushDiffLine = (lineType, line, o, n) => {
      // Split: buffer del/add so consecutive change runs share a row
      if (split && (lineType === 'del' || lineType === 'add')) {
        if (lineType === 'del') {
          // del after add closes the previous change group
          if (pendingAdds.length) flushSplitChangeGroup();
          pendingDels.push({ line, o, n });
        } else {
          pendingAdds.push({ line, o, n });
        }
        return;
      }

      if (split) flushSplitChangeGroup();

      if (split && lineType === 'context') {
        const code = line.slice(1);
        emitSplitRow('context', code, o, 'context', code, n, line);
        return;
      }

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
      attachInlineComments(o, n);
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
            // Middle gap: one chrome group on the next @@ (expandAbove) —
            // GitHub-style ▼ | Expand all | ▲ (both directions + full gap).
            // Do not dual-mount the same gap on prev.expandBelow (avoids
            // duplicate Expand all / stacked control groups).
            const middleGap = materializeGap(newLine, nextNew - 1, oldLine);
            expandAbove = middleGap;
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
        // Close any open del/add pair before chrome rows
        if (split) flushSplitChangeGroup();
        const row: any = {
          kind: 'diff-line',
          filePath: path,
          text: line,
          code: line,
          split: false,
          raw: line,
          // rowIndex assigned only when pushed — skipped hidden @@ must not
          // consume an index (selection head uses array index ≡ rowIndex).
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
        row.rowIndex = index++;
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

    // Flush trailing del/add pair at end of patch
    if (split) flushSplitChangeGroup();

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
          lastHunkRow.rowIndex = index++;
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
export function coveringRange(ranges, line) {
  if (!Array.isArray(ranges)) return null;
  for (const r of ranges) {
    if (r && line >= r.start && line <= r.end) return r;
  }
  return null;
}

export function toRangeMap(input) {
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

export function toLinesMap(input) {
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

export function toSet(paths) {
  if (!paths) return new Set();
  if (paths instanceof Set) return paths;
  return new Set(Array.isArray(paths) ? paths : []);
}

/** Placement key for an inline review root: path + side + line. */
export function commentLineKey(path, side, line) {
  const s = String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  return `${path}:${s}:${Number(line)}`;
}

export function commentSide(c) {
  return String(c?.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
}

/**
 * Line used for anchoring on the current diff.
 * Prefer live `line`; fall back to `originalLine` (outdated threads).
 */
export function commentAnchorLine(c) {
  if (c == null) return null;
  if (isFileLevelComment(c)) return null;
  if (c.line != null && Number.isFinite(Number(c.line))) return Number(c.line);
  if (c.originalLine != null && Number.isFinite(Number(c.originalLine))) {
    return Number(c.originalLine);
  }
  if (c.original_line != null && Number.isFinite(Number(c.original_line))) {
    return Number(c.original_line);
  }
  return null;
}

/**
 * GitHub file-level review comment (subject_type: file) — no line anchor.
 */
export function isFileLevelComment(c) {
  if (!c || !c.path) return false;
  const st = String(c.subjectType || c.subject_type || '').toLowerCase();
  if (st === 'file') return true;
  if (st === 'line') return false;
  // Heuristic: path-only comments with no line/original_line
  const hasLine =
    (c.line != null && Number.isFinite(Number(c.line))) ||
    (c.originalLine != null && Number.isFinite(Number(c.originalLine))) ||
    (c.original_line != null && Number.isFinite(Number(c.original_line)));
  return !hasLine;
}

/**
 * Top Y of virtual row `i` (prefix offsets or uniform rowHeight).
 */
export function rowTopY(offsets, i, rowHeight = 22) {
  if (Array.isArray(offsets) && offsets.length > 0) {
    const y = Number(offsets[i]);
    if (Number.isFinite(y)) return y;
  }
  return Math.max(0, Number(i) || 0) * (Number(rowHeight) || 22);
}

/**
 * File-header row that should stick at the top for the current scroll offset.
 * Returns the last file-header whose top is at or above scrollTop.
 *
 * @param {Array} virtualRows
 * @param {number[]|null} offsets rowOffsets() result (length rows+1)
 * @param {number} scrollTop
 * @param {number} [rowHeight=22] fallback when offsets missing
 * @returns {object|null}
 */
export function isReplyComment(c, byId) {
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
 * Guess highlight.js language id from path (must match registered langs in main.tsx).
 * @param {string} filePath
 */
export function languageFromPath(filePath) {
  const p = (filePath || '').toLowerCase();
  const base = p.split('/').pop() || '';
  // Bare / special filenames
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
  if (base === 'cmakelists.txt') return 'cmake';
  if (base.endsWith('.gradle.kts')) return 'kotlin';
  if (base.endsWith('.gradle')) return 'gradle';
  // multi-dot extensions
  if (base.endsWith('.d.ts')) return 'typescript';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  const map: Record<string, string> = {
    // Web
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    html: 'xml',
    htm: 'xml',
    xhtml: 'xml',
    xml: 'xml',
    svg: 'xml',
    vue: 'xml',
    svelte: 'xml',
    // Data / config
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    cfg: 'ini',
    conf: 'ini',
    env: 'bash',
    // Scripting
    py: 'python',
    pyi: 'python',
    pyw: 'python',
    rb: 'ruby',
    rake: 'ruby',
    php: 'php',
    phtml: 'php',
    pl: 'perl',
    pm: 'perl',
    lua: 'lua',
    r: 'r',
    // Shell
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    ps1: 'powershell',
    psm1: 'powershell',
    psd1: 'powershell',
    // Systems
    c: 'c',
    h: 'c',
    cc: 'cpp',
    cpp: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    hh: 'cpp',
    hxx: 'cpp',
    mm: 'objectivec',
    m: 'objectivec',
    // JVM / mobile
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'scala',
    sc: 'scala',
    go: 'go',
    rs: 'rust',
    cs: 'csharp',
    fs: 'fsharp',
    swift: 'swift',
    dart: 'dart',
    // Data / API
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    proto: 'protobuf',
    // Diff / patch
    diff: 'diff',
    patch: 'diff',
  };
  return map[ext || ''] || 'plaintext';
}
