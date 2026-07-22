import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { RefLink } from '@common/RefLink';
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
    shortcutMod,
    onSubscribe,
    shellMode = 'modal',
    onToggleShell,
    /** Increment to open inline title editor (e.g. command palette). */
    titleEditSignal = 0,
  } = props;

  const localBaseRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const skipBlurSaveRef = useRef(false);
  // Prefer store-owned layout when parent omits prop (ownership model proof)
  const storeLayout = useModalStore((s) => s.layoutMode);
  const effectiveLayout = layoutMode ?? storeLayout;

  const beginEditTitle = () => {
    if (!detail || actionBusy) return;
    setTitleDraft(String(detail.title || ''));
    setEditingTitle(true);
    skipBlurSaveRef.current = false;
  };

  const cancelEditTitle = () => {
    skipBlurSaveRef.current = true;
    setEditingTitle(false);
    setTitleDraft('');
  };

  const commitEditTitle = async () => {
    if (!detail || typeof onEditTitle !== 'function') {
      setEditingTitle(false);
      return;
    }
    const next = String(titleDraft || '').trim();
    if (!next || next === String(detail.title || '').trim()) {
      setEditingTitle(false);
      return;
    }
    skipBlurSaveRef.current = true;
    setEditingTitle(false);
    await onEditTitle(next);
  };

  // External kick (command palette)
  useEffect(() => {
    if (!titleEditSignal) return;
    beginEditTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal only
  }, [titleEditSignal]);

  // Focus + select when entering edit mode
  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

  // Drop edit mode when PR changes
  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft('');
  }, [detail?.owner, detail?.repo, detail?.number]);

  if (!detail) {
    return (
      <header className="prp-header" data-section-loading={sectionLoading ? '1' : '0'}>
        <div className="prp-header__main">
          <div className="prp-header__title-row">
            <span className="prp-header__number prp-skeleton__chip prp-skeleton__chip--num" aria-hidden="true" />
            <span className="prp-skeleton__row prp-skeleton__row--lg prp-skeleton__row--w45" aria-hidden="true" />
            <span className="prp-skeleton__chip" aria-hidden="true" />
            <span className="prp-skeleton__chip prp-skeleton__chip--sm" aria-hidden="true" />
          </div>
          <div className="prp-header__meta" aria-hidden="true">
            <span className="prp-skeleton__chip prp-skeleton__chip--branch" />
            <span className="prp-skeleton__row prp-skeleton__row--sm prp-skeleton__row--w20" />
            <span className="prp-skeleton__chip prp-skeleton__chip--sm" />
          </div>
        </div>
        <div className="prp-header__aside">
          <div className="prp-header__stats prp-header__stats--skeleton" aria-hidden="true">
            <span className="prp-skeleton__chip prp-skeleton__chip--stat" />
            <span className="prp-skeleton__chip prp-skeleton__chip--stat" />
            <span className="prp-skeleton__chip prp-skeleton__chip--stat-w" />
          </div>
          <div className="prp-header__actions">
            {typeof onToggleShell === 'function' ? (
              <button
                type="button"
                className="prp-shell-toggle"
                onClick={onToggleShell}
                aria-label={
                  shellMode === 'sheet' ? 'Switch to modal view' : 'Switch to side sheet view'
                }
                title={
                  shellMode === 'sheet' ? 'Switch to modal view' : 'Switch to side sheet view'
                }
                aria-pressed={shellMode === 'sheet'}
                data-shell={shellMode}
              >
                <span aria-hidden="true">{shellMode === 'sheet' ? '▢' : '◨'}</span>
              </button>
            ) : null}
            <span className="prp-skeleton__chip prp-skeleton__chip--btn" aria-hidden="true" />
            <span className="prp-skeleton__chip prp-skeleton__chip--btn" aria-hidden="true" />
            <Button onClick={onClose} aria-label="Close" shortcut="Esc">
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
          {editingTitle ? (
            <div className="prp-header__title-edit">
              <input
                ref={titleInputRef}
                className="prp-header__title-input"
                type="text"
                value={titleDraft}
                disabled={actionBusy}
                aria-label="Pull request title"
                maxLength={256}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    void commitEditTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelEditTitle();
                  }
                }}
                onBlur={() => {
                  if (skipBlurSaveRef.current) {
                    skipBlurSaveRef.current = false;
                    return;
                  }
                  // Defer so click on cancel/save buttons can set skip flag first
                  window.setTimeout(() => {
                    if (skipBlurSaveRef.current) {
                      skipBlurSaveRef.current = false;
                      return;
                    }
                    void commitEditTitle();
                  }, 0);
                }}
              />
              <button
                type="button"
                className="prp-icon-btn prp-header__title-action"
                disabled={actionBusy || !String(titleDraft || '').trim()}
                title="Save title"
                aria-label="Save title"
                onMouseDown={(e) => {
                  e.preventDefault();
                  skipBlurSaveRef.current = true;
                }}
                onClick={() => void commitEditTitle()}
              >
                ✓
              </button>
              <button
                type="button"
                className="prp-icon-btn prp-header__title-action"
                disabled={actionBusy}
                title="Cancel"
                aria-label="Cancel title edit"
                onMouseDown={(e) => {
                  e.preventDefault();
                  skipBlurSaveRef.current = true;
                }}
                onClick={cancelEditTitle}
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <h2 className="prp-header__title">{detail.title}</h2>
              {typeof onEditTitle === 'function' ? (
                <button
                  type="button"
                  className="prp-icon-btn prp-header__title-edit-btn"
                  disabled={actionBusy}
                  title="Edit title"
                  aria-label="Edit title"
                  onClick={beginEditTitle}
                >
                  ✎
                </button>
              ) : null}
            </>
          )}
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
            <span className="prp-branch-tag prp-branch-tag--base">
              <RefLink
                className="prp-branch-tag__text"
                owner={detail.baseOwner || detail.owner}
                repo={detail.baseRepo || detail.repo}
                refName={detail.baseRef}
              />
              <button
                type="button"
                className="prp-branch-tag__edit-btn"
                disabled={actionBusy || !onChangeBase}
                onClick={onChangeBase}
                title="Change base branch"
                aria-label="Change base branch"
                ref={(el) => {
                  localBaseRef.current = el;
                  if (baseBranchRef) baseBranchRef.current = el;
                }}
              >
                <span className="prp-branch-tag__edit" aria-hidden="true">
                  ✎
                </span>
              </button>
            </span>
            <span className="prp-branch-split__arrow" aria-hidden="true">
              ←
            </span>
            <RefLink
              className="prp-branch-tag prp-branch-tag--head"
              owner={detail.headOwner || detail.owner}
              repo={detail.headRepo || detail.repo}
              refName={detail.headRef}
            />
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
          {typeof onToggleShell === 'function' ? (
            <button
              type="button"
              className="prp-shell-toggle"
              onClick={onToggleShell}
              aria-label={
                shellMode === 'sheet' ? 'Switch to modal view' : 'Switch to side sheet view'
              }
              title={
                shellMode === 'sheet' ? 'Switch to modal view' : 'Switch to side sheet view'
              }
              aria-pressed={shellMode === 'sheet'}
              data-shell={shellMode}
            >
              {/* sheet = docked panel icon; modal = floating window icon */}
              <span aria-hidden="true">{shellMode === 'sheet' ? '▢' : '◨'}</span>
            </button>
          ) : null}
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
          {canClose ? (
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={onClosePr}>
              Close
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
