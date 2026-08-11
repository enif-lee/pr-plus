import React, { useMemo, useState, memo, useCallback, useRef } from 'react';
import {
  buildNestedFileTree,
  flattenVisibleTree,
  listFileExtensions,
  filterFilesByExtensions,
  filterFilesUnreadOnly,
  filterFilesCommentedOnly,
  toggleFileExtension,
  formatFileExtensionLabel,
  collectDirPaths,
} from '@lib/file-tree';
import { filterFilesByQuery, isPathViewed } from '@lib/review-threads';
import { isPathCollapsed } from '@lib/collapse';
import { IconDisclosure } from '@common/icons';
import { TipPopover } from '@common/TipPopover';
import { StepNav } from '@common/StepNav';
import {
  activeFileNavIndex,
  fileNavShortcutLabel,
  TOGGLE_VIEWED_SHORTCUT,
} from '@lib/shortcut-policy';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { useT } from '@lib/locale-context';
import { useModalStore } from '../../store/modal-store';

/** Cap extension chips so the search row stays usable on narrow nav. */
const MAX_EXT_CHIPS = 10;

const ActiveFileStepNav = memo(function ActiveFileStepNav({
  files,
  fileIndex: fileIndexProp,
  fileTotal,
  onPrevFile,
  onNextFile,
  filePrevShortcut,
  fileNextShortcut,
}: any) {
  const activePath = useModalStore((s) => s.activeFilePath);
  const fileIndex = Number.isFinite(Number(fileIndexProp))
    ? Number(fileIndexProp)
    : activeFileNavIndex(files, activePath);
  return (
    <StepNav
      className="prp-filetree__file-nav"
      index={fileIndex}
      total={fileTotal}
      onPrev={onPrevFile}
      onNext={onNextFile}
      label="Files"
      title="Previous / next file (from current file)"
      prevTitle="Previous file"
      nextTitle="Next file"
      prevShortcut={filePrevShortcut}
      nextShortcut={fileNextShortcut}
    />
  );
});

