/* global React, PRModalLayout, PRModalVirtual, PRModalSearch, PRModalDiffRows, PRModalFileTree, PRModalCollapse, PRModalCommentNav, PRModalTheme */
/* global hljs, marked, DOMPurify */

const { useCallback, useEffect, useMemo, useRef, useState } = React;
const { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } = PRModalLayout;
const { calculateVisibleRange, scrollTopForIndex } = PRModalVirtual;
const {
  buildSearchIndex,
  resolveQuerySearchState,
  resolveNavSearchState,
} = PRModalSearch;
const { flattenFilesToVirtualRows, fileStartIndexMap, languageFromPath } =
  PRModalDiffRows;
const { buildNestedFileTree, flattenVisibleTree } = PRModalFileTree;
const { annotateFilesForCollapse } = PRModalCollapse;
const {
  sortInlineComments,
  mapCommentsToRowIndices,
  resolveCommentNav,
} = PRModalCommentNav;
const { resolveGithubTheme } = PRModalTheme;

const ROW_HEIGHT = 22;
const COMMENT_ROW_HEIGHT = 56;

function rowHeightFor(row) {
  return row?.kind === 'inline-comment' ? COMMENT_ROW_HEIGHT : ROW_HEIGHT;
}

function averageRowHeight(rows) {
  if (!rows?.length) return ROW_HEIGHT;
  let sum = 0;
  for (const r of rows) sum += rowHeightFor(r);
  return sum / rows.length;
}

