import React, { useRef } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { LAYOUT_DIFF } from '@lib/layout-mode';
import { useModalStore } from '../../store/modal-store';

export function Header(props: any) {
  const {
    detail,
    onClose,
    onToggleDiff,
    layoutMode,
    themeMode,
    actionBusy,
    onClosePr,
    onReopenPr,
    onEditTitle,
    onChangeBase,
    baseBranchRef,
    sectionLoading,
    onOpenPalette,
    shortcutMod,
    onSubscribe,
  } = props;

  const localBaseRef = useRef<HTMLButtonElement | null>(null);
  // Prefer store-owned layout when parent omits prop (ownership model proof)
  const storeLayout = useModalStore((s) => s.layoutMode);
  const effectiveLayout = layoutMode ?? storeLayout;

  if (!detail) {
    return (
      <header className="prp-header" data-section-loading={sectionLoading ? '1' : '0'}>
        <div className="prp-header__main">
          <div className="prp-header__title-row">
            <span className="prp-header__number">PR</span>
            <h2 className="prp-header__title">{sectionLoading ? 'Loading…' : 'Pull request'}</h2>
          </div>
          {sectionLoading ? (
            <div className="prp-section-skeleton prp-section-skeleton--sm" aria-busy="true" />
          ) : null}
        </div>
        <div className="prp-header__aside">
          <div className="prp-header__actions">
            <Button onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
        </div>
      </header>
    );
  }

  const canClose = detail.state === 'open' && !detail.merged;
  const canReopen = detail.state === 'closed' && !detail.merged;
  const fileCount = detail.changedFiles ?? (detail.files || []).length;
  const subscribed = detail.subscribed === true;

  return (
    <header className="prp-header">
      <div className="prp-header__main">
        <div className="prp-header__title-row">
          <span className="prp-header__number">#{detail.number}</span>
          <h2 className="prp-header__title">{detail.title}</h2>
          <Button size="sm" disabled={actionBusy} onClick={onEditTitle} title="Edit title">
            Edit title
          </Button>
          {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
          {detail.state ? (
            <Badge tone={detail.state === 'open' ? 'ok' : 'muted'}>{detail.state}</Badge>
          ) : null}
          {detail.checks?.state ? (
            <Badge
              tone={
                detail.checks.state === 'success'
                  ? 'ok'
                  : detail.checks.state === 'failure'
                    ? 'danger'
                    : 'warn'
              }
            >
              checks: {detail.checks.state}
            </Badge>
          ) : null}
          {(detail.labels || []).map((l: any) => (
            <LabelLink key={l.name} owner={detail.owner} repo={detail.repo} label={l} />
          ))}
          <span className="prp-muted prp-theme-chip" title="Follows GitHub color mode">
            {themeMode}
          </span>
        </div>
        <div className="prp-header__meta">
          <span className="prp-branch-split" title="Base ← head">
            <button
              type="button"
              className="prp-branch-tag prp-branch-tag--base"
              disabled={actionBusy || !onChangeBase}
              onClick={onChangeBase}
              title="Change base branch"
              ref={(el) => {
                localBaseRef.current = el;
                if (baseBranchRef) baseBranchRef.current = el;
              }}
            >
              <span className="prp-branch-tag__text">{detail.baseRef || '—'}</span>
              <span className="prp-branch-tag__edit" aria-hidden="true">
                ✎
              </span>
            </button>
            <span className="prp-branch-split__arrow" aria-hidden="true">
              ←
            </span>
            <span className="prp-branch-tag prp-branch-tag--head">{detail.headRef || '—'}</span>
          </span>
          {detail.author ? (
            <span className="prp-muted">
              by <UserLink login={detail.author} />
            </span>
          ) : null}
          {detail.merged ? <Badge tone="ok">Merged</Badge> : null}
          {detail.mergeable === false ? <Badge tone="warn">Conflicts</Badge> : null}
          {detail.mergeableState ? (
            <span className="prp-muted" title="mergeable_state">
              merge: {detail.mergeableState}
            </span>
          ) : null}
        </div>
      </div>
      <div className="prp-header__aside">
        <div className="prp-header__stats" title="Files changed">
          <span className="prp-stat-add">+{detail.additions ?? 0}</span>
          <span className="prp-stat-del">−{detail.deletions ?? 0}</span>
          <span className="prp-muted">{fileCount} files</span>
        </div>
        <div className="prp-header__actions">
          {typeof onSubscribe === 'function' ? (
            <Button
              size="sm"
              disabled={actionBusy}
              onClick={() => onSubscribe(!subscribed)}
              title={subscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
            >
              {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={onToggleDiff}
            shortcut={shortcutMod ? `${shortcutMod}.` : undefined}
          >
            {effectiveLayout === LAYOUT_DIFF ? 'Conversation' : 'Diff'}
          </Button>
          <Button
            size="sm"
            onClick={onOpenPalette}
            shortcut={shortcutMod ? `${shortcutMod}K` : undefined}
          >
            Commands
          </Button>
          {canClose ? (
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={onClosePr}>
              Close PR
            </Button>
          ) : null}
          {canReopen ? (
            <Button size="sm" variant="ok" disabled={actionBusy} onClick={onReopenPr}>
              Reopen PR
            </Button>
          ) : null}
          {detail.htmlUrl ? (
            <a
              className="prp-btn prp-btn--default prp-btn--size-default"
              href={detail.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
            </a>
          ) : null}
          <Button onClick={onClose} aria-label="Close" shortcut="Esc">
            ✕
          </Button>
        </div>
      </div>
    </header>
  );
}

export default Header;
