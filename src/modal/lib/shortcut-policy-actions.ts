import {
  COMPOSER_CONTEXT_SHORTCUT,
  CONTEXT_THREAD_SHORTCUT,
  CONVERSATION_SCROLL_SHORTCUT,
  DIFF_OPT_ARROW_SHORTCUT,
  DIFF_PAGE_SCROLL_SHORTCUT,
  FILE_FOLD_SHORTCUT,
  FILE_NAV_SHORTCUT,
  REVIEW_FILTER_SHORTCUT,
  STEP_NAV_SHORTCUT,
  TOGGLE_SIDE_PANEL_SHORTCUT,
  TOGGLE_VIEWED_SHORTCUT,
} from './shortcut-policy-constants';
import {
  normalizeShortcutKey,
} from './shortcut-policy-keys';

/** Split from shortcut-policy.ts: shortcut-policy-actions */
/** @module modal/lib/shortcut-policy */
/**
 * Pure policy for PR modal global shortcuts.
 * Product chords use Option (former mod/⌘ → opt/⌥) except Find:
 *   find ⌘F / Ctrl+F · open palette ⌥⇧K · fullscreen ⌥⇧F · diff toggle ⌥.
 * Option+J/K step nav, Option+Shift+[ / ] file nav, stack digits, [ ] adjacent, Esc.
 */

/** Option/Alt + J/K — step prev/next (find hits or review threads). */
export function resolveArrowFoldAction(opts: {
  key?: string;
  layoutMode?: string;
  editableTarget?: boolean;
  contextThreadActive?: boolean;
  conversationCommentFocused?: boolean;
  /** When false, Conversation ←/→ do not fold (e.g. body/composer/merge focus). */
  focusedReviewThread?: boolean;
  diffThreadFocused?: boolean;
  /** Code-body multi/single line selection — not thread/file caret. */
  hasLineSelection?: boolean;
} = {}): string | null {
  if (opts.editableTarget) return null;
  const key = String(opts.key || '').toLowerCase();
  if (key !== 'arrowleft' && key !== 'arrowright') return null;
  const wantCollapse = key === 'arrowleft';
  const layout = String(opts.layoutMode || '');
  const contextThreadActive = Boolean(
    opts.contextThreadActive ?? opts.conversationCommentFocused
  );
  const hasLineSelection = Boolean(opts.hasLineSelection);
  const diffThreadFocused =
    opts.diffThreadFocused != null
      ? Boolean(opts.diffThreadFocused)
      : layout === 'diff' && contextThreadActive;

  if (layout === 'diff') {
    // Prefer thread when thread-focused without a code-body line selection
    if (diffThreadFocused && !hasLineSelection) {
      return wantCollapse
        ? 'contextThreadCollapse'
        : 'contextThreadExpand';
    }
    return wantCollapse ? 'collapseActiveFile' : 'expandActiveFile';
  }
  if (
    (layout === 'centered' || layout === 'conversation') &&
    contextThreadActive
  ) {
    // Explicit false: focused stop is not a review-thread (description/merge/…)
    if (opts.focusedReviewThread === false) return null;
    return wantCollapse ? 'contextThreadCollapse' : 'contextThreadExpand';
  }
  return null;
}

/**
 * Path to fold/expand: prefer line-selection file, else active tree file.
 */
export function resolveActiveFileForCollapse(opts: {
  lineSelection?: { filePath?: string | null } | null;
  activeFilePath?: string | null;
} = {}): string | null {
  const fromSel = String(opts.lineSelection?.filePath || '').trim();
  if (fromSel) return fromSel;
  const active = String(opts.activeFilePath || '').trim();
  return active || null;
}

/**
 * Option+B — toggle the layout side panel:
 * - Diff: files navigator (left)
 * - Conversation: metadata rail (right)
 * (⌥⇧B remains Change base branch.)
 */
