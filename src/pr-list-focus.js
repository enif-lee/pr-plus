/**
 * PR list keyboard focus (Option/Alt+J/K + Enter).
 * Pure helpers + small policy used by pr-modal-host on /pulls pages.
 */

const PR_LIST_FOCUS_CLASS = 'prp-list-focus';
const PR_LIST_FOCUS_ATTR = 'data-prp-list-focus';
/** Badge element on PR rows while Option is held */
const PR_LIST_HOTKEY_ATTR = 'data-prp-list-hotkey';
/** Badge on New pull request control */
const PR_LIST_NEW_PR_HOTKEY_ATTR = 'data-prp-new-pr-hotkey';

/**
 * Letters reserved for plain Option list-item slots:
 *   j / k — list focus step (⌥J / ⌥K)
 * (New PR is ⌥⇧N — does not consume plain ⌥N)
 */
const PR_LIST_HOTKEY_RESERVED = new Set(['j', 'k']);

/**
 * Build slot string: 1–9 then a–z excluding reserved letters.
 * Yields 9 + 24 = 33 open-by-hotkey targets.
 */
function buildPrListHotkeySlots() {
  let s = '123456789';
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i); // a–z
    if (!PR_LIST_HOTKEY_RESERVED.has(ch)) s += ch;
  }
  return s;
}

/**
 * Hotkey slots next to PR titles while Option is held.
 * 1–9 then remaining alphabet (skip j/k). Index 0 → "1", …
 */
const PR_LIST_HOTKEY_SLOTS = buildPrListHotkeySlots();
/** Option+Shift+N → New pull request */
const PR_LIST_NEW_PR_HOTKEY = 'n';

/**
 * Pulls list filter toolbar (Author / Label / … / Sort).
 * Activated with Option+Shift+letter (does not steal plain ⌥ list hotkeys).
 * Avoids K (⌥⇧K opens pulls palette).
 */
const PR_LIST_FILTER_BAR = [
  {
    id: 'filters-menu',
    title: 'Filters',
    key: 'f',
    code: 'KeyF',
    labelMac: '⌥⇧F',
    labelWin: 'Alt+Shift+F',
    match: /^filters?$/i,
    /** Toggle open/close instead of only open */
    toggle: true,
  },
  {
    id: 'author',
    title: 'Author',
    key: 'a',
    code: 'KeyA',
    labelMac: '⌥⇧A',
    labelWin: 'Alt+Shift+A',
    match: /^author$/i,
  },
  {
    id: 'label',
    title: 'Label',
    key: 'l',
    code: 'KeyL',
    labelMac: '⌥⇧L',
    labelWin: 'Alt+Shift+L',
    match: /^labels?$/i,
  },
  {
    id: 'projects',
    title: 'Projects',
    key: 'p',
    code: 'KeyP',
    labelMac: '⌥⇧P',
    labelWin: 'Alt+Shift+P',
    match: /^projects?$/i,
  },
  {
    id: 'milestones',
    title: 'Milestones',
    key: 'm',
    code: 'KeyM',
    labelMac: '⌥⇧M',
    labelWin: 'Alt+Shift+M',
    match: /^milestones?$/i,
  },
  {
    id: 'reviews',
    title: 'Reviews',
    key: 'r',
    code: 'KeyR',
    labelMac: '⌥⇧R',
    labelWin: 'Alt+Shift+R',
    match: /^reviews?$/i,
  },
  {
    id: 'assignee',
    title: 'Assignee',
    key: 'e',
    code: 'KeyE',
    labelMac: '⌥⇧E',
    labelWin: 'Alt+Shift+E',
    match: /^assignee$/i,
  },
  {
    id: 'sort',
    title: 'Sort',
    key: 't',
    code: 'KeyT',
    labelMac: '⌥⇧T',
    labelWin: 'Alt+Shift+T',
    match: /^sort$/i,
  },
];

const PR_LIST_FILTER_BAR_ATTR = 'data-prp-filter-bar-hotkey';