const FileTreeFileRow = memo(function FileTreeFileRow({
  node,
  collapsedFiles,
  viewedPaths,
  threadCounts,
  onToggleViewed,
  onSelect,
}: any) {
  const active = useModalStore(
    (s) => String(s.activeFilePath || '') === String(node.path || '')
  );
  const f = node.file || {};
  const isCollapsed = isPathCollapsed(
    node.path,
    collapsedFiles,
    Boolean(f.defaultCollapsed),
    false,
    viewedPaths
  );
  const threads =
    threadCounts?.get?.(node.path) || threadCounts?.[node.path] || 0;
  const viewed = isPathViewed ? isPathViewed(viewedPaths, node.path) : false;
  const status = String(f.status || '').toLowerCase();
  const statusTone =
    status === 'added' || status === 'add'
      ? 'add'
      : status === 'removed' ||
          status === 'deleted' ||
          status === 'del'
        ? 'del'
        : status === 'renamed'
          ? 'rename'
          : '';
  return (
    <li
      className="prp-filetree__row"
      style={{ paddingLeft: 4 + (node.depth || 0) * 12 }}
      data-file-status={status || undefined}
    >
      <label
        className={`prp-filetree__viewed${active ? ' prp-has-tip' : ''}`}
        title={active ? undefined : 'Mark as viewed'}
      >
        <input
          type="checkbox"
          checked={viewed}
          onChange={() => onToggleViewed?.(node.path)}
          onClick={(e) => e.stopPropagation()}
          aria-label={viewed ? 'Mark as unread' : 'Mark as viewed'}
        />
        {active ? (
          <TipPopover
            title={viewed ? 'Mark as unread' : 'Mark as viewed'}
            shortcut={
              typeof navigator !== 'undefined' &&
              /Mac|iPhone|iPad/.test(navigator.platform || '')
                ? TOGGLE_VIEWED_SHORTCUT.labelMac
                : TOGGLE_VIEWED_SHORTCUT.labelWin
            }
            preferredPlacement="right"
          />
        ) : null}
      </label>
      <button
        type="button"
        className={[
          'prp-filetree__item',
          active ? 'prp-filetree__item--active' : '',
          statusTone ? `prp-filetree__item--${statusTone}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect?.(node.path)}
        data-file-status={status || undefined}
        data-file-path={node.path}
      >
        <span
          className={[
            'prp-filetree__name',
            statusTone ? `prp-filetree__name--${statusTone}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={node.path}
        >
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
});

function FolderFileTreeImpl(props: any) {
  const t = useT();
  const {
    files,
    /**
     * File list used only to populate extension chips.
     * Should be resolve-status-scoped (not already filtered by selected exts),
     * so multi-select chips stay visible when one extension is on.
     */
    extSourceFiles = null,
    tree: treeProp,
    expandedDirs,
    onToggleDir,
    onSelect,
    collapsedFiles,
    fileQuery,
    onFileQuery,
    /** Called when the name filter is focused (fetch remaining file pages). */
    onSearchFocus = null,
    filesLoading = false,
    threadCounts,
    viewedPaths,
    onToggleViewed,
    navCollapsed = false,
    /** When provided, parent owns filter state (shared with review nav). */
    selectedExts: selectedExtsProp = null,
    onSelectedExts = null,
    unreadOnly: unreadOnlyProp = null,
    onUnreadOnly = null,
    /** Show only files that have ≥1 review thread (any status). */
    commentedOnly: commentedOnlyProp = null,
    onCommentedOnly = null,
    /** Visible file list index for prev/next (0-based; -1 if unknown) */
    fileIndex: fileIndexProp = null,
    fileTotal = 0,
    onPrevFile = null,
    onNextFile = null,
  } = props;
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const filePrevShortcut =
    typeof fileNavShortcutLabel === 'function'
      ? fileNavShortcutLabel('prev', isMac)
      : isMac
        ? '⌥⇧['
        : 'Alt+Shift+[';
  const fileNextShortcut =
    typeof fileNavShortcutLabel === 'function'
      ? fileNavShortcutLabel('next', isMac)
      : isMac
        ? '⌥⇧]'
        : 'Alt+Shift+]';

  const [selectedExtsLocal, setSelectedExtsLocal] = useState(() => new Set<string>());
  const [unreadOnlyLocal, setUnreadOnlyLocal] = useState(false);
  const [commentedOnlyLocal, setCommentedOnlyLocal] = useState(false);
  const selectedExts =
    selectedExtsProp instanceof Set ? selectedExtsProp : selectedExtsLocal;
  const unreadOnly =
    typeof unreadOnlyProp === 'boolean' ? unreadOnlyProp : unreadOnlyLocal;
  const commentedOnly =
    typeof commentedOnlyProp === 'boolean'
      ? commentedOnlyProp
      : commentedOnlyLocal;
  const setSelectedExts =
    typeof onSelectedExts === 'function' ? onSelectedExts : setSelectedExtsLocal;
  const setUnreadOnly =
    typeof onUnreadOnly === 'function' ? onUnreadOnly : setUnreadOnlyLocal;
  const setCommentedOnly =
    typeof onCommentedOnly === 'function'
      ? onCommentedOnly
      : setCommentedOnlyLocal;

  const extOptions = useMemo(() => {
    // Prefer resolve-status-scoped source so selecting .ts does not remove .tsx/etc chips.
    const source = Array.isArray(extSourceFiles) ? extSourceFiles : files;
    const listed = listFileExtensions(source || [], { max: MAX_EXT_CHIPS });
    // Keep any still-selected extensions visible even if outside the frequency cap.
    if (!(selectedExts instanceof Set) || selectedExts.size === 0) return listed;
    const out = listed.slice();
    for (const ext of selectedExts) {
      if (!out.includes(ext)) out.push(ext);
    }
    return out;
  }, [extSourceFiles, files, selectedExts]);

  // Parent App already applies name/ext/unread/commented filters when controlled.
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
      if (typeof filterFilesCommentedOnly === 'function') {
        list = filterFilesCommentedOnly(list, threadCounts, commentedOnly);
      }
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
    commentedOnly,
    viewedPaths,
    threadCounts,
    treeProp,
    parentFiltersFiles,
  ]);

  const filtering =
    Boolean(String(fileQuery || '').trim()) ||
    selectedExts.size > 0 ||
    unreadOnly ||
    commentedOnly;

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

  const listScrollRef = useRef<HTMLUListElement | null>(null);

  // Stay mounted while collapsed so open/close width animation can run.
  // Expand/collapse is driven by Diff toolbar “Files” + layout CSS.
  return (
    <aside
      className={`prp-filetree${navCollapsed ? ' prp-filetree--nav-collapsed' : ''}`}
      aria-label="Files navigator"
      aria-hidden={navCollapsed ? true : undefined}
    >
      <div className="prp-filetree__search">
        <div className="prp-filetree__search-row">
          <input
            className="prp-filetree__search-input"
            placeholder={
              filesLoading
                ? t('aside_loading_all_files')
                : t('aside_search_files_path')
            }
            value={fileQuery || ''}
            onChange={(e) => onFileQuery?.(e.target.value)}
            onFocus={() => {
              void onSearchFocus?.();
            }}
            aria-label={t('aside_search_files')}
            aria-busy={filesLoading ? true : undefined}
          />
          {Number(fileTotal) > 0 && (onPrevFile || onNextFile) ? (
            <ActiveFileStepNav
              files={files}
              fileIndex={fileIndexProp}
              fileTotal={fileTotal}
              onPrevFile={onPrevFile}
              onNextFile={onNextFile}
              filePrevShortcut={filePrevShortcut}
              fileNextShortcut={fileNextShortcut}
            />
          ) : null}
        </div>
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
            onClick={() => setUnreadOnly((v: boolean) => !v)}
          >
            Unread
          </button>
          <button
            type="button"
            className={
              commentedOnly
                ? 'prp-filetree__ext prp-filetree__ext--on'
                : 'prp-filetree__ext'
            }
            aria-pressed={commentedOnly}
            title={
              commentedOnly
                ? 'Show all files (clear commented filter)'
                : 'Show only files with review comments'
            }
            onClick={() => setCommentedOnly((v: boolean) => !v)}
          >
            Commented
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
      <div className="prp-scroll-float-host prp-filetree__list-host">
        <ul className="prp-filetree__list prp-scroll-float" ref={listScrollRef}>
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
            return (
              <FileTreeFileRow
                key={`f-${node.path}`}
                node={node}
                collapsedFiles={collapsedFiles}
                viewedPaths={viewedPaths}
                threadCounts={threadCounts}
                onToggleViewed={onToggleViewed}
                onSelect={onSelect}
              />
            );
          })}
        </ul>
        {!navCollapsed ? (
          <FloatingScrollbar
            scrollerRef={listScrollRef}
            contentKey={`${visible.length}:${filtering ? 'f' : 'a'}`}
          />
        ) : null}
      </div>
    </aside>
  );
}

export const FolderFileTree = memo(FolderFileTreeImpl);
export default FolderFileTree;
