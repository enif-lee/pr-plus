import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@common/Button';
import { OptBtnHint } from '@common/OptBtnHint';
import { SearchableSelect } from '@common/SearchableSelect';
import {
  buildCommitFilterOptions,
  diffCommitFilterToSelection,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  selectionToDiffCommitFilter,
  truncateCommitLabel,
} from '@lib/diff-commit-filter';
import { pendingReviewCount } from '@lib/pending-review';
import { IconChevronDown, IconFileNavToggle, IconGear } from '@common/icons';
import { StepNav } from '@common/StepNav';
import {
  sidePanelShortcutLabel,
  stepNavShortcutLabel,
} from '@lib/shortcut-policy';
import {
  createDefaultDiffReviewFilter,
  isStatusActive,
  listReviewAuthorsFromComments,
  normalizeDiffReviewFilter,
  type DiffReviewFilterState,
  type DiffReviewStatus,
} from '@lib/diff-review-filter';
import { TipPopover } from '@common/TipPopover';
import { SearchBar } from './SearchBar';
import './DiffToolbar.css';
import {
  FinishReviewModal,
  type FinishReviewEvent,
} from './FinishReviewModal';

/**
 * Unified Diff top chrome: files, multi-checkbox commits, thread filters,
 * grouped comment nav, pending review — no checks.
 * (+/−/files stats live in the PR header only.)
 *
 * Leave-review CTAs live in FinishReviewModal (GitHub-style). Diff header
 * only shows "Submit review" (always available, even with 0 pending).
 *
 * Display options (unified/split, hide whitespace) and review-filter extras
 * (hide outdated, authors) live in the gear settings popover.
 *
 * When find-in-diff is open, Unresolved/Resolved/Pending filters are replaced
 * by an inline search box (no extra header row).
 */
