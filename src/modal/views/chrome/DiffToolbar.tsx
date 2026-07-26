import React, { useMemo, useRef, useState } from 'react';
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
import { canSubmitReviewVerdict } from '@lib/pr-edit-api';
import { IconChevronDown, IconFileNavToggle } from '@common/icons';
import { StepNav } from '@common/StepNav';
import { stepNavShortcutLabel } from '@lib/shortcut-policy';
import { SearchBar } from './SearchBar';

/**
 * Unified Diff top chrome: files, multi-checkbox commits, stats,
 * unified/split, grouped comment nav, pending review — no checks.
 *
 * When find-in-diff is open, Unresolved/Resolved/Pending filters are replaced
 * by an inline search box (no extra header row).
 */
export function DiffToolbar(props: any) {
  const {
    detail,
    fileNavCollapsed,
    onToggleFileNav,
    annotatedFileCount = 0,
    rowCount = 0,
    filtered = false,
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
    /** Option-hold shortcut badges on step-nav / review CTAs */
    showOptHints = false,
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
  const fileCount = detail?.changedFiles ?? annotatedFileCount;
  const additions = detail?.additions ?? 0;
  const deletions = detail?.deletions ?? 0;
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const threadPrevShortcut = stepNavShortcutLabel('prev', isMac);
  const threadNextShortcut = stepNavShortcutLabel('next', isMac);
  // GitHub rejects APPROVE / REQUEST_CHANGES on your own PR
  const showReviewVerdict =
    typeof canSubmitReviewVerdict === 'function'
      ? canSubmitReviewVerdict(detail)
      : (() => {
          const a = String(detail?.author || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          const v = String(detail?.viewerLogin || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          return !(a && v && a === v);
        })();

  const commitOpts = useMemo(() => buildCommitFilterOptions(commits), [commits]);
  const f = normalizeDiffCommitFilter(commitFilter);
  const [commitPickerOpen, setCommitPickerOpen] = useState(false);
  const [commitQuery, setCommitQuery] = useState('');
  const commitBtnRef = useRef<HTMLButtonElement | null>(null);

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
          className="prp-diff-toolbar__nav-toggle"
          onClick={onToggleFileNav}
          aria-pressed={!fileNavCollapsed}
          aria-label={fileNavCollapsed ? 'Show files navigator' : 'Hide files navigator'}
          title={fileNavCollapsed ? 'Show files' : 'Hide files'}
        >
          <IconFileNavToggle collapsed={fileNavCollapsed} size={14} />
          <span className="prp-diff-toolbar__nav-label">Files</span>
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

        <div className="prp-diff-toolbar__stats" title="PR file stats">
          <span className="prp-stat-add">+{additions}</span>
          <span className="prp-stat-del">−{deletions}</span>
          <span className="prp-muted">
            {filtered ? `${annotatedFileCount}/${fileCount}` : fileCount} files
            {rowCount ? ` · ${rowCount} rows` : ''}
          </span>
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
                showOptHints={showOptHints}
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
                showOptHints={showOptHints}
              />
            ) : null}
          </div>
        ) : null}

        {pending > 0 ? (
          <div className="prp-diff-toolbar__pending" role="status">
            <span className="prp-opt-hint-host">
              <OptBtnHint
                show={showOptHints}
                label={isMac ? '⌥↵' : 'Alt+Enter'}
                preferredPlacement="top"
              />
              <Button
                size="sm"
                variant="primary"
                disabled={actionBusy}
                onClick={() => onLeaveReviewAction?.('comment')}
                title="Submit pending review as comment"
                shortcut={isMac ? '⌥↵' : 'Alt+Enter'}
                tipPlacement="top"
              >
                Submit review
              </Button>
            </span>
            {showReviewVerdict ? (
              <span className="prp-opt-hint-host">
                <OptBtnHint
                  show={showOptHints}
                  label={isMac ? '⌥⇧↵' : 'Alt+Shift+Enter'}
                  preferredPlacement="top"
                />
                <Button
                  size="sm"
                  variant="ok"
                  disabled={actionBusy}
                  onClick={() => onLeaveReviewAction?.('approve')}
                  title="Approve pull request"
                  shortcut={isMac ? '⌥⇧↵' : 'Alt+Shift+Enter'}
                  tipPlacement="top"
                >
                  Approve
                </Button>
              </span>
            ) : null}
            {showReviewVerdict ? (
              <span className="prp-opt-hint-host">
                <OptBtnHint
                  show={showOptHints}
                  label={isMac ? '⌥⇧X' : 'Alt+Shift+X'}
                  preferredPlacement="top"
                />
                <Button
                  size="sm"
                  variant="warn"
                  disabled={actionBusy}
                  onClick={() => onLeaveReviewAction?.('request_changes')}
                  title="Request changes"
                  shortcut={isMac ? '⌥⇧X' : 'Alt+Shift+X'}
                  tipPlacement="top"
                >
                  Request changes
                </Button>
              </span>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              disabled={actionBusy}
              onClick={onDiscardPending}
              title="Discard pending review"
              tipPlacement="top"
            >
              Discard
            </Button>
          </div>
        ) : null}

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
