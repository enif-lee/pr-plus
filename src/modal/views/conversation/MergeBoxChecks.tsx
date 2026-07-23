import React, { useMemo, useState } from 'react';
import {
  buildMergeBoxCheckGroups,
  mergeBoxChecksHeadline,
} from '@lib/checks';
import {
  IconCheckCircleFill,
  IconCircleSlash,
  IconDisclosure,
  IconDotFill,
  IconSkip,
  IconXCircleFill,
} from '@common/icons';

type GroupKey = string;

function CheckOutcomeIcon({ outcome }: { outcome: string }) {
  const size = 16 as const;
  if (outcome === 'failure') {
    return (
      <IconXCircleFill
        size={size}
        className="prp-merge-checks__item-icon prp-merge-checks__item-icon--failure"
      />
    );
  }
  if (outcome === 'success') {
    return (
      <IconCheckCircleFill
        size={size}
        className="prp-merge-checks__item-icon prp-merge-checks__item-icon--success"
      />
    );
  }
  if (outcome === 'skipped') {
    return (
      <IconSkip
        size={size}
        className="prp-merge-checks__item-icon prp-merge-checks__item-icon--skipped"
      />
    );
  }
  return (
    <IconDotFill
      size={size}
      className="prp-merge-checks__item-icon prp-merge-checks__item-icon--pending"
    />
  );
}

function GroupHeaderIcon({ outcome }: { outcome: string }) {
  // Keep header lightweight; item rows carry the status glyph
  if (outcome === 'failure') return null;
  if (outcome === 'skipped') return <IconCircleSlash size={12} className="prp-merge-checks__group-glyph" />;
  return null;
}

/**
 * GitHub-style check list for the merge box:
 * grouped failing / expected / skipped / successful with collapsible sections.
 */
export function MergeBoxChecks({ checks }: { checks: any }) {
  const grouped = useMemo(
    () =>
      typeof buildMergeBoxCheckGroups === 'function'
        ? buildMergeBoxCheckGroups(checks)
        : { state: 'unknown', totalCount: 0, groups: [] },
    [checks]
  );

  // Failing + pending open by default; successful/skipped open when few items
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({});

  if (!grouped.totalCount || !grouped.groups?.length) return null;

  const headline =
    typeof mergeBoxChecksHeadline === 'function'
      ? mergeBoxChecksHeadline(grouped.state, grouped.totalCount)
      : 'Checks';

  function isGroupOpen(key: string, outcome: string, count: number) {
    if (Object.prototype.hasOwnProperty.call(open, key)) return open[key];
    if (outcome === 'failure' || outcome === 'pending') return true;
    if (outcome === 'skipped') return count <= 5;
    // success: expand when short list so it matches GitHub expanded panel
    return count <= 8;
  }

  function toggleGroup(key: string, outcome: string, count: number) {
    setOpen((prev) => ({
      ...prev,
      [key]: !isGroupOpen(key, outcome, count),
    }));
  }

  return (
    <div className="prp-merge-checks" role="region" aria-label="Status checks">
      {headline ? (
        <div className="prp-merge-checks__headline">
          {/* No status icon here — merge-box header already shows the merge status glyph */}
          <div className="prp-merge-checks__headline-copy">
            <h4 className="prp-merge-checks__title">{headline}</h4>
            <p className="prp-merge-checks__subtitle prp-muted">
              {grouped.totalCount} check{grouped.totalCount === 1 ? '' : 's'}
              {grouped.state && grouped.state !== 'unknown'
                ? ` · ${grouped.state}`
                : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="prp-merge-checks__panel">
        {grouped.groups.map((g: any) => {
          const expanded = isGroupOpen(g.key, g.outcome, g.items.length);
          return (
            <div
              key={g.key}
              className={`prp-merge-checks__group prp-merge-checks__group--${g.outcome}`}
            >
              <button
                type="button"
                className="prp-merge-checks__group-toggle"
                aria-expanded={expanded}
                onClick={() => toggleGroup(g.key, g.outcome, g.items.length)}
              >
                <IconDisclosure open={expanded} size={14} />
                <GroupHeaderIcon outcome={g.outcome} />
                <span className="prp-merge-checks__group-label">{g.label}</span>
              </button>
              {expanded ? (
                <ul className="prp-merge-checks__list">
                  {g.items.map((item: any) => (
                    <li key={item.id} className="prp-merge-checks__item">
                      <span className="prp-merge-checks__item-status" aria-hidden="true">
                        <CheckOutcomeIcon outcome={item.outcome} />
                      </span>
                      <div className="prp-merge-checks__item-body">
                        <div className="prp-merge-checks__item-main">
                          {item.url ? (
                            <a
                              className="prp-merge-checks__item-name"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.name}
                            </a>
                          ) : (
                            <span className="prp-merge-checks__item-name">{item.name}</span>
                          )}
                          {item.summary ? (
                            <span className="prp-merge-checks__item-summary prp-muted">
                              {item.summary}
                            </span>
                          ) : null}
                        </div>
                        {item.required ? (
                          <span className="prp-merge-checks__required">Required</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MergeBoxChecks;
