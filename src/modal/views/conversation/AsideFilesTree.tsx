import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildNestedFileTree, flattenVisibleTree } from '@lib/file-tree';
import {
  filterFilesByQuery,
  takeVisibleTreeNodes,
} from '@lib/aside-lists';
import { IconDisclosure } from '@common/icons';
import { useT } from '@lib/locale-context';

const DEFAULT_CAP = 20;

export function AsideFilesTree({
  files,
  mayHaveMore = false,
  loadingMore = false,
  onEnsureAll = null,
}: {
  files?: any[];
  mayHaveMore?: boolean;
  loadingMore?: boolean;
  onEnsureAll?: (() => void | Promise<void>) | null;
}) {
  const t = useT();
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const ensureTriedRef = useRef('');

  const filteredFiles = useMemo(
    () => filterFilesByQuery(files || [], query),
    [files, query]
  );
  const tree = useMemo(
    () => buildNestedFileTree(filteredFiles),
    [filteredFiles]
  );

  useEffect(() => {
    const dirs = new Set();
    for (const n of tree) {
      if (n.type === 'dir') dirs.add(n.path);
    }
    setExpandedDirs(dirs);
  }, [tree]);

  // Typing with incomplete server data → load remaining pages.
  useEffect(() => {
    const q = query.trim();
    if (!q || !mayHaveMore || typeof onEnsureAll !== 'function') return;
    if (ensureTriedRef.current === q) return;
    ensureTriedRef.current = q;
    void onEnsureAll();
  }, [query, mayHaveMore, onEnsureAll]);

  const visible = useMemo(
    () => flattenVisibleTree(tree, expandedDirs),
    [tree, expandedDirs]
  );
  const cap = showAll || query.trim() ? 10000 : DEFAULT_CAP;
  const { nodes, truncated, total } = useMemo(
    () => takeVisibleTreeNodes(visible, cap),
    [visible, cap]
  );

  function onMoreClick() {
    if (mayHaveMore && typeof onEnsureAll === 'function') {
      void onEnsureAll();
    }
    setShowAll(true);
  }

  const overflowFromCap = !showAll && !query.trim() && truncated > 0;
  const showMore =
    overflowFromCap || (mayHaveMore && !loadingMore) || loadingMore;

  if (!files?.length && !loadingMore) {
    return <div className="prp-muted">{t('aside_no_files')}</div>;
  }

  return (
    <>
      <input
        type="search"
        className="prp-aside-search"
        placeholder={t('aside_search_files')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('aside_search_files')}
      />
      {!nodes.length ? (
        <div className="prp-muted">
          {query.trim()
            ? loadingMore
              ? t('load_stage_panel_files')
              : t('aside_no_matching_files')
            : t('aside_no_files')}
        </div>
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
      {showMore ? (
        <button
          type="button"
          className="prp-aside-overflow prp-aside-overflow--btn"
          disabled={loadingMore}
          onClick={onMoreClick}
        >
          {loadingMore
            ? t('stats_loading')
            : mayHaveMore
              ? overflowFromCap
                ? `+${truncated} more… · load all`
                : t('cta_load_all_files')
              : `+${truncated} more… · ${total} visible when expanded`}
        </button>
      ) : null}
    </>
  );
}
