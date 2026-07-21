import React, { useMemo, memo } from 'react';
import { flattenVisibleTree } from '@lib/file-tree';
import { isPathViewed } from '@lib/review-threads';

function FolderFileTreeImpl(props: any) {
  const {
    files,
    tree,
    expandedDirs,
    onToggleDir,
    activePath,
    onSelect,
    collapsedFiles,
    onToggleFileCollapse,
    fileQuery,
    onFileQuery,
    threadCounts,
    viewedPaths,
    onToggleViewed,
    navCollapsed = false,
    onToggleNavCollapse,
  } = props;

  const visible = useMemo(() => {
    if (typeof flattenVisibleTree === 'function') {
      return flattenVisibleTree(tree || [], expandedDirs);
    }
    return tree || [];
  }, [tree, expandedDirs]);

  if (navCollapsed) {
    return (
      <aside className="prp-filetree prp-filetree--collapsed" aria-label="Files navigator collapsed">
        <button
          type="button"
          className="prp-filetree__rail-toggle"
          onClick={onToggleNavCollapse}
          title="Expand files navigator"
          aria-label="Expand files navigator"
          aria-expanded={false}
        >
          <span aria-hidden="true">▸</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="prp-filetree" aria-label="Files navigator">
      <div className="prp-filetree__head">
        <span className="prp-filetree__head-label">Files</span>
        {typeof onToggleNavCollapse === 'function' ? (
          <button
            type="button"
            className="prp-filetree__collapse-nav"
            onClick={onToggleNavCollapse}
            title="Collapse files navigator"
            aria-label="Collapse files navigator"
            aria-expanded={true}
          >
            <span aria-hidden="true">◂</span>
          </button>
        ) : null}
      </div>
      <div className="prp-filetree__search">
        <input
          className="prp-filetree__search-input"
          placeholder="Filter files…"
          value={fileQuery || ''}
          onChange={(e) => onFileQuery?.(e.target.value)}
          aria-label="Filter files"
        />
      </div>
      <ul className="prp-filetree__list">
        {visible.map((node: any) => {
          if (node.type === 'dir') {
            const open = expandedDirs?.has?.(node.path);
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
                  <span className="prp-filetree__chev">{open ? '▼' : '▶'}</span>
                  <span className="prp-filetree__name">{node.name}/</span>
                </button>
              </li>
            );
          }
          const f = node.file || {};
          const isCollapsed = collapsedFiles?.has?.(node.path);
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
              {f.defaultCollapsed || isCollapsed ? (
                <button
                  type="button"
                  className="prp-filetree__collapse"
                  title={isCollapsed ? 'Expand file' : 'Collapse file'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFileCollapse?.(node.path);
                  }}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export const FolderFileTree = memo(FolderFileTreeImpl);
export default FolderFileTree;
