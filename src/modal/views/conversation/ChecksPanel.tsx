import React, { useMemo } from 'react';
import { Badge } from '@common/Badge';
import { normalizeChecks } from '@lib/checks';

/** True when checks payload has something worth showing. */
export function hasChecksData(checks: any): boolean {
  if (!checks) return false;
  const n =
    typeof normalizeChecks === 'function' ? normalizeChecks(checks) : checks;
  if (n.state && n.state !== 'pending' && n.state !== 'unknown') return true;
  const statuses = n.statuses || [];
  const runs = n.checkRuns || n.check_runs || [];
  return statuses.length > 0 || runs.length > 0 || Boolean(n.state);
}

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
  const state = String(normalized.state || 'unknown');
  const tone =
    state === 'success' || state === 'SUCCESS'
      ? 'ok'
      : state === 'failure' || state === 'FAILURE' || state === 'error'
        ? 'danger'
        : 'warn';

  return (
    <div className={compact ? 'prp-checks prp-checks--compact' : 'prp-checks'}>
      <div className="prp-checks-summary">
        Overall:{' '}
        <Badge tone={tone}>{state}</Badge>
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
          <li key={`s-${String(s.context || i)}`}>
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
          <li key={`r-${String(r.id || r.name || i)}`}>
            <Badge tone={r.conclusion || r.status}>{r.conclusion || r.status}</Badge>{' '}
            <span>{r.name || r.app?.name || r.appName || 'check'}</span>
            {r.html_url || r.htmlUrl || r.details_url || r.detailsUrl ? (
              <a
                className="prp-checks-link"
                href={r.html_url || r.htmlUrl || r.details_url || r.detailsUrl}
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
