import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { TipPopover } from '@common/TipPopover';
import { UserLink } from '@common/UserLink';
import { RefLink } from '@common/RefLink';
import {
  IconArrowLeft,
  IconCheck,
  IconCircleSlash,
  IconCopy,
  IconKebab,
  IconLinkExternal,
  IconPencil,
  IconShellMode,
  IconFullscreen,
  IconX,
  IconBell,
  IconBellSlash,
  IconSync,
  IconFileDiff,
  IconConversation,
} from '@common/icons';
import { LAYOUT_DIFF } from '@lib/layout-mode';
import { branchRefCopyText, copyTextToClipboard } from '@lib/copy-to-clipboard';
import { hasChecksData } from '../conversation/ChecksPanel';
import { ChecksSummary } from '../conversation/ChecksSummary';
import { useModalStore } from '../../store/modal-store';

/**
 * Diff-stat badge that morphs size when content switches (metrics ↔ load stage).
 * Same pill element; width/height animate via FLIP, no dual-layer fade.
 */
function HeaderStatsBadge({
  loadStage = null,
  skeleton = false,
  additions = 0,
  deletions = 0,
  fileCount = 0,
}: {
  loadStage?: { label?: string | null; busy?: boolean; phase?: string | null } | null;
  skeleton?: boolean;
  additions?: number;
  deletions?: number;
  fileCount?: number;
}) {
  const stageLabel = loadStage?.label ? String(loadStage.label) : '';
  const stageBusy = Boolean(loadStage?.busy);
  const showStage = Boolean(stageLabel);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const contentKey = showStage
    ? `stage:${stageLabel}:${stageBusy ? 1 : 0}`
    : skeleton
      ? 'metrics:skeleton'
      : `metrics:${additions}:${deletions}:${fileCount}`;

  useLayoutEffect(() => {
    const el = badgeRef.current;
    if (!el) return;
    const prevW = sizeRef.current.w;
    const prevH = sizeRef.current.h;
    // Measure natural size for current content
    el.style.width = 'auto';
    el.style.height = 'auto';
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));
    if (prevW > 0 && prevH > 0 && (prevW !== w || prevH !== h)) {
      // FLIP: hold previous size, then animate to natural size
      el.style.width = `${prevW}px`;
      el.style.height = `${prevH}px`;
      void el.offsetWidth;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    } else {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    sizeRef.current = { w, h };
  }, [contentKey]);

  return (
    <div
      ref={badgeRef}
      className={[
        'prp-header__stats',
        skeleton ? 'prp-header__stats--skeleton' : '',
        showStage ? 'prp-header__stats--busy' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-stats-mode={showStage ? 'stage' : 'metrics'}
      data-content-key={contentKey}
      title={showStage ? stageLabel : skeleton ? undefined : 'Files changed'}
      role={showStage ? 'status' : undefined}
      aria-live={showStage ? 'polite' : undefined}
      aria-busy={showStage && stageBusy ? true : undefined}
    >
      <span key={contentKey} className="prp-header__stats-inner">
        {showStage ? (
          <>
            {stageBusy ? (
              <span className="prp-header__stats-spinner" aria-hidden="true" />
            ) : null}
            <span className="prp-header__stats-label">{stageLabel}</span>
          </>
        ) : skeleton ? (
          <span className="prp-skeleton__chip prp-skeleton__chip--stat" />
        ) : (
          <>
            <span className="prp-stat-add">+{additions}</span>
            <span className="prp-stat-del">−{deletions}</span>
            <span className="prp-muted">{fileCount} files</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Shared PR header for modal + side sheet shells.
 * Row 1: #number · title · draft (only) · checks (when present) · diff stats
 * Row 2: branch direction · author · action toggles
 *
 * Progressive `loadStage` is integrated into the diff-stat badge (same pill;
 * size morphs when content changes — not a floating popup / dual fade).
 */
export function Header(props: any) {
  const {
    detail,
    onClose,
    onToggleDiff,
    layoutMode,
    actionBusy,
    onClosePr,
    onReopenPr,
    onEditTitle,
    onChangeBase,
    baseBranchRef,
    sectionLoading,
    shortcutMod,
    onSubscribe,
    onRefresh = null,
    shellMode = 'modal',
    onToggleShell,
    shellFullscreen = false,
    onToggleFullscreen,
    titleEditSignal = 0,
    loadStage = null,
  } = props;

  const localBaseRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  /** Which branch chip last copied: 'base' | 'head' | null */
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const skipBlurSaveRef = useRef(false);
  const storeLayout = useModalStore((s) => s.layoutMode);
  const effectiveLayout = layoutMode ?? storeLayout;

  async function copyBranchRef(kind: 'base' | 'head', refName: unknown) {
    const text = branchRefCopyText(refName);
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopiedRef(kind);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopiedRef(null);
      copyTimerRef.current = null;
    }, 1600);
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!overflowOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (overflowRef.current?.contains(t)) return;
      setOverflowOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [overflowOpen]);

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

  useEffect(() => {
    if (!titleEditSignal) return;
    beginEditTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleEditSignal]);

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft('');
  }, [detail?.owner, detail?.repo, detail?.number]);

  if (!detail) {
    return (
      <header
        className="prp-header prp-header--unified"
        data-section-loading={sectionLoading ? '1' : '0'}
        data-shell={shellMode}
      >
        <div className="prp-header__row prp-header__row--primary">
          <span className="prp-header__number prp-skeleton__chip prp-skeleton__chip--num" />
          <span className="prp-skeleton__row prp-skeleton__row--lg prp-skeleton__row--w45" />
          <span className="prp-skeleton__chip" />
          <HeaderStatsBadge loadStage={loadStage} skeleton />
        </div>
        <div className="prp-header__row prp-header__row--secondary">
          <span className="prp-skeleton__chip prp-skeleton__chip--branch" />
          <div className="prp-header__actions">
            <button
              type="button"
              className="prp-header__icon-btn prp-has-tip"
              onClick={onClose}
              aria-label="Close"
            >
              <IconX size={16} aria-hidden="true" />
              <TipPopover title="Close" shortcut="Esc" />
            </button>
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
    <header className="prp-header prp-header--unified" data-shell={shellMode}>
      {/* Row 1: identity + status + checks + stats */}
      <div className="prp-header__row prp-header__row--primary">
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
              className="prp-icon-btn prp-header__title-action prp-has-tip"
              disabled={actionBusy || !String(titleDraft || '').trim()}
              aria-label="Save title"
              onMouseDown={(e) => {
                e.preventDefault();
                skipBlurSaveRef.current = true;
              }}
              onClick={() => void commitEditTitle()}
            >
              <IconCheck size={14} />
              <TipPopover title="Save title" />
            </button>
            <button
              type="button"
              className="prp-icon-btn prp-header__title-action prp-has-tip"
              disabled={actionBusy}
              aria-label="Cancel title edit"
              onMouseDown={(e) => {
                e.preventDefault();
                skipBlurSaveRef.current = true;
              }}
              onClick={cancelEditTitle}
            >
              <IconX size={14} />
              <TipPopover title="Cancel" />
            </button>
          </div>
        ) : (
          <>
            <h2 className="prp-header__title">{detail.title}</h2>
            {typeof onEditTitle === 'function' ? (
              <button
                type="button"
                className="prp-icon-btn prp-header__title-edit-btn prp-has-tip"
                disabled={actionBusy}
                aria-label="Edit title"
                onClick={beginEditTitle}
              >
                <IconPencil size={14} />
                <TipPopover title="Edit title" />
              </button>
            ) : null}
          </>
        )}
        {/* Status: draft only (no open badge). Closed still labeled when not merged. */}
        {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
        {!detail.draft && detail.state === 'closed' && !detail.merged ? (
          <Badge tone="muted">closed</Badge>
        ) : null}
        {hasChecksData(detail.checks) ? (
          <ChecksSummary
            checks={detail.checks}
            label="Checks"
            className="prp-header__checks"
            size={14}
          />
        ) : null}
        <HeaderStatsBadge
          loadStage={loadStage}
          additions={detail.additions ?? 0}
          deletions={detail.deletions ?? 0}
          fileCount={fileCount}
        />
      </div>

      {/* Row 2: branches + actions */}
      <div className="prp-header__row prp-header__row--secondary">
        <div className="prp-header__branch-meta">
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
                className={`prp-branch-tag__copy-btn${
                  copiedRef === 'base' ? ' prp-branch-tag__copy-btn--done' : ''
                }`}
                disabled={!detail.baseRef}
                onClick={() => void copyBranchRef('base', detail.baseRef)}
                title={
                  copiedRef === 'base'
                    ? 'Copied!'
                    : `Copy base branch “${detail.baseRef || ''}”`
                }
                aria-label={`Copy base branch ${detail.baseRef || ''}`}
              >
                {copiedRef === 'base' ? (
                  <IconCheck size={12} aria-hidden="true" />
                ) : (
                  <IconCopy size={12} aria-hidden="true" />
                )}
              </button>
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
                <IconPencil className="prp-branch-tag__edit" size={12} />
              </button>
            </span>
            <span className="prp-branch-split__arrow" aria-hidden="true">
              <IconArrowLeft size={12} />
            </span>
            <span className="prp-branch-tag prp-branch-tag--head">
              <RefLink
                className="prp-branch-tag__text"
                owner={detail.headOwner || detail.owner}
                repo={detail.headRepo || detail.repo}
                refName={detail.headRef}
              />
              <button
                type="button"
                className={`prp-branch-tag__copy-btn${
                  copiedRef === 'head' ? ' prp-branch-tag__copy-btn--done' : ''
                }`}
                disabled={!detail.headRef}
                onClick={() => void copyBranchRef('head', detail.headRef)}
                title={
                  copiedRef === 'head'
                    ? 'Copied!'
                    : `Copy head branch “${detail.headRef || ''}”`
                }
                aria-label={`Copy head branch ${detail.headRef || ''}`}
              >
                {copiedRef === 'head' ? (
                  <IconCheck size={12} aria-hidden="true" />
                ) : (
                  <IconCopy size={12} aria-hidden="true" />
                )}
              </button>
            </span>
          </span>
          {detail.author ? (
            <span className="prp-muted">
              by <UserLink login={detail.author} />
            </span>
          ) : null}
          {/* Merge status lives only in the conversation merge box — not the header */}
        </div>

        <div className="prp-header__actions">
          {/* Wide: inline actions. Narrow: hidden via CSS; use overflow menu. */}
          <div className="prp-header__actions-inline">
            {/* Shell toggle only on conversation — side sheet is not used for Diff */}
            {typeof onToggleShell === 'function' &&
            effectiveLayout !== LAYOUT_DIFF ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-shell-toggle prp-has-tip"
                onClick={onToggleShell}
                aria-label={
                  shellMode === 'sheet'
                    ? 'Switch to modal view'
                    : 'Switch to side sheet view'
                }
                aria-pressed={shellMode === 'sheet'}
                data-shell={shellMode}
              >
                <IconShellMode sheet={shellMode === 'sheet'} size={16} />
                <TipPopover
                  title={
                    shellMode === 'sheet'
                      ? 'Switch to modal view'
                      : 'Switch to side sheet view'
                  }
                />
              </button>
            ) : null}
            {typeof onToggleFullscreen === 'function' ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-fullscreen-toggle prp-has-tip"
                onClick={onToggleFullscreen}
                aria-label={
                  shellFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                }
                aria-pressed={Boolean(shellFullscreen)}
                data-fullscreen={shellFullscreen ? '1' : '0'}
              >
                <IconFullscreen active={Boolean(shellFullscreen)} size={16} />
                <TipPopover
                  title={
                    shellFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                  }
                  shortcut={shortcutMod ? `${shortcutMod}Shift+F` : null}
                />
              </button>
            ) : null}
            {typeof onSubscribe === 'function' ? (
              <button
                type="button"
                className={`prp-header__icon-btn prp-has-tip${
                  subscribed ? ' prp-header__icon-btn--subscribed' : ''
                }`}
                disabled={actionBusy}
                onClick={() => onSubscribe(!subscribed)}
                aria-label={
                  subscribed
                    ? 'Unsubscribe from notifications'
                    : 'Subscribe to notifications'
                }
                aria-pressed={subscribed}
              >
                {/* Subscribed → muted (slash); not subscribed → normal bell */}
                {subscribed ? (
                  <IconBellSlash size={16} aria-hidden="true" />
                ) : (
                  <IconBell size={16} aria-hidden="true" />
                )}
                <TipPopover
                  title={
                    subscribed
                      ? 'Unsubscribe from notifications'
                      : 'Subscribe to notifications'
                  }
                />
              </button>
            ) : null}
            {typeof onRefresh === 'function' ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-header__refresh-btn prp-has-tip"
                disabled={actionBusy || sectionLoading}
                onClick={() => onRefresh()}
                aria-label={
                  effectiveLayout === LAYOUT_DIFF
                    ? 'Refresh metadata and all review threads'
                    : 'Refresh metadata and visible review threads'
                }
              >
                <IconSync size={16} aria-hidden="true" />
                <TipPopover
                  title={
                    effectiveLayout === LAYOUT_DIFF
                      ? 'Refresh (metadata + all threads)'
                      : 'Refresh (metadata + visible threads)'
                  }
                />
              </button>
            ) : null}
            <button
              type="button"
              className="prp-header__icon-btn prp-header__icon-btn--layout prp-has-tip"
              onClick={onToggleDiff}
              aria-label={
                effectiveLayout === LAYOUT_DIFF
                  ? 'Show conversation'
                  : 'Show file diff'
              }
              data-layout={
                effectiveLayout === LAYOUT_DIFF ? 'diff' : 'conversation'
              }
            >
              {effectiveLayout === LAYOUT_DIFF ? (
                <IconConversation size={16} aria-hidden="true" />
              ) : (
                <IconFileDiff size={16} aria-hidden="true" />
              )}
              <TipPopover
                title={
                  effectiveLayout === LAYOUT_DIFF
                    ? 'Show conversation'
                    : 'Show file diff'
                }
                shortcut={shortcutMod ? `${shortcutMod}.` : null}
              />
            </button>
            {canClose ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-header__icon-btn--danger prp-has-tip"
                disabled={actionBusy}
                onClick={onClosePr}
                aria-label="Close pull request"
              >
                <IconCircleSlash size={16} aria-hidden="true" />
                <TipPopover title="Close pull request" />
              </button>
            ) : null}
            {canReopen ? (
              <Button
                size="sm"
                variant="ok"
                disabled={actionBusy}
                onClick={onReopenPr}
                title="Reopen pull request"
              >
                Reopen PR
              </Button>
            ) : null}
            {detail.htmlUrl ? (
              <a
                className="prp-header__icon-btn prp-has-tip"
                href={detail.htmlUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on GitHub"
              >
                <IconLinkExternal size={16} aria-hidden="true" />
                <TipPopover title="Open on GitHub" />
              </a>
            ) : null}
            <button
              type="button"
              className="prp-header__icon-btn prp-has-tip"
              onClick={onClose}
              aria-label="Close"
            >
              <IconX size={16} aria-hidden="true" />
              <TipPopover title="Close" shortcut="Esc" />
            </button>
          </div>

          {/* Narrow: overflow menu (same handlers as inline row) */}
          <div className="prp-header__actions-more" ref={overflowRef}>
            <button
              type="button"
              className="prp-header__more-btn prp-has-tip"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label="More actions"
              onClick={() => setOverflowOpen((o) => !o)}
            >
              <IconKebab size={16} />
              <TipPopover title="More actions" />
            </button>
            {overflowOpen ? (
              <ul className="prp-header__more-menu" role="menu">
                {typeof onToggleShell === 'function' &&
                effectiveLayout !== LAYOUT_DIFF ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      onClick={() => {
                        setOverflowOpen(false);
                        onToggleShell();
                      }}
                    >
                      {shellMode === 'sheet'
                        ? 'Switch to modal view'
                        : 'Switch to side sheet'}
                    </button>
                  </li>
                ) : null}
                {typeof onToggleFullscreen === 'function' ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      onClick={() => {
                        setOverflowOpen(false);
                        onToggleFullscreen();
                      }}
                    >
                      {shellFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    </button>
                  </li>
                ) : null}
                {typeof onSubscribe === 'function' ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      disabled={actionBusy}
                      onClick={() => {
                        setOverflowOpen(false);
                        onSubscribe(!subscribed);
                      }}
                    >
                      {subscribed ? 'Unsubscribe' : 'Subscribe'}
                    </button>
                  </li>
                ) : null}
                {typeof onRefresh === 'function' ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      disabled={actionBusy || sectionLoading}
                      onClick={() => {
                        setOverflowOpen(false);
                        onRefresh();
                      }}
                    >
                      {effectiveLayout === LAYOUT_DIFF
                        ? 'Refresh (all threads)'
                        : 'Refresh (visible threads)'}
                    </button>
                  </li>
                ) : null}
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="prp-header__more-item"
                    onClick={() => {
                      setOverflowOpen(false);
                      onToggleDiff?.();
                    }}
                  >
                    {effectiveLayout === LAYOUT_DIFF ? 'Conversation' : 'Diff'}
                    {shortcutMod ? ` (${shortcutMod}.)` : ''}
                  </button>
                </li>
                {canClose ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item prp-header__more-item--danger"
                      disabled={actionBusy}
                      onClick={() => {
                        setOverflowOpen(false);
                        onClosePr?.();
                      }}
                    >
                      Close PR
                    </button>
                  </li>
                ) : null}
                {canReopen ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      disabled={actionBusy}
                      onClick={() => {
                        setOverflowOpen(false);
                        onReopenPr?.();
                      }}
                    >
                      Reopen PR
                    </button>
                  </li>
                ) : null}
                {detail.htmlUrl ? (
                  <li role="none">
                    <a
                      role="menuitem"
                      className="prp-header__more-item"
                      href={detail.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOverflowOpen(false)}
                    >
                      Open on GitHub
                    </a>
                  </li>
                ) : null}
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="prp-header__more-item"
                    onClick={() => {
                      setOverflowOpen(false);
                      onClose?.();
                    }}
                  >
                    Close modal
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