export function resolveComposerContextShortcutAction(opts: any = {}) {
  if (!opts.composerFocused) return null;
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const ctrl = Boolean(opts.ctrl);
  const key = normalizeShortcutKey({
    key: opts.key,
    code: opts.code,
    alt,
  });

  // ⌘Enter / Ctrl+Enter → submit (composer only; no Option required)
  if (
    mod &&
    !alt &&
    !shift &&
    (key === 'enter' || opts.code === 'Enter' || opts.code === 'NumpadEnter')
  ) {
    return COMPOSER_CONTEXT_SHORTCUT.submitModEnter.action;
  }

  // Remaining chords need Option (not ⌘)
  if (!alt || mod) return null;

  // ⌥⌃R resolve when the form supports it
  if (ctrl && !shift && key === 'r') {
    if (opts.canResolve === false) return null;
    return COMPOSER_CONTEXT_SHORTCUT.resolve.action;
  }
  if (ctrl) return null;

  if (shift) return null;

  if (key === 'e') return COMPOSER_CONTEXT_SHORTCUT.emoji.action;
  if (key === 'c') return COMPOSER_CONTEXT_SHORTCUT.submit.action;
  if (key === 'i') return COMPOSER_CONTEXT_SHORTCUT.focusInput.action;
  if (key === 't') {
    if (opts.canToggleMode === false) return null;
    // When canToggleMode omitted, still emit — handlers no-op if no mode UI
    return COMPOSER_CONTEXT_SHORTCUT.modeToggle.action;
  }
  return null;
}

/**
 * Toggle Diff review-filter status chip (multi-select).
 * Delegates to diff-review-filter; empty status set ≡ show all.
 */
export function toggleReviewFilter(
  current: unknown,
  target: 'unresolved' | 'resolved' | 'pending' | string
) {
  // Lazy require-free import via dynamic path would break pure build;
  // inline multi-toggle matching diff-review-filter semantics.
  const t = String(target || '').toLowerCase();
  if (t !== 'unresolved' && t !== 'resolved' && t !== 'pending') {
    return current ?? null;
  }
  const statusesOrder = ['unresolved', 'resolved', 'pending'] as const;
  let statuses: string[] = [];
  let hideOutdated = false;
  let authors: string[] = [];
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    const o = current as any;
    if (Array.isArray(o.statuses)) {
      statuses = o.statuses.map(String).map((s) => s.toLowerCase());
    }
    hideOutdated = Boolean(o.hideOutdated);
    if (Array.isArray(o.authors)) authors = o.authors.map(String);
  } else if (typeof current === 'string' && current) {
    statuses = [String(current).toLowerCase()];
  } else if (current == null || current === '') {
    // Product default when toggling from uninitialized exclusive null
    statuses = ['unresolved', 'pending'];
  }
  const set = new Set(statuses.filter((s) => statusesOrder.includes(s as any)));
  if (set.has(t)) set.delete(t);
  else set.add(t);
  return {
    statuses: statusesOrder.filter((s) => set.has(s)),
    hideOutdated,
    authors,
  };
}

/**
 * Next scrollTop when paging the Diff scroller by roughly one viewport.
 * delta < 0 → previous page; delta > 0 → next page.
 */
export function nextScrollTopByPage(
  scrollTop: unknown,
  clientHeight: unknown,
  scrollHeight: unknown,
  delta: number
): number {
  const top = Math.max(0, Number(scrollTop) || 0);
  const vh = Math.max(0, Number(clientHeight) || 0);
  const sh = Math.max(0, Number(scrollHeight) || 0);
  if (vh <= 0) return top;
  // Leave a small overlap so context remains visible
  const step = Math.max(40, Math.floor(vh * 0.9));
  const d = delta < 0 ? -step : step;
  const max = Math.max(0, sh - vh);
  const next = top + d;
  return Math.min(max, Math.max(0, next));
}

export function filePathOf(file: any): string {
  return String(file?.filename || file?.path || '').trim();
}

/**
 * Index of the active path in the visible file list (-1 if missing).
 */
export function activeFileNavIndex(
  files: any[] | null | undefined,
  activePath: unknown
): number {
  const list = Array.isArray(files) ? files : [];
  const path = String(activePath || '').trim();
  if (!list.length || !path) return -1;
  return list.findIndex((f) => filePathOf(f) === path);
}

/**
 * Adjacent file in the visible list, relative to the currently viewed file.
 * Wraps at ends. `delta` is the signed step count (e.g. +3 = three files forward).
 * UI key-hold uses ±1 per frame; multi-step remains for callers that want a jump.
 * If active path is not in the list, positive steps start before first, negative after last.
 */
