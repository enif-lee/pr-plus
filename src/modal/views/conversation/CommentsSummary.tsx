import React from 'react';
import { useT } from '@lib/locale-context';
import { summarizeCommentThreads } from '@lib/comment-summary';
import './CommentsSummary.css';

/** GitHub-style resolution bar; the host detail remains the source of truth. */
export function CommentsSummary({ detail, compact = false }: { detail: any; compact?: boolean }) {
  const t = useT();
  const stats = summarizeCommentThreads(detail);
  if (!stats.available) {
    return <p className="prp-comment-summary__note">{t('comments_summary_unavailable')}</p>;
  }
  const resolved = t('comments_summary_resolved', { count: stats.resolved });
  const unresolved = t('comments_summary_unresolved', { count: stats.unresolved });
  const scope = stats.total == null
    ? t('comments_summary_loaded', { count: stats.loaded })
    : t('comments_summary_total', { count: stats.total });
  const unknown = stats.unknown > 0
    ? t('comments_summary_unknown', { count: stats.unknown })
    : stats.partial ? t('comments_summary_partial') : '';
  const denominator = stats.total ?? stats.loaded;
  return (
    <div className={`prp-comment-summary${compact ? ' prp-comment-summary--compact' : ''}`}>
      <div className="prp-comment-summary__headline">
        <span>{stats.total === 0 ? t('comments_summary_empty') : unresolved}</span>
        {!compact && stats.total !== 0 ? <span className="prp-comment-summary__total">{scope}</span> : null}
      </div>
      <div className="prp-comment-summary__bar" role="img" aria-label={[scope, resolved, unresolved, unknown].filter(Boolean).join(', ')}>
        {denominator > 0 ? <>
          {stats.resolved > 0 ? <span className="prp-comment-summary__segment prp-comment-summary__segment--resolved" style={{ width: `${stats.resolved / denominator * 100}%` }} /> : null}
          {stats.unresolved > 0 ? <span className="prp-comment-summary__segment prp-comment-summary__segment--unresolved" style={{ width: `${stats.unresolved / denominator * 100}%` }} /> : null}
          {stats.unknown > 0 ? <span className="prp-comment-summary__segment prp-comment-summary__segment--unknown" style={{ width: `${stats.unknown / denominator * 100}%` }} /> : null}
        </> : null}
      </div>
      {!compact && stats.total !== 0 ? <div className="prp-comment-summary__legend">
        <span><i className="prp-comment-summary__dot prp-comment-summary__segment--resolved" aria-hidden="true" />{resolved}</span>
        <span><i className="prp-comment-summary__dot prp-comment-summary__segment--unresolved" aria-hidden="true" />{unresolved}</span>
      </div> : null}
      {unknown ? <p className="prp-comment-summary__note">{unknown}</p> : null}
    </div>
  );
}
