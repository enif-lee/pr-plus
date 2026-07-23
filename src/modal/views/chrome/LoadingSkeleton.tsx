import React from 'react';

/**
 * Layout-faithful loading placeholders.
 * Mirrors conversation (main + aside cards) or diff (tree + pane chrome)
 * so header stats/actions and body regions don't jump when content arrives.
 */
export function LoadingSkeleton({ variant = 'conversation' }: { variant?: 'conversation' | 'diff' }) {
  const isDiff = variant === 'diff';

  if (isDiff) {
    return (
      <div className="prp-skeleton prp-skeleton--diff" aria-busy="true" aria-label="Loading pull request">
        <div className="prp-skeleton-diff">
          <aside className="prp-skeleton-diff__tree" aria-hidden="true">
            <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w60" />
            <div className="prp-skeleton__chip-row">
              <span className="prp-skeleton__chip" />
              <span className="prp-skeleton__chip prp-skeleton__chip--sm" />
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="prp-skeleton__row prp-skeleton__row--file" style={{ width: `${70 - (i % 3) * 8}%` }} />
            ))}
          </aside>
          <div className="prp-skeleton-diff__pane">
            <div className="prp-skeleton-diff__chrome">
              <span className="prp-skeleton__chip" />
              <span className="prp-skeleton__chip prp-skeleton__chip--sm" />
              <span className="prp-skeleton__chip prp-skeleton__chip--sm" />
            </div>
            <div className="prp-skeleton-diff__toolbar">
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w40" />
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
            </div>
            <div className="prp-skeleton-diff__lines">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                <div key={i} className="prp-skeleton-diff__line">
                  <span className="prp-skeleton__gutter" />
                  <span
                    className="prp-skeleton__row prp-skeleton__row--code"
                    style={{ width: `${45 + ((i * 17) % 40)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="prp-skeleton prp-skeleton--conversation"
      aria-busy="true"
      aria-label="Loading pull request"
    >
      <div className="prp-skeleton-conversation">
        <div className="prp-skeleton-conversation__main">
          <div className="prp-skeleton-card">
            <div className="prp-skeleton-card__head">
              <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w30" />
              <span className="prp-skeleton__chip prp-skeleton__chip--icon" />
            </div>
            <div className="prp-skeleton-card__body">
              <div className="prp-skeleton__row prp-skeleton__row--md" />
              <div className="prp-skeleton__row prp-skeleton__row--md prp-skeleton__row--w70" />
              <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w50" />
            </div>
          </div>
          <div className="prp-skeleton-card">
            <div className="prp-skeleton-card__head">
              <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w40" />
            </div>
            <div className="prp-skeleton-card__body">
              {[0, 1, 2].map((i) => (
                <div key={i} className="prp-skeleton-feed-item">
                  <span className="prp-skeleton__avatar" />
                  <div className="prp-skeleton-feed-item__body">
                    <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w35" />
                    <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w80" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="prp-skeleton-card prp-skeleton-card--merge">
            <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w25" />
            <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w55" />
            <div className="prp-skeleton__chip-row">
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
            </div>
          </div>
          <div className="prp-skeleton-card">
            <div className="prp-skeleton-card__head">
              <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w30" />
            </div>
            <div className="prp-skeleton-card__body">
              <div className="prp-skeleton__block prp-skeleton__block--composer" />
              <div className="prp-skeleton__chip-row">
                <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
                <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
                <span className="prp-skeleton__chip prp-skeleton__chip--btn" />
              </div>
            </div>
          </div>
        </div>
        <aside className="prp-skeleton-conversation__aside">
          {['Reviewers', 'Assignees', 'Labels', 'Milestone', 'Checks', 'Commits', 'Files'].map(
            (label) => (
              <div key={label} className="prp-skeleton-card prp-skeleton-card--aside">
                <div className="prp-skeleton-card__head">
                  <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w45" />
                </div>
                <div className="prp-skeleton-card__body prp-skeleton-card__body--tight">
                  <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w70" />
                  <div className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w50" />
                  <span className="prp-skeleton__link" />
                </div>
              </div>
            )
          )}
        </aside>
      </div>
    </div>
  );
}

export default LoadingSkeleton;
