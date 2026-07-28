import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { IconChevronDown, IconFileNavToggle } from '@common/icons';
import { StepNav } from '@common/StepNav';
import {
  sidePanelShortcutLabel,
  stepNavShortcutLabel,
} from '@lib/shortcut-policy';
import { TipPopover } from '@common/TipPopover';
import { SearchBar } from './SearchBar';
import {
  FinishReviewModal,
  type FinishReviewEvent,
} from './FinishReviewModal';

/**
 * Unified Diff top chrome: files, multi-checkbox commits, unified/split,
 * grouped comment nav, pending review — no checks.
 * (+/−/files stats live in the PR header only.)
 *
 * Leave-review CTAs live in FinishReviewModal (GitHub-style). Diff header
 * only shows "Submit review" (always available, even with 0 pending).
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
    /** null | 'unresolved' | 'resolved' | 'pending' — deselectable segment control */
    reviewFilter = null,
    onReviewFilter = null,
    showReviewFilter = false,
    /** Thread totals for filter button labels */
    unresolvedCount = 0,
    resolvedCount = 0,
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

        <div className="prp-diff-mode" role="radiogroup" aria-label="Diff view mode">
          <label className="prp-diff-mode__opt">
            <input
              type="radio"
              name="prp-diff-mode"
              value="unified"
              checked={diffMode === 'unified'}
              onChange={() => onDiffMode?.('unified')}
            />
            Unified
          </label>
          <label className="prp-diff-mode__opt">
            <input
              type="radio"
              name="prp-diff-mode"
              value="split"
              checked={diffMode === 'split'}
              onChange={() => onDiffMode?.('split')}
            />
            Split
          </label>
        </div>

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

        {searchOpen || showReviewFilter || comments?.length ? (
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
                aria-label="Filter files by review threads"
              >
                <button
                  type="button"
                  className={
                    reviewFilter === 'unresolved'
                      ? 'prp-review-filter__btn prp-review-filter__btn--on'
                      : 'prp-review-filter__btn'
                  }
                  aria-pressed={reviewFilter === 'unresolved'}
                  title={
                    reviewFilter === 'unresolved'
                      ? 'Clear filter — show all review threads'
                      : `Show only unresolved review threads (${unresN})`
                  }
                  onClick={() =>
                    onReviewFilter?.(
                      reviewFilter === 'unresolved' ? null : 'unresolved'
                    )
                  }
                >
                  Unresolved{' '}
                  <span className="prp-review-filter__count">{unresN}</span>
                </button>
                <button
                  type="button"
                  className={
                    reviewFilter === 'resolved'
                      ? 'prp-review-filter__btn prp-review-filter__btn--on'
                      : 'prp-review-filter__btn'
                  }
                  aria-pressed={reviewFilter === 'resolved'}
                  title={
                    reviewFilter === 'resolved'
                      ? 'Clear filter — show all review threads'
                      : `Show only resolved review threads (${resN})`
                  }
                  onClick={() =>
                    onReviewFilter?.(
                      reviewFilter === 'resolved' ? null : 'resolved'
                    )
                  }
                >
                  Resolved <span className="prp-review-filter__count">{resN}</span>
                </button>
                {pending > 0 || reviewFilter === 'pending' ? (
                  <button
                    type="button"
                    className={
                      reviewFilter === 'pending'
                        ? 'prp-review-filter__btn prp-review-filter__btn--on'
                        : 'prp-review-filter__btn'
                    }
                    aria-pressed={reviewFilter === 'pending'}
                    title={
                      reviewFilter === 'pending'
                        ? 'Clear filter — show all review threads'
                        : `Show only pending (unsubmitted) comments (${pending})`
                    }
                    onClick={() =>
                      onReviewFilter?.(
                        reviewFilter === 'pending' ? null : 'pending'
                      )
                    }
                  >
                    Pending{' '}
                    <span className="prp-review-filter__count">{pending}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            {!searchOpen && comments?.length ? (
              <StepNav
                className="prp-diff-toolbar__comments prp-comment-nav"
                index={commentIndex}
                total={comments.length}
                onPrev={onPrevComment}
                onNext={onNextComment}
                label="Review threads"
                title={
                  reviewFilter
                    ? `Filtered review threads (${reviewFilter}; replies excluded)`
                    : 'Review threads (replies excluded)'
                }
                prevTitle="Previous review thread"
                nextTitle="Next review thread"
                prevShortcut={threadPrevShortcut}
                nextShortcut={threadNextShortcut}
              />
            ) : null}
          </div>
        ) : null}

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
