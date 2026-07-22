import React, { useRef } from 'react';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { UserLink } from '@common/UserLink';
import { reviewStatusTone } from '@common/utils';
import { Avatar } from '@common/Avatar';

export function MetaList({
  title,
  rows,
  emptyLabel,
  onRemove,
  onAdd,
  /** Optional per-row re-request (reviewers). Receives login. */
  onRerequest = null,
  addLabel,
  actionBusy,
  renderStatus,
  addButtonRef,
  avatarUrls,
}: any) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const list = Array.isArray(rows) ? rows : [];
  const avatars = avatarUrls && typeof avatarUrls === 'object' ? avatarUrls : {};
  return (
    <Card title={title}>
      <ul className="prp-list prp-people-list">
        {list.length === 0 ? (
          <li className="prp-muted">{emptyLabel || 'None'}</li>
        ) : (
          list.map((row: any) => {
            const login = typeof row === 'string' ? row : row?.login;
            if (!login) return null;
            const status = typeof row === 'object' ? row.status : null;
            const canRerequest =
              typeof onRerequest === 'function' &&
              (typeof row !== 'object' || row?.canRerequest !== false);
            const avatarUrl =
              (typeof row === 'object' && (row.avatarUrl || row.avatar_url)) ||
              avatars[String(login).toLowerCase()] ||
              null;
            return (
              <li key={String(login).toLowerCase()} className="prp-people-chip">
                <Avatar login={login} avatarUrl={avatarUrl} size="md" />
                <span className="prp-people-chip__name" title={login}>
                  <UserLink login={login} />
                </span>
                {status
                  ? renderStatus
                    ? renderStatus(status, row)
                    : (
                        <Badge
                          tone={reviewStatusTone(status)}
                          className="prp-people-chip__status"
                        >
                          {status}
                        </Badge>
                      )
                  : null}
                <span className="prp-people-chip__actions">
                  {canRerequest ? (
                    <button
                      type="button"
                      className="prp-icon-btn prp-people-chip__rerequest"
                      disabled={actionBusy}
                      onClick={() => onRerequest(login, row)}
                      title={`Re-request review from ${login}`}
                      aria-label={`Re-request review from ${login}`}
                    >
                      <span className="prp-people-chip__rerequest-icon" aria-hidden="true">
                        ↻
                      </span>
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      className="prp-icon-btn"
                      disabled={actionBusy}
                      onClick={() => onRemove(login)}
                      title={`Remove ${login}`}
                      aria-label={`Remove ${login}`}
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })
        )}
      </ul>
      {onAdd ? (
        <button
          type="button"
          className="prp-add-link"
          disabled={actionBusy}
          onClick={onAdd}
          ref={(el) => {
            localRef.current = el;
            if (addButtonRef) addButtonRef.current = el;
          }}
        >
          {addLabel || 'Add…'}
        </button>
      ) : null}
    </Card>
  );
}

export default MetaList;