export function resolveAdjacentFileNav(
  files: any[] | null | undefined,
  activePath: unknown,
  delta: number
): { index: number; total: number; path: string | null } {
  const list = Array.isArray(files) ? files : [];
  const total = list.length;
  if (total <= 0) return { index: -1, total: 0, path: null };
  let steps = Math.trunc(Number(delta));
  if (!Number.isFinite(steps) || steps === 0) {
    const cur = activeFileNavIndex(list, activePath);
    if (cur >= 0) {
      return { index: cur, total, path: filePathOf(list[cur]) || null };
    }
    return { index: -1, total, path: null };
  }
  let idx = activeFileNavIndex(list, activePath);
  if (idx < 0) {
    // Not in list: positive starts before first, negative starts after last
    idx = steps > 0 ? -1 : 0;
  }
  const next = ((idx + steps) % total + total) % total;
  const path = filePathOf(list[next]);
  return { index: next, total, path: path || null };
}

/** Selectors for GitHub's native ⌘K command palette. */
export function resolveModalShortcutAction(opts: any = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  /** Physical Control — used with ⌥ for resolve (not ⌘/meta). */
  const ctrl = Boolean(opts.ctrl);
  const key = normalizeShortcutKey({
    key: opts.key,
    code: opts.code,
    alt,
  });
  const paletteOpen = Boolean(opts.paletteOpen);
  const layout = String(opts.layoutMode || '');
  /** Conversation focus ring and/or Diff active review-thread nav index. */
  const contextThreadActive = Boolean(
    opts.contextThreadActive ?? opts.conversationCommentFocused
  );
  const hasLineSelection = Boolean(opts.hasLineSelection);
  /**
   * Real Diff thread focus. When omitted, fall back to contextThreadActive so
   * older callers keep prior behavior; App passes this explicitly.
   */
  const diffThreadFocused =
    opts.diffThreadFocused != null
      ? Boolean(opts.diffThreadFocused)
      : layout === 'diff' && contextThreadActive;

  // GitHub ⌘K palette owns Escape / keyboard — never close pr+ shell
  if (opts.githubPaletteOpen) return null;

  // Esc is handled in App with layout context (palette / search / edit / diff / close)
  if (key === 'escape') {
    if (paletteOpen) return 'closePalette';
    if (opts.editingBody || opts.editingComment) return 'cancelEdit';
    return 'escapeNav';
  }

  // Command palette owns the keyboard entirely
  if (paletteOpen) return null;

  /*
   * Context-thread shortcuts (Conversation focus or Diff comment nav):
   *   ⌥F fold · ⌥D Diff · ⌥C comment (1st focus input, 2nd submit)
   *   ⌥⌃R resolve / unresolve
   * ⌥C allowed while the reply composer is focused (second stage).
   *
   * ⌥F on Diff is special: **code-body** line selection → file fold; focused
   * review thread (⌥J/K or ↑↓ on thread) → thread fold. Thread/file carets are
   * not hasLineSelection. (contextThreadActive may be forced true on Diff so
   * ⌥C/D seed the first thread — that force must not steal file fold.)
   */
  if (contextThreadActive && alt && !shift) {
    if (ctrl && !mod && key === 'r') {
      return CONTEXT_THREAD_SHORTCUT.resolve.action;
    }
    if (!ctrl && !mod) {
      if (key === 'f' && !opts.editableTarget) {
        if (layout === 'diff') {
          if (hasLineSelection) {
            return FILE_FOLD_SHORTCUT.action;
          }
          if (diffThreadFocused) {
            return CONTEXT_THREAD_SHORTCUT.fold.action;
          }
          // No thread focus — fall through to FILE_FOLD below
        } else {
          return CONTEXT_THREAD_SHORTCUT.fold.action;
        }
      } else if (key === 'd' && !opts.editableTarget) {
        return CONTEXT_THREAD_SHORTCUT.gotoDiff.action;
      } else if (key === 'c') {
        // First press focuses composer; second (while typing) submits.
        return CONTEXT_THREAD_SHORTCUT.comment.action;
      }
    }
  }

  // ⌥⇧[ / ⌥⇧] (Alt+Shift+[ / ]): previous/next file on Diff from current file
  if (alt && !mod && !ctrl && shift && (key === '[' || key === ']')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return key === '['
      ? FILE_NAV_SHORTCUT.prev.action
      : FILE_NAV_SHORTCUT.next.action;
  }

  // ⌥⇧↑ / ⌥⇧↓: page-scroll active panel (Diff list or Conversation timeline)
  if (
    alt &&
    !mod &&
    !ctrl &&
    shift &&
    (key === 'arrowup' || key === 'arrowdown')
  ) {
    if (opts.editableTarget) return null;
    if (layout === 'diff') {
      return key === 'arrowup'
        ? DIFF_PAGE_SCROLL_SHORTCUT.prev.action
        : DIFF_PAGE_SCROLL_SHORTCUT.next.action;
    }
    if (layout === 'centered' || layout === 'conversation') {
      return key === 'arrowup'
        ? CONVERSATION_SCROLL_SHORTCUT.pagePrev.action
        : CONVERSATION_SCROLL_SHORTCUT.pageNext.action;
    }
    return null;
  }

  // ⌥↑ / ⌥↓ (no Shift): Diff selection jump, or Conversation panel scroll
  if (
    alt &&
    !mod &&
    !ctrl &&
    !shift &&
    (key === 'arrowup' || key === 'arrowdown')
  ) {
    if (opts.editableTarget) return null;
    if (layout === 'diff') {
      return key === 'arrowup'
        ? DIFF_OPT_ARROW_SHORTCUT.prev.action
        : DIFF_OPT_ARROW_SHORTCUT.next.action;
    }
    if (layout === 'centered' || layout === 'conversation') {
      return key === 'arrowup'
        ? CONVERSATION_SCROLL_SHORTCUT.optPrev.action
        : CONVERSATION_SCROLL_SHORTCUT.optNext.action;
    }
    return null;
  }

  // ⌥⇧R: toggle viewed/unread for the active Diff file
  if (alt && !mod && !ctrl && shift && key === 'r') {
    if (opts.editableTarget) return null;
    if (layout !== 'diff') return null;
    return TOGGLE_VIEWED_SHORTCUT.action;
  }

  // ⌥F: fold/expand focused Diff file (context-thread ⌥F handled above)
  if (alt && !mod && !ctrl && !shift && key === 'f') {
    if (opts.editableTarget) return null;
    if (layout !== 'diff') return null;
    return FILE_FOLD_SHORTCUT.action;
  }

  // ⌥J / ⌥K: step prev/next — Find hits, Diff review threads, or Conversation comments.
  // Allowed while Find input is focused (searchOpen); blocked for other editables.
  if (alt && !mod && !ctrl && !shift && (key === 'j' || key === 'k')) {
    if (opts.editableTarget && !opts.searchOpen) return null;
    if (
      !opts.searchOpen &&
      layout !== 'diff' &&
      layout !== 'centered' &&
      layout !== 'conversation'
    ) {
      return null;
    }
    return key === 'k' ? STEP_NAV_SHORTCUT.prev.action : STEP_NAV_SHORTCUT.next.action;
  }

  // ⌥U / ⌥R / ⌥P: toggle Diff review filters (unresolved / resolved / pending)
  // (⌥⌃R is resolve on a focused conversation thread — handled above)
  if (alt && !mod && !ctrl && !shift && (key === 'u' || key === 'r' || key === 'p')) {
    if (opts.editableTarget) return null;
    if (layout !== 'diff') return null;
    if (key === 'u') return REVIEW_FILTER_SHORTCUT.unresolved.action;
    if (key === 'r') return REVIEW_FILTER_SHORTCUT.resolved.action;
    return REVIEW_FILTER_SHORTCUT.pending.action;
  }

  // ⌥[ / ⌥] / ⌥1–9: stack path or list-adjacent PR navigation (modal/sheet)
  if (alt && !mod && !ctrl && !shift && !opts.editableTarget) {
    if (key === '[') return 'navAdjacentPrev';
    if (key === ']') return 'navAdjacentNext';
    if (/^[1-9]$/.test(key)) return `navStackDigit${key}`;
  }

  // Diff line-selection move (no Opt): plain arrows = single-line move;
  // Shift+arrows = extend range. Allowed without an active selection so that
  // after file nav the first arrow seeds the first displayed line of the file.
  if (
    !alt &&
    !mod &&
    (key === 'arrowup' || key === 'arrowdown') &&
    String(opts.layoutMode || '') === 'diff'
  ) {
    if (opts.editableTarget) return null;
    if (shift) {
      return key === 'arrowup'
        ? 'extendSelectionUp'
        : 'extendSelectionDown';
    }
    return key === 'arrowup' ? 'moveSelectionUp' : 'moveSelectionDown';
  }

  // ← / → directed fold (file or focused thread). Before editable steal so
  // we only run when not typing.
  if (
    !alt &&
    !mod &&
    !ctrl &&
    !shift &&
    (key === 'arrowleft' || key === 'arrowright')
  ) {
    if (opts.editableTarget) return null;
    const foldAct = resolveArrowFoldAction({
      key,
      layoutMode: layout,
      editableTarget: false,
      contextThreadActive,
      conversationCommentFocused: opts.conversationCommentFocused,
      focusedReviewThread: opts.focusedReviewThread,
      diffThreadFocused,
      hasLineSelection,
    });
    if (foldAct) return foldAct;
  }

  // Composer-focused context (comment / reply / thread / selection form):
  // ⌥E emoji · ⌥C submit · ⌥⌃R resolve · ⌥I focus · ⌥T mode · ⌘↵ submit
  if (opts.composerFocused) {
    const ca = resolveComposerContextShortcutAction({
      mod,
      shift,
      alt,
      ctrl,
      key: opts.key,
      code: opts.code,
      composerFocused: true,
      canResolve: opts.canResolve,
      canToggleMode: opts.canToggleMode,
    });
    if (ca) return ca;
  }

  // Do not steal keys while typing in inputs/textareas/contenteditable
  if (opts.editableTarget) return null;

  // ⌘F / Ctrl+F → Find in PR (exception to opt-only product chords)
  if (mod && !alt && !shift && !ctrl && key === 'f') return 'openSearch';

  // Remaining product shortcuts are Option-only (Ctrl only used with ⌥ for resolve)
  if (!alt || mod) return null;
  if (ctrl) return null;

  // ⌥⇧K → pr+ command palette (same as pulls page)
  if (shift && key === 'k') return 'openPalette';

  // ⌥⇧F → fullscreen shell toggle
  if (shift && key === 'f') return 'toggleFullscreen';

  // ⌥⇧C → focus first conversation comment/review; second press (or Diff
  // thread nav) clears focus chrome (Conversation ring + Diff hit ring).
  if (shift && key === 'c') {
    if (opts.conversationCommentFocused || opts.diffThreadFocused) {
      return 'clearConversationCommentFocus';
    }
    return 'focusConversationComment';
  }

  // ⌥⇧E → restore native GitHub UI (embed only)
  if (shift && key === 'e') {
    if (opts.presentation === 'embed' || opts.isEmbed) return 'restoreNativeView';
    return null;
  }

  // Remaining shift chords (R / arrows handled earlier for Diff)
  if (shift) return null;

  // ⌥B → toggle Diff files nav / Conversation metadata rail
  if (key === 'b') return TOGGLE_SIDE_PANEL_SHORTCUT.action;

  // ⌥. → toggle Diff ↔ Conversation
  if (key === '.' || key === 'period') return 'toggleDiff';

  return null;
}

