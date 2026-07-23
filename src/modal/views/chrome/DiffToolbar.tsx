import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
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

/**
 * Unified Diff top chrome: files, multi-checkbox commits, stats,
 * unified/split, grouped comment nav, pending review — no checks.
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
            disabled={commitDisabled || commitLoading || !commitOpts.length}
            onClick={() => setCommitPickerOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={commitPickerOpen}
            title="Select 1 commit for a single diff, or 2 for an inclusive range"
          >
            {commitLoading ? 'Loading…' : triggerLabel}
            <span className="prp-diff-toolbar__chevron" aria-hidden="true">
              <IconChevronDown size={12} />
            </span>
          </button>
          <SearchableSelect
            open={commitPickerOpen}
            title="Commits — check 1 or 2"
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
            placeholder="Filter commits… (empty = all)"
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

        {showReviewFilter || comments?.length ? (
          <div className="prp-diff-toolbar__thread-tools">
            {showReviewFilter ? (
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
                  Unresolved <span className="prp-review-filter__count">{unresN}</span>
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
            {comments?.length ? (
              <div
                className="prp-btn-group prp-comment-nav prp-diff-toolbar__comments"
                role="group"
                aria-label="Review threads"
              >
                <span
                  className="prp-btn-group__meta prp-muted"
                  title={
                    reviewFilter
                      ? `Filtered review threads (${reviewFilter}; replies excluded)`
                      : 'Review threads (replies excluded)'
                  }
                >
                  {commentIndex >= 0 ? commentIndex + 1 : 0}/{comments.length}
                </span>
                <button
                  type="button"
                  className="prp-btn-group__btn"
                  onClick={onPrevComment}
                  title="Previous thread"
                  aria-label="Previous review thread"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="prp-btn-group__btn"
                  onClick={onNextComment}
                  title="Next thread"
                  aria-label="Next review thread"
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {pending > 0 ? (
          <div className="prp-diff-toolbar__pending" role="status">
            <Button
              size="sm"
              variant="primary"
              disabled={actionBusy}
              onClick={() => onLeaveReviewAction?.('comment')}
              title="Submit pending review as comment"
            >
              Submit review
            </Button>
            <Button
              size="sm"
              variant="ok"
              disabled={actionBusy}
              onClick={() => onLeaveReviewAction?.('approve')}
              title="Approve pull request"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="warn"
              disabled={actionBusy}
              onClick={() => onLeaveReviewAction?.('request_changes')}
              title="Request changes"
            >
              Request changes
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={actionBusy}
              onClick={onDiscardPending}
              title="Discard pending review"
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
        {actionMsg ? <span className="prp-action-inline">{actionMsg}</span> : null}
      </div>
    </div>
  );
}

export default DiffToolbar;
