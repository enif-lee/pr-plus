import React, { useLayoutEffect, useMemo, useRef } from 'react';
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
import { useT } from '@lib/locale-context';
import { formatMessage } from '@lib/i18n';
import './Header.css';
import '../../components/common/MarkdownComposer.css';

/** 1–4 reviewers all shown; 5+ → first 3 + “+N” chip. */
const HEADER_REVIEWER_MAX_FULL = 4;
const HEADER_REVIEWER_MAX_OVERFLOW = 3;

export function formatReviewStatusTip(
  status: unknown,
  localeOrT?: string | ((key: string) => string)
): string {
  const t =
    typeof localeOrT === 'function'
      ? localeOrT
      : (key: string) => formatMessage(key, localeOrT || 'en');
  const s = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  if (!s) return t('review_status_none');
  if (s === 'APPROVED') return t('review_status_approved');
  if (s === 'CHANGES_REQUESTED') return t('review_status_changes_requested');
  if (s === 'PENDING' || s === 'REVIEW_REQUIRED')
    return t('review_status_pending');
  if (s === 'COMMENTED') return t('review_status_commented');
  if (s === 'DISMISSED') return t('review_status_dismissed');
  return String(status);
}

/**
 * Diff compact header: reviewer avatars + check icons as **one** continuous
 * overlapping stack. Leftmost is topmost (highest z-index).
 */
export function HeaderCompactMetaStack({ detail }: { detail: any }) {
  const t = useT();
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
        const statusLabel = formatReviewStatusTip(status, t);
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
  }, [detail, avatars, t]);

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
        aria-label={t('header_more_reviewers', { count: extra })}
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
      aria-label={t('header_reviewers_and_checks')}
    >
      {nodes}
    </span>
  );
}

/** Width morph duration — keep in sync with CSS transition on `.prp-header__stats`. */
const STATS_MORPH_MS = 280;

/**
 * Diff-stat badge (+N −M · files). Loading is a mode on this same pill
 * (spinner + border) — no stage label, percent bar, or phrase morph.
 */
export function HeaderStatsBadge({
  loadStage = null,
  skeleton = false,
  additions = 0,
  deletions = 0,
  fileCount = 0,
}: {
  loadStage?: {
    busy?: boolean;
    phase?: string | null;
    mode?: 'critical' | 'background' | 'loading' | string | null;
    background?: boolean;
  } | null;
  skeleton?: boolean;
  additions?: number;
  deletions?: number;
  fileCount?: number;
}) {
  const t = useT();
  const storeBusy = useDetailUiStore((s) => s.loadBusy);
  const hostBusy = Boolean(loadStage?.busy);
  const hostLoading =
    hostBusy ||
    loadStage?.mode === 'background' ||
    loadStage?.mode === 'loading' ||
    Boolean(loadStage?.background);
  const loading = !skeleton && (hostLoading || storeBusy);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const modeRef = useRef<'metrics' | 'metrics-bg' | 'skeleton' | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mode = skeleton ? 'skeleton' : loading ? 'metrics-bg' : 'metrics';
  const contentKey = skeleton
    ? 'metrics:skeleton'
    : `${mode}:${additions}:${deletions}:${fileCount}`;

  useLayoutEffect(() => {
    const el = badgeRef.current;
    if (!el) return;

    if (morphTimerRef.current) {
      clearTimeout(morphTimerRef.current);
      morphTimerRef.current = null;
    }

    const prevMode = modeRef.current;
    const prevW = sizeRef.current.w;
    const modeChanged = prevMode != null && prevMode !== mode;

    // Measure target size with current mode classes (busy = fixed CSS width).
    // Clear only inline size so CSS --busy width / auto metrics can apply.
    el.style.width = '';
    el.style.height = '';
    el.style.minWidth = '';
    el.style.maxWidth = '';
    el.style.overflow = '';
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));

    // Metrics value changes (± lines) while already in metrics: no morph noise.
    if (
      (mode === 'metrics' || mode === 'metrics-bg') &&
      (prevMode === 'metrics' || prevMode === 'metrics-bg') &&
      !modeChanged
    ) {
      sizeRef.current = { w, h };
      modeRef.current = mode;
      el.style.width = '';
      el.style.height = '';
      el.style.minWidth = '';
      el.style.overflow = '';
      return;
    }

    if (prevW > 0 && Math.abs(prevW - w) > 1) {
      // FLIP skeleton ↔ metrics. Right-anchored via margin-left:auto.
      el.style.minWidth = '0';
      el.style.maxWidth = 'none';
      el.style.overflow = 'hidden';
      el.style.width = `${prevW}px`;
      void el.offsetWidth;
      el.style.width = `${w}px`;

      morphTimerRef.current = setTimeout(() => {
        const node = badgeRef.current;
        morphTimerRef.current = null;
        if (!node) return;
        // Hand size back to CSS (fixed stage width / intrinsic metrics).
        node.style.width = '';
        node.style.height = '';
        node.style.minWidth = '';
        node.style.maxWidth = '';
        node.style.overflow = '';
      }, STATS_MORPH_MS + 40);
    } else {
      el.style.width = '';
      el.style.height = '';
      el.style.minWidth = '';
      el.style.maxWidth = '';
      el.style.overflow = '';
    }

    sizeRef.current = { w, h };
    modeRef.current = mode;

    return () => {
      if (morphTimerRef.current) {
        clearTimeout(morphTimerRef.current);
        morphTimerRef.current = null;
      }
    };
  }, [contentKey, mode]);

  return (
    <div
      ref={badgeRef}
      className={[
        'prp-header__stats',
        skeleton ? 'prp-header__stats--skeleton' : '',
        loading ? 'prp-header__stats--bg-loading' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-stats-mode={loading ? 'metrics-loading' : 'metrics'}
      data-content-key={contentKey}
      data-bg-loading={loading ? '1' : undefined}
      title={
        loading
          ? t('stats_loading_panels')
          : skeleton
            ? undefined
            : t('stats_files_changed')
      }
      role={loading ? 'status' : undefined}
      aria-live={loading ? 'polite' : undefined}
      aria-busy={loading ? true : undefined}
    >
      <span key="metrics" className="prp-header__stats-inner">
        {skeleton ? (
          <span className="prp-skeleton__chip prp-skeleton__chip--stat" />
        ) : (
          <>
            {loading ? (
              <span className="prp-header__stats-spinner" aria-hidden="true" />
            ) : null}
            <span className="prp-stat-add">+{additions}</span>
            <span className="prp-stat-del">−{deletions}</span>
            <span className="prp-muted prp-header__stats-files">
              {t('stats_n_files', { count: fileCount })}
            </span>
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
 * Open/refresh loading is a mode on the same diff-stat pill (spinner + border),
 * not a stage/percent bar.
 */
