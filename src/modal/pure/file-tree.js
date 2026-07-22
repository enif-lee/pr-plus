/**
 * Nested folder tree from PR file paths (GitHub Files Changed tree).
 */

/**
 * @typedef {{ type: 'dir'|'file', name: string, path: string, children?: TreeNode[], file?: object }} TreeNode
 */

/**
 * @param {Array<{ filename?: string, path?: string }>} files
 * @returns {TreeNode[]}
 */
function buildNestedFileTree(files) {
  const root = { type: 'dir', name: '', path: '', children: [] };
  if (!Array.isArray(files)) return [];

  for (const file of files) {
    const full = file.filename || file.path || '';
    if (!full) continue;
    const parts = full.split('/').filter(Boolean);
    let node = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      if (isFile) {
        if (!node.children) node.children = [];
        node.children.push({
          type: 'file',
          name: part,
          path: full,
          file,
        });
      } else {
        if (!node.children) node.children = [];
        let next = node.children.find((c) => c.type === 'dir' && c.name === part);
        if (!next) {
          next = { type: 'dir', name: part, path: acc, children: [] };
          node.children.push(next);
        }
        node = next;
      }
    }
  }

  function sortNodes(nodes) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.type === 'dir' && n.children) sortNodes(n.children);
    }
  }

  sortNodes(root.children || []);
  return root.children || [];
}

/**
 * Flatten tree for rendering with depth.
 * @param {TreeNode[]} nodes
 * @param {Set<string>|Map} [expandedDirs] dirs currently expanded (paths)
 * @returns {Array<{ type: string, name: string, path: string, depth: number, file?: object }>}
 */
function flattenVisibleTree(nodes, expandedDirs) {
  const out = [];
  const expanded =
    expandedDirs instanceof Set
      ? expandedDirs
      : expandedDirs instanceof Map
        ? new Set([...expandedDirs.keys()].filter((k) => expandedDirs.get(k)))
        : new Set(expandedDirs || []);

  function walk(list, depth) {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      out.push({
        type: n.type,
        name: n.name,
        path: n.path,
        depth,
        file: n.file,
      });
      if (n.type === 'dir' && n.children && expanded.has(n.path)) {
        walk(n.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return out;
}

/**
 * Lowercase extension without the leading dot.
 * Dotfiles (`.gitignore`) and names without a `.` → empty string.
 */
function fileExtensionFromPath(pathOrName) {
  const base = String(pathOrName || '')
    .split('/')
    .pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i + 1).toLowerCase();
}

/**
 * Unique extensions from a file list, most frequent first (then alpha).
 */
function listFileExtensions(files, opts) {
  const list = Array.isArray(files) ? files : [];
  const counts = new Map();
  for (const f of list) {
    const path = (f && (f.filename || f.path)) || '';
    if (!path) continue;
    const ext = fileExtensionFromPath(path);
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] === '') return 1;
    if (b[0] === '') return -1;
    return a[0].localeCompare(b[0]);
  });
  const max =
    opts && Number.isFinite(opts.max) && opts.max > 0
      ? Math.floor(opts.max)
      : sorted.length;
  return sorted.slice(0, max).map(([ext]) => ext);
}

/**
 * Keep files whose extension is in `selected`. Empty selection → all files.
 */
function filterFilesByExtensions(files, selected) {
  const list = Array.isArray(files) ? files : [];
  const set =
    selected instanceof Set
      ? selected
      : new Set(Array.isArray(selected) ? selected : selected ? [...selected] : []);
  if (set.size === 0) return list.slice();
  return list.filter((f) => {
    const path = (f && (f.filename || f.path)) || '';
    return set.has(fileExtensionFromPath(path));
  });
}

function toggleFileExtension(selected, ext) {
  const next = selected instanceof Set ? new Set(selected) : new Set(selected || []);
  const key = String(ext == null ? '' : ext);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function formatFileExtensionLabel(ext) {
  const e = String(ext == null ? '' : ext);
  return e ? `.${e}` : '∅';
}

function collectDirPaths(nodes) {
  const out = new Set();
  function walk(list) {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      if (n && n.type === 'dir') {
        if (n.path) out.add(n.path);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return out;
}

const api = {
  buildNestedFileTree,
  flattenVisibleTree,
  fileExtensionFromPath,
  listFileExtensions,
  filterFilesByExtensions,
  toggleFileExtension,
  formatFileExtensionLabel,
  collectDirPaths,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalFileTree = api;
}
