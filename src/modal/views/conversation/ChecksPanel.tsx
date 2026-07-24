import React, { useMemo } from 'react';
import { Badge } from '@common/Badge';
import { IconLinkExternal } from '@common/icons';
import { normalizeChecks } from '@lib/checks';
import { ChecksSummary } from './ChecksSummary';

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

  return (
    <div className={compact ? 'prp-checks prp-checks--compact' : 'prp-checks'}>
      <div className="prp-checks-summary">
        <ChecksSummary checks={normalized} label="Checks" />
      </div>
      <ul className="prp-list prp-checks-list">
        {statuses.map((s: any, i: number) => {
          const href = s.target_url || s.targetUrl || '';
          return (
            <li key={`s-${String(s.context || i)}`}>
              <Badge tone={s.state}>{s.state}</Badge>{' '}
              <span>{s.context || s.description || 'status'}</span>
              {href ? <DetailsLink href={href} /> : null}
            </li>
          );
        })}
        {runs.map((r: any, i: number) => {
          const href =
            r.html_url || r.htmlUrl || r.details_url || r.detailsUrl || '';
          return (
            <li key={`r-${String(r.id || r.name || i)}`}>
              <Badge tone={r.conclusion || r.status}>
                {r.conclusion || r.status}
              </Badge>{' '}
              <span>{r.name || r.app?.name || r.appName || 'check'}</span>
              {href ? <DetailsLink href={href} /> : null}
            </li>
          );
        })}
        {statuses.length === 0 && runs.length === 0 ? (
          <li className="prp-muted">No individual status contexts</li>
        ) : null}
      </ul>
    </div>
  );
}

export default ChecksPanel;
