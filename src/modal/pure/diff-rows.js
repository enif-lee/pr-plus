/**
 * Flatten PR files + patches into virtual table rows.
 * mode: 'unified' | 'split'
 */

/**
 * @param {Array<{ filename: string, status?: string, additions?: number, deletions?: number, patch?: string }>} files
 * @param {'unified'|'split'} [mode='unified']
 * @returns {Array<{ kind: string, filePath: string, text: string, rowIndex: number, lineType?: string, oldLine?: number|null, newLine?: number|null }>}
 */
function flattenFilesToVirtualRows(files, mode = 'unified') {
  const rows = [];
  if (!Array.isArray(files)) return rows;
  const split = mode === 'split';

  let index = 0;
  for (const file of files) {
    const path = file.filename || file.path || 'unknown';
    const status = file.status || 'modified';
    const stats = `+${file.additions ?? 0} −${file.deletions ?? 0}`;

    rows.push({
      kind: 'file-header',
      filePath: path,
      text: `${status} ${path} ${stats}`,
      rowIndex: index++,
      lineType: 'header',
    });

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
        const text = `${String(o ?? '').padStart(4)} │ ${left.padEnd(48).slice(0, 48)} │ ${String(n ?? '').padStart(4)} │ ${right}`;
        rows.push({
          kind: 'diff-line',
          filePath: path,
          text,
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
          rowIndex: index++,
          lineType,
          oldLine: o,
          newLine: n,
        });
      }
    }
  }

  return rows;
}

/**
 * Map of filePath -> first rowIndex for file tree jump.
 */
function fileStartIndexMap(virtualRows) {
  const map = new Map();
  if (!Array.isArray(virtualRows)) return map;
  for (const row of virtualRows) {
    if (row.kind === 'file-header' && row.filePath && !map.has(row.filePath)) {
      map.set(row.filePath, row.rowIndex);
    }
  }
  return map;
}

const api = {
  flattenFilesToVirtualRows,
  fileStartIndexMap,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalDiffRows = api;
}
