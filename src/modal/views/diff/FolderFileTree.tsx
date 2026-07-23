import React, { useMemo, useState, memo, useCallback } from 'react';
import {
  buildNestedFileTree,
  flattenVisibleTree,
  listFileExtensions,
  filterFilesByExtensions,
  filterFilesUnreadOnly,
  toggleFileExtension,
  formatFileExtensionLabel,
  collectDirPaths,
} from '@lib/file-tree';
import { filterFilesByQuery, isPathViewed } from '@lib/review-threads';
import { isPathCollapsed } from '@lib/collapse';
import { IconDisclosure } from '@common/icons';

/** Cap extension chips so the search row stays usable on narrow nav. */
const MAX_EXT_CHIPS = 10;

function FolderFileTreeImpl(props: any) {
  const {
    files,
    tree: treeProp,
    expandedDirs,
    onToggleDir,
    activePath,
    onSelect,
    collapsedFiles,
    fileQuery,
    onFileQuery,
    threadCounts,
    viewedPaths,
    onToggleViewed,
    navCollapsed = false,
    /** When provided, parent owns filter state (shared with review nav). */
    selectedExts: selectedExtsProp = null,
    onSelectedExts = null,
    unreadOnly: unreadOnlyProp = null,
    onUnreadOnly = null,
  } = props;

  const [selectedExtsLocal, setSelectedExtsLocal] = useState(() => new Set<string>());
  const [unreadOnlyLocal, setUnreadOnlyLocal] = useState(false);
  const selectedExts =
    selectedExtsProp instanceof Set ? selectedExtsProp : selectedExtsLocal;
  const unreadOnly =
    typeof unreadOnlyProp === 'boolean' ? unreadOnlyProp : unreadOnlyLocal;
  const setSelectedExts =
    typeof onSelectedExts === 'function' ? onSelectedExts : setSelectedExtsLocal;
  const setUnreadOnly =
    typeof onUnreadOnly === 'function' ? onUnreadOnly : setUnreadOnlyLocal;

  const extOptions = useMemo(
    () => listFileExtensions(files || [], { max: MAX_EXT_CHIPS }),
    [files]
  );

  // Parent App already applies review + name/ext/unread filters when controlled.
  // Re-apply here only for local (uncontrolled) mode, or when parent passes unfiltered files.
  const parentFiltersFiles = selectedExtsProp instanceof Set;
  const filteredTree = useMemo(() => {
    let list = Array.isArray(files) ? files : [];
    if (!parentFiltersFiles) {
      if (typeof filterFilesByQuery === 'function') {
        list = filterFilesByQuery(list, fileQuery);
      }
      list = filterFilesByExtensions(list, selectedExts);
      list = filterFilesUnreadOnly(list, viewedPaths, unreadOnly);
    }
    if (typeof buildNestedFileTree === 'function') {
      return buildNestedFileTree(list);
    }
    return treeProp || [];
  }, [
    files,
    fileQuery,
    selectedExts,
    unreadOnly,
    viewedPaths,
    treeProp,
    parentFiltersFiles,
  ]);

  const filtering =
    Boolean(String(fileQuery || '').trim()) ||
    selectedExts.size > 0 ||
    unreadOnly;

  const effectiveExpanded = useMemo(() => {
    if (!filtering) return expandedDirs;
    // While filtering, expand every dir so matches are not hidden under collapsed folders.
    const dirs = collectDirPaths(filteredTree);
    if (expandedDirs instanceof Set) {
      for (const p of expandedDirs) dirs.add(p);
    }
    return dirs;
  }, [filtering, filteredTree, expandedDirs]);

  const visible = useMemo(() => {
    if (typeof flattenVisibleTree === 'function') {
      return flattenVisibleTree(filteredTree || [], effectiveExpanded);
    }
    return filteredTree || [];
  }, [filteredTree, effectiveExpanded]);

  const onToggleExt = useCallback((ext: string) => {
    setSelectedExts((prev) => toggleFileExtension(prev, ext));
  }, []);

  // Stay mounted while collapsed so open/close width animation can run.
  // Expand/collapse is driven by Diff toolbar “Files” + layout CSS.
  return (
    <aside
      className={`prp-filetree${navCollapsed ? ' prp-filetree--nav-collapsed' : ''}`}
      aria-label="Files navigator"
      aria-hidden={navCollapsed ? true : undefined}
    >
      <div className="prp-filetree__search">
        <input
          className="prp-filetree__search-input"
          placeholder="Filter files…"
          value={fileQuery || ''}
          onChange={(e) => onFileQuery?.(e.target.value)}
          aria-label="Filter files"
        />
        <div
          className="prp-filetree__filters"
          role="group"
          aria-label="File list filters"
        >
          <button
            type="button"
            className={
              unreadOnly
                ? 'prp-filetree__ext prp-filetree__ext--on'
                : 'prp-filetree__ext'
            }
            aria-pressed={unreadOnly}
            title={
              unreadOnly
                ? 'Show all files (clear unread filter)'
                : 'Show only unread (not viewed) files'
            }
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread
          </button>
          {extOptions.map((ext) => {
            const on = selectedExts.has(ext);
            const label = formatFileExtensionLabel(ext);
            return (
              <button
                key={ext || '__none__'}
                type="button"
                className={
                  on
                    ? 'prp-filetree__ext prp-filetree__ext--on'
                    : 'prp-filetree__ext'
                }
                aria-pressed={on}
                title={
                  on
                    ? `Clear filter ${label}`
                    : `Show only ${label} files`
                }
                onClick={() => onToggleExt(ext)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="prp-filetree__list">
        {visible.map((node: any) => {
          if (node.type === 'dir') {
            const open = effectiveExpanded?.has?.(node.path);
            return (
              <li
                key={`d-${node.path}`}
                className="prp-filetree__row"
                style={{ paddingLeft: 4 + (node.depth || 0) * 12 }}
              >
                <button
                  type="button"
                  className="prp-filetree__item prp-filetree__dir"
                  onClick={() => onToggleDir?.(node.path)}
                >
                  <span className="prp-filetree__chev" aria-hidden="true">
                    <IconDisclosure open={open} size={12} />
                  </span>
                  <span className="prp-filetree__name">{node.name}/</span>
                </button>
              </li>
            );
          }
          const f = node.file || {};
          const isCollapsed = isPathCollapsed(
            node.path,
            collapsedFiles,
            Boolean(f.defaultCollapsed),
            false,
            viewedPaths
          );
          const threads = threadCounts?.get?.(node.path) || threadCounts?.[node.path] || 0;
          const viewed = isPathViewed ? isPathViewed(viewedPaths, node.path) : false;
          return (
            <li
              key={`f-${node.path}`}
              className="prp-filetree__row"
              style={{ paddingLeft: 4 + (node.depth || 0) * 12 }}
            >
              <label className="prp-filetree__viewed" title="Mark as viewed">
                <input
                  type="checkbox"
                  checked={viewed}
                  onChange={() => onToggleViewed?.(node.path)}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <button
                type="button"
                className={
                  node.path === activePath
                    ? 'prp-filetree__item prp-filetree__item--active'
                    : 'prp-filetree__item'
                }
                onClick={() => onSelect?.(node.path)}
              >
                <span className="prp-filetree__name" title={node.path}>
                  {node.name}
                  {isCollapsed ? ' ·' : ''}
                </span>
                {threads > 0 ? (
                  <span className="prp-filetree__threads" title="Review threads">
                    {threads}
                  </span>
                ) : null}
                <span className="prp-filetree__stat">
                  <span className="prp-stat-add">+{f.additions ?? 0}</span>
                  <span className="prp-stat-del">−{f.deletions ?? 0}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export const FolderFileTree = memo(FolderFileTreeImpl);
export default FolderFileTree;
