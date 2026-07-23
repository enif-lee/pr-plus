import React, { useMemo } from 'react';
import { formatWhen } from '@common/utils';
import { githubCommitUrl } from '@lib/ui-polish';
import { takeCommitsForTimeline } from '@lib/aside-lists';

export function AsideCommitsTimeline({ commits, owner, repo }: any) {
  const { items, truncated, total } = useMemo(
    () => takeCommitsForTimeline(commits, 12),
    [commits]
  );
  if (!items.length) {
    return <div className="prp-muted">No commits</div>;
  }
  return (
    <>
      {/* Scroll on outer wrapper so the rail (::before) spans full content height */}
      <div className="prp-commit-timeline-scroll">
        <ol className="prp-commit-timeline">
          {items.map((c, idx) => {
            const commitHref =
              c.sha && owner && repo ? githubCommitUrl(owner, repo, c.sha) : '';
            return (
              <li
                key={c.key}
                className={`prp-commit-timeline__item${
                  idx === items.length - 1 ? ' prp-commit-timeline__item--last' : ''
                }`}
              >
                <span className="prp-commit-timeline__dot" aria-hidden="true" />
                <div className="prp-commit-timeline__body">
                  <div className="prp-commit-timeline__msg" title={c.fullMessage || c.message}>
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
                      <code className="prp-commit-timeline__sha">{c.shortSha}</code>
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
      {truncated > 0 ? (
        <div className="prp-aside-overflow">
          +{truncated} more · {total} commits total
        </div>
      ) : null}
    </>
  );
}
