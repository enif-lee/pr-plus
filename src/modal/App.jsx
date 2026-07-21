/* global React, PRModalLayout, PRModalVirtual, PRModalSearch, PRModalDiffRows */

const { useCallback, useEffect, useMemo, useRef, useState } = React;
const { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } = PRModalLayout;
const { calculateVisibleRange, scrollTopForIndex } = PRModalVirtual;
const { buildSearchIndex, searchIndex, nextHitIndex } = PRModalSearch;
const { flattenFilesToVirtualRows, fileStartIndexMap } = PRModalDiffRows;

const ROW_HEIGHT = 22;

function Section({ title, children, compact, actions }) {
  return (
    <section className={`prp-section${compact ? ' prp-section--compact' : ''}`}>
      <h3 className="prp-section__title">
        <span>{title}</span>
        {actions ? <span className="prp-section__actions">{actions}</span> : null}
      </h3>
      <div className="prp-section__body">{children}</div>
    </section>
  );
}

function Badge({ children, tone }) {
  return <span className={`prp-badge prp-badge--${tone || 'muted'}`}>{children}</span>;
}

function Header({ detail, onClose, onToggleDiff, layoutMode, diffMode, onDiffMode }) {
  if (!detail) return null;
  return (
    <header className="prp-header">
      <div className="prp-header__main">
        <div className="prp-header__title-row">
          <span className="prp-header__number">#{detail.number}</span>
          <h2 className="prp-header__title">{detail.title}</h2>
          {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
          {detail.state ? <Badge tone="state">{detail.state}</Badge> : null}
          {detail.checks?.state ? (
            <Badge tone={detail.checks.state === 'success' ? 'ok' : detail.checks.state === 'failure' ? 'danger' : 'warn'}>
              checks: {detail.checks.state}
            </Badge>
          ) : null}
        </div>
        <div className="prp-header__meta">
          <span className="prp-mono">
            {detail.baseRef} ← {detail.headRef}
          </span>
          {detail.author ? <span>by {detail.author}</span> : null}
          {detail.merged ? <Badge tone="ok">Merged</Badge> : null}
          {detail.mergeable === false ? <Badge tone="warn">Conflicts</Badge> : null}
          <span className="prp-muted">
            +{detail.additions ?? 0}/−{detail.deletions ?? 0} · {detail.changedFiles ?? (detail.files || []).length} files
          </span>
        </div>
      </div>
      <div className="prp-header__actions">
        {layoutMode === LAYOUT_DIFF ? (
          <>
            <button
              type="button"
              className={`prp-btn prp-btn--sm${diffMode === 'unified' ? ' prp-btn--active' : ''}`}
              onClick={() => onDiffMode('unified')}
            >
              Unified
            </button>
            <button
              type="button"
              className={`prp-btn prp-btn--sm${diffMode === 'split' ? ' prp-btn--active' : ''}`}
              onClick={() => onDiffMode('split')}
            >
              Split
            </button>
          </>
        ) : null}
        <button type="button" className="prp-btn prp-btn--primary" onClick={onToggleDiff}>
          {layoutMode === LAYOUT_DIFF ? 'Hide diff' : 'Diff view'}
        </button>
        {detail.htmlUrl ? (
          <a className="prp-btn" href={detail.htmlUrl} target="_blank" rel="noreferrer">
            Open on GitHub
          </a>
        ) : null}
        <button type="button" className="prp-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
    </header>
  );
}

function ChecksPanel({ checks }) {
  if (!checks) return <div className="prp-muted">No checks data</div>;
  const statuses = checks.statuses || [];
  const runs = checks.checkRuns || [];
  return (
    <div>
      <div className="prp-checks-summary">
        Overall: <Badge tone={checks.state === 'success' ? 'ok' : checks.state === 'failure' ? 'danger' : 'warn'}>{checks.state}</Badge>
        <span className="prp-muted"> ({checks.totalCount || statuses.length || runs.length})</span>
      </div>
      <ul className="prp-list">
        {statuses.map((s, i) => (
          <li key={`s-${i}`}>
            <Badge tone={s.state}>{s.state}</Badge> {s.context}
            {s.description ? <div className="prp-muted prp-clamp">{s.description}</div> : null}
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

function CompactBody({
  detail,
  commentText,
  setCommentText,
  reviewText,
  setReviewText,
  actionBusy,
  actionMsg,
  onPostComment,
  onSubmitReview,
}) {
  if (!detail) return null;
  return (
    <div className="prp-compact">
      <Section title="Description" compact>
        <pre className="prp-prose">{detail.body || '(no description)'}</pre>
      </Section>
      <div className="prp-compact__grid">
        <Section title="Commits" compact>
          <ul className="prp-list">
            {(detail.commits || []).slice(0, 20).map((c) => (
              <li key={c.sha || c.message}>
                <code>{(c.sha || '').slice(0, 7)}</code> {c.message}
              </li>
            ))}
            {(detail.commits || []).length === 0 ? <li className="prp-muted">No commits</li> : null}
          </ul>
        </Section>
        <Section title="Checks" compact>
          <ChecksPanel checks={detail.checks} />
        </Section>
        <Section title="Reviews" compact>
          <ul className="prp-list">
            {(detail.reviews || []).map((r, i) => (
              <li key={r.id || i}>
                <Badge tone={String(r.state || '').toLowerCase()}>{r.state || 'REVIEW'}</Badge>{' '}
                {r.author}
                {r.body ? <div className="prp-muted prp-clamp">{r.body}</div> : null}
              </li>
            ))}
            {(detail.reviews || []).length === 0 ? (
              <li className="prp-muted">No reviews yet</li>
            ) : null}
          </ul>
          <div className="prp-composer">
            <textarea
              className="prp-textarea"
              rows={2}
              placeholder="Review body (optional)…"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />
            <div className="prp-composer__row">
              <button type="button" className="prp-btn prp-btn--sm" disabled={actionBusy} onClick={() => onSubmitReview('COMMENT')}>
                Comment
              </button>
              <button type="button" className="prp-btn prp-btn--sm prp-btn--ok" disabled={actionBusy} onClick={() => onSubmitReview('APPROVE')}>
                Approve
              </button>
              <button type="button" className="prp-btn prp-btn--sm prp-btn--warn" disabled={actionBusy} onClick={() => onSubmitReview('REQUEST_CHANGES')}>
                Request changes
              </button>
            </div>
          </div>
        </Section>
        <Section title="Conversation" compact>
          <ul className="prp-list">
            {(detail.comments || []).slice(0, 30).map((c, i) => (
              <li key={c.id || i}>
                <strong>{c.author}</strong>
                <div className="prp-clamp">{c.body}</div>
              </li>
            ))}
            {(detail.comments || []).length === 0 ? (
              <li className="prp-muted">No issue comments</li>
            ) : null}
          </ul>
          <div className="prp-composer">
            <textarea
              className="prp-textarea"
              rows={2}
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="prp-composer__row">
              <button type="button" className="prp-btn prp-btn--sm prp-btn--primary" disabled={actionBusy || !commentText.trim()} onClick={onPostComment}>
                Post comment
              </button>
            </div>
          </div>
        </Section>
        <Section title="Files" compact>
          <ul className="prp-list prp-mono">
            {(detail.files || []).slice(0, 40).map((f) => (
              <li key={f.filename}>
                {f.filename}{' '}
                <span className="prp-muted">
                  +{f.additions ?? 0}/−{f.deletions ?? 0}
                </span>
              </li>
            ))}
            {(detail.files || []).length === 0 ? <li className="prp-muted">No files</li> : null}
          </ul>
        </Section>
        <Section title="Line comments" compact>
          <ul className="prp-list">
            {(detail.reviewComments || []).slice(0, 40).map((c, i) => (
              <li key={c.id || i}>
                <span className="prp-mono">{c.path}:{c.line ?? '?'}</span> · <strong>{c.author}</strong>
                <div className="prp-clamp">{c.body}</div>
              </li>
            ))}
            {(detail.reviewComments || []).length === 0 ? (
              <li className="prp-muted">No line comments</li>
            ) : null}
          </ul>
        </Section>
      </div>
      {actionMsg ? <div className="prp-action-msg">{actionMsg}</div> : null}
    </div>
  );
}

function FileTree({ files, activePath, onSelect }) {
  return (
    <aside className="prp-filetree">
      <div className="prp-filetree__head">Files ({files.length})</div>
      <ul className="prp-filetree__list">
        {files.map((f) => (
          <li key={f.filename}>
            <button
              type="button"
              className={
                f.filename === activePath
                  ? 'prp-filetree__item prp-filetree__item--active'
                  : 'prp-filetree__item'
              }
              onClick={() => onSelect(f.filename)}
            >
              <span className="prp-filetree__name">{f.filename}</span>
              <span className="prp-filetree__stat">
                +{f.additions ?? 0}/−{f.deletions ?? 0}
              </span>
            </button>
          </li>
        ))}
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
}) {
  const range = calculateVisibleRange({
    totalRows: virtualRows.length,
    rowHeight: ROW_HEIGHT,
    viewportHeight,
    scrollTop,
    overscan: 8,
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
          {slice.map((row) => (
            <div
              key={row.rowIndex}
              className={`prp-vline prp-vline--${row.lineType || row.kind}${
                highlightRowIndex === row.rowIndex ? ' prp-vline--hit' : ''
              }`}
              style={{ height: ROW_HEIGHT }}
              data-row-index={row.rowIndex}
              data-file-path={row.filePath || ''}
              data-new-line={row.newLine ?? ''}
              title={row.kind === 'diff-line' ? 'Double-click to comment on this line' : undefined}
              onDoubleClick={() => {
                if (row.kind === 'diff-line' && row.filePath && row.newLine != null) {
                  onLineComment?.(row);
                }
              }}
            >
              <code>{row.text}</code>
            </div>
          ))}
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
      <button type="button" className="prp-btn prp-btn--sm" onClick={onPrev}>
        ↑
      </button>
      <button type="button" className="prp-btn prp-btn--sm" onClick={onNext}>
        ↓
      </button>
      <button type="button" className="prp-btn prp-btn--sm" onClick={onClose}>
        Esc
      </button>
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
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const searchInputRef = useRef(null);
  const shellRef = useRef(null);

  const files = detail?.files || [];
  const virtualRows = useMemo(
    () => flattenFilesToVirtualRows(files, diffMode),
    [files, diffMode]
  );
  const fileStarts = useMemo(() => fileStartIndexMap(virtualRows), [virtualRows]);

  const docs = useMemo(
    () => buildSearchIndex(detail || {}, virtualRows),
    [detail, virtualRows]
  );

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
    }
  }, [open]);

  useEffect(() => {
    if (!open || !shellRef.current) return undefined;
    const measure = () => {
      const el = shellRef.current;
      if (!el) return;
      const h = el.clientHeight || 600;
      // header ~56 + search ~40 + pane head ~32
      setViewportHeight(Math.max(240, h - (layoutMode === LAYOUT_DIFF ? 130 : 200)));
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

  useEffect(() => {
    if (!searchOpen) return;
    const hits = searchIndex(docs, searchQuery);
    setSearchHits(hits);
    setSearchHitIndex(hits.length ? 0 : -1);
  }, [searchQuery, docs, searchOpen]);

  const jumpToHit = useCallback(
    (hit) => {
      if (!hit) return;
      if (hit.filePath) setActiveFilePath(hit.filePath);
      if (typeof hit.rowIndex === 'number') {
        const applyScroll = () => {
          const top = scrollTopForIndex(
            hit.rowIndex,
            ROW_HEIGHT,
            viewportHeight,
            virtualRows.length
          );
          setScrollTop(top);
          if (listRef.current) listRef.current.scrollTop = top;
        };
        if (layoutMode !== LAYOUT_DIFF) expandDiff(applyScroll);
        else applyScroll();
      }
    },
    [layoutMode, viewportHeight, virtualRows.length]
  );

  useEffect(() => {
    if (searchHitIndex >= 0 && searchHits[searchHitIndex]) {
      jumpToHit(searchHits[searchHitIndex]);
    }
  }, [searchHitIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      const top = scrollTopForIndex(idx, ROW_HEIGHT, viewportHeight, virtualRows.length);
      setScrollTop(top);
      if (listRef.current) listRef.current.scrollTop = top;
    }
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
    const body = window.prompt(
      `Line comment on ${row.filePath}:${row.newLine}`,
      ''
    );
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
  const cls = `${layoutClassName(layoutMode)} ${animClass}`.trim();

  return (
    <div className="prp-overlay" ref={rootRef} tabIndex={-1}>
      <div className="prp-backdrop" onClick={onClose} />
      <div
        className={cls}
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Pull request #${detail.number}` : 'Pull request'}
      >
        <Header
          detail={detail}
          onClose={onClose}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          diffMode={diffMode}
          onDiffMode={setDiffMode}
        />
        <SearchBar
          open={searchOpen}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          onChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onNext={() =>
            setSearchHitIndex((i) => nextHitIndex(i, searchHits.length, 1))
          }
          onPrev={() =>
            setSearchHitIndex((i) => nextHitIndex(i, searchHits.length, -1))
          }
        />
        {loading ? <div className="prp-status">Loading pull request…</div> : null}
        {error ? <div className="prp-status prp-status--error">{error}</div> : null}
        {!loading && detail && layoutMode === LAYOUT_CENTERED ? (
          <CompactBody
            detail={{ ...detail, files }}
            commentText={commentText}
            setCommentText={setCommentText}
            reviewText={reviewText}
            setReviewText={setReviewText}
            actionBusy={actionBusy}
            actionMsg={actionMsg}
            onPostComment={onPostComment}
            onSubmitReview={onSubmitReview}
          />
        ) : null}
        {!loading && detail && layoutMode === LAYOUT_DIFF ? (
          <div className="prp-diff-layout">
            <FileTree
              files={files}
              activePath={activeFilePath}
              onSelect={onSelectFile}
            />
            <div className="prp-diff-pane">
              <div className="prp-diff-pane__head">
                Diff ({diffMode}) · {virtualRows.length} rows · virtualized · double-click line to comment
                {actionMsg ? <span className="prp-action-inline"> · {actionMsg}</span> : null}
              </div>
              <VirtualDiff
                virtualRows={virtualRows}
                scrollTop={scrollTop}
                viewportHeight={viewportHeight}
                listRef={listRef}
                highlightRowIndex={hit?.rowIndex}
                onScroll={(top) => setScrollTop(top)}
                onLineComment={onLineComment}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mountPrModal(hostEl, props) {
  const root = ReactDOM.createRoot(hostEl);
  root.render(React.createElement(PrModalApp, props));
  return root;
}

globalThis.PRModalApp = PrModalApp;
globalThis.mountPrModal = mountPrModal;