/** shadcn-style primitives (Tailwind-inspired utility classes in scoped CSS) */
function Button({ children, variant = 'default', size = 'default', className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`prp-btn prp-btn--${variant} prp-btn--size-${size} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

function Badge({ children, tone = 'muted', className = '' }) {
  return (
    <span className={`prp-badge prp-badge--${tone} ${className}`.trim()}>{children}</span>
  );
}

function Card({ title, children, actions, className = '' }) {
  return (
    <section className={`prp-card ${className}`.trim()}>
      {title ? (
        <div className="prp-card__head">
          <h3 className="prp-card__title">{title}</h3>
          {actions ? <div className="prp-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="prp-card__body">{children}</div>
    </section>
  );
}

function MarkdownView({ source, className = '' }) {
  const html = useMemo(() => {
    const raw = source == null || source === '' ? '_No content_' : String(source);
    try {
      const md = typeof marked !== 'undefined' ? marked : globalThis.marked;
      const purify = typeof DOMPurify !== 'undefined' ? DOMPurify : globalThis.DOMPurify;
      if (!md) {
        return escapeHtml(raw).replace(/\n/g, '<br/>');
      }
      const parsed =
        typeof md.parse === 'function' ? md.parse(raw) : typeof md === 'function' ? md(raw) : raw;
      if (purify?.sanitize) return purify.sanitize(parsed);
      return parsed;
    } catch {
      return escapeHtml(raw).replace(/\n/g, '<br/>');
    }
  }, [source]);
  return (
    <div
      className={`prp-md ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightCode(code, filePath) {
  const text = code == null ? '' : String(code);
  try {
    const eng = typeof hljs !== 'undefined' ? hljs : globalThis.hljs;
    if (!eng) return escapeHtml(text);
    const lang = languageFromPath(filePath);
    if (lang && eng.getLanguage?.(lang)) {
      return eng.highlight(text, { language: lang, ignoreIllegals: true }).value;
    }
    return eng.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

function Header({ detail, onClose, onToggleDiff, layoutMode, diffMode, onDiffMode, themeMode }) {
  if (!detail) return null;
  return (
    <header className="prp-header">
      <div className="prp-header__main">
        <div className="prp-header__title-row">
          <span className="prp-header__number">#{detail.number}</span>
          <h2 className="prp-header__title">{detail.title}</h2>
          {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
          {detail.state ? (
            <Badge tone={detail.state === 'open' ? 'ok' : 'muted'}>{detail.state}</Badge>
          ) : null}
          {detail.checks?.state ? (
            <Badge
              tone={
                detail.checks.state === 'success'
                  ? 'ok'
                  : detail.checks.state === 'failure'
                    ? 'danger'
                    : 'warn'
              }
            >
              checks: {detail.checks.state}
            </Badge>
          ) : null}
          <span className="prp-muted prp-theme-chip" title="Follows GitHub color mode">
            {themeMode}
          </span>
        </div>
        <div className="prp-header__meta">
          <span className="prp-branch-pill">
            <span className="prp-mono">{detail.baseRef}</span>
            <span className="prp-muted"> ← </span>
            <span className="prp-mono">{detail.headRef}</span>
          </span>
          {detail.author ? <span className="prp-muted">by {detail.author}</span> : null}
          {detail.merged ? <Badge tone="ok">Merged</Badge> : null}
          {detail.mergeable === false ? <Badge tone="warn">Conflicts</Badge> : null}
          <span className="prp-muted">
            +{detail.additions ?? 0}/−{detail.deletions ?? 0} ·{' '}
            {detail.changedFiles ?? (detail.files || []).length} files
          </span>
        </div>
      </div>
      <div className="prp-header__actions">
        {layoutMode === LAYOUT_DIFF ? (
          <>
            <Button
              size="sm"
              variant={diffMode === 'unified' ? 'primary' : 'default'}
              onClick={() => onDiffMode('unified')}
            >
              Unified
            </Button>
            <Button
              size="sm"
              variant={diffMode === 'split' ? 'primary' : 'default'}
              onClick={() => onDiffMode('split')}
            >
              Split
            </Button>
          </>
        ) : null}
        <Button variant="primary" onClick={onToggleDiff}>
          {layoutMode === LAYOUT_DIFF ? 'Conversation' : 'Files changed'}
        </Button>
        {detail.htmlUrl ? (
          <a className="prp-btn prp-btn--default prp-btn--size-default" href={detail.htmlUrl} target="_blank" rel="noreferrer">
            Open on GitHub
          </a>
        ) : null}
        <Button onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>
    </header>
  );
}

function ConversationView({
  detail,
  commentText,
  setCommentText,
  reviewText,
  setReviewText,
  actionBusy,
  actionMsg,
  onPostComment,
  onSubmitReview,
  onOpenFiles,
}) {
  const timeline = useMemo(() => {
    if (!detail) return [];
    const items = [];
    (detail.reviews || []).forEach((r, i) => {
      if (!r.body && r.state === 'COMMENTED') return;
      items.push({
        key: `rev-${r.id || i}`,
        kind: 'review',
        author: r.author,
        state: r.state,
        body: r.body,
        at: r.submittedAt,
      });
    });
    (detail.comments || []).forEach((c, i) => {
      items.push({
        key: `c-${c.id || i}`,
        kind: 'comment',
        author: c.author,
        body: c.body,
        at: c.createdAt,
      });
    });
    items.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    return items;
  }, [detail]);

  if (!detail) return null;

  return (
    <div className="prp-conversation">
      <div className="prp-conversation__main">
        <Card title="Description" className="prp-card--desc">
          <MarkdownView source={detail.body || '_No description provided._'} />
        </Card>

        <Card
          title="Conversation"
          actions={
            <Button size="sm" variant="primary" onClick={onOpenFiles}>
              Files changed
            </Button>
          }
        >
          {timeline.length === 0 ? (
            <p className="prp-muted">No conversation yet.</p>
          ) : (
            <ul className="prp-timeline">
              {timeline.map((item) => (
                <li key={item.key} className="prp-timeline__item">
                  <div className="prp-timeline__meta">
                    <strong>{item.author || 'user'}</strong>
                    {item.state ? <Badge tone={String(item.state).toLowerCase()}>{item.state}</Badge> : null}
                    {item.at ? <span className="prp-muted">{formatWhen(item.at)}</span> : null}
                  </div>
                  <MarkdownView source={item.body || ''} className="prp-md--compact" />
                </li>
              ))}
            </ul>
          )}

          <div className="prp-composer">
            <textarea
              className="prp-textarea"
              rows={3}
              placeholder="Leave a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="prp-composer__row">
              <Button
                variant="primary"
                size="sm"
                disabled={actionBusy || !commentText.trim()}
                onClick={onPostComment}
              >
                Comment
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <aside className="prp-conversation__aside">
        <Card title="Reviewers">
          <ul className="prp-list">
            {(detail.reviews || []).length === 0 ? (
              <li className="prp-muted">No reviews yet</li>
            ) : (
              (detail.reviews || []).map((r, i) => (
                <li key={r.id || i}>
                  <Badge tone={String(r.state || '').toLowerCase()}>{r.state || 'REVIEW'}</Badge>{' '}
                  {r.author}
                </li>
              ))
            )}
          </ul>
          <div className="prp-composer">
            <textarea
              className="prp-textarea"
              rows={2}
              placeholder="Review summary (optional)…"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />
            <div className="prp-composer__row">
              <Button size="sm" disabled={actionBusy} onClick={() => onSubmitReview('COMMENT')}>
                Comment
              </Button>
              <Button size="sm" variant="ok" disabled={actionBusy} onClick={() => onSubmitReview('APPROVE')}>
                Approve
              </Button>
              <Button size="sm" variant="warn" disabled={actionBusy} onClick={() => onSubmitReview('REQUEST_CHANGES')}>
                Request changes
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Checks">
          <ChecksPanel checks={detail.checks} />
        </Card>

        <Card title="Commits">
          <ul className="prp-list prp-mono">
            {(detail.commits || []).slice(0, 30).map((c) => (
              <li key={c.sha || c.message}>
                <code>{(c.sha || '').slice(0, 7)}</code> {c.message}
              </li>
            ))}
            {(detail.commits || []).length === 0 ? <li className="prp-muted">No commits</li> : null}
          </ul>
        </Card>

        <Card title="Files">
          <ul className="prp-list prp-mono">
            {(detail.files || []).slice(0, 40).map((f) => (
              <li key={f.filename}>
                {f.filename}{' '}
                <span className="prp-muted">
                  +{f.additions ?? 0}/−{f.deletions ?? 0}
                  {f.defaultCollapsed ? ' · collapsed' : ''}
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="primary" className="prp-mt-2" onClick={onOpenFiles}>
            View files
          </Button>
        </Card>

        {actionMsg ? <div className="prp-action-msg">{actionMsg}</div> : null}
      </aside>
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function ChecksPanel({ checks }) {
  if (!checks) return <div className="prp-muted">No checks data</div>;
  const statuses = checks.statuses || [];
  const runs = checks.checkRuns || [];
  return (
    <div>
      <div className="prp-checks-summary">
        Overall:{' '}
        <Badge
          tone={
            checks.state === 'success' ? 'ok' : checks.state === 'failure' ? 'danger' : 'warn'
          }
        >
          {checks.state}
        </Badge>
      </div>
      <ul className="prp-list">
        {statuses.map((s, i) => (
          <li key={`s-${i}`}>
            <Badge tone={s.state}>{s.state}</Badge> {s.context}
          </li>
        ))}
        {runs.map((r, i) => (
          <li key={`r-${i}`}>
            <Badge tone={r.conclusion || r.status}>{r.conclusion || r.status}</Badge> {r.name}
          </li>
        ))}
        {statuses.length === 0 && runs.length === 0 ? (
          <li className="prp-muted">No status contexts</li>
        ) : null}
      </ul>
    </div>
  );
}

function FolderFileTree({
  tree,
  expandedDirs,
  onToggleDir,
  activePath,
  onSelect,
  collapsedFiles,
  onToggleFileCollapse,
}) {
  const visible = useMemo(
    () => flattenVisibleTree(tree, expandedDirs),
    [tree, expandedDirs]
  );
  return (
    <aside className="prp-filetree">
      <div className="prp-filetree__head">Files</div>
      <ul className="prp-filetree__list">
        {visible.map((node) => {
          if (node.type === 'dir') {
            const open = expandedDirs.has(node.path);
            return (
              <li key={`d-${node.path}`} style={{ paddingLeft: 8 + node.depth * 12 }}>
                <button
                  type="button"
                  className="prp-filetree__item prp-filetree__dir"
                  onClick={() => onToggleDir(node.path)}
                >
                  <span className="prp-filetree__chev">{open ? '▼' : '▶'}</span>
                  <span className="prp-filetree__name">{node.name}/</span>
                </button>
              </li>
            );
          }
          const f = node.file || {};
          const isCollapsed = collapsedFiles.has(node.path);
          return (
            <li key={`f-${node.path}`} style={{ paddingLeft: 8 + node.depth * 12 }}>
              <button
                type="button"
                className={
                  node.path === activePath
                    ? 'prp-filetree__item prp-filetree__item--active'
                    : 'prp-filetree__item'
                }
                onClick={() => onSelect(node.path)}
              >
                <span className="prp-filetree__name" title={node.path}>
                  {node.name}
                  {isCollapsed ? ' ·' : ''}
                </span>
                <span className="prp-filetree__stat">
                  +{f.additions ?? 0}/−{f.deletions ?? 0}
                </span>
              </button>
              {f.defaultCollapsed || isCollapsed ? (
                <button
                  type="button"
                  className="prp-filetree__collapse"
                  title={isCollapsed ? 'Expand file' : 'Collapse file'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFileCollapse(node.path);
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

function VirtualDiff({
  virtualRows,
  scrollTop,
  viewportHeight,
  onScroll,
  highlightRowIndex,
  listRef,
  onLineComment,
  onToggleCollapse,
}) {
  // Approximate virtualization with fixed average height for spacer stability
  const avgH = useMemo(() => averageRowHeight(virtualRows), [virtualRows]);
  const range = calculateVisibleRange({
    totalRows: virtualRows.length,
    rowHeight: avgH,
    viewportHeight,
    scrollTop,
    overscan: 10,
  });

  const slice =
    range.end >= range.start ? virtualRows.slice(range.start, range.end + 1) : [];

  return (
    <div
      className="prp-vlist"
      ref={listRef}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      style={{ height: viewportHeight }}
    >
      <div className="prp-vlist__spacer" style={{ height: range.totalHeight }}>
        <div className="prp-vlist__window" style={{ transform: `translateY(${range.offsetY}px)` }}>
          {slice.map((row) => {
            if (row.kind === 'inline-comment') {
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--comment${
                    highlightRowIndex === row.rowIndex ? ' prp-vline--hit' : ''
                  }`}
                  style={{ minHeight: COMMENT_ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
                >
                  <div className="prp-inline-comment">
                    <div className="prp-inline-comment__meta">
                      <strong>{row.author || 'user'}</strong>
                      <span className="prp-muted">
                        on {row.filePath}:{row.newLine}
                      </span>
                    </div>
                    <MarkdownView source={row.body || ''} className="prp-md--compact" />
                  </div>
                </div>
              );
            }
            if (row.kind === 'file-header') {
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--header${
                    highlightRowIndex === row.rowIndex ? ' prp-vline--hit' : ''
                  }`}
                  style={{ height: ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
                >
                  <button
                    type="button"
                    className="prp-file-header-btn"
                    onClick={() => onToggleCollapse?.(row.filePath)}
                  >
                    <code>{row.text}</code>
                  </button>
                </div>
              );
            }
            const isCode =
              row.kind === 'diff-line' &&
              (row.lineType === 'add' ||
                row.lineType === 'del' ||
                row.lineType === 'context');
            const html = isCode
              ? highlightCode(row.code ?? row.text, row.filePath)
              : escapeHtml(row.text);
            return (
              <div
                key={row.rowIndex}
                className={`prp-vline prp-vline--${row.lineType || row.kind}${
                  highlightRowIndex === row.rowIndex ? ' prp-vline--hit' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
                data-row-index={row.rowIndex}
                data-file-path={row.filePath || ''}
                data-new-line={row.newLine ?? ''}
                title={
                  row.kind === 'diff-line' ? 'Double-click to comment on this line' : undefined
                }
                onDoubleClick={() => {
                  if (row.kind === 'diff-line' && row.filePath && row.newLine != null) {
                    onLineComment?.(row);
                  }
                }}
              >
                <code
                  className={isCode ? 'hljs prp-code' : undefined}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SearchBar({
  open,
  query,
  hits,
  hitIndex,
  onChange,
  onClose,
  onNext,
  onPrev,
  inputRef,
}) {
  if (!open) return null;
  return (
    <div className="prp-search" role="search">
      <input
        ref={inputRef}
        className="prp-search__input"
        value={query}
        placeholder="Find in PR / diff (indexes off-screen rows)…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            onPrev();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="prp-search__count">
        {hits.length ? `${hitIndex + 1}/${hits.length}` : '0/0'}
      </span>
      <Button size="sm" onClick={onPrev}>
        ↑
      </Button>
      <Button size="sm" onClick={onNext}>
        ↓
      </Button>
      <Button size="sm" onClick={onClose}>
        Esc
      </Button>
    </div>
  );
}

function CommentNavBar({ comments, commentIndex, onPrev, onNext }) {
  if (!comments?.length) return null;
  return (
    <div className="prp-comment-nav">
      <span className="prp-muted">
        Comments {commentIndex >= 0 ? commentIndex + 1 : 0}/{comments.length}
      </span>
      <Button size="sm" onClick={onPrev} title="Previous comment">
        Prev comment
      </Button>
      <Button size="sm" onClick={onNext} title="Next comment">
        Next comment
      </Button>
    </div>
  );
}

function PrModalApp({ open, loading, error, detail, onClose, onRefresh }) {
  const [layoutMode, setLayoutMode] = useState(LAYOUT_CENTERED);
  const [diffMode, setDiffMode] = useState('unified');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchHitIndex, setSearchHitIndex] = useState(-1);
  const [activeFilePath, setActiveFilePath] = useState(null);
  const [animClass, setAnimClass] = useState('');
  const [commentText, setCommentText] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [collapsedFiles, setCollapsedFiles] = useState(() => new Set());
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const [commentIndex, setCommentIndex] = useState(-1);
  const [theme, setTheme] = useState(() =>
    resolveGithubTheme(typeof document !== 'undefined' ? document : null, typeof window !== 'undefined' ? window : null)
  );
  const listRef = useRef(null);
  const searchInputRef = useRef(null);
  const shellRef = useRef(null);
  const collapseInitRef = useRef(null);

  const annotatedFiles = useMemo(() => {
    if (!detail?.files) return [];
    if (detail.files.some((f) => 'defaultCollapsed' in f)) return detail.files;
    return annotateFilesForCollapse(detail.files, detail.gitattributesText || '');
  }, [detail]);

  // Initialize collapsed set once per PR number
  useEffect(() => {
    if (!detail?.number) return;
    if (collapseInitRef.current === detail.number) return;
    collapseInitRef.current = detail.number;
    const next = new Set();
    for (const f of annotatedFiles) {
      if (f.defaultCollapsed) next.add(f.filename || f.path);
    }
    setCollapsedFiles(next);
    // Expand top-level dirs by default
    const tree = buildNestedFileTree(annotatedFiles);
    const dirs = new Set();
    for (const n of tree) {
      if (n.type === 'dir') dirs.add(n.path);
    }
    setExpandedDirs(dirs);
  }, [detail?.number, annotatedFiles]);

  const virtualRows = useMemo(
    () =>
      flattenFilesToVirtualRows(annotatedFiles, diffMode, {
        collapsedPaths: collapsedFiles,
        reviewComments: detail?.reviewComments || [],
      }),
    [annotatedFiles, diffMode, collapsedFiles, detail?.reviewComments]
  );
  const fileStarts = useMemo(() => fileStartIndexMap(virtualRows), [virtualRows]);
  const fileTree = useMemo(() => buildNestedFileTree(annotatedFiles), [annotatedFiles]);

  const mappedComments = useMemo(
    () =>
      mapCommentsToRowIndices(
        sortInlineComments(detail?.reviewComments || []),
        virtualRows
      ),
    [detail?.reviewComments, virtualRows]
  );

  const docs = useMemo(
    () => buildSearchIndex(detail || {}, virtualRows),
    [detail, virtualRows]
  );

  const avgH = useMemo(() => averageRowHeight(virtualRows), [virtualRows]);

  useEffect(() => {
    if (!open) {
      setLayoutMode(LAYOUT_CENTERED);
      setDiffMode('unified');
      setScrollTop(0);
      setSearchOpen(false);
      setSearchQuery('');
      setSearchHits([]);
      setSearchHitIndex(-1);
      setActiveFilePath(null);
      setAnimClass('');
      setCommentText('');
      setReviewText('');
      setActionMsg('');
      setCommentIndex(-1);
      collapseInitRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const sync = () => {
      setTheme(
        resolveGithubTheme(
          typeof document !== 'undefined' ? document : null,
          typeof window !== 'undefined' ? window : null
        )
      );
    };
    sync();
    const obs =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(sync)
        : null;
    if (obs && document?.documentElement) {
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-color-mode', 'data-dark-theme', 'data-light-theme', 'class'],
      });
    }
    return () => obs?.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !shellRef.current) return undefined;
    const measure = () => {
      const el = shellRef.current;
      if (!el) return;
      const h = el.clientHeight || 600;
      setViewportHeight(Math.max(240, h - (layoutMode === LAYOUT_DIFF ? 150 : 120)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, layoutMode, animClass]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const isFind =
        (e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey) && !e.altKey;
      if (isFind && open) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (e.key === 'Escape' && open) {
        if (searchOpen) {
          e.preventDefault();
          setSearchOpen(false);
        } else if (layoutMode === LAYOUT_DIFF) {
          e.preventDefault();
          collapseDiff();
        } else {
          e.preventDefault();
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, searchOpen, layoutMode, onClose]);

  const jumpToRow = useCallback(
    (rowIndex, filePath) => {
      if (typeof rowIndex !== 'number') return;
      if (filePath) setActiveFilePath(filePath);
      const applyScroll = () => {
        const top = scrollTopForIndex(rowIndex, avgH, viewportHeight, virtualRows.length);
        setScrollTop(top);
        if (listRef.current) listRef.current.scrollTop = top;
      };
      if (layoutMode !== LAYOUT_DIFF) expandDiff(applyScroll);
      else applyScroll();
    },
    [layoutMode, viewportHeight, virtualRows.length, avgH]
  );

  const jumpToHit = useCallback(
    (hit) => {
      if (!hit) return;
      jumpToRow(hit.rowIndex, hit.filePath);
    },
    [jumpToRow]
  );

  useEffect(() => {
    if (!searchOpen) return;
    const state = resolveQuerySearchState(docs, searchQuery);
    setSearchHits(state.hits);
    setSearchHitIndex(state.hitIndex);
    if (state.shouldJump) jumpToHit(state.activeHit);
  }, [searchQuery, docs, searchOpen, jumpToHit]);

  function navSearch(delta) {
    const state = resolveNavSearchState(searchHits, searchHitIndex, delta);
    setSearchHitIndex(state.hitIndex);
    if (state.shouldJump) jumpToHit(state.activeHit);
  }

  function navComment(delta) {
    const state = resolveCommentNav(mappedComments, commentIndex, delta);
    setCommentIndex(state.commentIndex);
    if (state.shouldJump && state.active) {
      jumpToRow(state.active.rowIndex, state.active.path);
    }
  }

  function expandDiff(after) {
    setAnimClass('prp-modal--animating');
    setLayoutMode(LAYOUT_DIFF);
    requestAnimationFrame(() => {
      setAnimClass('prp-modal--animating prp-modal--anim-in');
      setTimeout(() => {
        setAnimClass('');
        after?.();
      }, 280);
    });
  }

  function collapseDiff() {
    setAnimClass('prp-modal--animating prp-modal--anim-out');
    setTimeout(() => {
      setLayoutMode(LAYOUT_CENTERED);
      setAnimClass('');
    }, 280);
  }

  function onToggleDiff() {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    else expandDiff();
  }

  function onSelectFile(path) {
    setActiveFilePath(path);
    // Auto-expand collapsed file when selected from tree
    setCollapsedFiles((prev) => {
      if (!prev.has(path)) return prev;
      const n = new Set(prev);
      n.delete(path);
      return n;
    });
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      const top = scrollTopForIndex(idx, avgH, viewportHeight, virtualRows.length);
      setScrollTop(top);
      if (listRef.current) listRef.current.scrollTop = top;
    }
  }

  function onToggleDir(path) {
    setExpandedDirs((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function onToggleFileCollapse(path) {
    setCollapsedFiles((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  async function onPostComment() {
    const body = commentText.trim();
    if (!body || !detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.postIssueComment) throw new Error('Comment API unavailable');
      await api.postIssueComment(detail.owner, detail.repo, detail.number, body);
      setCommentText('');
      setActionMsg('Comment posted.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubmitReview(event) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.submitPullReview) throw new Error('Review API unavailable');
      await api.submitPullReview(detail.owner, detail.repo, detail.number, {
        event,
        body: reviewText,
      });
      setReviewText('');
      setActionMsg(`Review submitted (${event}).`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onLineComment(row) {
    if (!detail || !row?.filePath || row.newLine == null) return;
    const body = window.prompt(`Line comment on ${row.filePath}:${row.newLine}`, '');
    if (body == null || !String(body).trim()) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
      await api.postReviewComment(detail.owner, detail.repo, detail.number, {
        body: String(body).trim(),
        path: row.filePath,
        line: row.newLine,
        side: 'RIGHT',
        commitId: detail.headSha,
      });
      setActionMsg('Line comment posted.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  if (!open) return null;

  const hit = searchHitIndex >= 0 ? searchHits[searchHitIndex] : null;
  const cls = `${layoutClassName(layoutMode)} ${animClass} ${theme.className}`.trim();

  return (
    <div className={`prp-overlay ${theme.className}`} tabIndex={-1} data-color-mode={theme.mode}>
      <div className="prp-backdrop" onClick={onClose} />
      <div
        className={cls}
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Pull request #${detail.number}` : 'Pull request'}
        data-color-mode={theme.mode}
      >
        <Header
          detail={detail}
          onClose={onClose}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          diffMode={diffMode}
          onDiffMode={setDiffMode}
          themeMode={theme.mode}
        />
        <SearchBar
          open={searchOpen}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          onChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onNext={() => navSearch(1)}
          onPrev={() => navSearch(-1)}
        />
        {loading ? <div className="prp-status">Loading pull request…</div> : null}
        {error ? <div className="prp-status prp-status--error">{error}</div> : null}
        {!loading && detail && layoutMode === LAYOUT_CENTERED ? (
          <ConversationView
            detail={{ ...detail, files: annotatedFiles }}
            commentText={commentText}
            setCommentText={setCommentText}
            reviewText={reviewText}
            setReviewText={setReviewText}
            actionBusy={actionBusy}
            actionMsg={actionMsg}
            onPostComment={onPostComment}
            onSubmitReview={onSubmitReview}
            onOpenFiles={() => expandDiff()}
          />
        ) : null}
        {!loading && detail && layoutMode === LAYOUT_DIFF ? (
          <div className="prp-diff-layout">
            <FolderFileTree
              tree={fileTree}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              activePath={activeFilePath}
              onSelect={onSelectFile}
              collapsedFiles={collapsedFiles}
              onToggleFileCollapse={onToggleFileCollapse}
            />
            <div className="prp-diff-pane">
              <div className="prp-diff-pane__head">
                <span>
                  Diff ({diffMode}) · {virtualRows.length} rows · virtualized · highlighted ·
                  double-click line to comment
                </span>
                <CommentNavBar
                  comments={mappedComments}
                  commentIndex={commentIndex}
                  onPrev={() => navComment(-1)}
                  onNext={() => navComment(1)}
                />
                {actionMsg ? <span className="prp-action-inline"> · {actionMsg}</span> : null}
              </div>
              <VirtualDiff
                virtualRows={virtualRows}
                scrollTop={scrollTop}
                viewportHeight={viewportHeight}
                listRef={listRef}
                highlightRowIndex={
                  hit?.rowIndex ??
                  (commentIndex >= 0 ? mappedComments[commentIndex]?.rowIndex : undefined)
                }
                onScroll={(top) => setScrollTop(top)}
                onLineComment={onLineComment}
                onToggleCollapse={onToggleFileCollapse}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Create or reuse a React root on hostEl. Prefer updating via returned
 * `.render(nextProps)` instead of unmounting (preserves layout/scroll/search).
 */
function mountPrModal(hostEl, props) {
  let root = hostEl.__prpReactRoot;
  if (!root) {
    root = ReactDOM.createRoot(hostEl);
    hostEl.__prpReactRoot = root;
  }
  root.render(React.createElement(PrModalApp, props));
  return {
    render(nextProps) {
      root.render(React.createElement(PrModalApp, nextProps));
    },
    unmount() {
      try {
        root.unmount();
      } catch {
        /* ignore */
      }
      delete hostEl.__prpReactRoot;
    },
  };
}

globalThis.PRModalApp = PrModalApp;
globalThis.mountPrModal = mountPrModal;
