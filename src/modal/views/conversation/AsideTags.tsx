import React, { useEffect, useState } from 'react';
import { tagsIntersectingCommits } from '@lib/create-and-apply';
import { githubCommitUrl } from '@lib/ui-polish';

/**
 * Lazy Tags aside: fetch repo tags and show those that point at PR commits.
 */
export function AsideTags({
  owner,
  repo,
  commits = [],
  active = false,
}: {
  owner?: string;
  repo?: string;
  commits?: any[];
  /** When true, kick off lazy load (section open). */
  active?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<Array<{ name: string; sha: string }> | null>(
    null
  );
  const [loadedKey, setLoadedKey] = useState('');

  const key = `${owner || ''}/${repo || ''}`;

  useEffect(() => {
    if (!active || !owner || !repo) return;
    if (tags && loadedKey === key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const api = globalThis.PRTreeFetch;
        if (typeof api?.fetchRepoTags !== 'function') {
          throw new Error('Tags API unavailable');
        }
        const list = await api.fetchRepoTags(owner, repo);
        if (cancelled) return;
        setTags(Array.isArray(list) ? list : []);
        setLoadedKey(key);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || String(err));
        setTags([]);
        setLoadedKey(key);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, owner, repo, key, tags, loadedKey]);

  if (!active && tags == null) {
    return <div className="prp-muted">Open to load tags…</div>;
  }
  if (loading && tags == null) {
    return <div className="prp-muted">Loading tags…</div>;
  }
  if (error && !(tags && tags.length)) {
    return <div className="prp-muted">Tags unavailable: {error}</div>;
  }

  const matched =
    typeof tagsIntersectingCommits === 'function'
      ? tagsIntersectingCommits(tags || [], commits)
      : [];

  if (!matched.length) {
    return (
      <div className="prp-muted">
        No tags on this PR’s commits
        {(commits || []).length ? '' : ' (no commits loaded yet)'}
      </div>
    );
  }

  return (
    <ul className="prp-list prp-aside-tags">
      {matched.map((t) => {
        const href =
          owner && repo && t.sha
            ? githubCommitUrl(owner, repo, t.sha)
            : '';
        return (
          <li key={t.name} className="prp-aside-tags__item">
            <span className="prp-aside-tags__name" title={t.name}>
              {t.name}
            </span>
            {href ? (
              <a
                className="prp-mono prp-entity-link prp-aside-tags__sha"
                href={href}
                target="_blank"
                rel="noreferrer"
                title={t.sha}
              >
                {t.sha.slice(0, 7)}
              </a>
            ) : (
              <code className="prp-mono prp-aside-tags__sha">
                {t.sha.slice(0, 7)}
              </code>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default AsideTags;
