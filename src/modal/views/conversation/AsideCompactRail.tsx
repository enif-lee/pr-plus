import React, { useMemo } from 'react';
import { Avatar } from '@common/Avatar';
import { TipPopover } from '@common/TipPopover';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import { reviewStatusTone } from '@common/utils';
import { hasChecksData } from './ChecksPanel';
import { ChecksSummary } from './ChecksSummary';

/**
 * Avatar stack visibility:
 * - 1–4 people: show all
 * - 5+: show first 3, then a +N circle for the rest (merges overflow from the 4th on)
 */
const MAX_FULL_STACK = 4;
const MAX_WHEN_OVERFLOW = 3;

function formatReviewStatus(status: unknown): string {
  const s = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  if (!s) return 'No review';
  if (s === 'APPROVED') return 'Approved';
  if (s === 'CHANGES_REQUESTED') return 'Changes requested';
  if (s === 'PENDING' || s === 'REVIEW_REQUIRED') return 'Pending review';
  if (s === 'COMMENTED') return 'Commented';
  if (s === 'DISMISSED') return 'Dismissed';
  return String(status);
}

type StackPerson = {
  login: string;
  avatarUrl?: string | null;
  status?: string | null;
  tip: string;
  tone?: string;
};

function AvatarStack({
  people,
  emptyLabel,
  withStatusRing,
}: {
  people: StackPerson[];
  emptyLabel: string;
  withStatusRing?: boolean;
}) {
  if (!people.length) {
    return (
      <div
        className="prp-aside-compact__stack prp-aside-compact__stack--empty prp-has-tip"
        tabIndex={0}
      >
        <span className="prp-aside-compact__empty-dot" aria-hidden="true" />
        <TipPopover title={emptyLabel} />
      </div>
    );
  }
  const showAll = people.length <= MAX_FULL_STACK;
  const shown = showAll
    ? people
    : people.slice(0, MAX_WHEN_OVERFLOW);
  const extra = people.length - shown.length;
  return (
    <div className="prp-aside-compact__stack" role="list">
      {shown.map((u, i) => {
        const tone = withStatusRing
          ? u.tone || reviewStatusTone(u.status)
          : null;
        return (
          <span
            key={String(u.login).toLowerCase()}
            className={[
              'prp-aside-compact__avatar-wrap',
              'prp-has-tip',
              tone ? `prp-aside-compact__avatar-wrap--${tone}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ zIndex: i + 1 }}
            role="listitem"
            tabIndex={0}
          >
            <Avatar
              login={u.login}
              avatarUrl={u.avatarUrl}
              size="sm"
              title={undefined}
            />
            <TipPopover title={u.tip} />
          </span>
        );
      })}
      {extra > 0 ? (
        <span
          className="prp-aside-compact__more-circle prp-has-tip"
          tabIndex={0}
          role="listitem"
          style={{ zIndex: shown.length + 1 }}
          aria-label={`+${extra} more`}
        >
          <span className="prp-aside-compact__more-circle__txt">+{extra}</span>
          <TipPopover
            title={people
              .slice(shown.length)
              .map((p) => p.tip)
              .join('\n')}
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Collapsed right-rail: full section labels + overlapping avatars / status.
 * Hover popovers show identity + review/check state.
 */
export function AsideCompactRail({ detail }: { detail: any }) {
  const avatars =
    detail?.avatarUrls && typeof detail.avatarUrls === 'object'
      ? detail.avatarUrls
      : {};

  const reviewers = useMemo(() => {
    const rows =
      typeof buildUnifiedReviewerRows === 'function'
        ? buildUnifiedReviewerRows(detail || {})
        : (detail?.requestedReviewers || []).map((login: string) => ({
            login,
            status: 'PENDING',
          }));
    return (rows || [])
      .map((row: any) => {
        const login = typeof row === 'string' ? row : row?.login;
        if (!login) return null;
        const status = typeof row === 'object' ? row.status : null;
        const avatarUrl =
          (typeof row === 'object' && (row.avatarUrl || row.avatar_url)) ||
          avatars[String(login).toLowerCase()] ||
          null;
        const statusLabel = formatReviewStatus(status);
        return {
          login: String(login),
          avatarUrl,
          status,
          tone: reviewStatusTone(status),
          tip: status ? `${login} · ${statusLabel}` : String(login),
        } as StackPerson;
      })
      .filter(Boolean) as StackPerson[];
  }, [detail, avatars]);

  const assignees = useMemo(() => {
    return (detail?.assignees || [])
      .map((login: string) => {
        if (!login) return null;
        return {
          login: String(login),
          avatarUrl: avatars[String(login).toLowerCase()] || null,
          tip: String(login),
        } as StackPerson;
      })
      .filter(Boolean) as StackPerson[];
  }, [detail?.assignees, avatars]);

  const showChecks = hasChecksData(detail?.checks);

  const labels = Array.isArray(detail?.labels) ? detail.labels : [];
  const labelItems = labels.slice(0, 8).map((l: any, i: number) => {
    const name = String(l?.name || l || '');
    const color = String(l?.color || '').replace(/^#/, '');
    const bg = /^[0-9a-fA-F]{3,8}$/.test(color) ? `#${color}` : 'var(--prp-border)';
    return { key: name || String(i), name, bg };
  });

  const commitN = Array.isArray(detail?.commits) ? detail.commits.length : 0;
  const fileN =
    detail?.changedFiles ??
    (Array.isArray(detail?.files) ? detail.files.length : 0);

  return (
    <div className="prp-aside-compact" aria-label="Pull request metadata (compact)">
      <section className="prp-aside-compact__group" aria-label="Reviewers">
        <h3 className="prp-aside-compact__label">Reviewers</h3>
        <AvatarStack
          people={reviewers}
          emptyLabel="No reviewers yet"
          withStatusRing
        />
      </section>

      <section className="prp-aside-compact__group" aria-label="Assignees">
        <h3 className="prp-aside-compact__label">Assignees</h3>
        <AvatarStack people={assignees} emptyLabel="No assignees" />
      </section>

      {showChecks ? (
        <section className="prp-aside-compact__group" aria-label="Checks">
          <h3 className="prp-aside-compact__label">Checks</h3>
          <ChecksSummary
            checks={detail.checks}
            showLabel={false}
            className="prp-aside-compact__check"
            size={16}
          />
        </section>
      ) : null}

      {labelItems.length ? (
        <section className="prp-aside-compact__group" aria-label="Labels">
          <h3 className="prp-aside-compact__label">Labels</h3>
          <div className="prp-aside-compact__labels">
            {labelItems.map((l) => (
              <span
                key={l.key}
                className="prp-aside-compact__label-dot prp-has-tip"
                style={{ background: l.bg }}
                tabIndex={0}
              >
                <TipPopover title={l.name || 'Label'} />
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {detail?.milestone ? (
        <section className="prp-aside-compact__group" aria-label="Milestone">
          <h3 className="prp-aside-compact__label">Milestone</h3>
          <span
            className="prp-aside-compact__pill prp-has-tip"
            tabIndex={0}
          >
            #{detail.milestone.number ?? '—'}
            <TipPopover
              title={
                detail.milestone.title
                  ? `${detail.milestone.title} (#${detail.milestone.number ?? '—'})`
                  : `Milestone #${detail.milestone.number ?? '—'}`
              }
            />
          </span>
        </section>
      ) : null}

      {(commitN > 0 || fileN > 0) && (
        <section
          className="prp-aside-compact__group prp-aside-compact__group--counts"
          aria-label="Counts"
        >
          {commitN > 0 ? (
            <span className="prp-aside-compact__count prp-has-tip" tabIndex={0}>
              {commitN}
              <span className="prp-aside-compact__count-unit"> commits</span>
              <TipPopover title={`${commitN} commit${commitN === 1 ? '' : 's'}`} />
            </span>
          ) : null}
          {fileN > 0 ? (
            <span className="prp-aside-compact__count prp-has-tip" tabIndex={0}>
              {fileN}
              <span className="prp-aside-compact__count-unit"> files</span>
              <TipPopover title={`${fileN} file${fileN === 1 ? '' : 's'}`} />
            </span>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default AsideCompactRail;
