import React from 'react';
import { Badge } from '@common/Badge';

/** True when checks payload has something worth showing. */
export function hasChecksData(checks: any): boolean {
  if (!checks) return false;
  if (checks.state && checks.state !== 'pending' && checks.state !== 'unknown') return true;
  const statuses = checks.statuses || [];
  const runs = checks.checkRuns || checks.check_runs || [];
  return statuses.length > 0 || runs.length > 0 || Boolean(checks.state);
}

export function ChecksPanel({ checks, compact = false }: any) {
  if (!hasChecksData(checks)) return null;
  const statuses = checks.statuses || [];
  const runs = checks.checkRuns || checks.check_runs || [];
  const tone =
    checks.state === 'success' || checks.state === 'SUCCESS'
      ? 'ok'
      : checks.state === 'failure' || checks.state === 'FAILURE' || checks.state === 'error'
        ? 'danger'
        : 'warn';

  return (
    <div className={compact ? 'prp-checks prp-checks--compact' : 'prp-checks'}>
      <div className="prp-checks-summary">
        Overall:{' '}
        <Badge tone={tone}>{checks.state || 'unknown'}</Badge>
        {statuses.length || runs.length ? (
          <span className="prp-muted">
            {' '}
            · {statuses.length + runs.length} context
            {statuses.length + runs.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <ul className="prp-list prp-checks-list">
        {statuses.map((s: any, i: number) => (
          <li key={`s-${i}`}>
            <Badge tone={s.state}>{s.state}</Badge>{' '}
            <span>{s.context || s.description || 'status'}</span>
            {s.target_url || s.targetUrl ? (
              <a
                className="prp-checks-link"
                href={s.target_url || s.targetUrl}
                target="_blank"
                rel="noreferrer"
              >
                details
              </a>
            ) : null}
          </li>
        ))}
        {runs.map((r: any, i: number) => (
          <li key={`r-${i}`}>
            <Badge tone={r.conclusion || r.status}>{r.conclusion || r.status}</Badge>{' '}
            <span>{r.name || r.app?.name || 'check'}</span>
            {r.html_url || r.details_url || r.detailsUrl ? (
              <a
                className="prp-checks-link"
                href={r.html_url || r.details_url || r.detailsUrl}
                target="_blank"
                rel="noreferrer"
              >
                details
              </a>
            ) : null}
          </li>
        ))}
        {statuses.length === 0 && runs.length === 0 ? (
          <li className="prp-muted">No individual status contexts</li>
        ) : null}
      </ul>
    </div>
  );
}

export default ChecksPanel;
