import React, { useRef } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { UserLink } from '@common/UserLink';
import { avatarInitials, reviewStatusTone } from '@common/utils';

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
}: any) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const list = Array.isArray(rows) ? rows : [];
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
            return (
              <li key={String(login).toLowerCase()} className="prp-people-chip">
                <span className="prp-avatar" aria-hidden="true">
                  {avatarInitials(login)}
                </span>
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
