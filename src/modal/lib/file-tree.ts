/** @module modal/lib/file-tree */
/**
 * Nested folder tree from PR file paths (GitHub Files Changed tree).
 */

/**
 * Natural name order: digits compare as numbers (V2 before V10, file2 before file10).
 */
export function compareFileTreeNames(a: unknown, b: unknown): number {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * @typedef {{ type: 'dir'|'file', name: string, path: string, children?: TreeNode[], file?: object }} TreeNode
 */

/**
 * @param {Array<{ filename?: string, path?: string }>} files
 * @returns {TreeNode[]}
 */
export function buildNestedFileTree(files: any) {
  const root = { type: 'dir', name: '', path: '', children: [] as any[] };
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

  function sortNodes(nodes: any) {
    nodes.sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return compareFileTreeNames(a.name, b.name);
    });
    for (const n of nodes) {
      if (n.type === 'dir' && n.children) sortNodes(n.children);
    }
  }

  sortNodes(root.children || []);
  return root.children || [];
}

/**
 * Files in explorer / Diff / step-nav order: nested tree, dirs-first +
 * natural name sort at each level, DFS walk. Prefer this over raw GitHub
 * `files[]` order so Diff virtual list, left file tree, and prev/next file
 * all agree.
 *
 * @param {Array<{ filename?: string, path?: string }>} files
 * @returns {Array<{ filename?: string, path?: string }>}
 */
export function filesInTreeOrder(files: any) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];
  const tree = buildNestedFileTree(list);
  const out: any[] = [];
  function walk(nodes: any) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n) continue;
      if (n.type === 'file') {
        if (n.file) out.push(n.file);
        else if (n.path) out.push({ filename: n.path, path: n.path });
        continue;
      }
      if (n.type === 'dir' && n.children) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

/**
 * Flatten tree for rendering with depth.
 * @param {TreeNode[]} nodes
 * @param {Set<string>|Map} [expandedDirs] dirs currently expanded (paths)
 * @returns {Array<{ type: string, name: string, path: string, depth: number, file?: object }>}
 */
export function flattenVisibleTree(nodes: any, expandedDirs: any) {
  const out: any[] = [];
  const expanded =
    expandedDirs instanceof Set
      ? expandedDirs
      : expandedDirs instanceof Map
        ? new Set([...expandedDirs.keys()].filter((k) => expandedDirs.get(k)))
        : new Set(expandedDirs || []);

  function walk(list: any, depth: any) {
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
 * @param {string|null|undefined} pathOrName
 * @returns {string}
 */
export function fileExtensionFromPath(pathOrName: any) {
  const base = String(pathOrName || '')
    .split('/')
    .pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i + 1).toLowerCase();
}

/**
 * Unique extensions from a file list, most frequent first (then alpha).
 * @param {Array<{ filename?: string, path?: string }>} files
 * @param {{ max?: number }} [opts]
 * @returns {string[]} extension tokens (no leading dot; '' for no-extension)
 */
export function listFileExtensions(
  files: Array<{ filename?: string; path?: string }> | null | undefined,
  opts: { max?: number } = {}
) {
  const list = Array.isArray(files) ? files : [];
  const counts = new Map<string, number>();
  for (const f of list) {
    const path = f?.filename || f?.path || '';
    if (!path) continue;
    const ext = fileExtensionFromPath(path);
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    // Keep no-ext last among equals
    if (a[0] === '') return 1;
    if (b[0] === '') return -1;
    return a[0].localeCompare(b[0]);
  });
  const optsMax = Number(opts?.max);
  const max =
    Number.isFinite(optsMax) && optsMax > 0
      ? Math.floor(optsMax)
      : sorted.length;
  return sorted.slice(0, max).map(([ext]) => ext);
}

/**
 * Keep files whose extension is in `selected`. Empty selection → all files.
 * @param {Array<{ filename?: string, path?: string }>} files
 * @param {Iterable<string>|Set<string>|string[]|null|undefined} selected
 */
export function filterFilesByExtensions(files: any, selected: any) {
  const list = Array.isArray(files) ? files : [];
  const set =
    selected instanceof Set
      ? selected
      : new Set(
          Array.isArray(selected)
            ? selected
            : selected
              ? [...(selected as Iterable<string>)]
              : []
        );
  if (set.size === 0) return list.slice();
  return list.filter((f) => {
    const path = f?.filename || f?.path || '';
    return set.has(fileExtensionFromPath(path));
  });
}

/**
 * Toggle one extension in a selection set (immutable).
 * @param {Set<string>|string[]|null|undefined} selected
 * @param {string} ext
 * @returns {Set<string>}
 */
