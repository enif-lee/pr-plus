/** @module modal/lib/file-tree */
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
export function buildNestedFileTree(files) {
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
export function flattenVisibleTree(nodes, expandedDirs) {
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
