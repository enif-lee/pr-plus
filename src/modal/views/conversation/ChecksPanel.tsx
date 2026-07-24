import React, { useMemo } from 'react';
import { IconLinkExternal } from '@common/icons';
import { normalizeChecks } from '@lib/checks';
import { CheckOutcomeIcon } from './ChecksSummary';

/** True when checks payload has something worth showing (real contexts/runs). */
export function hasChecksData(checks: any): boolean {
  if (!checks) return false;
  const n =
    typeof normalizeChecks === 'function' ? normalizeChecks(checks) : checks;
  const statuses = n.statuses || [];
  const runs = n.checkRuns || n.check_runs || [];
  // Ignore combined-status state alone — empty repos report state:"pending".
  return statuses.length > 0 || runs.length > 0;
}

/** Map status context / check-run conclusion → icon outcome key. */
function outcomeFromCheck(stateOrConclusion: unknown): string {
  const s = String(stateOrConclusion || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  if (!s) return 'pending';
  if (
    s === 'failure' ||
    s === 'error' ||
    s === 'cancelled' ||
    s === 'timed out' ||
    s === 'action required'
  ) {
    return 'failure';
  }
  if (s === 'success' || s === 'neutral' || s === 'completed') {
    return 'success';
  }
  if (s === 'skipped' || s === 'stale') {
    return 'skipped';
  }
  // pending, queued, in progress, expected, …
  return 'pending';
}

function DetailsLink({ href }: { href: string }) {
  return (
    <a
      className="prp-checks-link prp-checks-link--icon"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Open check details"
      title="Open check details"
    >
      <IconLinkExternal size={12} className="prp-checks-link__icon" />
    </a>
  );
}

/**
 * Expanded conversation rail: per-check rows with icons only.
 * Summary stack lives in AsideCompactRail when the rail is collapsed —
 * do not render ChecksSummary here.
 */
export function ChecksPanel({ checks, compact = false }: any) {
  const normalized = useMemo(
    () =>
      typeof normalizeChecks === 'function'
        ? normalizeChecks(checks)
        : {
            state: checks?.state || 'unknown',
            statuses: checks?.statuses || [],
            checkRuns: checks?.checkRuns || checks?.check_runs || [],
            totalCount: 0,
          },
    [checks]
  );
  if (!hasChecksData(normalized)) return null;
  const statuses = normalized.statuses || [];
  const runs = normalized.checkRuns || [];
  const hasRows = statuses.length > 0 || runs.length > 0;

  return (
    <div className={compact ? 'prp-checks prp-checks--compact' : 'prp-checks'}>
      {hasRows ? (
        <ul className="prp-list prp-checks-list">
          {statuses.map((s: any, i: number) => {
            const href = s.target_url || s.targetUrl || '';
            const outcome = outcomeFromCheck(s.state);
            const label = String(s.state || outcome);
            return (
              <li
                key={`s-${String(s.context || i)}`}
                className="prp-checks-list__row"
              >
                <span
                  className="prp-checks-list__icon"
                  title={label}
                  aria-label={label}
                >
                  <CheckOutcomeIcon outcome={outcome} size={14} />
                </span>
                <span className="prp-checks-list__name">
                  {s.context || s.description || 'status'}
                </span>
                {href ? <DetailsLink href={href} /> : null}
              </li>
            );
          })}
          {runs.map((r: any, i: number) => {
            const href =
              r.html_url || r.htmlUrl || r.details_url || r.detailsUrl || '';
            const outcome = outcomeFromCheck(r.conclusion || r.status);
            const label = String(r.conclusion || r.status || outcome);
            return (
              <li
                key={`r-${String(r.id || r.name || i)}`}
                className="prp-checks-list__row"
              >
                <span
                  className="prp-checks-list__icon"
                  title={label}
                  aria-label={label}
                >
                  <CheckOutcomeIcon outcome={outcome} size={14} />
                </span>
                <span className="prp-checks-list__name">
                  {r.name || r.app?.name || r.appName || 'check'}
                </span>
                {href ? <DetailsLink href={href} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="prp-muted">
          {normalized.state ? String(normalized.state) : 'No individual checks'}
        </span>
      )}
    </div>
  );
}

export default ChecksPanel;
