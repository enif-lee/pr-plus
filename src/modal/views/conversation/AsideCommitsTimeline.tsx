import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatWhen } from '@common/utils';
import { githubCommitUrl } from '@lib/ui-polish';
import {
  filterCommitsByQuery,
  takeCommitsForTimeline,
} from '@lib/aside-lists';

const DEFAULT_CAP = 12;

export function AsideCommitsTimeline({
  commits,
  owner,
  repo,
  /** True when more commits may exist on the server than are loaded. */
  mayHaveMore = false,
  loadingMore = false,
  /** Fetch remaining pages when search / more needs full data. */
  onEnsureAll = null,
}: {
  commits?: any[];
  owner?: string;
  repo?: string;
  mayHaveMore?: boolean;
  loadingMore?: boolean;
  onEnsureAll?: (() => void | Promise<void>) | null;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const ensureTriedRef = useRef('');

  const filtered = useMemo(
    () => filterCommitsByQuery(commits || [], query),
    [commits, query]
  );

  const cap = showAll || query.trim() ? 5000 : DEFAULT_CAP;
  const { items, truncated, total } = useMemo(
    () => takeCommitsForTimeline(filtered, cap),
    [filtered, cap]
  );

  // Typing with incomplete server data → load remaining pages.
  useEffect(() => {
    const q = query.trim();
    if (!q || !mayHaveMore || typeof onEnsureAll !== 'function') return;
    if (ensureTriedRef.current === q) return;
    ensureTriedRef.current = q;
    void onEnsureAll();
  }, [query, mayHaveMore, onEnsureAll]);

  function onMoreClick() {
    if (mayHaveMore && typeof onEnsureAll === 'function') {
      void onEnsureAll();
    }
    setShowAll(true);
  }

  const overflowFromCap = !showAll && !query.trim() && truncated > 0;
  const showMore =
    overflowFromCap || (mayHaveMore && !loadingMore) || loadingMore;

  return (
    <>
      <input
        type="search"
        className="prp-aside-search"
        placeholder="Search commits…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search commits"
      />
      {!items.length ? (
        loadingMore && !query.trim() ? null : (
          <div className="prp-muted">
            {query.trim()
              ? loadingMore
                ? 'Loading commits…'
                : 'No matching commits'
              : 'No commits'}
          </div>
        )
      ) : (
        <div className="prp-commit-timeline-scroll">
          <ol className="prp-commit-timeline">
            {items.map((c, idx) => {
              const commitHref =
                c.sha && owner && repo
                  ? githubCommitUrl(owner, repo, c.sha)
                  : '';
              return (
                <li
                  key={c.key}
                  className={`prp-commit-timeline__item${
                    idx === items.length - 1
                      ? ' prp-commit-timeline__item--last'
                      : ''
                  }`}
                >
                  <span className="prp-commit-timeline__dot" aria-hidden="true" />
                  <div className="prp-commit-timeline__body">
                    <div
                      className="prp-commit-timeline__msg"
                      title={c.fullMessage || c.message}
                    >
                      {c.message}
                    </div>
                    <div className="prp-commit-timeline__meta">
                      {commitHref ? (
                        <a
                          className="prp-commit-timeline__sha prp-entity-link prp-entity-link--ref"
                          href={commitHref}
                          target="_blank"
                          rel="noreferrer"
                          title={`View ${c.shortSha} on GitHub`}
                        >
                          <code>{c.shortSha}</code>
                        </a>
                      ) : (
                        <code className="prp-commit-timeline__sha">
                          {c.shortSha}
                        </code>
                      )}
                      {c.author ? <span>{c.author}</span> : null}
                      {c.at ? <span>{formatWhen(c.at)}</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {showMore ? (
        <button
          type="button"
          className="prp-aside-overflow prp-aside-overflow--btn"
          disabled={loadingMore}
          onClick={onMoreClick}
        >
          {loadingMore
            ? 'Loading…'
            : mayHaveMore
              ? overflowFromCap
                ? `+${truncated} more… · load all`
                : 'Load all commits…'
              : `+${truncated} more… · ${total} commits total`}
        </button>
      ) : null}
    </>
  );
}