/** Option/Alt + J/K — move focus through PR list rows. */
const PR_LIST_STEP = {
  prev: {
    key: 'k',
    code: 'KeyK',
    action: 'focusPrev',
    chord: 'opt+k',
    labelMac: '⌥K',
    labelWin: 'Alt+K',
  },
  next: {
    key: 'j',
    code: 'KeyJ',
    action: 'focusNext',
    chord: 'opt+j',
    labelMac: '⌥J',
    labelWin: 'Alt+J',
  },
};

/**
 * Label for list hotkey slot index (0-based), or null if out of range.
 * @param {number} index
 */
function prListHotkeyLabel(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= PR_LIST_HOTKEY_SLOTS.length) {
    return null;
  }
  return PR_LIST_HOTKEY_SLOTS[i];
}

/**
 * Normalize key for Option/Alt combos (⌥J → "∆" etc.).
 * Prefer KeyboardEvent.code when alt is held.
 * @param {{ key?: string, code?: string, alt?: boolean }} opts
 */
function normalizePrListKey(opts = {}) {
  const alt = Boolean(opts.alt);
  const code = String(opts.code || '');
  if (alt) {
    if (code === 'KeyJ' || code === 'keyj') return 'j';
    if (code === 'KeyK' || code === 'keyk') return 'k';
    if (code === 'KeyN' || code === 'keyn') return 'n';
    const d = code.match(/^Digit([1-9])$/i);
    if (d) return d[1];
    // Any letter A–Z (including reserved — caller decides)
    const letter = code.match(/^Key([A-Z])$/i);
    if (letter) return letter[1].toLowerCase();
  }
  return String(opts.key || '').toLowerCase();
}

/**
 * Resolve Option+1–9 / a–z (minus j/k) → 0-based PR row index, or -1.
 * @param {{ alt?: boolean, mod?: boolean, shift?: boolean, code?: string, key?: string }} opts
 */
function resolvePrListHotkeyIndex(opts = {}) {
  if (!opts.alt || opts.mod || opts.shift) return -1;
  const code = String(opts.code || '');
  const d = code.match(/^Digit([1-9])$/i) || code.match(/^Numpad([1-9])$/i);
  if (d) {
    const idx = Number(d[1]) - 1;
    return idx < PR_LIST_HOTKEY_SLOTS.length ? idx : -1;
  }
  // Physical letter → slot via PR_LIST_HOTKEY_SLOTS (skips j/k automatically)
  const letter = code.match(/^Key([A-Z])$/i);
  if (letter) {
    const ch = letter[1].toLowerCase();
    if (PR_LIST_HOTKEY_RESERVED.has(ch)) return -1;
    return PR_LIST_HOTKEY_SLOTS.indexOf(ch);
  }
  // Fallback via normalized key
  const key = normalizePrListKey(opts);
  if (PR_LIST_HOTKEY_RESERVED.has(key)) return -1;
  return PR_LIST_HOTKEY_SLOTS.indexOf(key);
}

/**
 * Resolve Option+Shift+letter for filter toolbar (Author, Label, …).
 * @returns {{ id: string, key: string, labelMac: string }|null}
 */
function resolveFilterBarShortcut(opts = {}) {
  if (!opts.alt || !opts.shift || opts.mod) return null;
  const code = String(opts.code || '');
  // Palette open is ⌥⇧K — leave K free
  if (code === 'KeyK' || code === 'keyk') return null;
  for (const def of PR_LIST_FILTER_BAR) {
    if (code === def.code || code.toLowerCase() === String(def.code).toLowerCase()) {
      return {
        id: def.id,
        key: def.key,
        labelMac: def.labelMac,
        labelWin: def.labelWin,
        title: def.title,
      };
    }
  }
  // Fallback by normalized letter
  const key = normalizePrListKey({
    key: opts.key,
    code: opts.code,
    alt: true,
    shift: true,
  });
  const def = PR_LIST_FILTER_BAR.find((d) => d.key === key);
  if (!def) return null;
  return {
    id: def.id,
    key: def.key,
    labelMac: def.labelMac,
    labelWin: def.labelWin,
    title: def.title,
  };
}

/**
 * Match a control's visible label text to a filter-bar def.
 * @param {string} text
 */
function matchFilterBarLabel(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/⌥⇧[A-Z]/gi, '')
    .replace(/alt\+shift\+[a-z]/gi, '')
    .trim();
  if (!t) return null;
  for (const def of PR_LIST_FILTER_BAR) {
    if (def.match.test(t)) return def;
  }
  return null;
}

