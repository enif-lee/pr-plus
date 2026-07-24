import React, { useEffect, useMemo, useState } from 'react';
import { formatWhen } from '@common/utils';
import { githubCommitUrl } from '@lib/ui-polish';
import { takeCommitsForTimeline } from '@lib/aside-lists';
import {
  filterCommitsByQuery,
  needsFullCorpusLoad,
} from '@lib/create-and-apply';

export function AsideCommitsTimeline({
  commits,
  owner,
  repo,
  onEnsureAllCommits = null,
  commitsFullyLoaded = false,
  loadingAll = false,
}: any) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = query.trim();
  const filtered = useMemo(
    () =>
      typeof filterCommitsByQuery === 'function'
        ? filterCommitsByQuery(commits, q)
        : commits || [],
    [commits, q]
  );

  const { items, truncated, total } = useMemo(() => {
    if (showAll || q) {
      // Full filtered list when searching or after Load more
      const list = Array.isArray(filtered) ? [...filtered].reverse() : [];
      return {
        items: list.map((c: any, i: number) => {
          const fullMsg = String(c.message || '').trim();
          const firstLine = fullMsg.split('\n')[0] || '(no message)';
          const shortMessage =
            firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
          const sha = String(c.sha || '');
          return {
            key: sha || `commit-${i}`,
            sha,
            shortSha: sha ? sha.slice(0, 7) : '-------',
            message: shortMessage,
            fullMessage: fullMsg,
            author: c.author || '',
            at: c.date || c.committedAt || c.authoredAt || '',
          };
        }),
        total: list.length,
        truncated: 0,
      };
    }
    return takeCommitsForTimeline(filtered, 12);
  }, [filtered, showAll, q]);

  async function ensureFull(reason: 'search' | 'loadMore') {
    const need =
      typeof needsFullCorpusLoad === 'function'
        ? needsFullCorpusLoad({
            query: reason === 'search' ? q : '',
            loadMore: reason === 'loadMore',
            fullyLoaded: commitsFullyLoaded,
          })
        : !commitsFullyLoaded;
    if (!need || typeof onEnsureAllCommits !== 'function') return;
    setBusy(true);
    try {
      await onEnsureAllCommits();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!q) return;
    void ensureFull('search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!items.length && !q && !(commits || []).length) {
    return <div className="prp-muted">No commits</div>;
  }

  return (
    <>
      <div className="prp-aside-search">
        <input
          className="prp-aside-search__input"
          type="search"
          placeholder="Search commits…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search commits"
        />
      </div>
      {!items.length ? (
        <div className="prp-muted">No matching commits</div>
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
                  <span
                    className="prp-commit-timeline__dot"
                    aria-hidden="true"
                  />
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
      {truncated > 0 && !q ? (
        <div className="prp-aside-overflow">
          <button
            type="button"
            className="prp-add-link"
            disabled={busy || loadingAll}
            onClick={() => {
              setShowAll(true);
              void ensureFull('loadMore');
            }}
          >
            {busy || loadingAll
              ? 'Loading…'
              : `Load more (+${truncated} · ${total} total)`}
          </button>
        </div>
      ) : null}
      {q && !commitsFullyLoaded && (busy || loadingAll) ? (
        <div className="prp-muted prp-aside-overflow">Loading all commits…</div>
      ) : null}
    </>
  );
}
