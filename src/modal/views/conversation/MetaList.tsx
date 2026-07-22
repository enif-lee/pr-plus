import React, { useRef } from 'react';
import { Button } from '@common/Button';
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
            const avatarUrl =
              (typeof row === 'object' && (row.avatarUrl || row.avatar_url)) ||
              avatars[String(login).toLowerCase()] ||
              null;
            return (
              <li key={String(login).toLowerCase()} className="prp-people-chip">
                <Avatar login={login} avatarUrl={avatarUrl} size="md" />
                <span className="prp-people-chip__name">
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
                {onRemove ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionBusy}
                    onClick={() => onRemove(login)}
                    title={`Remove ${login}`}
                    className="prp-icon-btn"
                  >
                    ✕
                  </Button>
                ) : null}
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
