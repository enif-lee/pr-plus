/**
 * AUTO-GENERATED from src/pr-list-focus.ts
 * SOURCE OF TRUTH: src/pr-list-focus.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
const PR_LIST_FOCUS_CLASS = "prp-list-focus";
const PR_LIST_FOCUS_ATTR = "data-prp-list-focus";
const PR_LIST_HOTKEY_ATTR = "data-prp-list-hotkey";
const PR_LIST_NEW_PR_HOTKEY_ATTR = "data-prp-new-pr-hotkey";
const PR_LIST_HOTKEY_RESERVED = /* @__PURE__ */ new Set(["j", "k"]);
function buildPrListHotkeySlots() {
  let s = "123456789";
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    if (!PR_LIST_HOTKEY_RESERVED.has(ch)) s += ch;
  }
  return s;
}
const PR_LIST_HOTKEY_SLOTS = buildPrListHotkeySlots();
const PR_LIST_NEW_PR_HOTKEY = "n";
const PR_LIST_FILTER_BAR = [
  {
    id: "filters-menu",
    title: "Filters",
    key: "f",
    code: "KeyF",
    labelMac: "\u2325\u21E7F",
    labelWin: "Alt+Shift+F",
    match: /^filters?$/i,
    /** Toggle open/close instead of only open */
    toggle: true
  },
  {
    id: "author",
    title: "Author",
    key: "a",
    code: "KeyA",
    labelMac: "\u2325\u21E7A",
    labelWin: "Alt+Shift+A",
    match: /^author$/i
  },
  {
    id: "label",
    title: "Label",
    key: "l",
    code: "KeyL",
    labelMac: "\u2325\u21E7L",
    labelWin: "Alt+Shift+L",
    match: /^labels?$/i
  },
  {
    id: "projects",
    title: "Projects",
    key: "p",
    code: "KeyP",
    labelMac: "\u2325\u21E7P",
    labelWin: "Alt+Shift+P",
    match: /^projects?$/i
  },
  {
    id: "milestones",
    title: "Milestones",
    key: "m",
    code: "KeyM",
    labelMac: "\u2325\u21E7M",
    labelWin: "Alt+Shift+M",
    match: /^milestones?$/i
  },
  {
    id: "reviews",
    title: "Reviews",
    key: "r",
    code: "KeyR",
    labelMac: "\u2325\u21E7R",
    labelWin: "Alt+Shift+R",
    match: /^reviews?$/i
  },
  {
    id: "assignee",
    title: "Assignee",
    key: "e",
    code: "KeyE",
    labelMac: "\u2325\u21E7E",
    labelWin: "Alt+Shift+E",
    match: /^assignee$/i
  },
  {
    id: "sort",
    title: "Sort",
    key: "t",
    code: "KeyT",
    labelMac: "\u2325\u21E7T",
    labelWin: "Alt+Shift+T",
    match: /^sort$/i
  }
];
const PR_LIST_FILTER_BAR_ATTR = "data-prp-filter-bar-hotkey";
const PR_LIST_STEP = {
  prev: {
    key: "k",
    code: "KeyK",
    action: "focusPrev",
    chord: "opt+k",
    labelMac: "\u2325K",
    labelWin: "Alt+K"
  },
  next: {
    key: "j",
    code: "KeyJ",
    action: "focusNext",
    chord: "opt+j",
    labelMac: "\u2325J",
    labelWin: "Alt+J"
  }
};
function prListHotkeyLabel(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= PR_LIST_HOTKEY_SLOTS.length) {
    return null;
  }
  return PR_LIST_HOTKEY_SLOTS[i];
}
function normalizePrListKey(opts = {}) {
  const alt = Boolean(opts.alt);
  const code = String(opts.code || "");
  if (alt) {
    if (code === "KeyJ" || code === "keyj") return "j";
    if (code === "KeyK" || code === "keyk") return "k";
    if (code === "KeyN" || code === "keyn") return "n";
    const d = code.match(/^Digit([1-9])$/i);
    if (d) return d[1];
    const letter = code.match(/^Key([A-Z])$/i);
    if (letter) return letter[1].toLowerCase();
  }
  return String(opts.key || "").toLowerCase();
}
function resolvePrListHotkeyIndex(opts = {}) {
  if (!opts.alt || opts.mod || opts.shift) return -1;
  const code = String(opts.code || "");
  const d = code.match(/^Digit([1-9])$/i) || code.match(/^Numpad([1-9])$/i);
  if (d) {
    const idx = Number(d[1]) - 1;
    return idx < PR_LIST_HOTKEY_SLOTS.length ? idx : -1;
  }
  const letter = code.match(/^Key([A-Z])$/i);
  if (letter) {
    const ch = letter[1].toLowerCase();
    if (PR_LIST_HOTKEY_RESERVED.has(ch)) return -1;
    return PR_LIST_HOTKEY_SLOTS.indexOf(ch);
  }
  const key = normalizePrListKey(opts);
  if (PR_LIST_HOTKEY_RESERVED.has(key)) return -1;
  return PR_LIST_HOTKEY_SLOTS.indexOf(key);
}
function resolveFilterBarShortcut(opts = {}) {
  if (!opts.alt || !opts.shift || opts.mod) return null;
  const code = String(opts.code || "");
  if (code === "KeyK" || code === "keyk") return null;
  for (const def2 of PR_LIST_FILTER_BAR) {
    if (code === def2.code || code.toLowerCase() === String(def2.code).toLowerCase()) {
      return {
        id: def2.id,
        key: def2.key,
        labelMac: def2.labelMac,
        labelWin: def2.labelWin,
        title: def2.title
      };
    }
  }
  const key = normalizePrListKey({
    key: opts.key,
    code: opts.code,
    alt: true,
    shift: true
  });
  const def = PR_LIST_FILTER_BAR.find((d) => d.key === key);
  if (!def) return null;
  return {
    id: def.id,
    key: def.key,
    labelMac: def.labelMac,
    labelWin: def.labelWin,
    title: def.title
  };
}
function matchFilterBarLabel(text) {
  const t = String(text || "").replace(/\s+/g, " ").replace(/⌥⇧[A-Z]/gi, "").replace(/alt\+shift\+[a-z]/gi, "").trim();
  if (!t) return null;
  for (const def of PR_LIST_FILTER_BAR) {
    if (def.match.test(t)) return def;
  }
  return null;
}
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
const GITHUB_COMMAND_PALETTE_SELECTOR = "#command-palette-pjax-container, dialog.js-command-palette-dialog, command-palette";
const GITHUB_PALETTE_ESCAPE_GRACE_MS = 500;
let _githubPaletteLastOpenAt = 0;
function findGithubCommandPaletteDialog(doc) {
  if (!doc || typeof doc.getElementById !== "function") return null;
  try {
    return doc.getElementById("command-palette-pjax-container") || doc.querySelector?.("dialog.js-command-palette-dialog") || null;
  } catch {
    return null;
  }
}
function isInsideGithubCommandPalette(el) {
  if (!el || typeof el.closest !== "function") return false;
  try {
    return Boolean(el.closest(GITHUB_COMMAND_PALETTE_SELECTOR));
  } catch {
    return false;
  }
}
function isGithubCommandPaletteOpen(doc) {
  if (!doc || typeof doc.getElementById !== "function") return false;
  try {
    const d = findGithubCommandPaletteDialog(doc);
    if (!d) return false;
    return Boolean(d.open);
  } catch {
  }
  return false;
}
function touchGithubCommandPaletteOpen(doc, now = Date.now()) {
  const open = isGithubCommandPaletteOpen(doc);
  if (open) _githubPaletteLastOpenAt = now;
  return open;
}
function shouldIgnoreModalEscapeForGithubPalette(doc, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const grace = Number.isFinite(opts.graceMs) ? Math.max(0, opts.graceMs) : GITHUB_PALETTE_ESCAPE_GRACE_MS;
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
function recoverGithubCommandPaletteTopLayer(doc) {
  if (!doc || typeof doc.getElementById !== "function") return false;
  const d = doc.getElementById("command-palette-pjax-container") || doc.querySelector?.("dialog.js-command-palette-dialog");
  if (!d) return false;
  let isModal = false;
  try {
    isModal = typeof d.matches === "function" && d.matches(":modal");
  } catch {
    isModal = false;
  }
  if (!isModal) return false;
  if (isGithubCommandPaletteOpen(doc) && d.open) return false;
  let recovered = false;
  try {
    if (typeof d.close === "function") {
      d.close();
      recovered = true;
    }
  } catch {
  }
  try {
    if (typeof d.matches === "function" && d.matches(":modal")) {
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
  }
  return recovered;
}
function resolvePrListShortcutAction(opts = {}) {
  if (opts.hostEnabled === false) return null;
  if (!opts.isPullsList) return null;
  if (opts.modalOpen) return null;
  if (opts.githubPaletteOpen) return null;
  if (opts.pullsPaletteOpen) return null;
  if (opts.editableTarget) return null;
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const key = normalizePrListKey({
    key: opts.key,
    code: opts.code,
    alt
  });
  const code = String(opts.code || "");
  if (!mod && !shift && !alt && (key === "enter" || code === "Enter" || code === "NumpadEnter")) {
    if (!opts.hasFocusedRow) return null;
    return "openFocused";
  }
  if (alt && shift && !mod && key === "n") {
    return "newPullRequest";
  }
  if (alt && shift && !mod) {
    const filter = resolveFilterBarShortcut({
      alt,
      shift,
      mod,
      code: opts.code,
      key: opts.key
    });
    if (filter) {
      return { action: "openFilterBar", filterId: filter.id };
    }
  }
  if (alt && !mod && !shift) {
    const hotIdx = resolvePrListHotkeyIndex({
      alt,
      mod,
      shift,
      code: opts.code,
      key: opts.key
    });
    if (hotIdx >= 0) {
      return { action: "openByHotkey", index: hotIdx };
    }
  }
  if (alt && !mod && !shift && (key === "j" || key === "k")) {
    return key === "k" ? PR_LIST_STEP.prev.action : PR_LIST_STEP.next.action;
  }
  return null;
}
function unwrapPrListAction(resolved) {
  if (!resolved) return { action: null, index: -1, filterId: null };
  if (typeof resolved === "string") {
    return { action: resolved, index: -1, filterId: null };
  }
  return {
    action: resolved.action || null,
    index: Number.isFinite(resolved.index) ? resolved.index : -1,
    filterId: resolved.filterId || null
  };
}
function findFocusIndex(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return -1;
  const focusClass = opts.focusClass || PR_LIST_FOCUS_CLASS;
  const getNumber = typeof opts.getNumber === "function" ? opts.getNumber : () => Number.NaN;
  const want = opts.focusNumber;
  if (want != null && Number.isFinite(Number(want))) {
    const n = Number(want);
    const byNum = list.findIndex((row) => getNumber(row) === n);
    if (byNum >= 0) return byNum;
  }
  return list.findIndex(
    (row) => row?.classList?.contains?.(focusClass) || row?.getAttribute?.(PR_LIST_FOCUS_ATTR) === "1"
  );
}
function applyFocusToRows(rows, index, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const focusClass = opts.focusClass || PR_LIST_FOCUS_CLASS;
  for (const row2 of list) {
    if (!row2?.classList) continue;
    row2.classList.remove(focusClass);
    try {
      row2.removeAttribute?.(PR_LIST_FOCUS_ATTR);
    } catch {
    }
  }
  if (index < 0 || index >= list.length) return null;
  const row = list[index];
  row.classList.add(focusClass);
  try {
    row.setAttribute?.(PR_LIST_FOCUS_ATTR, "1");
  } catch {
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
  __resetGithubPaletteWatchForTests
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = prListFocusApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRListFocus = prListFocusApi;
}
