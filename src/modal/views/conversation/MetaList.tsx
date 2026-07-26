import React, { useRef } from 'react';
import { Badge } from '@common/Badge';
import { AsideSection } from '@common/AsideSection';
import { UserLink } from '@common/UserLink';
import { reviewStatusTone } from '@common/utils';
import { Avatar } from '@common/Avatar';
import { IconSync, IconX } from '@common/icons';
import { OptBtnHint } from '@common/OptBtnHint';

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
  /** Option-hold: show shortcut badge above Add… */
  showOptHints = false,
  /** e.g. ⌥⇧R / ⌥⇧A */
  addShortcut = null,
}: any) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const list = Array.isArray(rows) ? rows : [];
  const avatars = avatarUrls && typeof avatarUrls === 'object' ? avatarUrls : {};
  return (
    <AsideSection title={title}>
      <ul className="prp-list prp-people-list">
        {list.length === 0 ? (
          <li className="prp-muted">{emptyLabel || 'None'}</li>
        ) : (
          list.map((row: any) => {
            const login = typeof row === 'string' ? row : row?.login;
            if (!login) return null;
            const status = typeof row === 'object' ? row.status : null;
            const isBot =
              typeof row === 'object' &&
              (row?.isBot === true || row?.type === 'Bot' || row?.bot === true);
            // Bots cannot be re-requested or removed via the people chip actions.
            const canRerequest =
              typeof onRerequest === 'function' &&
              !isBot &&
              (typeof row !== 'object' || row?.canRerequest !== false);
            const canRemove =
              typeof onRemove === 'function' &&
              !isBot &&
              (typeof row !== 'object' || row?.canRemove !== false);
            const avatarUrl =
              (typeof row === 'object' && (row.avatarUrl || row.avatar_url)) ||
              avatars[String(login).toLowerCase()] ||
              null;
            return (
              <li
                key={String(login).toLowerCase()}
                className={`prp-people-chip${isBot ? ' prp-people-chip--bot' : ''}`}
                data-bot={isBot ? '1' : undefined}
              >
                <Avatar login={login} avatarUrl={avatarUrl} size="sm" />
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
                {isBot ? (
                  <Badge tone="muted" className="prp-people-chip__status" title="Bot account">
                    bot
                  </Badge>
                ) : null}
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
                      <IconSync
                        className="prp-people-chip__rerequest-icon"
                        size={12}
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                  {canRemove ? (
                    <button
                      type="button"
                      className="prp-icon-btn"
                      disabled={actionBusy}
                      onClick={() => onRemove(login)}
                      title={`Remove ${login}`}
                      aria-label={`Remove ${login}`}
                    >
                      <IconX size={12} />
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
          className={`prp-add-link${addShortcut ? ' prp-opt-hint-host' : ''}`}
          disabled={actionBusy}
          onClick={onAdd}
          title={
            addShortcut
              ? `${addLabel || 'Add…'} (${addShortcut})`
              : addLabel || 'Add…'
          }
          ref={(el) => {
            localRef.current = el;
            if (addButtonRef) addButtonRef.current = el;
          }}
        >
          <OptBtnHint
            show={Boolean(showOptHints && addShortcut)}
            label={addShortcut}
            preferredPlacement="right"
          />
          {addLabel || 'Add…'}
        </button>
      ) : null}
    </AsideSection>
  );
}

export default MetaList;
