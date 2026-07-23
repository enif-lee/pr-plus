import React, { useEffect, useMemo, useState } from 'react';
import { buildNestedFileTree, flattenVisibleTree } from '@lib/file-tree';
import { takeVisibleTreeNodes } from '@lib/aside-lists';
import { IconDisclosure } from '@common/icons';

export function AsideFilesTree({ files }: any) {
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const tree = useMemo(() => buildNestedFileTree(files || []), [files]);

  useEffect(() => {
    const dirs = new Set();
    for (const n of tree) {
      if (n.type === 'dir') dirs.add(n.path);
    }
    setExpandedDirs(dirs);
  }, [tree]);

  const visible = useMemo(
    () => flattenVisibleTree(tree, expandedDirs),
    [tree, expandedDirs]
  );
  const { nodes, truncated, total } = useMemo(
    () => takeVisibleTreeNodes(visible, 20),
    [visible]
  );

  if (!files?.length) {
    return <div className="prp-muted">No files</div>;
  }

  return (
    <>
      <ul className="prp-aside-tree">
        {nodes.map((node) => {
          if (node.type === 'dir') {
            const open = expandedDirs.has(node.path);
            return (
              <li key={`d-${node.path}`} className="prp-aside-tree__row" style={{ paddingLeft: 4 + node.depth * 12 }}>
                <button
                  type="button"
                  className="prp-aside-tree__item prp-aside-tree__dir"
                  onClick={() =>
                    setExpandedDirs((prev) => {
                      const n = new Set(prev);
                      if (n.has(node.path)) n.delete(node.path);
                      else n.add(node.path);
                      return n;
                    })
                  }
                >
                  <span className="prp-aside-tree__chev" aria-hidden="true">
                    <IconDisclosure open={open} size={12} />
                  </span>
                  <span className="prp-aside-tree__name">{node.name}/</span>
                </button>
              </li>
            );
          }
          const f = node.file || {};
          return (
            <li key={`f-${node.path}`} className="prp-aside-tree__row" style={{ paddingLeft: 4 + node.depth * 12 }}>
              <span className="prp-aside-tree__item">
                <span className="prp-aside-tree__name" title={node.path}>
                  {node.name}
                </span>
                <span className="prp-aside-tree__stat">
                  +{f.additions ?? 0}/−{f.deletions ?? 0}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {truncated > 0 ? (
        <div className="prp-aside-overflow">
          +{truncated} more nodes · {total} visible when expanded
        </div>
      ) : null}
    </>
  );
}
