(function(){
/**
 * Pure policy for PR modal global shortcuts.
 * Diff toggle, command palette, Find (⌘F), conversation comment focus,
 * Option+J/K step nav (find hits / review threads), and Esc navigation.
 */

const STEP_NAV_SHORTCUT = {
  prev: {
    key: 'k',
    code: 'KeyK',
    action: 'stepNavPrev',
    chord: 'opt+k',
    labelMac: '⌥K',
    labelWin: 'Alt+K',
  },
  next: {
    key: 'j',
    code: 'KeyJ',
    action: 'stepNavNext',
    chord: 'opt+j',
    labelMac: '⌥J',
    labelWin: 'Alt+J',
  },
};

const FILE_NAV_SHORTCUT = {
  prev: {
    key: '[',
    code: 'BracketLeft',
    action: 'navFilePrev',
    chord: 'opt+shift+[',
    labelMac: '⌥⇧[',
    labelWin: 'Alt+Shift+[',
  },
  next: {
    key: ']',
    code: 'BracketRight',
    action: 'navFileNext',
    chord: 'opt+shift+]',
    labelMac: '⌥⇧]',
    labelWin: 'Alt+Shift+]',
  },
};

const DIFF_PAGE_SCROLL_SHORTCUT = {
  prev: {
    key: 'arrowup',
    code: 'ArrowUp',
    action: 'scrollDiffPagePrev',
    chord: 'opt+shift+arrowup',
    labelMac: '⌥⇧↑',
    labelWin: 'Alt+Shift+↑',
  },
  next: {
    key: 'arrowdown',
    code: 'ArrowDown',
    action: 'scrollDiffPageNext',
    chord: 'opt+shift+arrowdown',
    labelMac: '⌥⇧↓',
    labelWin: 'Alt+Shift+↓',
  },
};

/** Option+Arrow (no Shift): Diff selection jump / Conversation panel scroll. */
const DIFF_OPT_ARROW_SHORTCUT = {
  selectionSteps: 8,
  scrollStepScale: 1,
  conversationRowHeight: 48,
  prev: {
    key: 'arrowup',
    code: 'ArrowUp',
    action: 'optArrowScrollSelectPrev',
    chord: 'opt+arrowup',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  next: {
    key: 'arrowdown',
    code: 'ArrowDown',
    action: 'optArrowScrollSelectNext',
    chord: 'opt+arrowdown',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
};

const CONVERSATION_SCROLL_SHORTCUT = {
  optPrev: {
    action: 'scrollConversationOptPrev',
    chord: 'opt+arrowup',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  optNext: {
    action: 'scrollConversationOptNext',
    chord: 'opt+arrowdown',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
  pagePrev: {
    action: 'scrollConversationPagePrev',
    chord: 'opt+shift+arrowup',
    labelMac: '⌥⇧↑',
    labelWin: 'Alt+Shift+↑',
  },
  pageNext: {
    action: 'scrollConversationPageNext',
    chord: 'opt+shift+arrowdown',
    labelMac: '⌥⇧↓',
    labelWin: 'Alt+Shift+↓',
  },
};

function optArrowScrollDeltaPx(dir, rowHeight, viewportHeight) {
  const d = dir < 0 ? -1 : 1;
  const rh = Math.max(1, Number(rowHeight) || 22);
  const steps = Number(DIFF_OPT_ARROW_SHORTCUT.selectionSteps) || 8;
  const scale = Number(DIFF_OPT_ARROW_SHORTCUT.scrollStepScale) || 1;
  let dy = d * steps * rh * scale;
  const vp = Math.max(0, Number(viewportHeight) || 0);
  if (vp > 0) {
    const cap = Math.floor(vp * 0.5);
    if (Math.abs(dy) > cap) dy = d * cap;
  }
  return dy;
}

const TOGGLE_VIEWED_SHORTCUT = {
  key: 'r',
  code: 'KeyR',
  action: 'toggleViewedActiveFile',
  chord: 'opt+shift+r',
  labelMac: '⌥⇧R',
  labelWin: 'Alt+Shift+R',
};

/** Option+B — Diff files nav / Conversation metadata rail. */
const TOGGLE_SIDE_PANEL_SHORTCUT = {
  key: 'b',
  code: 'KeyB',
  action: 'toggleSidePanel',
  chord: 'opt+b',
  labelMac: '⌥B',
  labelWin: 'Alt+B',
};

const REVIEW_FILTER_SHORTCUT = {
  unresolved: {
    key: 'u',
    code: 'KeyU',
    filter: 'unresolved',
    action: 'toggleReviewFilterUnresolved',
    chord: 'opt+u',
    labelMac: '⌥U',
    labelWin: 'Alt+U',
  },
  resolved: {
    key: 'r',
    code: 'KeyR',
    filter: 'resolved',
    action: 'toggleReviewFilterResolved',
    chord: 'opt+r',
    labelMac: '⌥R',
    labelWin: 'Alt+R',
  },
  pending: {
    key: 'p',
    code: 'KeyP',
    filter: 'pending',
    action: 'toggleReviewFilterPending',
    chord: 'opt+p',
    labelMac: '⌥P',
    labelWin: 'Alt+P',
  },
};

function toggleReviewFilter(current, target) {
  const t = String(target || '').toLowerCase();
  if (t !== 'unresolved' && t !== 'resolved' && t !== 'pending') {
    return current ?? null;
  }
  const cur = current == null || current === '' ? null : String(current).toLowerCase();
  if (cur === t) return null;
  return t;
}

function nextScrollTopByPage(scrollTop, clientHeight, scrollHeight, delta) {
  const top = Math.max(0, Number(scrollTop) || 0);
  const vh = Math.max(0, Number(clientHeight) || 0);
  const sh = Math.max(0, Number(scrollHeight) || 0);
  if (vh <= 0) return top;
  const step = Math.max(40, Math.floor(vh * 0.9));
  const d = delta < 0 ? -step : step;
  const max = Math.max(0, sh - vh);
  const next = top + d;
  return Math.min(max, Math.max(0, next));
}

function filePathOf(file) {
  return String(file?.filename || file?.path || '').trim();
}

function activeFileNavIndex(files, activePath) {
  const list = Array.isArray(files) ? files : [];
  const path = String(activePath || '').trim();
  if (!list.length || !path) return -1;
  return list.findIndex((f) => filePathOf(f) === path);
}

function resolveAdjacentFileNav(files, activePath, delta) {
  const list = Array.isArray(files) ? files : [];
  const total = list.length;
  if (total <= 0) return { index: -1, total: 0, path: null };
  const d = delta < 0 ? -1 : 1;
  let idx = activeFileNavIndex(list, activePath);
  if (idx < 0) {
    idx = d > 0 ? -1 : 0;
  }
  const next = ((idx + d) % total + total) % total;
  const path = filePathOf(list[next]);
  return { index: next, total, path: path || null };
}

const GITHUB_COMMAND_PALETTE_SELECTOR =
  '#command-palette-pjax-container, dialog.js-command-palette-dialog, command-palette';
const GITHUB_PALETTE_ESCAPE_GRACE_MS = 500;
let _githubPaletteLastOpenAt = 0;

function findGithubCommandPaletteDialog(doc) {
  if (!doc || typeof doc.getElementById !== 'function') return null;
  try {
    return (
      doc.getElementById('command-palette-pjax-container') ||
      (typeof doc.querySelector === 'function'
        ? doc.querySelector('dialog.js-command-palette-dialog')
        : null)
    );
  } catch {
    return null;
  }
}

function isInsideGithubCommandPalette(el) {
  if (!el || typeof el.closest !== 'function') return false;
  try {
    return Boolean(el.closest(GITHUB_COMMAND_PALETTE_SELECTOR));
  } catch {
    return false;
  }
}

/**
 * GitHub's native command palette (⌘K / Ctrl+K) is actively open.
 * Strict: only dialog.open — never stuck :modal / leftover focus / residual paint.
 * @param {Document|null|undefined} doc
 */
function isGithubCommandPaletteOpen(doc) {
  if (!doc || typeof doc.getElementById !== 'function') return false;
  try {
    const d = findGithubCommandPaletteDialog(doc);
    if (!d) return false;
    return Boolean(d.open);
  } catch {
    /* ignore */
  }
  return false;
}

function touchGithubCommandPaletteOpen(doc, now = Date.now()) {
  const open = isGithubCommandPaletteOpen(doc);
  if (open) _githubPaletteLastOpenAt = now;
  return open;
}

/**
 * Escape while GH palette is open / just closed must not close pr+ shell.
 * Only open + short grace after last open observation.
 * @param {Document|null|undefined} doc
 * @param {{ target?: EventTarget|null, now?: number, graceMs?: number }} [opts]
 */
function shouldIgnoreModalEscapeForGithubPalette(doc, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const grace = Number.isFinite(opts.graceMs)
    ? Math.max(0, opts.graceMs)
    : GITHUB_PALETTE_ESCAPE_GRACE_MS;

  if (isGithubCommandPaletteOpen(doc)) {
    _githubPaletteLastOpenAt = now;
    return true;
  }
  if (_githubPaletteLastOpenAt > 0 && now - _githubPaletteLastOpenAt <= grace) {
    return true;
  }
  return false;
}

function __resetGithubPaletteWatchForTests() {
  _githubPaletteLastOpenAt = 0;
}

/**
 * Map KeyboardEvent.code → canonical shortcut token (physical layout).
 * @param {unknown} code
 * @returns {string|null}
 */
function keyTokenFromCode(code) {
  const c = String(code || '');
  if (!c) return null;
  const letter = c.match(/^Key([A-Z])$/i);
  if (letter) return letter[1].toLowerCase();
  const digit = c.match(/^Digit([0-9])$/i) || c.match(/^Numpad([0-9])$/i);
  if (digit) return digit[1];
  switch (c) {
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Period':
      return '.';
    case 'Comma':
      return ',';
    case 'Slash':
      return '/';
    case 'Backslash':
      return '\\';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Backquote':
      return '`';
    case 'Enter':
    case 'NumpadEnter':
      return 'enter';
    case 'Escape':
      return 'escape';
    case 'Space':
      return ' ';
    case 'Tab':
      return 'tab';
    case 'Backspace':
      return 'backspace';
    case 'Delete':
      return 'delete';
    case 'ArrowUp':
      return 'arrowup';
    case 'ArrowDown':
      return 'arrowdown';
    case 'ArrowLeft':
      return 'arrowleft';
    case 'ArrowRight':
      return 'arrowright';
    default:
      return null;
  }
}

function isOptionGlyphKey(key) {
  const k = String(key || '');
  if (!k) return false;
  if (/^[a-zA-Z0-9]$/.test(k)) return false;
  if (/^[\[\].,\/\\;'`=\-]$/.test(k)) return false;
  if (
    /^(escape|enter|tab|backspace|delete|arrowup|arrowdown|arrowleft|arrowright| |space)$/i.test(
      k
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Normalize key for shortcut matching — always prefers KeyboardEvent.code.
 * @param {{ key?: string, code?: string, alt?: boolean }} opts
 * @returns {string}
 */
function normalizeShortcutKey(opts = {}) {
  const fromCode = keyTokenFromCode(opts.code);
  if (fromCode != null) return fromCode;
  const raw = String(opts.key || '');
  if (isOptionGlyphKey(raw)) return raw.toLowerCase();
  if (raw === ' ') return ' ';
  return raw.toLowerCase();
}

function shortcutKeyFromEvent(e) {
  if (!e) return '';
  return normalizeShortcutKey({
    key: e.key,
    code: e.code,
    alt: Boolean(e.altKey),
  });
}

/**
 * Opt-hold badge slots for PR modal chrome.
 */
function buildModalOptHoldSlots(opts = {}) {
  const stack = Array.isArray(opts.stackItems) ? opts.stackItems : [];
  const isMac = opts.isMac !== false;
  const slots = [];

  for (let i = 0; i < Math.min(stack.length, 9); i++) {
    const it = stack[i] || {};
    const num = Number(it.number);
    if (!Number.isFinite(num) || num <= 0) continue;
    slots.push({
      id: `stack-digit-${i + 1}`,
      label: isMac ? `⌥${i + 1}` : `Alt+${i + 1}`,
      chord: `opt+${i + 1}`,
      target: 'stack',
      digit: i + 1,
      number: num,
    });
  }

  // Option+[ / ] remain keybindings only — not Opt-hold badge chrome.

  const layout = String(opts.layoutMode || '');
  if (opts.searchOpen || layout === 'diff') {
    slots.push({
      id: 'step-prev',
      label: isMac ? STEP_NAV_SHORTCUT.prev.labelMac : STEP_NAV_SHORTCUT.prev.labelWin,
      chord: STEP_NAV_SHORTCUT.prev.chord,
      target: 'step-prev',
    });
    slots.push({
      id: 'step-next',
      label: isMac ? STEP_NAV_SHORTCUT.next.labelMac : STEP_NAV_SHORTCUT.next.labelWin,
      chord: STEP_NAV_SHORTCUT.next.chord,
      target: 'step-next',
    });
  }

  return slots;
}

/**
 * @param {'prev'|'next'} which
 * @param {boolean} [isMac]
 */
function stepNavShortcutLabel(which, isMac = false) {
  const s = STEP_NAV_SHORTCUT[which] || STEP_NAV_SHORTCUT.next;
  return isMac ? s.labelMac : s.labelWin;
}

function fileNavShortcutLabel(which, isMac = false) {
  const s = FILE_NAV_SHORTCUT[which] || FILE_NAV_SHORTCUT.next;
  return isMac ? s.labelMac : s.labelWin;
}

/**
 * @param {{
 *   mod: boolean,
 *   shift: boolean,
 *   alt?: boolean,
 *   key: string,
 *   code?: string,
 *   editingBody?: boolean,
 *   editingComment?: boolean|object|null,
 *   paletteOpen?: boolean,
 *   editableTarget?: boolean,
 *   conversationCommentFocused?: boolean,
 *   searchOpen?: boolean,
 *   layoutMode?: string,
 * }} opts
 * @returns {string|null}
 */
function resolveModalShortcutAction(opts = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const key = normalizeShortcutKey({
    key: opts.key,
    code: opts.code,
    alt,
  });
  const paletteOpen = Boolean(opts.paletteOpen);

  // GitHub ⌘K palette owns Escape / keyboard — never close pr+ shell
  if (opts.githubPaletteOpen) return null;

  // Esc is handled in App with layout context (palette / search / edit / diff / close)
  if (key === 'escape') {
    if (paletteOpen) return 'closePalette';
    if (opts.editingBody || opts.editingComment) return 'cancelEdit';
    return 'escapeNav';
  }

  if (paletteOpen) return null;

  // ⌥⇧[ / ⌥⇧]: previous/next file on Diff from current file
  if (alt && !mod && shift && (key === '[' || key === ']')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return key === '['
      ? FILE_NAV_SHORTCUT.prev.action
      : FILE_NAV_SHORTCUT.next.action;
  }

  // ⌥⇧↑ / ⌥⇧↓: page-scroll Diff or Conversation panel
  if (alt && !mod && shift && (key === 'arrowup' || key === 'arrowdown')) {
    if (opts.editableTarget) return null;
    const layout = String(opts.layoutMode || '');
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

  // ⌥↑ / ⌥↓: Diff selection jump or Conversation panel scroll
  if (alt && !mod && !shift && (key === 'arrowup' || key === 'arrowdown')) {
    if (opts.editableTarget) return null;
    const layout = String(opts.layoutMode || '');
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
  if (alt && !mod && shift && key === 'r') {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return TOGGLE_VIEWED_SHORTCUT.action;
  }

  // ⌥J / ⌥K: Find hits, Diff threads, or Conversation comments
  if (alt && !mod && !shift && (key === 'j' || key === 'k')) {
    if (opts.editableTarget && !opts.searchOpen) return null;
    const layout = String(opts.layoutMode || '');
    if (
      !opts.searchOpen &&
      layout !== 'diff' &&
      layout !== 'centered' &&
      layout !== 'conversation'
    ) {
      return null;
    }
    return key === 'k'
      ? STEP_NAV_SHORTCUT.prev.action
      : STEP_NAV_SHORTCUT.next.action;
  }

  // ⌥U / ⌥R / ⌥P: toggle Diff review filters
  if (alt && !mod && !shift && (key === 'u' || key === 'r' || key === 'p')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    if (key === 'u') return REVIEW_FILTER_SHORTCUT.unresolved.action;
    if (key === 'r') return REVIEW_FILTER_SHORTCUT.resolved.action;
    return REVIEW_FILTER_SHORTCUT.pending.action;
  }

  // ⌥[ / ⌥] / ⌥1–9: stack path or list-adjacent PR navigation
  if (alt && !mod && !shift && !opts.editableTarget) {
    if (key === '[') return 'navAdjacentPrev';
    if (key === ']') return 'navAdjacentNext';
    if (/^[1-9]$/.test(key)) return `navStackDigit${key}`;
  }

  // Diff line-selection move — seed first file line when no selection yet
  if (
    !alt &&
    !mod &&
    (key === 'arrowup' || key === 'arrowdown') &&
    String(opts.layoutMode || '') === 'diff'
  ) {
    if (opts.editableTarget) return null;
    if (shift) {
      return key === 'arrowup' ? 'extendSelectionUp' : 'extendSelectionDown';
    }
    return key === 'arrowup' ? 'moveSelectionUp' : 'moveSelectionDown';
  }

  // Do not steal keys while typing in inputs/textareas/contenteditable
  if (opts.editableTarget) return null;

  // ⌘F / Ctrl+F → Find in PR (exception to opt-only product chords)
  if (mod && !alt && !shift && key === 'f') return 'openSearch';

  // Remaining product shortcuts are Option-only
  if (!alt || mod) return null;

  // ⌥⇧K → pr+ command palette
  if (shift && key === 'k') return 'openPalette';

  // ⌥⇧F → fullscreen
  if (shift && key === 'f') return 'toggleFullscreen';

  // ⌥⇧C → conversation comment focus
  if (shift && key === 'c') {
    if (opts.conversationCommentFocused) return 'clearConversationCommentFocus';
    return 'focusConversationComment';
  }

  // ⌥⇧E → restore native (embed)
  if (shift && key === 'e') {
    if (opts.presentation === 'embed' || opts.isEmbed) return 'restoreNativeView';
    return null;
  }

  if (shift) return null;

  // ⌥B → toggle Diff files nav / Conversation metadata rail
  if (key === 'b') return TOGGLE_SIDE_PANEL_SHORTCUT.action;

  // ⌥. → toggle Diff
  if (key === '.' || key === 'period') return 'toggleDiff';

  return null;
}

function sidePanelShortcutLabel(isMac = false) {
  return isMac
    ? TOGGLE_SIDE_PANEL_SHORTCUT.labelMac
    : TOGGLE_SIDE_PANEL_SHORTCUT.labelWin;
}

/**
 * Stable search-anchor for a conversation timeline comment/review row.
 * @param {{ kind?: string, id?: string|number }|null|undefined} item
 * @returns {string|null}
 */
function conversationCommentFocusAnchor(item) {
  if (!item || item.id == null) return null;
  const kind = String(item.kind || '');
  const id = String(item.id);
  if (kind === 'issue-comment') return `issue-comment:${id}`;
  if (kind === 'review') return `review:${id}`;
  if (kind === 'review-group') return `review-group:${id}`;
  if (kind === 'review-thread' || kind === 'review-comment') {
    return `review-comment:${id}`;
  }
  return null;
}

/**
 * Pick the first focusable PR comment/review timeline entry (display order).
 * @param {Array} items
 * @returns {{ id: string, kind: string, anchor: string }|null}
 */
function pickConversationCommentFocusTarget(items) {
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || item.pending) continue;
    const anchor = conversationCommentFocusAnchor(item);
    if (!anchor) continue;
    return {
      id: String(item.id),
      kind: String(item.kind || ''),
      anchor,
    };
  }
  return null;
}

/** One navigable stop per thread (root only — not per-reply). */
function pushThreadFocusTarget(out, thread) {
  if (!thread || thread.id == null) return;
  out.push({
    id: String(thread.id),
    kind: 'review-thread',
    anchor: 'review-comment:' + thread.id,
  });
}

/**
 * Page order: review-group → each included thread unit → standalone threads.
 * Does not step into individual replies.
 */
function listConversationCommentFocusTargets(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (item.kind === 'review-group' && item.pending) continue;

    if (item.kind === 'review-group') {
      out.push({
        id: String(item.id),
        kind: 'review-group',
        anchor: 'review-group:' + item.id,
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
      anchor: anchor,
    });
  }
  return out;
}

function stepConversationCommentFocus(items, currentAnchor, delta) {
  const targets = listConversationCommentFocusTargets(items);
  if (!targets.length) return null;
  const d = delta < 0 ? -1 : 1;
  const cur = String(currentAnchor || '').trim();
  let idx = cur ? targets.findIndex((t) => t.anchor === cur) : -1;
  if (idx < 0) {
    return d > 0 ? targets[0] : targets[targets.length - 1];
  }
  const next = ((idx + d) % targets.length + targets.length) % targets.length;
  return targets[next];
}

function applyScrollerDelta(el, deltaPx) {
  if (!el || typeof el.scrollTop !== 'number') return 0;
  const top = Math.max(0, Number(el.scrollTop) || 0);
  const vh = Math.max(0, Number(el.clientHeight) || 0);
  const sh = Math.max(0, Number(el.scrollHeight) || 0);
  const max = Math.max(0, sh - vh);
  const next = Math.min(max, Math.max(0, top + (Number(deltaPx) || 0)));
  el.scrollTop = next;
  return next;
}

const api = {
  STEP_NAV_SHORTCUT,
  FILE_NAV_SHORTCUT,
  DIFF_PAGE_SCROLL_SHORTCUT,
  DIFF_OPT_ARROW_SHORTCUT,
  CONVERSATION_SCROLL_SHORTCUT,
  optArrowScrollDeltaPx,
  TOGGLE_VIEWED_SHORTCUT,
  TOGGLE_SIDE_PANEL_SHORTCUT,
  sidePanelShortcutLabel,
  REVIEW_FILTER_SHORTCUT,
  toggleReviewFilter,
  nextScrollTopByPage,
  listConversationCommentFocusTargets,
  stepConversationCommentFocus,
  applyScrollerDelta,
  GITHUB_COMMAND_PALETTE_SELECTOR,
  GITHUB_PALETTE_ESCAPE_GRACE_MS,
  findGithubCommandPaletteDialog,
  isInsideGithubCommandPalette,
  isGithubCommandPaletteOpen,
  touchGithubCommandPaletteOpen,
  shouldIgnoreModalEscapeForGithubPalette,
  __resetGithubPaletteWatchForTests,
  keyTokenFromCode,
  isOptionGlyphKey,
  normalizeShortcutKey,
  shortcutKeyFromEvent,
  stepNavShortcutLabel,
  fileNavShortcutLabel,
  activeFileNavIndex,
  resolveAdjacentFileNav,
  buildModalOptHoldSlots,
  resolveModalShortcutAction,
  conversationCommentFocusAnchor,
  pickConversationCommentFocusTarget,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof globalThis !== "undefined") globalThis.PRModalShortcutPolicy = api;
})();
