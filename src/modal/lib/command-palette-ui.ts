import { resolveContextCommentActionControl } from './context-thread-dom';
import type { TimelineTipId } from './conversation-timeline-filter';

export interface ConversationPaletteHandle {
  toggleTimelineTip: (id: TimelineTipId) => void;
  canLoadMore: boolean;
}

const COMMENT_CONTROLS = {
  'comment-copy-body': '[data-prp-copy-comment]',
  'comment-copy-link': '[data-prp-copy-comment-link]',
  'comment-quote': '[data-prp-quote-reply]',
  'comment-react': '[data-prp-reaction-add]',
  'comment-hide': '[data-prp-hide-comment]',
  'comment-unhide': '[data-prp-unhide-comment]',
  'comment-edit': '[data-prp-edit-comment]',
  'comment-delete': '[data-prp-delete-comment]',
};

export const PALETTE_TIMELINE_KINDS = {
  all: 'popup_tl_all',
  events: 'popup_tl_events',
  participants: 'popup_tl_participants',
  comments: 'popup_tl_comments',
  'review-threads': 'popup_tl_threads',
};

const ACTIVE_THREAD = [
  '.prp-inline-thread--context-active',
  '.prp-inline-thread[data-context-active="1"]',
].join(', ');
const FOCUSED_COMMENT = [
  '.prp-card--kb-focus:not([data-search-anchor^="review-group:"]):not([data-search-anchor="composer"])',
  '.prp-review-group__row--kb-focus',
  '.prp-vline--comment-selected .prp-inline-thread',
].join(', ');
const FOCUSED_UNIT = '[data-prp-thread-unit-active="1"], .prp-review-thread__item--unit-focus';
export const PALETTE_COMPOSER = '[data-prp-composer-root]';

/** Reuse the live controls in the active panel, never a hidden keep-alive panel. */
export function collectPaletteControls(
  overlay: HTMLElement | null,
  hasPendingReview: boolean,
  lastFocusedComposer: Element | null = null,
) {
  const controls = new Map<string, HTMLElement>();
  const panel = overlay?.querySelector<HTMLElement>('.prp-body-panel--active');
  const add = (id: string, element: HTMLElement | null | undefined) => {
    if (element && !element.matches(':disabled,[aria-disabled="true"]') && element.getClientRects().length) {
      controls.set(id, element);
    }
  };
  for (const el of panel?.querySelectorAll<HTMLElement>('[data-prp-palette-control]') || []) {
    const id = el.getAttribute('data-prp-palette-control');
    if (id) add(id, el);
  }
  // Conversation Find lives above its body panel instead of inside it.
  for (const el of overlay?.querySelectorAll<HTMLElement>('[data-prp-palette-control="search-load-comments"]') || []) {
    if (!el.closest('.prp-body-panel')) add('search-load-comments', el);
  }
  const activeThread = panel?.querySelector(ACTIVE_THREAD);
  const context = activeThread || panel?.querySelector(FOCUSED_COMMENT);
  if (context) {
    // If the focused reply lacks a control (e.g. it belongs to somebody else),
    // don't fall back to the thread root for edit/delete or other actions.
    const unit = context.matches(FOCUSED_UNIT) ? context : context.querySelector(FOCUSED_UNIT);
    const target = unit || (context.querySelector('[data-prp-thread-unit]') ? null : context);
    for (const [id, selector] of Object.entries(COMMENT_CONTROLS)) {
      add(id, resolveContextCommentActionControl(target, [selector]));
    }
  }
  const candidates = new Set([
    panel?.querySelector('[data-prp-composer-kind="selection"]'),
    context?.closest(PALETTE_COMPOSER) || context?.querySelector(PALETTE_COMPOSER),
    lastFocusedComposer,
  ].filter((el): el is Element => Boolean(el && panel?.contains(el) && el.getClientRects().length)));
  const composer = lastFocusedComposer
    ? (candidates.has(lastFocusedComposer) ? lastFocusedComposer : null)
    : candidates.size === 1 ? candidates.values().next().value : null;
  const pending = composer?.querySelector<HTMLElement>('[data-prp-composer-start-review]');
  const immediate = composer?.querySelector<HTMLElement>('[data-prp-composer-submit]:not([data-prp-composer-start-review])');
  add('comment-now', immediate);
  add(hasPendingReview ? 'add-pending-review' : 'start-pending-review', pending);
  return controls;
}

export function activatePaletteControl(control: HTMLElement, focus: boolean, scroll = focus) {
  if (scroll) {
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (focus) {
    control.focus({ preventScroll: true });
  } else {
    control.click();
  }
}

/** Targets remain the existing sidebar UI, including its lazy-load on first open. */
export function openPaletteAsideSection(panel: HTMLElement, section: string) {
  const expand = panel.querySelector<HTMLElement>('.prp-conversation__aside--collapsed');
  if (expand) panel.querySelector<HTMLElement>('.prp-aside-collapse-btn')?.click();
  requestAnimationFrame(() => {
    const group = panel.querySelector(`[data-prp-aside-section="${section}"]`);
    const toggle = group?.querySelector<HTMLElement>('.prp-aside-section__toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    toggle?.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(() => group?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }));
  });
}

export function readPaletteLinks(panel: HTMLElement, selector: string) {
  return Array.from(panel.querySelectorAll<HTMLAnchorElement>(selector)).map((link) => ({
    link,
    label: link.closest('.prp-checks-list__row')?.querySelector('.prp-checks-list__name')?.textContent?.trim() ||
      link.textContent?.trim() || link.title || link.href,
  }));
}
