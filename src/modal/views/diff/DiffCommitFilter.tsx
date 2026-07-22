import React, { useMemo } from 'react';
import {
  buildCommitFilterOptions,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
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
};

/**
 * Diff toolbar: filter files by one commit or an inclusive commit range.
 */
export function DiffCommitFilter({
  commits,
  filter,
  onChange,
  loading = false,
  error = null,
  label = null,
  disabled = false,
}: Props) {
  const options = useMemo(() => buildCommitFilterOptions(commits), [commits]);
  const f = normalizeDiffCommitFilter(filter);
  const rangeMode = f.mode === 'range';
  const singleValue = f.mode === 'single' && f.sha ? f.sha : 'all';
  const fromValue = f.mode === 'range' && f.sha ? f.sha : options[options.length - 1]?.sha || '';
  const toValue = f.mode === 'range' && f.endSha ? f.endSha : options[0]?.sha || '';

  if (!options.length) return null;

  const busy = Boolean(loading || disabled);

  return (
    <div className="prp-commit-filter" role="group" aria-label="Diff commits">
      <label className="prp-commit-filter__range-toggle">
        <input
          type="checkbox"
          checked={rangeMode}
          disabled={busy}
          onChange={(e) => {
            if (e.target.checked) {
              const start = options[options.length - 1]?.sha || options[0]?.sha;
              const end = options[0]?.sha || start;
              if (start && end) onChange({ mode: 'range', sha: start, endSha: end });
            } else {
              onChange({ mode: 'all' });
            }
          }}
        />
        Range
      </label>

      {!rangeMode ? (
        <select
          className="prp-commit-filter__select"
          value={singleValue}
          disabled={busy}
          aria-label="Show changes for commit"
          title="Show all PR changes or a single commit"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'all') onChange({ mode: 'all' });
            else onChange({ mode: 'single', sha: v });
          }}
        >
          <option value="all">All commits ({options.length})</option>
          {options.map((o) => (
            <option key={o.sha} value={o.sha}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="prp-commit-filter__range">
          <select
            className="prp-commit-filter__select"
            value={fromValue}
            disabled={busy}
            aria-label="Range start commit"
            title="First commit in range (inclusive)"
            onChange={(e) => {
              const start = e.target.value;
              const end = toValue || start;
              onChange({ mode: 'range', sha: start, endSha: end });
            }}
          >
            {/* chronological for "from": oldest → newest */}
            {[...options].reverse().map((o) => (
              <option key={`from-${o.sha}`} value={o.sha}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="prp-commit-filter__arrow" aria-hidden="true">
            →
          </span>
          <select
            className="prp-commit-filter__select"
            value={toValue}
            disabled={busy}
            aria-label="Range end commit"
            title="Last commit in range (inclusive)"
            onChange={(e) => {
              const end = e.target.value;
              const start = fromValue || end;
              onChange({ mode: 'range', sha: start, endSha: end });
            }}
          >
            {options.map((o) => (
              <option key={`to-${o.sha}`} value={o.sha}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? <span className="prp-commit-filter__status">Loading…</span> : null}
      {!loading && !isAllCommitsFilter(f) && label ? (
        <span className="prp-commit-filter__status" title={label}>
          {label}
        </span>
      ) : null}
      {error ? (
        <span className="prp-commit-filter__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default DiffCommitFilter;