/**
 * Stable search-anchor for a conversation timeline comment/review row.
 * Also supports structural stops: body (description) and merge box.
 */
export function conversationCommentFocusAnchor(item: any): string | null {
  if (!item) return null;
  const kind = String(item.kind || '');
  if (kind === 'description' || kind === 'body') return 'body';
  if (kind === 'merge' || kind === 'merge-box') return 'merge';
  if (kind === 'composer' || kind === 'comment-form' || kind === 'review-form') {
    return 'composer';
  }
  if (item.id == null) return null;
  const id = String(item.id);
  if (kind === 'issue-comment') return `issue-comment:${id}`;
  if (kind === 'review') return `review:${id}`;
  if (kind === 'review-group') return `review-group:${id}`;
  if (kind === 'review-thread' || kind === 'review-comment') {
    return `review-comment:${id}`;
  }
  return null;
}

/** Options for Conversation ⌥J/K focus order (mirrors virtual row panel order). */
export type ConversationFocusOrderOpts = {
  /**
   * When true (product default UI):
   *   description → composer (comment/review form) → merge → comment/review units
   * When false:
   *   description → comment/review units → merge → composer
   * Matches `buildConversationVirtualRows` panel placement.
   */
  reverseComments?: boolean;
};

/**
 * Pick the first focusable Conversation stop (description).
 */
