import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { TipPopover } from '@common/TipPopover';
import { OptBtnHint } from '@common/OptBtnHint';
import { UserLink } from '@common/UserLink';
import { RefLink } from '@common/RefLink';
import { Avatar } from '@common/Avatar';
import {
  IconArrowLeft,
  IconCheck,
  IconCircleSlash,
  IconCopy,
  IconKebab,
  IconLink,
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
import { buildGithubPrPageUrl } from '@lib/ui-polish';
import { buildUnifiedReviewerRows } from '@lib/searchable-select';
import {
  detectEmojiTrigger,
  filterEmojis,
  applyEmojiInsertion,
  emojiMenuLabel,
} from '@lib/markdown-composer';
import { reviewStatusTone } from '@common/utils';
import { hasChecksData } from '../conversation/ChecksPanel';
import {
  buildCheckStackGroups,
  CheckOutcomeIcon,
} from '../conversation/ChecksSummary';
import { useModalStore } from '../../store/modal-store';
import { useDetailUiStore } from '../../store/detail-ui-store';
import './Header.css';
import '../../components/common/MarkdownComposer.css';

/** 1–4 reviewers all shown; 5+ → first 3 + “+N” chip. */
const HEADER_REVIEWER_MAX_FULL = 4;
const HEADER_REVIEWER_MAX_OVERFLOW = 3;

import {
  HeaderCompactMetaStack,
  HeaderStatsBadge,
} from './HeaderStats';

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
  const titleHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  /** Input width matched to the rendered h2 title (px) when edit starts. */
  const [titleInputWidthPx, setTitleInputWidthPx] = useState<number | null>(null);
  /** `:` emoji typeahead while editing title */
  const [titleEmojiMenu, setTitleEmojiMenu] = useState<{
    items: any[];
    trigger: { query: string; start: number; end: number };
  } | null>(null);
  const [titleEmojiIndex, setTitleEmojiIndex] = useState(0);
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

  /** Clipboard + toast for PR GitHub detail page URL (chrome + palette share builder). */
  async function copyPrGithubPageUrl() {
    const d = detail || {};
    let webOrigin = d.webOrigin || null;
    if (!webOrigin && d.htmlUrl) {
      try {
        webOrigin = new URL(String(d.htmlUrl)).origin;
      } catch {
        webOrigin = null;
      }
    }
    const url =
      typeof buildGithubPrPageUrl === 'function'
        ? buildGithubPrPageUrl({
            owner: d.owner,
            repo: d.repo,
            number: d.number,
            htmlUrl: d.htmlUrl,
            webOrigin,
          })
        : String(d.htmlUrl || '').trim();
    if (!url) {
      if (typeof onActionMsg === 'function') onActionMsg('No PR link to copy');
      return false;
    }
    // Publish URL before clipboard write so e2e can assert even if clipboard is blocked
    try {
      (globalThis as any).__prpLastCopiedPrUrl = url;
      document.documentElement?.setAttribute?.('data-prp-last-copied-pr-url', url);
    } catch {
      /* ignore */
    }
    const ok = await copyTextToClipboard(url);
    if (typeof onActionMsg === 'function') {
      onActionMsg(ok ? 'PR link copied' : 'Copy failed');
    }
    try {
      (globalThis as any).__prpLastCopyPrOk = ok;
      document.documentElement?.setAttribute?.(
        'data-prp-last-copy-pr-ok',
        ok ? '1' : '0'
      );
    } catch {
      /* ignore */
    }
    return ok;
  }

  const prPageUrl = useMemo(() => {
    const d = detail || {};
    let webOrigin = d.webOrigin || null;
    if (!webOrigin && d.htmlUrl) {
      try {
        webOrigin = new URL(String(d.htmlUrl)).origin;
      } catch {
        webOrigin = null;
      }
    }
    return typeof buildGithubPrPageUrl === 'function'
      ? buildGithubPrPageUrl({
          owner: d.owner,
          repo: d.repo,
          number: d.number,
          htmlUrl: d.htmlUrl,
          webOrigin,
        })
      : String(d.htmlUrl || '').trim();
  }, [detail]);

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
    // Size input to the currently rendered title width (h2 box, after layout).
    const heading = titleHeadingRef.current;
    if (heading) {
      const rect = heading.getBoundingClientRect();
      // scrollWidth covers full text if not ellipsized; clientWidth is visible.
      const textW = Math.ceil(
        Math.max(rect.width, heading.scrollWidth || 0, heading.offsetWidth || 0)
      );
      // input: padding 10+10 + border 1+1 (box-sizing: border-box)
      const chrome = 22;
      setTitleInputWidthPx(Math.max(48 + chrome, textW + chrome));
    } else {
      setTitleInputWidthPx(null);
    }
    setTitleDraft(String(detail.title || ''));
    setEditingTitle(true);
    skipBlurSaveRef.current = false;
  };

  const cancelEditTitle = () => {
    skipBlurSaveRef.current = true;
    setEditingTitle(false);
    setTitleDraft('');
    setTitleInputWidthPx(null);
    setTitleEmojiMenu(null);
    setTitleEmojiIndex(0);
  };

  function syncTitleEmojiMenu(text: string, cursor: number) {
    if (typeof detectEmojiTrigger !== 'function') {
      setTitleEmojiMenu(null);
      return;
    }
    const trig = detectEmojiTrigger(text, cursor);
    if (!trig) {
      setTitleEmojiMenu(null);
      return;
    }
    const items =
      typeof filterEmojis === 'function' ? filterEmojis(trig.query, 12) : [];
    setTitleEmojiMenu({ items, trigger: trig });
    setTitleEmojiIndex(0);
  }

  function applyTitleEmoji(item: any) {
    if (!titleEmojiMenu || !item) return;
    const next = applyEmojiInsertion(
      titleDraft,
      titleEmojiMenu.trigger,
      item
    );
    setTitleDraft(next.text);
    setTitleEmojiMenu(null);
    setTitleEmojiIndex(0);
    requestAnimationFrame(() => {
      const el = titleInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
      syncTitleEmojiMenu(next.text, next.cursor);
    });
  }

  const commitEditTitle = async () => {
    setTitleEmojiMenu(null);
    setTitleEmojiIndex(0);
    if (!detail || typeof onEditTitle !== 'function') {
      setEditingTitle(false);
      setTitleInputWidthPx(null);
      return;
    }
    const next = String(titleDraft || '').trim();
    if (!next || next === String(detail.title || '').trim()) {
      setEditingTitle(false);
      setTitleInputWidthPx(null);
      return;
    }
    skipBlurSaveRef.current = true;
    setEditingTitle(false);
    setTitleInputWidthPx(null);
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
    setTitleInputWidthPx(null);
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
                  style={
                    titleInputWidthPx != null
                      ? {
                          width: titleInputWidthPx,
                          flex: '0 0 auto',
                        }
                      : undefined
                  }
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    syncTitleEmojiMenu(
                      e.target.value,
                      e.target.selectionStart ?? e.target.value.length
                    );
                  }}
                  onClick={(e) =>
                    syncTitleEmojiMenu(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? 0
                    )
                  }
                  onKeyUp={(e) => {
                    if (
                      e.key === 'ArrowDown' ||
                      e.key === 'ArrowUp' ||
                      e.key === 'Enter' ||
                      e.key === 'Tab' ||
                      e.key === 'Escape'
                    ) {
                      return;
                    }
                    syncTitleEmojiMenu(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? 0
                    );
                  }}
                  onKeyDown={(e) => {
                    const items = titleEmojiMenu?.items || [];
                    if (items.length) {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setTitleEmojiMenu(null);
                        return;
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        setTitleEmojiIndex((i) => (i + 1) % items.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        setTitleEmojiIndex(
                          (i) => (i - 1 + items.length) % items.length
                        );
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        e.stopPropagation();
                        applyTitleEmoji(items[titleEmojiIndex] ?? items[0]);
                        return;
                      }
                    }
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
                      setTitleEmojiMenu(null);
                      void commitEditTitle();
                    }, 0);
                  }}
                />
                {titleEmojiMenu?.items?.length ? (
                  <ul
                    className="prp-composer-menu prp-composer-menu--emoji prp-header__title-emoji-menu"
                    role="listbox"
                    aria-label="Emoji suggestions"
                  >
                    {titleEmojiMenu.items.map((item: any, idx: number) => {
                      const label =
                        typeof emojiMenuLabel === 'function'
                          ? emojiMenuLabel(item)
                          : `:${item.name}:`;
                      return (
                        <li
                          key={String(item.name || label)}
                          role="option"
                          aria-selected={idx === titleEmojiIndex}
                        >
                          <button
                            type="button"
                            className={`prp-composer-menu__item prp-composer-menu__item--emoji${
                              idx === titleEmojiIndex
                                ? ' prp-composer-menu__item--active'
                                : ''
                            }`}
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              skipBlurSaveRef.current = true;
                              applyTitleEmoji(item);
                            }}
                            onMouseEnter={() => setTitleEmojiIndex(idx)}
                          >
                            <span
                              className="prp-composer-menu__emoji"
                              aria-hidden="true"
                            >
                              {item.emoji}
                            </span>
                            <span className="prp-composer-menu__emoji-name">
                              {label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
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
                <h2 ref={titleHeadingRef} className="prp-header__title">
                  {detail.title}
                </h2>
                {typeof onEditTitle === 'function' ? (
                  <button
                    type="button"
                    className="prp-icon-btn prp-header__title-edit-btn prp-has-tip prp-opt-hint-host"
                    disabled={actionBusy}
                    aria-label="Edit title"
                    onClick={beginEditTitle}
                  >
                    <OptBtnHint label="⌥⇧T" />
                    <IconPencil size={14} />
                    <TipPopover title="Edit title" shortcut="⌥⇧T" />
                  </button>
                ) : null}
              </>
            )}
          </div>
          {/* Status badges: draft / merged (purple) / closed (red). Open has no badge. */}
          {detail.draft ? <Badge tone="draft">Draft</Badge> : null}
          {detail.merged ? <Badge tone="merged">Merged</Badge> : null}
          {!detail.merged && detail.state === 'closed' ? (
            <Badge tone="closed">Closed</Badge>
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
              className="prp-branch-tag__edit-btn prp-opt-hint-host"
              disabled={actionBusy || !onChangeBase}
              onClick={onChangeBase}
              title="Change base branch"
              aria-label="Change base branch"
              ref={(el) => {
                localBaseRef.current = el;
                if (baseBranchRef) baseBranchRef.current = el;
              }}
            >
              <OptBtnHint label="⌥⇧B" />
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
                className="prp-header__icon-btn prp-fullscreen-toggle prp-has-tip prp-opt-hint-host"
                onClick={onToggleFullscreen}
                aria-label={
                  shellFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                }
                aria-pressed={Boolean(shellFullscreen)}
                data-fullscreen={shellFullscreen ? '1' : '0'}
              >
                <OptBtnHint label="⌥⇧F" />
                <IconFullscreen active={Boolean(shellFullscreen)} size={16} />
                <TipPopover
                  title={
                    shellFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                  }
                  shortcut="⌥⇧F"
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
                className="prp-header__icon-btn prp-header__refresh-btn prp-has-tip prp-opt-hint-host"
                disabled={actionBusy || sectionLoading}
                onClick={() => onRefresh()}
                data-prp-refresh="1"
                aria-label={
                  effectiveLayout === LAYOUT_DIFF
                    ? 'Refresh metadata and all review threads (⌥⇧G)'
                    : 'Refresh metadata and visible review threads (⌥⇧G)'
                }
                title={
                  effectiveLayout === LAYOUT_DIFF
                    ? 'Refresh (metadata + all threads) · ⌥⇧G'
                    : 'Refresh (metadata + visible threads) · ⌥⇧G'
                }
              >
                <OptBtnHint label="⌥⇧G" preferredPlacement="bottom" />
                <IconSync size={16} aria-hidden="true" />
                <TipPopover
                  title={
                    effectiveLayout === LAYOUT_DIFF
                      ? 'Refresh (metadata + all threads)'
                      : 'Refresh (metadata + visible threads)'
                  }
                  shortcut="⌥⇧G"
                />
              </button>
            ) : null}
            <button
              type="button"
              className="prp-header__icon-btn prp-header__icon-btn--layout prp-has-tip prp-opt-hint-host"
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
              <OptBtnHint label="⌥." />
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
                shortcut="⌥."
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
            {detail.htmlUrl || prPageUrl ? (
              <a
                className="prp-header__icon-btn prp-has-tip"
                href={detail.htmlUrl || prPageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on GitHub"
                data-prp-open-github="1"
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
                data-prp-github-mark="1"
              >
                <IconMarkGithub size={16} aria-hidden="true" />
                <TipPopover
                  title="Show GitHub PR page"
                  shortcut={restoreShortcut}
                  preferredPlacement="bottom"
                />
              </button>
            ) : null}
            {/* Hyperlink control adjacent to GitHub open / mark controls */}
            {prPageUrl ? (
              <button
                type="button"
                className="prp-header__icon-btn prp-has-tip"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void copyPrGithubPageUrl();
                }}
                aria-label="Copy link to PR on GitHub"
                title="Copy link to PR on GitHub"
                data-prp-copy-pr-link="1"
                data-prp-pr-url={prPageUrl}
              >
                <IconLink size={16} aria-hidden="true" />
                <TipPopover title="Copy link to PR on GitHub" />
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
                      data-prp-refresh="1"
                      onClick={() => {
                        setOverflowOpen(false);
                        onRefresh();
                      }}
                    >
                      {effectiveLayout === LAYOUT_DIFF
                        ? 'Refresh (all threads)'
                        : 'Refresh (visible threads)'}
                      {' · ⌥⇧G'}
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
                {detail.htmlUrl || prPageUrl ? (
                  <li role="none">
                    <a
                      role="menuitem"
                      className="prp-header__more-item"
                      href={detail.htmlUrl || prPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOverflowOpen(false)}
                    >
                      Open on GitHub
                    </a>
                  </li>
                ) : null}
                {prPageUrl ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="prp-header__more-item"
                      data-prp-copy-pr-link="1"
                      onClick={() => {
                        setOverflowOpen(false);
                        void copyPrGithubPageUrl();
                      }}
                    >
                      Copy PR link
                    </button>
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

