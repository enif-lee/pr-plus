import React, { useMemo, useState } from 'react';
import { filterTagsByQuery } from '@lib/aside-lists';
import { githubTreeUrl } from '@lib/ui-polish';

/**
 * Tags whose commit sha is among the PR commits / head.
 */
export function AsideTagsList({
  tags = [],
  owner,
  repo,
  loading = false,
  error = null,
}: {
  tags?: Array<{ name?: string; sha?: string }>;
  owner?: string;
  repo?: string;
  loading?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => filterTagsByQuery(tags, query),
    [tags, query]
  );

  // Loading state is shown on AsideSection title spinner — keep body quiet.
  if (loading && !tags.length) {
    return null;
  }
  if (error && !tags.length) {
    return <div className="prp-muted">{error}</div>;
  }

  return (
    <>
      <input
        type="search"
        className="prp-aside-search"
        placeholder="Search tags…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search tags"
      />
      {!filtered.length ? (
        <div className="prp-muted">
          {query.trim()
            ? 'No matching tags'
            : 'No tags point at this PR’s commits'}
        </div>
      ) : (
        <ul className="prp-list prp-aside-tags">
          {filtered.map((t) => {
            const name = String(t.name || '').trim();
            const sha = String(t.sha || '').trim();
            const short = sha ? sha.slice(0, 7) : '';
            const href =
              name && owner && repo ? githubTreeUrl(owner, repo, name) : '';
            return (
              <li key={name || sha} className="prp-aside-tags__item">
                {href ? (
                  <a
                    className="prp-entity-link"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code className="prp-aside-tags__name">{name}</code>
                  </a>
                ) : (
                  <code className="prp-aside-tags__name">{name}</code>
                )}
                {short ? (
                  <span className="prp-muted prp-aside-tags__sha">{short}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default AsideTagsList;