export function pickConversationCommentFocusTarget(
  items: any,
  opts?: ConversationFocusOrderOpts
): { id: string; kind: string; anchor: string } | null {
  const targets = listConversationCommentFocusTargets(items, opts);
  return targets.length ? targets[0] : null;
}

/**
 * Push a review-thread as one navigable unit (root only — not individual replies).
 */
export function pushThreadFocusTarget(
  out: Array<{ id: string; kind: string; anchor: string }>,
  thread: any
) {
  if (!thread || thread.id == null) return;
  out.push({
    id: String(thread.id),
    kind: 'review-thread',
    anchor: `review-comment:${thread.id}`,
  });
}

/**
 * Timeline comment/review units only (no description/merge). Skips system events
 * and pending review-groups. Thread navigation is by **thread unit**, not per-reply.
 */
export function listConversationTimelineFocusTargets(
  items: any
): Array<{ id: string; kind: string; anchor: string }> {
  const list = Array.isArray(items) ? items : [];
  const out: Array<{ id: string; kind: string; anchor: string }> = [];

  for (const item of list) {
    if (!item) continue;
    // Structural markers passed explicitly are handled separately
    if (
      item.kind === 'description' ||
      item.kind === 'body' ||
      item.kind === 'merge' ||
      item.kind === 'merge-box' ||
      item.kind === 'composer' ||
      item.kind === 'comment-form' ||
      item.kind === 'review-form'
    ) {
      continue;
    }
    // Pending review-group lives in the composer, not the timeline
    if (item.kind === 'review-group' && item.pending) continue;
    // System events are not ⌥J/K stops
    if (item.kind === 'timeline-event') continue;

    if (item.kind === 'review-group') {
      out.push({
        id: String(item.id),
        kind: 'review-group',
        anchor: `review-group:${item.id}`,
      });
      for (const t of item.threads || []) {
        pushThreadFocusTarget(out, t);
      }
      continue;
    }

    if (item.kind === 'review-thread' || item.kind === 'review-comment') {
      pushThreadFocusTarget(out, item);
      continue;
    }

    const anchor = conversationCommentFocusAnchor(item);
    if (!anchor) continue;
    out.push({
      id: String(item.id),
      kind: String(item.kind || ''),
      anchor,
    });
  }

  return out;
}