/**
 * Next focused index. No current focus (-1): first step lands on first/last.
 * Wraps at ends.
 * @param {number} current  -1 when none
 * @param {number} delta    +1 next / -1 prev
 * @param {number} count
 */
function nextFocusIndex(current, delta, count) {
  const n = Number(count) || 0;
  if (n <= 0) return -1;
  const d = delta < 0 ? -1 : 1;
  const cur = Number.isFinite(current) ? Number(current) : -1;
  if (cur < 0 || cur >= n) {
    return d > 0 ? 0 : n - 1;
  }
  let next = cur + d;
  if (next < 0) next = n - 1;
  if (next >= n) next = 0;
  return next;
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
      doc.querySelector?.('dialog.js-command-palette-dialog') ||
      null
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
 * GitHub's native command palette dialog (⌘K / Ctrl+K) is actively open.
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
 * Escape while GH palette is open / just closed — do not steal the key.
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
 * GitHub command palette can leave its <dialog> in the CSS top layer
 * (`:modal`) after close while open=false / display:none. That blocks all
 * hit-testing on the page (elementFromPoint → html only). Force-release it.
 * @param {Document|null|undefined} doc
 * @returns {boolean} true when a recovery action ran
 */
function recoverGithubCommandPaletteTopLayer(doc) {
  if (!doc || typeof doc.getElementById !== 'function') return false;
  const d =
    doc.getElementById('command-palette-pjax-container') ||
    doc.querySelector?.('dialog.js-command-palette-dialog');
  if (!d) return false;

  let isModal = false;
  try {
    isModal = typeof d.matches === 'function' && d.matches(':modal');
  } catch {
    isModal = false;
  }
  if (!isModal) return false;

  // Legitimately open + visible — do not touch
  if (isGithubCommandPaletteOpen(doc) && d.open) return false;

  let recovered = false;
  try {
    if (typeof d.close === 'function') {
      d.close();
      recovered = true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof d.matches === 'function' && d.matches(':modal')) {
      const parent = d.parentNode;
      const next = d.nextSibling;
      if (parent) {
        parent.removeChild(d);
        if (next) parent.insertBefore(d, next);
        else parent.appendChild(d);
        recovered = true;
      }
    }
  } catch {
    /* ignore */
  }
  return recovered;
}

/**
 * Resolve pulls-list keyboard action.
 * @param {{
 *   mod?: boolean,
 *   shift?: boolean,
 *   alt?: boolean,
 *   key?: string,
 *   code?: string,
 *   editableTarget?: boolean,
 *   modalOpen?: boolean,
 *   isPullsList?: boolean,
 *   hostEnabled?: boolean,
 *   hasFocusedRow?: boolean,
 *   githubPaletteOpen?: boolean,
 *   pullsPaletteOpen?: boolean,
 * }} opts
 * @returns {string|{action:string,index?:number}|null}
 */
function resolvePrListShortcutAction(opts = {}) {
  if (opts.hostEnabled === false) return null;
  if (!opts.isPullsList) return null;
  if (opts.modalOpen) return null;
  // Never fight GitHub's ⌘K command palette
  if (opts.githubPaletteOpen) return null;
  // Pulls palette owns the keyboard while open
  if (opts.pullsPaletteOpen) return null;
  if (opts.editableTarget) return null;

  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const key = normalizePrListKey({
    key: opts.key,
    code: opts.code,
    alt,
  });
  const code = String(opts.code || '');

  // Enter opens the focused PR (no modifiers)
  if (
    !mod &&
    !shift &&
    !alt &&
    (key === 'enter' || code === 'Enter' || code === 'NumpadEnter')
  ) {
    if (!opts.hasFocusedRow) return null;
    return 'openFocused';
  }

  // ⌥⇧N — New pull request
  if (alt && shift && !mod && key === 'n') {
    return 'newPullRequest';
  }

  // ⌥⇧A/L/P/M/R/E/T — filter toolbar (Author, Label, …)
  if (alt && shift && !mod) {
    const filter = resolveFilterBarShortcut({
      alt,
      shift,
      mod,
      code: opts.code,
      key: opts.key,
    });
    if (filter) {
      return { action: 'openFilterBar', filterId: filter.id };
    }
  }

  // ⌥1–9 / ⌥a–z (skip j/k) — open PR at hotkey slot
  if (alt && !mod && !shift) {
    const hotIdx = resolvePrListHotkeyIndex({
      alt,
      mod,
      shift,
      code: opts.code,
      key: opts.key,
    });
    if (hotIdx >= 0) {
      return { action: 'openByHotkey', index: hotIdx };
    }
  }

  // ⌥J / ⌥K (Alt+J/K) — next / prev list row
  if (alt && !mod && !shift && (key === 'j' || key === 'k')) {
    return key === 'k' ? PR_LIST_STEP.prev.action : PR_LIST_STEP.next.action;
  }

  return null;
}

/**
 * Flatten resolve result.
 * @param {string|{action:string,index?:number}|null} resolved
 */
function unwrapPrListAction(resolved) {
  if (!resolved) return { action: null, index: -1, filterId: null };
  if (typeof resolved === 'string') {
    return { action: resolved, index: -1, filterId: null };
  }
  return {
    action: resolved.action || null,
    index: Number.isFinite(resolved.index) ? resolved.index : -1,
    filterId: resolved.filterId || null,
  };
}

/**
 * Find index of focused row; prefer PR number when provided.
 * @param {Element[]} rows
 * @param {{ focusNumber?: number|null, focusClass?: string, getNumber?: (row: Element) => number }} opts
 */
function findFocusIndex(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return -1;
  const focusClass = opts.focusClass || PR_LIST_FOCUS_CLASS;
  const getNumber =
    typeof opts.getNumber === 'function'
      ? opts.getNumber
      : () => Number.NaN;
  const want = opts.focusNumber;
  if (want != null && Number.isFinite(Number(want))) {
    const n = Number(want);
    const byNum = list.findIndex((row) => getNumber(row) === n);
    if (byNum >= 0) return byNum;
  }
  return list.findIndex(
    (row) =>
      row?.classList?.contains?.(focusClass) ||
      row?.getAttribute?.(PR_LIST_FOCUS_ATTR) === '1'
  );
}

/**
 * Apply focus class to rows[index]; clear others.
 * @returns {Element|null}
 */
function applyFocusToRows(rows, index, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const focusClass = opts.focusClass || PR_LIST_FOCUS_CLASS;
  for (const row of list) {
    if (!row?.classList) continue;
    row.classList.remove(focusClass);
    try {
      row.removeAttribute?.(PR_LIST_FOCUS_ATTR);
    } catch {
      /* ignore */
    }
  }
  if (index < 0 || index >= list.length) return null;
  const row = list[index];
  row.classList.add(focusClass);
  try {
    row.setAttribute?.(PR_LIST_FOCUS_ATTR, '1');
  } catch {
    /* ignore */
  }
  return row;
}

const prListFocusApi = {
  PR_LIST_FOCUS_CLASS,
  PR_LIST_FOCUS_ATTR,
  PR_LIST_HOTKEY_ATTR,
  PR_LIST_NEW_PR_HOTKEY_ATTR,
  PR_LIST_FILTER_BAR_ATTR,
  PR_LIST_HOTKEY_SLOTS,
  PR_LIST_HOTKEY_RESERVED,
  PR_LIST_NEW_PR_HOTKEY,
  PR_LIST_FILTER_BAR,
  PR_LIST_STEP,
  buildPrListHotkeySlots,
  prListHotkeyLabel,
  normalizePrListKey,
  nextFocusIndex,
  resolvePrListHotkeyIndex,
  resolveFilterBarShortcut,
  matchFilterBarLabel,
  resolvePrListShortcutAction,
  unwrapPrListAction,
  findFocusIndex,
  applyFocusToRows,
  isGithubCommandPaletteOpen,
  touchGithubCommandPaletteOpen,
  shouldIgnoreModalEscapeForGithubPalette,
  findGithubCommandPaletteDialog,
  isInsideGithubCommandPalette,
  GITHUB_PALETTE_ESCAPE_GRACE_MS,
  recoverGithubCommandPaletteTopLayer,
  __resetGithubPaletteWatchForTests,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = prListFocusApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRListFocus = prListFocusApi;
}
