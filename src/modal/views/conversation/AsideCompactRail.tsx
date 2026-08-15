import React, { useMemo } from 'react';
import { useT } from '@lib/locale-context';
import { Avatar } from '@common/Avatar';
import { TipPopover } from '@common/TipPopover';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import { reviewStatusTone } from '@common/utils';
import { hasChecksData } from './ChecksPanel';
import { buildCheckStackGroups, ChecksSummary } from './ChecksSummary';
import '../../components/common/AvatarStack.css';

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
  withStatusRing,
}: {
  people: StackPerson[];
  withStatusRing?: boolean;
}) {
  if (!people.length) return null;
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

const TAG_COMPACT_MAX = 4;

function shortTagLabel(name: string, max = 10): string {
  const raw = String(name || '').trim();
  if (!raw) return 'tag';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Collapsed right-rail: full section labels + overlapping avatars / status.
 * Hover popovers show identity + review/check/tag/milestone state.
 * Empty groups are omitted (same as expanded rail empty states).
 */
export function AsideCompactRail({
  detail,
  tags = null,
}: {
  detail: any;
  /** PR-related git tags (sha matches PR commits / head). */
  tags?: Array<{ name?: string; sha?: string }> | null;
}) {
  const t = useT();
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

  // Only show Checks when there is a non-empty outcome stack (hide empty shell).
  const checkGroups = useMemo(
    () =>
      hasChecksData(detail?.checks)
        ? buildCheckStackGroups(detail.checks)
        : [],
    [detail?.checks]
  );
  const showChecks = checkGroups.length > 0;

  const labels = Array.isArray(detail?.labels) ? detail.labels : [];
  const labelItems = labels.slice(0, 8).map((l: any, i: number) => {
    const name = String(l?.name || l || '');
    const color = String(l?.color || '').replace(/^#/, '');
    const bg = /^[0-9a-fA-F]{3,8}$/.test(color) ? `#${color}` : 'var(--prp-border)';
    return { key: name || String(i), name, bg };
  });

  const milestone = detail?.milestone || null;
  const showMilestone = Boolean(
    milestone && (milestone.number != null || milestone.title)
  );

  const projectItems = useMemo(() => {
    const list = Array.isArray(detail?.projects) ? detail.projects : [];
    return list
      .map((p: any, i: number) => {
        const title = String(p?.title || '').trim();
        if (!title) return null;
        return {
          key: String(p?.id || title || i),
          title,
          short: shortTagLabel(title, 12),
          tip:
            p?.number != null
              ? `${title} (#${p.number})`
              : title,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      title: string;
      short: string;
      tip: string;
    }>;
  }, [detail?.projects]);

  const developmentItems = useMemo(() => {
    const raw =
      Array.isArray(detail?.developmentIssues) && detail.developmentIssues.length
        ? detail.developmentIssues
        : (detail?.linkedIssues || []).map((n: number) => ({
            number: n,
            title: '',
          }));
    return raw
      .map((item: any) => {
        const num = Number(item?.number);
        if (!Number.isFinite(num) || num <= 0) return null;
        const title = String(item?.title || '').trim();
        const shortTitle = title
          ? title.length > 28
            ? `${title.slice(0, 27)}…`
            : title
          : '';
        return {
          key: String(num),
          number: num,
          tip: title ? `#${num} · ${title}` : `#${num}`,
          label: shortTitle ? `#${num} ${shortTitle}` : `#${num}`,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      number: number;
      tip: string;
      label: string;
    }>;
  }, [detail?.developmentIssues, detail?.linkedIssues]);

  const tagItems = useMemo(() => {
    const list = Array.isArray(tags) ? tags : [];
    return list
      .map((t, i) => {
        const name = String(t?.name || '').trim();
        if (!name) return null;
        const sha = String(t?.sha || '').trim();
        const shortSha = sha ? sha.slice(0, 7) : '';
        return {
          key: name || String(i),
          name,
          short: shortTagLabel(name),
          tip: shortSha ? `${name} · ${shortSha}` : name,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      name: string;
      short: string;
      tip: string;
    }>;
  }, [tags]);

  const tagShown = tagItems.slice(0, TAG_COMPACT_MAX);
  const tagExtra = tagItems.length - tagShown.length;

  const commitN = Array.isArray(detail?.commits) ? detail.commits.length : 0;
  const fileN =
    detail?.changedFiles ??
    (Array.isArray(detail?.files) ? detail.files.length : 0);

  const hasAnything =
    reviewers.length > 0 ||
    assignees.length > 0 ||
    showChecks ||
    labelItems.length > 0 ||
    projectItems.length > 0 ||
    showMilestone ||
    developmentItems.length > 0 ||
    tagItems.length > 0 ||
    commitN > 0 ||
    fileN > 0;

  if (!hasAnything) {
    return (
      <div
        className="prp-aside-compact prp-aside-compact--empty"
        aria-label="Pull request metadata (compact)"
      >
        <span className="prp-muted prp-aside-compact__empty-msg">No meta</span>
      </div>
    );
  }

  return (
    <div className="prp-aside-compact" aria-label="Pull request metadata (compact)">
      {/* Empty groups are omitted entirely when collapsed. */}
      {reviewers.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_reviewers')}>
          <h3 className="prp-aside-compact__label">{t('meta_reviewers')}</h3>
          <AvatarStack people={reviewers} withStatusRing />
        </section>
      ) : null}

      {assignees.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_assignees')}>
          <h3 className="prp-aside-compact__label">{t('meta_assignees')}</h3>
          <AvatarStack people={assignees} />
        </section>
      ) : null}

      {showChecks ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_checks')}>
          <h3 className="prp-aside-compact__label">{t('meta_checks')}</h3>
          <ChecksSummary
            checks={detail.checks}
            showLabel={false}
            className="prp-aside-compact__check"
            size={16}
          />
        </section>
      ) : null}

      {labelItems.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_labels')}>
          <h3 className="prp-aside-compact__label">{t('meta_labels')}</h3>
          <div className="prp-aside-compact__labels">
            {labelItems.map((l: any) => (
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

      {projectItems.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_projects')}>
          <h3 className="prp-aside-compact__label">{t('meta_projects')}</h3>
          <div className="prp-aside-compact__projects" role="list">
            {projectItems.slice(0, 4).map((p) => (
              <span
                key={p.key}
                className="prp-aside-compact__project-item prp-has-tip"
                role="listitem"
                tabIndex={0}
              >
                {p.short}
                <TipPopover title={p.tip} />
              </span>
            ))}
            {projectItems.length > 4 ? (
              <span
                className="prp-aside-compact__more-circle prp-has-tip"
                tabIndex={0}
                role="listitem"
              >
                <span className="prp-aside-compact__more-circle__txt">
                  +{projectItems.length - 4}
                </span>
                <TipPopover
                  title={projectItems
                    .slice(4)
                    .map((p) => p.tip)
                    .join('\n')}
                />
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {showMilestone ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_milestone')}>
          <h3 className="prp-aside-compact__label">{t('meta_milestone')}</h3>
          <span className="prp-aside-compact__pill prp-has-tip" tabIndex={0}>
            <span className="prp-aside-compact__pill-txt">
              {milestone.title
                ? shortTagLabel(String(milestone.title), 12)
                : `#${milestone.number ?? '—'}`}
            </span>
            <TipPopover
              title={
                milestone.title
                  ? `${milestone.title}${
                      milestone.number != null
                        ? ` (#${milestone.number})`
                        : ''
                    }`
                  : `Milestone #${milestone.number ?? '—'}`
              }
            />
          </span>
        </section>
      ) : null}

      {developmentItems.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_development')}>
          <h3 className="prp-aside-compact__label">{t('meta_development')}</h3>
          <div className="prp-aside-compact__dev" role="list">
            {developmentItems.slice(0, 4).map((d) => (
              <span
                key={d.key}
                className="prp-aside-compact__dev-item prp-has-tip"
                role="listitem"
                tabIndex={0}
              >
                {d.label}
                <TipPopover title={d.tip} />
              </span>
            ))}
            {developmentItems.length > 4 ? (
              <span
                className="prp-aside-compact__more-circle prp-has-tip"
                tabIndex={0}
                role="listitem"
              >
                <span className="prp-aside-compact__more-circle__txt">
                  +{developmentItems.length - 4}
                </span>
                <TipPopover
                  title={developmentItems
                    .slice(4)
                    .map((d) => d.tip)
                    .join('\n')}
                />
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {tagItems.length ? (
        <section className="prp-aside-compact__group" aria-label={t('meta_tags')}>
          <h3 className="prp-aside-compact__label">{t('meta_tags')}</h3>
          <div className="prp-aside-compact__tags" role="list">
            {tagShown.map((t) => (
              <span
                key={t.key}
                className="prp-aside-compact__tag prp-has-tip"
                role="listitem"
                tabIndex={0}
              >
                <code className="prp-aside-compact__tag-txt">{t.short}</code>
                <TipPopover title={t.tip} />
              </span>
            ))}
            {tagExtra > 0 ? (
              <span
                className="prp-aside-compact__more-circle prp-has-tip"
                tabIndex={0}
                role="listitem"
                aria-label={`+${tagExtra} more tags`}
              >
                <span className="prp-aside-compact__more-circle__txt">
                  +{tagExtra}
                </span>
                <TipPopover
                  title={tagItems
                    .slice(tagShown.length)
                    .map((t) => t.tip)
                    .join('\n')}
                />
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {commitN > 0 || fileN > 0 ? (
        <section
          className="prp-aside-compact__group prp-aside-compact__group--counts"
          aria-label="Counts"
        >
          {commitN > 0 ? (
            <span className="prp-aside-compact__count prp-has-tip" tabIndex={0}>
              {commitN}
              <span className="prp-aside-compact__count-unit"> commits</span>
              <TipPopover
                title={`${commitN} commit${commitN === 1 ? '' : 's'}`}
              />
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
      ) : null}
    </div>
  );
}

export default AsideCompactRail;