export function DiffToolbar(props: any) {
  const {
    detail,
    fileNavCollapsed,
    onToggleFileNav,
    diffMode = 'unified',
    onDiffMode,
    hideWhitespace = false,
    onHideWhitespace = null,
    commits = [],
    commitFilter,
    onCommitFilter,
    /** Called when the commits picker opens (fetch remaining pages). */
    onOpenCommitPicker = null,
    commitLoading = false,
    commitError = null,
    commitLabel = null,
    commitDisabled = false,
    comments = [],
    commentIndex = -1,
    onPrevComment,
    onNextComment,
    /**
     * Multi-select review filter state (statuses + hideOutdated + authors).
     * Legacy string/null still accepted via normalizeDiffReviewFilter.
     */
    reviewFilter = null,
    onReviewFilter = null,
    /** Toggle one status chip (multi-select). */
    onToggleReviewStatus = null,
    /** Patch hideOutdated / authors. */
    onPatchReviewFilter = null,
    showReviewFilter = false,
    /** Thread totals for filter button labels */
    unresolvedCount = 0,
    resolvedCount = 0,
    /** All review comments (for author list) */
    reviewComments = null,
    pendingBatch,
    pendingServerCount = 0,
    totalPendingCount = null,
    onDiscardPending,
    onLeaveReviewAction,
    actionBusy = false,
    actionMsg = null,
    /** Shell color mode for portaled Finish review popover */
    colorMode = null,
    /** Shared with selection / conversation composers */
    onUploadFile = null,
    mentionCandidates = [],
    linkCtx = null,
    /** Inline find-in-diff (replaces review filter when open) */
    searchOpen = false,
    searchQuery = '',
    searchHits = null,
    searchHitIndex = -1,
    searchInputRef = null,
    searchBusy = false,
    showSearchLoadComments = false,
    onSearchLoadComments = null,
    searchLoadCommentsBusy = false,
    onSearchChange = null,
    onSearchClose = null,
    onSearchNext = null,
    onSearchPrev = null,
  } = props;

  // Unified: GitHub PENDING review only (totalPendingCount from App).
  // Legacy fallback: local batch count if host not yet updated.
  const localPending =
    typeof pendingReviewCount === 'function' ? pendingReviewCount(pendingBatch) : 0;
  const pending =
    totalPendingCount != null
      ? Number(totalPendingCount)
      : Number(pendingServerCount || 0) || localPending;
  const unresN = Number(unresolvedCount) || 0;
  const resN = Number(resolvedCount) || 0;
  const filterState: DiffReviewFilterState = useMemo(
    () =>
      normalizeDiffReviewFilter(
        reviewFilter ?? createDefaultDiffReviewFilter()
      ),
    [reviewFilter]
  );
  const authorList = useMemo(() => {
    const src = Array.isArray(reviewComments)
      ? reviewComments
      : Array.isArray(comments)
        ? comments
        : Array.isArray(detail?.reviewComments)
          ? detail.reviewComments
          : [];
    return typeof listReviewAuthorsFromComments === 'function'
      ? listReviewAuthorsFromComments(src)
      : [];
  }, [reviewComments, comments, detail?.reviewComments]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);
  const settingsGearRef = useRef<HTMLButtonElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [settingsCoords, setSettingsCoords] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const placeSettingsMenu = () => {
    const gear = settingsGearRef.current;
    if (!gear || typeof window === 'undefined') return;
    const rect = gear.getBoundingClientRect();
    const gap = 4;
    const menuW = 240;
    const pad = 8;
    // Prefer below the gear; flip above if not enough room
    const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
    const spaceAbove = rect.top - gap - pad;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(
      120,
      Math.min(360, preferBelow ? spaceBelow : spaceAbove)
    );
    let top = preferBelow
      ? rect.bottom + gap
      : Math.max(pad, rect.top - gap - maxHeight);
    // Right-align to gear (toolbar sits on the right half of Diff chrome)
    let left = rect.right - menuW;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
    // If flipped above and we estimated height, keep top within viewport
    if (!preferBelow) {
      top = Math.max(pad, rect.top - gap - maxHeight);
    }
    setSettingsCoords({ top, left, maxHeight });
  };

  useLayoutEffect(() => {
    if (!settingsOpen) {
      setSettingsCoords(null);
      return undefined;
    }
    placeSettingsMenu();
    const onReposition = () => placeSettingsMenu();
    window.addEventListener('resize', onReposition);
    // Capture scroll on any ancestor (virtual list / modal shell)
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    // Defer outside-click so the opening click does not immediately close.
    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 0);
    function onDoc(e: MouseEvent) {
      if (!armed) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (settingsWrapRef.current?.contains(t)) return;
      if (settingsMenuRef.current?.contains(t)) return;
      if (settingsGearRef.current?.contains(t)) return;
      setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [settingsOpen]);
  function toggleStatus(status: DiffReviewStatus) {
    if (typeof onToggleReviewStatus === 'function') {
      onToggleReviewStatus(status);
      return;
    }
    // Fallback: exclusive-style via onReviewFilter for older hosts
    onReviewFilter?.(
      isStatusActive(filterState, status) ? null : status
    );
  }
  function patchFilter(partial: Partial<DiffReviewFilterState>) {
    if (typeof onPatchReviewFilter === 'function') {
      onPatchReviewFilter(partial);
      return;
    }
    onReviewFilter?.({ ...filterState, ...partial });
  }
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const threadPrevShortcut = stepNavShortcutLabel('prev', isMac);
  const threadNextShortcut = stepNavShortcutLabel('next', isMac);
  const filesPanelShortcut =
    typeof sidePanelShortcutLabel === 'function'
      ? sidePanelShortcutLabel(isMac)
      : isMac
        ? '⌥B'
        : 'Alt+B';

  const commitOpts = useMemo(() => buildCommitFilterOptions(commits), [commits]);
  const f = normalizeDiffCommitFilter(commitFilter);
  const [commitPickerOpen, setCommitPickerOpen] = useState(false);
  const [commitQuery, setCommitQuery] = useState('');
  const commitBtnRef = useRef<HTMLButtonElement | null>(null);
  const submitBtnRef = useRef<HTMLSpanElement | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishInitial, setFinishInitial] =
    useState<FinishReviewEvent>('comment');

  // Global leave-review chords / palette on Diff → open this modal
  // (event dispatched from PrModalApp leaveReview when layout is Diff).
  // Keep a stable listener for the whole toolbar lifetime (both keep-alive panels).
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent)?.detail || {};
      const kind = String(detail.kind || 'comment').toLowerCase();
      const next: FinishReviewEvent =
        kind === 'approve'
          ? 'approve'
          : kind === 'request_changes' || kind === 'request-changes'
            ? 'request_changes'
            : 'comment';
      setFinishInitial(next);
      setFinishOpen(true);
    }
    window.addEventListener('prp-open-finish-review', onOpen as EventListener);
    return () => {
      window.removeEventListener('prp-open-finish-review', onOpen as EventListener);
    };
  }, []);

  const initialSelectedIds = useMemo(
    () => diffCommitFilterToSelection(f, commits),
    // Recompute when filter identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.mode, f.sha, f.endSha, commits]
  );

  const selectOptions = useMemo(
    () =>
      commitOpts.map((o) => ({
        id: o.sha,
        label: o.label,
        keywords: [o.shortSha, o.sha, o.fullLabel],
        meta: { fullLabel: o.fullLabel },
      })),
    [commitOpts]
  );

  const triggerLabel = (() => {
    if (isAllCommitsFilter(f)) return `All commits (${commitOpts.length})`;
    if (f.mode === 'range' && f.sha && f.endSha) {
      const raw =
        commitLabel ||
        `${String(f.sha).slice(0, 7)}…${String(f.endSha).slice(0, 7)}`;
      return truncateCommitLabel(raw, 36);
    }
    if (f.mode === 'single' && f.sha) {
      const raw =
        commitLabel ||
        commitOpts.find((o) => o.sha === f.sha)?.fullLabel ||
        String(f.sha).slice(0, 7);
      return truncateCommitLabel(raw, 36);
    }
    return 'Commits';
  })();

  function applyCommitSelection(ids: string[]) {
    const next = selectionToDiffCommitFilter(ids, commits);
    onCommitFilter?.(next);
    setCommitPickerOpen(false);
    setCommitQuery('');
  }

  return (
    <div className="prp-diff-toolbar" role="toolbar" aria-label="Diff controls">
      <div className="prp-diff-toolbar__row prp-diff-toolbar__row--primary">
        <button
          type="button"
          className="prp-diff-toolbar__nav-toggle prp-has-tip prp-opt-hint-host"
          onClick={onToggleFileNav}
          aria-pressed={!fileNavCollapsed}
          aria-label={
            fileNavCollapsed ? 'Show files navigator' : 'Hide files navigator'
          }
        >
          <OptBtnHint
            label={filesPanelShortcut}
            preferredPlacement="bottom"
          />
          <IconFileNavToggle collapsed={fileNavCollapsed} size={14} />
          <span className="prp-diff-toolbar__nav-label">Files</span>
          <TipPopover
            title={
              fileNavCollapsed ? 'Show files panel' : 'Hide files panel'
            }
            shortcut={filesPanelShortcut}
          />
        </button>

        <div className="prp-diff-toolbar__commits">
          <button
            type="button"
            ref={commitBtnRef}
            className="prp-diff-toolbar__commit-btn"
            disabled={commitDisabled || (commitLoading && !commitOpts.length)}
            onClick={() => {
              setCommitPickerOpen((o) => {
                const next = !o;
                if (next) {
                  void onOpenCommitPicker?.();
                }
                return next;
              });
            }}
            aria-haspopup="dialog"
            aria-expanded={commitPickerOpen}
            title="Select 1 commit for a single diff, or 2 for an inclusive range"
          >
            {commitLoading && !commitOpts.length ? 'Loading…' : triggerLabel}
            <span className="prp-diff-toolbar__chevron" aria-hidden="true">
              <IconChevronDown size={12} />
            </span>
          </button>
          <SearchableSelect
            open={commitPickerOpen}
            title={
              commitLoading
                ? 'Commits — loading all…'
                : 'Commits — check 1 or 2'
            }
            options={selectOptions}
            query={commitQuery}
            onQuery={setCommitQuery}
            onPick={null}
            onConfirm={(ids: string[]) => applyCommitSelection(ids)}
            onClose={() => {
              setCommitPickerOpen(false);
              setCommitQuery('');
            }}
            allowFreeText={false}
            anchorRef={commitBtnRef}
            placement="bottom"
            multi
            initialSelectedIds={initialSelectedIds}
            confirmLabel="Apply selection"
            placeholder="Search commits by message or sha…"
            emptyLabel={
              commitLoading ? 'Loading remaining commits…' : 'No matches'
            }
          />
        </div>

        <div
          className={`prp-diff-toolbar__thread-tools${
            searchOpen ? ' prp-diff-toolbar__thread-tools--search' : ''
          }`}
        >
          {searchOpen ? (
            <SearchBar
              variant="toolbar"
              open
              query={searchQuery}
              hits={searchHits}
              hitIndex={searchHitIndex}
              inputRef={searchInputRef}
              searching={searchBusy}
              showLoadComments={showSearchLoadComments}
              onLoadComments={onSearchLoadComments}
              loadCommentsBusy={searchLoadCommentsBusy}
              onChange={onSearchChange}
              onClose={onSearchClose}
              onNext={onSearchNext}
              onPrev={onSearchPrev}
              placeholder="Find in diff, comments…"
            />
          ) : showReviewFilter ? (
            <div
              className="prp-review-filter"
              role="group"
              aria-label="Filter review threads by status (multi-select)"
            >
              <button
                type="button"
                className={
                  isStatusActive(filterState, 'unresolved')
                    ? 'prp-review-filter__btn prp-review-filter__btn--on'
                    : 'prp-review-filter__btn'
                }
                aria-pressed={isStatusActive(filterState, 'unresolved')}
                title={`Toggle unresolved threads (${unresN}). Empty selection shows all.`}
                onClick={() => toggleStatus('unresolved')}
              >
                Unresolved{' '}
                <span className="prp-review-filter__count">{unresN}</span>
              </button>
              <button
                type="button"
                className={
                  isStatusActive(filterState, 'resolved')
                    ? 'prp-review-filter__btn prp-review-filter__btn--on'
                    : 'prp-review-filter__btn'
                }
                aria-pressed={isStatusActive(filterState, 'resolved')}
                title={`Toggle resolved threads (${resN}). Empty selection shows all.`}
                onClick={() => toggleStatus('resolved')}
              >
                Resolved <span className="prp-review-filter__count">{resN}</span>
              </button>
              {pending > 0 ? (
                <button
                  type="button"
                  className={
                    isStatusActive(filterState, 'pending')
                      ? 'prp-review-filter__btn prp-review-filter__btn--on'
                      : 'prp-review-filter__btn'
                  }
                  aria-pressed={isStatusActive(filterState, 'pending')}
                  title={`Toggle pending (unsubmitted) comments (${pending}). Empty selection shows all.`}
                  onClick={() => toggleStatus('pending')}
                >
                  Pending{' '}
                  <span className="prp-review-filter__count">{pending}</span>
                </button>
              ) : null}
            </div>
          ) : null}
          {!searchOpen ? (
            <div
              className="prp-diff-toolbar__thread-nav-wrap"
              ref={settingsWrapRef}
            >
              <div className="prp-diff-toolbar__thread-nav">
                {Array.isArray(comments) && comments.length ? (
                  <StepNav
                    className="prp-diff-toolbar__comments prp-comment-nav"
                    index={commentIndex}
                    total={comments.length}
                    onPrev={onPrevComment}
                    onNext={onNextComment}
                    label="Review threads"
                    title={
                      filterState.statuses.length ||
                      filterState.hideOutdated ||
                      filterState.authors.length
                        ? `Filtered review threads (replies excluded)`
                        : 'Review threads (replies excluded)'
                    }
                    prevTitle="Previous review thread"
                    nextTitle="Next review thread"
                    prevShortcut={threadPrevShortcut}
                    nextShortcut={threadNextShortcut}
                  />
                ) : null}
                <button
                  ref={settingsGearRef}
                  type="button"
                  className={
                    Array.isArray(comments) && comments.length
                      ? 'prp-diff-toolbar__filter-gear'
                      : 'prp-diff-toolbar__filter-gear prp-diff-toolbar__filter-gear--alone'
                  }
                  aria-label="Diff view settings"
                  aria-haspopup="menu"
                  aria-expanded={settingsOpen}
                  title="View and filter options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsOpen((v) => !v);
                  }}
                  data-prp-review-filter-gear="1"
                >
                  <IconGear size={14} />
                </button>
              </div>
              {settingsOpen && settingsCoords
                ? (() => {
                    const menu = (
                      <div
                        ref={settingsMenuRef}
                        className="prp-diff-review-settings prp-diff-review-settings--portal"
                        role="menu"
                        aria-label="Diff view settings"
                        data-prp-review-filter-menu="1"
                        style={{
                          top: settingsCoords.top,
                          left: settingsCoords.left,
                          maxHeight: settingsCoords.maxHeight,
                        }}
                      >
                        <div className="prp-diff-review-settings__section">
                          <p className="prp-diff-review-settings__heading">
                            Diff view
                          </p>
                          <div
                            className="prp-diff-review-settings__radios"
                            role="radiogroup"
                            aria-label="Diff view mode"
                          >
                            <label className="prp-diff-review-settings__row">
                              <input
                                type="radio"
                                name="prp-diff-mode"
                                value="unified"
                                checked={diffMode === 'unified'}
                                onChange={(e) => {
                                  onDiffMode?.('unified');
                                  try {
                                    (e.currentTarget as HTMLInputElement).blur();
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              />
                              <span>Unified</span>
                            </label>
                            <label className="prp-diff-review-settings__row">
                              <input
                                type="radio"
                                name="prp-diff-mode"
                                value="split"
                                checked={diffMode === 'split'}
                                onChange={(e) => {
                                  onDiffMode?.('split');
                                  try {
                                    (e.currentTarget as HTMLInputElement).blur();
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              />
                              <span>Split</span>
                            </label>
                          </div>
                          <label
                            className="prp-diff-review-settings__row"
                            title="Hide lines that change only whitespace"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(hideWhitespace)}
                              onChange={(e) =>
                                onHideWhitespace?.(Boolean(e.target.checked))
                              }
                              data-prp-hide-whitespace="1"
                            />
                            <span>Hide whitespace</span>
                          </label>
                        </div>
                        {showReviewFilter || authorList.length > 0 ? (
                          <>
                            <hr className="prp-diff-review-settings__divider" />
                            <div className="prp-diff-review-settings__section">
                              <label className="prp-diff-review-settings__row">
                                <input
                                  type="checkbox"
                                  checked={Boolean(filterState.hideOutdated)}
                                  onChange={(e) =>
                                    patchFilter({
                                      hideOutdated: e.target.checked,
                                    })
                                  }
                                />
                                <span>Hide outdated comments</span>
                              </label>
                            </div>
                            <hr className="prp-diff-review-settings__divider" />
                            <div className="prp-diff-review-settings__section">
                              <p className="prp-diff-review-settings__heading">
                                Reviewed by…
                              </p>
                              {authorList.length === 0 ? (
                                <p className="prp-diff-review-settings__empty">
                                  No review authors yet
                                </p>
                              ) : (
                                authorList.map((login) => {
                                  const key = String(login).toLowerCase();
                                  const checked = filterState.authors.some(
                                    (a) => a.toLowerCase() === key
                                  );
                                  return (
                                    <label
                                      key={key}
                                      className="prp-diff-review-settings__row"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = new Set(
                                            filterState.authors.map((a) =>
                                              a.toLowerCase()
                                            )
                                          );
                                          if (next.has(key)) next.delete(key);
                                          else next.add(key);
                                          patchFilter({ authors: [...next] });
                                        }}
                                      />
                                      <span>{login}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                    if (typeof document === 'undefined') return menu;
                    const portalRoot =
                      (document.querySelector(
                        '.prp-overlay'
                      ) as HTMLElement | null) || document.body;
                    return createPortal(menu, portalRoot);
                  })()
                : null}
            </div>
          ) : null}
        </div>

        {/* Always available — event/body live in FinishReviewModal */}
        <div className="prp-diff-toolbar__pending" role="group" aria-label="Leave a review">
          <span className="prp-opt-hint-host" ref={submitBtnRef}>
            <OptBtnHint
              label={isMac ? '⌥↵' : 'Alt+Enter'}
              preferredPlacement="top"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={actionBusy}
              aria-haspopup="dialog"
              aria-expanded={finishOpen}
              onClick={() => {
                setFinishInitial('comment');
                setFinishOpen(true);
              }}
              title={
                pending > 0
                  ? `Finish your review (${pending} pending)`
                  : 'Finish your review'
              }
              shortcut={isMac ? '⌥↵' : 'Alt+Enter'}
              tipPlacement="top"
            >
              Submit review
              {pending > 0 ? (
                <span className="prp-diff-toolbar__pending-count" aria-hidden="true">
                  {pending}
                </span>
              ) : null}
            </Button>
          </span>
          <FinishReviewModal
            open={finishOpen}
            anchorRef={submitBtnRef}
            pendingCount={pending}
            detail={detail}
            actionBusy={actionBusy}
            colorMode={colorMode}
            initialEvent={finishInitial}
            onUploadFile={onUploadFile}
            mentionCandidates={mentionCandidates}
            linkCtx={linkCtx}
            onClose={() => setFinishOpen(false)}
            onDiscard={
              pending > 0 && typeof onDiscardPending === 'function'
                ? async () => {
                    await onDiscardPending?.();
                    setFinishOpen(false);
                  }
                : null
            }
            onSubmit={async (kind, body) => {
              const ok = await onLeaveReviewAction?.(kind, { body });
              if (ok !== false) setFinishOpen(false);
            }}
          />
        </div>

        {commitError ? (
          <span className="prp-commit-filter__error" role="alert">
            {commitError}
          </span>
        ) : null}

      </div>
    </div>
  );
}

export default DiffToolbar;