/**
 * Ordered list of focusable Conversation stops for ⌥J / ⌥K.
 * Mirrors on-screen panel order from `buildConversationVirtualRows`:
 *   reverseComments true:  description → composer → merge → comment/review units
 *   reverseComments false: description → comment/review units → merge → composer
 * Skips pending review-groups and timeline-events.
 */
export function listConversationCommentFocusTargets(
  items: any,
  opts?: ConversationFocusOrderOpts
): Array<{ id: string; kind: string; anchor: string }> {
  const reverse = Boolean(opts?.reverseComments);
  const description = { id: 'body', kind: 'description', anchor: 'body' };
  const composer = { id: 'composer', kind: 'composer', anchor: 'composer' };
  const merge = { id: 'merge', kind: 'merge', anchor: 'merge' };
  const timeline = listConversationTimelineFocusTargets(items);

  if (reverse) {
    return [description, composer, merge, ...timeline];
  }
  return [description, ...timeline, merge, composer];
}

/**
 * Step conversation comment focus by delta (wraps). When no current anchor,
 * first press lands on first (delta>0) or last (delta<0).
 */
export function stepConversationCommentFocus(
  items: any,
  currentAnchor: unknown,
  delta: number,
  opts?: ConversationFocusOrderOpts
): { id: string; kind: string; anchor: string } | null {
  const targets = listConversationCommentFocusTargets(items, opts);
  if (!targets.length) return null;
  const d = delta < 0 ? -1 : 1;
  const cur = String(currentAnchor || '').trim();
  let idx = cur ? targets.findIndex((t) => t.anchor === cur) : -1;
  if (idx < 0) {
    // Seed: down → first, up → last
    return d > 0 ? targets[0] : targets[targets.length - 1];
  }
  const next = ((idx + d) % targets.length + targets.length) % targets.length;
  return targets[next];
}

/**
 * Apply a signed scroll delta to a scroller element (clamped).
 * Pure helper for conversation Opt-arrow / page scroll.
 */
export function applyScrollerDelta(
  el: { scrollTop?: number; clientHeight?: number; scrollHeight?: number } | null,
  deltaPx: number
): number {
  if (!el || typeof el.scrollTop !== 'number') return 0;
  const top = Math.max(0, Number(el.scrollTop) || 0);
  const vh = Math.max(0, Number(el.clientHeight) || 0);
  const sh = Math.max(0, Number(el.scrollHeight) || 0);
  const max = Math.max(0, sh - vh);
  const next = Math.min(max, Math.max(0, top + (Number(deltaPx) || 0)));
  el.scrollTop = next;
  return next;
}
