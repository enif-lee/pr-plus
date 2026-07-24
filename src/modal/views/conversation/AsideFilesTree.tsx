import React, { useEffect, useMemo, useState } from 'react';
import { buildNestedFileTree, flattenVisibleTree } from '@lib/file-tree';
import { takeVisibleTreeNodes } from '@lib/aside-lists';
import {
  filterFilesByQuery,
  needsFullCorpusLoad,
} from '@lib/create-and-apply';
import { IconDisclosure } from '@common/icons';

export function AsideFilesTree({
  files,
  onEnsureAllFiles = null,
  filesFullyLoaded = false,
  loadingAll = false,
}: any) {
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = query.trim();
  const filteredFiles = useMemo(
    () =>
      typeof filterFilesByQuery === 'function'
        ? filterFilesByQuery(files, q)
        : files || [],
    [files, q]
  );

  const tree = useMemo(
    () => buildNestedFileTree(filteredFiles || []),
    [filteredFiles]
  );

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
  const { nodes, truncated, total } = useMemo(() => {
    if (showAll || q) {
      return {
        nodes: visible,
        total: visible.length,
        truncated: 0,
      };
    }
    return takeVisibleTreeNodes(visible, 20);
  }, [visible, showAll, q]);

  async function ensureFull(reason: 'search' | 'loadMore') {
    const need =
      typeof needsFullCorpusLoad === 'function'
        ? needsFullCorpusLoad({
            query: reason === 'search' ? q : '',
            loadMore: reason === 'loadMore',
            fullyLoaded: filesFullyLoaded,
          })
        : !filesFullyLoaded;
    if (!need || typeof onEnsureAllFiles !== 'function') return;
    setBusy(true);
    try {
      await onEnsureAllFiles();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!q) return;
    void ensureFull('search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!files?.length && !q) {
    return <div className="prp-muted">No files</div>;
  }

  return (
    <>
      <div className="prp-aside-search">
        <input
          className="prp-aside-search__input"
          type="search"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search files"
        />
      </div>
      {!nodes.length ? (
        <div className="prp-muted">No matching files</div>
      ) : (
        <ul className="prp-aside-tree">
          {nodes.map((node) => {
            if (node.type === 'dir') {
              const open = expandedDirs.has(node.path);
              return (
                <li
                  key={`d-${node.path}`}
                  className="prp-aside-tree__row"
                  style={{ paddingLeft: 4 + node.depth * 12 }}
                >
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
              <li
                key={`f-${node.path}`}
                className="prp-aside-tree__row"
                style={{ paddingLeft: 4 + node.depth * 12 }}
              >
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
      )}
      {truncated > 0 && !q ? (
        <div className="prp-aside-overflow">
          <button
            type="button"
            className="prp-add-link"
            disabled={busy || loadingAll}
            onClick={() => {
              setShowAll(true);
              void ensureFull('loadMore');
            }}
          >
            {busy || loadingAll
              ? 'Loading…'
              : `Load more (+${truncated} · ${total} nodes)`}
          </button>
        </div>
      ) : null}
      {q && !filesFullyLoaded && (busy || loadingAll) ? (
        <div className="prp-muted prp-aside-overflow">Loading all files…</div>
      ) : null}
    </>
  );
}
