/** @module modal/lib/diff-rows */
/**
 * Flatten PR files + patches into virtual table rows.
 * mode: 'unified' | 'split'
 * Supports default-collapsed files and inline review comments.
 */

/**
 * @param {Array<{ filename: string, status?: string, additions?: number, deletions?: number, patch?: string, defaultCollapsed?: boolean }>} files
 * @param {'unified'|'split'} [mode='unified']
 * @param {{ collapsedPaths?: Set<string>|string[], reviewComments?: Array, expandAll?: boolean }} [options]
 * @returns {Array<object>}
 */
export function flattenFilesToVirtualRows(files, mode = 'unified', options: any = {}) {
  const rows = [];
  if (!Array.isArray(files)) return rows;
  const split = mode === 'split';
  const collapsedSet = toSet(options.collapsedPaths);
  const commentsByKey = groupComments(options.reviewComments || []);

  let index = 0;
  for (const file of files) {
    const path = file.filename || file.path || 'unknown';
    const status = file.status || 'modified';
    const stats = `+${file.additions ?? 0} −${file.deletions ?? 0}`;
    const isCollapsed =
      !options.expandAll &&
      (collapsedSet.has(path) ||
        (collapsedSet.size === 0 && file.defaultCollapsed === true));

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
      continue;
    }

    let oldLine = 0;
    let newLine = 0;
    const lines = patch.split('\n');
    for (const line of lines) {
      let lineType = 'context';
      if (line.startsWith('+++') || line.startsWith('---')) lineType = 'meta';
      else if (line.startsWith('@@')) {
        lineType = 'hunk';
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          oldLine = Number(m[1]);
          newLine = Number(m[2]);
        }
      } else if (line.startsWith('+')) lineType = 'add';
      else if (line.startsWith('-')) lineType = 'del';

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

      // Inline comments after matching RIGHT/new line
      if (n != null) {
        const key = `${path}:${n}`;
        const list = commentsByKey.get(key) || [];
        for (const c of list) {
          rows.push({
            kind: 'inline-comment',
            filePath: path,
            text: `${c.author || 'user'}: ${c.body || ''}`,
            body: c.body || '',
            author: c.author || '',
            commentId: c.id,
            threadNodeId: c.threadNodeId || null,
            resolved: Boolean(c.resolved),
            rowIndex: index++,
            lineType: 'comment',
            newLine: n,
            oldLine: o,
          });
        }
      }
    }
  }

  return rows;
}

function toSet(paths) {
  if (!paths) return new Set();
  if (paths instanceof Set) return paths;
  return new Set(Array.isArray(paths) ? paths : []);
}

/**
 * Group review comments by path:line for inline rows.
 * Only **root** comments become rows; replies (inReplyToId → known id) are
 * nested under the root via groupReviewThreads / InlineThread.replies.
 */
export function groupComments(comments) {
  const map = new Map();
  if (!Array.isArray(comments)) return map;
  const byId = new Map();
  for (const c of comments) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of comments) {
    if (!c || !c.path || c.line == null) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) {
      // Reply — do not emit a second inline-comment row
      continue;
    }
    const key = `${c.path}:${Number(c.line)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
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
