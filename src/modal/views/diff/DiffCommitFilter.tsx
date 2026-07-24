import React, { useMemo, useRef, useState } from 'react';
import { SearchableSelect } from '@common/SearchableSelect';
import {
  buildCommitFilterOptions,
  diffCommitFilterToSelection,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  selectionToDiffCommitFilter,
  truncateCommitLabel,
  type DiffCommitFilter as Filter,
} from '@lib/diff-commit-filter';

type Props = {
  commits?: Array<{ sha?: string; message?: string }>;
  filter: Filter;
  onChange: (next: Filter) => void;
  loading?: boolean;
  error?: string | null;
  label?: string | null;
  disabled?: boolean;
  /** Fetch remaining commit pages when the picker opens. */
  onOpen?: (() => void) | null;
};

/**
 * Multi-checkbox SearchableSelect: 1 commit = single, 2 = range, 0 = all.
 * Options are newest-first (see buildCommitFilterOptions).
 */
export function DiffCommitFilter({
  commits,
  filter,
  onChange,
  loading = false,
  error = null,
  label = null,
  disabled = false,
  onOpen = null,
}: Props) {
  const options = useMemo(() => buildCommitFilterOptions(commits), [commits]);
  const f = normalizeDiffCommitFilter(filter);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement | null>(null);

  if (!options.length && !loading) return null;

  const busy = Boolean(loading || disabled);
  const selectOptions = useMemo(
    () =>
      options.map((o) => ({
        id: o.sha,
        label: o.label,
        keywords: [o.shortSha, o.sha, o.fullLabel],
      })),
    [options]
  );

  const initialSelectedIds = useMemo(
    () => diffCommitFilterToSelection(f, commits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.mode, f.sha, f.endSha, commits]
  );

  const trigger = (() => {
    if (isAllCommitsFilter(f)) return `All commits (${options.length})`;
    if (f.mode === 'range' && f.sha && f.endSha) {
      return truncateCommitLabel(
        label || `${String(f.sha).slice(0, 7)}…${String(f.endSha).slice(0, 7)}`,
        36
      );
    }
    return truncateCommitLabel(
      label || options.find((o) => o.sha === f.sha)?.fullLabel || 'Commits',
      36
    );
  })();

  return (
    <div className="prp-commit-filter" role="group" aria-label="Diff commits">
      <button
        type="button"
        ref={btnRef}
        className="prp-commit-filter__trigger"
        disabled={busy && !options.length}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) void onOpen?.();
            return next;
          });
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Check 1 commit for single diff, or 2 for a range"
      >
        {loading && !options.length ? 'Loading…' : trigger}
        <span aria-hidden="true"> ▾</span>
      </button>
      <SearchableSelect
        open={open}
        title={loading ? 'Commits — loading all…' : 'Commits — check 1 or 2'}
        options={selectOptions}
        query={query}
        onQuery={setQuery}
        onPick={null}
        onConfirm={(ids: string[]) => {
          onChange(selectionToDiffCommitFilter(ids, commits));
          setOpen(false);
          setQuery('');
        }}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        allowFreeText={false}
        anchorRef={btnRef}
        placement="bottom"
        multi
        initialSelectedIds={initialSelectedIds}
        confirmLabel="Apply selection"
        placeholder="Search commits by message or sha…"
        emptyLabel={loading ? 'Loading remaining commits…' : 'No matches'}
      />
      {error ? (
        <span className="prp-commit-filter__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default DiffCommitFilter;