export function toggleFileExtension(selected: any, ext: any) {
  const next = selected instanceof Set ? new Set(selected) : new Set(selected || []);
  const key = String(ext ?? '');
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Display label for an extension token (`.ts` or `∅` for none).
 * @param {string} ext
 */
export function formatFileExtensionLabel(ext: any) {
  const e = String(ext ?? '');
  return e ? `.${e}` : '∅';
}

/** Diff review filter: off | unresolved | resolved | pending */
export type DiffReviewFilterMode =
  | null
  | 'unresolved'
  | 'resolved'
  | 'pending';

/**
 * True when threadCounts has at least one path with count > 0.
 * @param {Map<string, number>|Record<string, number>|null|undefined} threadCounts
 */
export function hasAnyReviewThreads(threadCounts: any) {
  if (!threadCounts) return false;
  if (threadCounts instanceof Map) {
    for (const n of threadCounts.values()) {
      if (Number(n) > 0) return true;
    }
    return false;
  }
  if (typeof threadCounts === 'object') {
    for (const k of Object.keys(threadCounts)) {
      if (Number((threadCounts as any)[k]) > 0) return true;
    }
  }
  return false;
}

/**
 * Sum all path counts in a Map / record.
 * @param {Map<string, number>|Record<string, number>|null|undefined} threadCounts
 * @returns {number}
 */
export function sumThreadCounts(threadCounts: any) {
  if (!threadCounts) return 0;
  let n = 0;
  if (threadCounts instanceof Map) {
    for (const v of threadCounts.values()) n += Number(v) || 0;
    return n;
  }
  if (typeof threadCounts === 'object') {
    for (const k of Object.keys(threadCounts)) {
      n += Number((threadCounts as any)[k]) || 0;
    }
  }
  return n;
}

function countOnPath(
  threadCounts: Map<string, number> | Record<string, number> | null | undefined,
  path: string
) {
  if (!path || !threadCounts) return 0;
  if (threadCounts instanceof Map) return Number(threadCounts.get(path)) || 0;
  return Number((threadCounts as any)[path]) || 0;
}

/**
 * Filter files by review-thread mode.
 * - null: no filter
 * - 'unresolved': paths with submitted unresolved (non-pending) threads
 * - 'resolved': paths with at least one resolved thread
 * - 'pending': paths with at least one pending (unsubmitted) thread
 * - 'all' (legacy): paths with any review thread
 *
 * When `pendingCounts` is provided, unresolved is max(0, unresolved − pending)
 * so draft threads are not double-counted with the Pending filter.
 *
 * @param {Array<{ filename?: string, path?: string }>} files
 * @param {Map<string, number>|Record<string, number>|null|undefined} allCounts
 * @param {Map<string, number>|Record<string, number>|null|undefined} unresolvedCounts
 * @param {DiffReviewFilterMode | 'all' | boolean | null | undefined} mode
 * @param {Map<string, number>|Record<string, number>|null|undefined} [pendingCounts]
 */
export function filterFilesByReviewMode(
  files: any,
  allCounts: any,
  unresolvedCounts: any,
  mode: any,
  pendingCounts: any = null
) {
  const list = Array.isArray(files) ? files : [];
  let m: any = mode;
  if (m === true) m = 'all'; // back-compat
  if (
    m !== 'all' &&
    m !== 'unresolved' &&
    m !== 'resolved' &&
    m !== 'pending'
  ) {
    return list.slice();
  }
  return list.filter((f) => {
    const path = f?.filename || f?.path || '';
    const total = countOnPath(allCounts, path);
    const unresolved = countOnPath(unresolvedCounts, path);
    const pending = countOnPath(pendingCounts, path);
    if (m === 'pending') return pending > 0;
    if (m === 'unresolved') {
      // Submitted open threads only when pendingCounts is known
      if (pendingCounts != null) return Math.max(0, unresolved - pending) > 0;
      return unresolved > 0;
    }
    if (m === 'resolved') return total > unresolved; // at least one resolved
    return total > 0; // 'all'
  });
}

/** @deprecated use filterFilesByReviewMode */
export function filterFilesWithReviewThreads(files: any, threadCounts: any, reviewOnly: any) {
  return filterFilesByReviewMode(
    files,
    threadCounts,
    threadCounts,
    reviewOnly ? 'all' : null
  );
}

/**
 * Keep only paths not marked viewed (unread). Off when unreadOnly is false.
 * @param {Array<{ filename?: string, path?: string }>} files
 * @param {Set<string>|string[]|null|undefined} viewedPaths
 * @param {boolean} unreadOnly
 */
export function filterFilesUnreadOnly(files: any, viewedPaths: any, unreadOnly: any) {
  const list = Array.isArray(files) ? files : [];
  if (!unreadOnly) return list.slice();
  const viewed =
    viewedPaths instanceof Set
      ? viewedPaths
      : new Set(Array.isArray(viewedPaths) ? viewedPaths : []);
  return list.filter((f) => {
    const path = f?.filename || f?.path || '';
    return path ? !viewed.has(path) : false;
  });
}

/**
 * Keep only files that have ≥1 review thread (any status).
 * Used by the file explorer "Commented" chip — independent of Diff review-status
 * multi-filter (which only hides threads, not files).
 *
 * @param {Array<{ filename?: string, path?: string }>} files
 * @param {Map<string, number>|Record<string, number>|null|undefined} threadCounts
 * @param {boolean} commentedOnly
 */
export function filterFilesCommentedOnly(files: any, threadCounts: any, commentedOnly: any) {
  const list = Array.isArray(files) ? files : [];
  if (!commentedOnly) return list.slice();
  return filterFilesByReviewMode(list, threadCounts, threadCounts, 'all');
}

/**
 * Collect every dir path in a nested tree (for auto-expand while filtering).
 * @param {TreeNode[]} nodes
 * @returns {Set<string>}
 */
export function collectDirPaths(nodes: any) {
  const out = new Set();
  function walk(list: any) {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      if (n?.type === 'dir') {
        if (n.path) out.add(n.path);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return out;
}
