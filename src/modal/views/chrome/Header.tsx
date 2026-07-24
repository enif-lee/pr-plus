import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { TipPopover } from '@common/TipPopover';
import { UserLink } from '@common/UserLink';
import { RefLink } from '@common/RefLink';
import { Avatar } from '@common/Avatar';
import {
  IconArrowLeft,
  IconCheck,
  IconCircleSlash,
  IconCopy,
  IconKebab,
  IconLinkExternal,
  IconMarkGithub,
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
import { EMBED_RESTORE_SHORTCUT } from '@lib/page-embed';
import { LAYOUT_DIFF } from '@lib/layout-mode';
import { headerReviewCompact } from '@lib/header-layout';
import { branchRefCopyText, copyTextToClipboard } from '@lib/copy-to-clipboard';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import { reviewStatusTone } from '@common/utils';
import { hasChecksData } from '../conversation/ChecksPanel';
import {
  buildCheckStackGroups,
  CheckOutcomeIcon,
} from '../conversation/ChecksSummary';
import { useModalStore } from '../../store/modal-store';

/** 1–4 reviewers all shown; 5+ → first 3 + “+N” chip. */
const HEADER_REVIEWER_MAX_FULL = 4;
const HEADER_REVIEWER_MAX_OVERFLOW = 3;

function formatReviewStatusTip(status: unknown): string {
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

/**
 * Diff compact header: reviewer avatars + check icons as **one** continuous
 * overlapping stack. Leftmost is topmost (highest z-index).
 */
function HeaderCompactMetaStack({ detail }: { detail: any }) {
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
        const statusLabel = formatReviewStatusTip(status);
        return {
          login: String(login),
          avatarUrl,
          status,
          tone: reviewStatusTone(status),
          tip: status ? `${login} · ${statusLabel}` : String(login),
        };
      })
      .filter(Boolean) as Array<{
      login: string;
      avatarUrl: string | null;
      status: string | null;
      tone: string;
      tip: string;
    }>;
  }, [detail, avatars]);

  const checkGroups = useMemo(
    () =>
      hasChecksData(detail?.checks)
        ? buildCheckStackGroups(detail.checks)
        : [],
    [detail?.checks]
  );

  if (!reviewers.length && !checkGroups.length) return null;

  const showAll = reviewers.length <= HEADER_REVIEWER_MAX_FULL;
  const shown = showAll
    ? reviewers
    : reviewers.slice(0, HEADER_REVIEWER_MAX_OVERFLOW);
  const extra = reviewers.length - shown.length;
  const moreSlot = extra > 0 ? 1 : 0;
  // Single flat list for continuous −6px overlap + left-on-top z-index
  const total = shown.length + moreSlot + checkGroups.length;

  let slot = 0;
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < shown.length; i++) {
    const u = shown[i];
    const tone = u.tone || reviewStatusTone(u.status);
    const z = total - slot;
    slot += 1;
    nodes.push(
      <span
        key={`r-${String(u.login).toLowerCase()}`}
        className={[
          'prp-header__meta-stack__item',
          'prp-header__meta-stack__item--reviewer',
          'prp-has-tip',
          tone ? `prp-header__meta-stack__item--${tone}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ zIndex: z }}
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
  }

  if (extra > 0) {
    const z = total - slot;
    slot += 1;
    nodes.push(
      <span
        key="r-more"
        className="prp-header__meta-stack__item prp-header__meta-stack__item--more prp-has-tip"
        style={{ zIndex: z }}
        role="listitem"
        tabIndex={0}
        aria-label={`+${extra} more reviewers`}
      >
        <span className="prp-header__meta-stack__more-txt">+{extra}</span>
        <TipPopover
          title={reviewers
            .slice(shown.length)
            .map((p) => p.tip)
            .join('\n')}
        />
      </span>
    );
  }

  for (let i = 0; i < checkGroups.length; i++) {
    const g = checkGroups[i];
    const z = total - slot;
    slot += 1;
    nodes.push(
      <span
        key={`c-${g.key}`}
        className={`prp-header__meta-stack__item prp-header__meta-stack__item--check prp-header__meta-stack__item--check-${g.key} prp-has-tip`}
        style={{ zIndex: z }}
        role="listitem"
        tabIndex={0}
        aria-label={g.tip.replace(/\n/g, ', ')}
      >
        <CheckOutcomeIcon outcome={g.key} size={14} />
        <TipPopover title={g.tip} />
      </span>
    );
  }

  return (
    <span
      className="prp-header__meta-stack"
      role="group"
      aria-label="Reviewers and checks"
    >
      {nodes}
    </span>
  );
}

/** Width/height morph duration — keep in sync with CSS transition on `.prp-header__stats`. */
const STATS_MORPH_MS = 320;

/**
 * Diff-stat badge that morphs size when content switches (metrics ↔ load stage,
 * and stage label swaps). Same pill element; width/height animate via FLIP, no
 * dual-layer fade.
 *
 * Metrics settle to intrinsic size after morph so long "+/− N files" strings
 * are not clipped when the header reflows.
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
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentKey = showStage
    ? `stage:${stageLabel}:${stageBusy ? 1 : 0}`
    : skeleton
      ? 'metrics:skeleton'
      : `metrics:${additions}:${deletions}:${fileCount}`;

  useLayoutEffect(() => {
    const el = badgeRef.current;
    if (!el) return;

    if (morphTimerRef.current) {
      clearTimeout(morphTimerRef.current);
      morphTimerRef.current = null;
    }

    const prevW = sizeRef.current.w;
    const prevH = sizeRef.current.h;

    // Measure natural size for the new content (CSS min-width applies when busy).
    el.style.width = 'auto';
    el.style.height = 'auto';
    el.style.minWidth = '';
    el.style.overflow = '';
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));

    if (prevW > 0 && prevH > 0 && (prevW !== w || prevH !== h)) {
      // FLIP: pin previous size → reflow → animate to measured size.
      // min-width:0 so stage's 22ch floor does not block shrink/grow from metrics.
      el.style.minWidth = '0';
      el.style.overflow = 'hidden';
      el.style.width = `${prevW}px`;
      el.style.height = `${prevH}px`;
      void el.offsetWidth;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;

      morphTimerRef.current = setTimeout(() => {
        const node = badgeRef.current;
        morphTimerRef.current = null;
        if (!node) return;
        if (!showStage) {
          // Metrics: release fixed size so header reflow never clips stats.
          node.style.width = '';
          node.style.height = '';
          node.style.minWidth = '';
          node.style.overflow = '';
        } else {
          // Stage: keep pixel size; restore CSS min-width / overflow.
          node.style.minWidth = '';
          node.style.overflow = '';
        }
      }, STATS_MORPH_MS + 20);
    } else if (showStage) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.minWidth = '';
      el.style.overflow = '';
    } else {
      el.style.width = '';
      el.style.height = '';
      el.style.minWidth = '';
      el.style.overflow = '';
    }

    sizeRef.current = { w, h };

    return () => {
      if (morphTimerRef.current) {
        clearTimeout(morphTimerRef.current);
        morphTimerRef.current = null;
      }
    };
  }, [contentKey, showStage]);

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
            <span className="prp-muted prp-header__stats-files">{fileCount} files</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Shared PR header for modal + side sheet shells.
 *
 * Conversation (any width):
 *   Row 1 — #number · title · draft · checks · stats
 *   Row 2 — branch direction · author | action toggles
 *   Narrow panels only collapse actions → ⋯ (no densify / single-line compact).
 *
 * Review compact (Diff layout only): denser strip for review surface.
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
    /** Surface short result copy via modal top pill toast */
    onActionMsg = null,
    /** 'modal' | 'embed' — embed hides close / shell / fullscreen chrome */
    presentation = 'modal',
    /** Embed: restore original GitHub PR UI */
    onRestoreNative = null,
  } = props;
  const isEmbed =
    String(presentation || '').toLowerCase() === 'embed' ||
    shellMode === 'embed';
  const showClose = !isEmbed && typeof onClose === 'function';
  const showShellToggle =
    !isEmbed &&
    typeof onToggleShell === 'function' &&
    // Diff layout never uses side sheet
    true;
  const showFullscreenToggle =
    !isEmbed && typeof onToggleFullscreen === 'function';
  const showRestoreNative =
    isEmbed && typeof onRestoreNative === 'function';
  const restoreShortcut =
    shortcutMod === '⌘'
      ? EMBED_RESTORE_SHORTCUT.label
      : EMBED_RESTORE_SHORTCUT.labelWin;

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
    if (typeof onActionMsg === 'function') {
      onActionMsg(ok ? 'Branch copied' : 'Copy failed');
    }
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

  // Diff only — conversation never densifies by panel width
  const reviewCompact =
    typeof headerReviewCompact === 'function'
      ? headerReviewCompact({ layoutMode: effectiveLayout })
      : effectiveLayout === LAYOUT_DIFF;

  if (!detail) {
    return (
      <header
        className={`prp-header prp-header--unified${
          reviewCompact ? ' prp-header--review-compact' : ''
        }`}
        data-section-loading={sectionLoading ? '1' : '0'}
        data-shell={shellMode}
        data-presentation={isEmbed ? 'embed' : 'modal'}
        data-layout={
          effectiveLayout === LAYOUT_DIFF ? 'diff' : 'conversation'
        }
        data-review-compact={reviewCompact ? '1' : '0'}
      >
        <div className="prp-header__row prp-header__row--primary">
          <div className="prp-header__identity">
            <span className="prp-header__number prp-skeleton__chip prp-skeleton__chip--num" />
            <span className="prp-skeleton__row prp-skeleton__row--lg prp-skeleton__row--w45" />
            <span className="prp-skeleton__chip" />
          </div>
          <HeaderStatsBadge loadStage={loadStage} skeleton />
        </div>
        <div className="prp-header__branch-meta">
          <span className="prp-skeleton__chip prp-skeleton__chip--branch" />
        </div>
        {showClose ? (
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
        ) : null}
      </header>
    );
  }

  const canClose = detail.state === 'open' && !detail.merged;
  const canReopen = detail.state === 'closed' && !detail.merged;
  const fileCount = detail.changedFiles ?? (detail.files || []).length;
  const subscribed = detail.subscribed === true;

  return (
    <header
      className={`prp-header prp-header--unified${
        reviewCompact ? ' prp-header--review-compact' : ''
      }`}
      data-shell={shellMode}
      data-presentation={isEmbed ? 'embed' : 'modal'}
      data-layout={effectiveLayout === LAYOUT_DIFF ? 'diff' : 'conversation'}
      data-review-compact={reviewCompact ? '1' : '0'}
    >
      {/* Row 1: identity (title/checks) left · stats pill right (never wraps under) */}
      <div className="prp-header__row prp-header__row--primary">
        <div className="prp-header__identity">
          <span className="prp-header__number">#{detail.number}</span>
          {/* Title + edit stay glued; only the title text ellipsizes under pressure */}
          <div className="prp-header__title-cluster">
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
          </div>
          {/* Status: draft only (no open badge). Closed still labeled when not merged. */}
          {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
          {!detail.draft && detail.state === 'closed' && !detail.merged ? (
            <Badge tone="muted">closed</Badge>
          ) : null}
          {/* Conversation: reviewers/checks live in the right rail.
              Diff compact: continuous overlapping stack — reviewers then checks. */}
          {reviewCompact ? <HeaderCompactMetaStack detail={detail} /> : null}
        </div>
        <HeaderStatsBadge
          loadStage={loadStage}
          additions={detail.additions ?? 0}
          deletions={detail.deletions ?? 0}
          fileCount={fileCount}
        />
      </div>

      {/* Branch meta — second row when wide; same line as identity when compact */}
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
          <span className="prp-muted prp-header__author">
            by <UserLink login={detail.author} />
          </span>
        ) : null}
        {/* Merge status lives only in the conversation merge box — not the header */}
      </div>

      {/* Actions — second row when wide; same line when compact */}
      <div className="prp-header__actions">
          {/* Wide: inline actions. Narrow: hidden via CSS; use overflow menu. */}
          <div className="prp-header__actions-inline">
            {/* Shell toggle only on conversation — side sheet is not used for Diff / embed */}
            {showShellToggle && effectiveLayout !== LAYOUT_DIFF ? (
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
            {/* Diff is always fullscreen — no shell fullscreen toggle; embed has none */}
            {showFullscreenToggle && effectiveLayout !== LAYOUT_DIFF ? (
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
            {showRestoreNative ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-restore-native prp-has-tip"
                onClick={() => onRestoreNative?.()}
                aria-label="Show GitHub PR page"
                data-action="restore-native"
              >
                <IconMarkGithub size={16} aria-hidden="true" />
                <TipPopover
                  title="Show GitHub PR page"
                  shortcut={restoreShortcut}
                  preferredPlacement="bottom"
                />
              </button>
            ) : null}
            {showClose ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-has-tip"
                onClick={onClose}
                aria-label="Close"
              >
                <IconX size={16} aria-hidden="true" />
                <TipPopover title="Close" shortcut="Esc" />
              </button>
            ) : null}
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
                {showShellToggle && effectiveLayout !== LAYOUT_DIFF ? (
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
                {showFullscreenToggle && effectiveLayout !== LAYOUT_DIFF ? (
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
                {showRestoreNative ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      data-action="restore-native"
                      onClick={() => {
                        setOverflowOpen(false);
                        onRestoreNative?.();
                      }}
                    >
                      Show GitHub PR page
                      {restoreShortcut ? ` (${restoreShortcut})` : ''}
                    </button>
                  </li>
                ) : null}
                {showClose ? (
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
                ) : null}
              </ul>
            ) : null}
          </div>
      </div>
    </header>
  );
}

export default Header;
