/**
 * AUTO-GENERATED from src/onboarding.ts
 * SOURCE OF TRUTH: src/onboarding.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
// src/onboarding-hotkeys.ts
function isOptHoldEvent(opts) {
  if (!opts?.alt) return false;
  const type = String(opts.type || "keydown");
  return type === "keydown" || type === "keyup";
}
function isOptShiftKEvent(opts) {
  if (!opts?.alt || !opts?.shift || opts?.mod) return false;
  const code = String(opts.code || "");
  if (code === "KeyK" || code === "keyk") return true;
  return String(opts.key || "").toLowerCase() === "k";
}
function isOptPeriodEvent(opts) {
  if (!opts?.alt || opts?.shift || opts?.mod) return false;
  const code = String(opts.code || "");
  if (code === "Period" || code === "period") return true;
  const key = String(opts.key || "");
  return key === "." || key === "Period" || key === "\uFF1E" || key === "\u2026";
}
function isOptDigit1Event(opts) {
  return isOptHotkeySlotEvent(opts, "1");
}
function isOptHotkeySlotEvent(opts, slot) {
  if (!opts?.alt || opts?.shift || opts?.mod) return false;
  const want = String(slot || "").toLowerCase();
  if (!want) return false;
  const code = String(opts.code || "");
  if (/^[1-9]$/.test(want)) {
    if (code === `Digit${want}` || code === `Numpad${want}`) return true;
    return String(opts.key || "") === want;
  }
  if (code === `Key${want.toUpperCase()}` || code === `key${want}`) return true;
  const key = String(opts.key || "").toLowerCase();
  return key === want;
}
function isEscapeEvent(opts) {
  const key = String(opts.key || "");
  const code = String(opts.code || "");
  return key === "Escape" || code === "Escape";
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function fireKey(target, init) {
  if (!target || typeof target.dispatchEvent !== "function") return false;
  const type = init.type || "keydown";
  const mod = Boolean(init.mod);
  const evt = new KeyboardEvent(type, {
    key: init.key,
    code: init.code || "",
    altKey: Boolean(init.alt),
    shiftKey: Boolean(init.shift),
    metaKey: mod,
    ctrlKey: Boolean(init.ctrl) || mod && false,
    bubbles: true,
    cancelable: true
  });
  return target.dispatchEvent(evt);
}
function isOnboardingEnterEvent(opts) {
  if (opts?.alt || opts?.mod) return false;
  return opts?.key === "Enter" || opts?.code === "Enter";
}
function isOnboardingSkipTourEvent(opts) {
  return opts?.key === "Escape" || opts?.code === "Escape";
}
function isOnboardingBackEvent(opts) {
  if (opts?.mod) return false;
  return opts?.key === "Backspace" || opts?.code === "Backspace";
}

// src/onboarding-diff-demo.ts
var DIFF_DEMO_STEPS = [
  {
    id: "select-line",
    title: "1 \xB7 Select a line",
    body: "Click any code line in the Diff. That starts a selection \u2014 the base for new comments.",
    chords: []
  },
  {
    id: "file-next",
    title: "2 \xB7 Next file",
    body: "Jump to the next changed file. Press the shortcut once on the Diff panel.",
    chords: ["\u2325\u21E7]"]
  },
  {
    id: "file-prev",
    title: "3 \xB7 Previous file",
    body: "Go back one file in the same list order.",
    chords: ["\u2325\u21E7["]
  },
  {
    id: "page-down",
    title: "4 \xB7 Scroll Diff down",
    body: "Page the hunk list by roughly one screen.",
    chords: ["\u2325\u21E7\u2193"]
  },
  {
    id: "page-up",
    title: "5 \xB7 Scroll Diff up",
    body: "Page back up the same amount.",
    chords: ["\u2325\u21E7\u2191"]
  },
  {
    id: "move-selection",
    title: "6 \xB7 Move selection",
    body: "With a line selected, use Arrow Down to move one line at a time.",
    chords: ["\u2193"]
  },
  {
    id: "jump-selection",
    title: "7 \xB7 Jump selection",
    body: "Option + Arrow Down hops several lines \u2014 useful on long hunks.",
    chords: ["\u2325\u2193"]
  },
  {
    id: "multi-select",
    title: "8 \xB7 Multi-line range",
    body: "Shift + Arrow Down grows the selection into a block for one comment.",
    chords: ["\u21E7\u2193"]
  },
  {
    id: "comment-island",
    title: "9 \xB7 New comment",
    body: "With a range selected, press \u2325C to open the new-comment composer. You do not need to post \u2014 practice the shortcut, then continue.",
    chords: ["\u2325C"]
  },
  {
    id: "clear-selection",
    title: "10 \xB7 Clear selection",
    body: "Press Esc on the Diff to dismiss the selection bar (Enter skips this tip).",
    chords: ["Esc"]
  },
  {
    id: "thread-next",
    title: "11 \xB7 Next review thread",
    body: "PR #1 has demo thread groups. Press \u2325J to step to the next review thread on Diff.",
    chords: ["\u2325J"]
  },
  {
    id: "thread-prev",
    title: "12 \xB7 Previous review thread",
    body: "Press \u2325K to step backward through review threads.",
    chords: ["\u2325K"]
  },
  {
    id: "wrap-up",
    title: "13 \xB7 Done",
    body: "You practiced Diff nav and thread jumping. Press Enter to continue the tour.",
    chords: []
  }
];
function splitChordKeys(chord) {
  let s = String(chord ?? "").trim();
  if (!s) return [];
  if (s.includes("+")) {
    return s.split("+").map((p) => p.trim()).filter(Boolean);
  }
  if (/^(Esc|Enter|Tab|Space|Spacebar|Return)$/i.test(s)) {
    return [s.length <= 3 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase()];
  }
  const keys = [];
  const MODS = ["\u2325", "\u21E7", "\u2318", "\u2303", "\u2387"];
  let guard = 0;
  while (s && guard++ < 16) {
    let hit = false;
    for (const m of MODS) {
      if (s.startsWith(m)) {
        keys.push(m);
        s = s.slice(m.length);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    break;
  }
  if (!s) return keys;
  if (["\u2191", "\u2193", "\u2190", "\u2192"].includes(s[0])) {
    keys.push(s[0]);
    s = s.slice(1);
  }
  if (s) {
    if (/^[a-z]$/.test(s)) keys.push(s.toUpperCase());
    else keys.push(s);
  }
  return keys;
}
function chordLabelsToKbdParts(chords, multiJoiner = "or") {
  const list = (Array.isArray(chords) ? chords : [chords]).map((c) => String(c || "").trim()).filter(Boolean);
  const parts = [];
  list.forEach((chord, i) => {
    if (i > 0) parts.push(multiJoiner);
    const keys = splitChordKeys(chord);
    keys.forEach((k, j) => {
      if (j > 0) parts.push("+");
      parts.push({ k });
    });
  });
  return parts;
}
function matchesDiffDemoChord(opts, chord) {
  const c = String(chord || "").trim();
  if (!c) return false;
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const mod = Boolean(opts.mod);
  if (mod) return false;
  const code = String(opts.code || "");
  const key = String(opts.key || "");
  if (c === "Esc" || c === "Escape") {
    return key === "Escape" || code === "Escape";
  }
  if (c === "\u2193" || c === "ArrowDown") {
    return !alt && !shift && (key === "ArrowDown" || code === "ArrowDown");
  }
  if (c === "\u2191" || c === "ArrowUp") {
    return !alt && !shift && (key === "ArrowUp" || code === "ArrowUp");
  }
  if (c === "\u2325\u2193") {
    return alt && !shift && (key === "ArrowDown" || code === "ArrowDown");
  }
  if (c === "\u2325\u2191") {
    return alt && !shift && (key === "ArrowUp" || code === "ArrowUp");
  }
  if (c === "\u21E7\u2193") {
    return !alt && shift && (key === "ArrowDown" || code === "ArrowDown");
  }
  if (c === "\u21E7\u2191") {
    return !alt && shift && (key === "ArrowUp" || code === "ArrowUp");
  }
  if (c === "\u2325\u21E7\u2193") {
    return alt && shift && (key === "ArrowDown" || code === "ArrowDown");
  }
  if (c === "\u2325\u21E7\u2191") {
    return alt && shift && (key === "ArrowUp" || code === "ArrowUp");
  }
  if (c === "\u2325\u21E7]" || c === "\u2325\u21E7\u3011") {
    return alt && shift && (code === "BracketRight" || key === "]" || key === "}");
  }
  if (c === "\u2325\u21E7[" || c === "\u2325\u21E7\u3010") {
    return alt && shift && (code === "BracketLeft" || key === "[" || key === "{");
  }
  if (c === "\u2325J" || c === "\u2325j") {
    return alt && !shift && (code === "KeyJ" || key.toLowerCase() === "j");
  }
  if (c === "\u2325K" || c === "\u2325k") {
    return alt && !shift && (code === "KeyK" || key.toLowerCase() === "k");
  }
  if (c === "\u2325C" || c === "\u2325c") {
    return alt && !shift && (code === "KeyC" || key.toLowerCase() === "c");
  }
  return false;
}
function matchesDiffDemoStep(opts, step) {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  return chords.some((ch) => matchesDiffDemoChord(opts, ch));
}
var CONVERSATION_DEMO_STEPS = [
  {
    id: "conv-jk",
    title: "1 \xB7 Step Conversation",
    body: "On Conversation, \u2325J / \u2325K moves focus in this order: 1) PR description, 2) comments & review threads, 3) merge box. Press \u2325J a few times.",
    chords: ["\u2325J"]
  },
  {
    id: "conv-jk-back",
    title: "2 \xB7 Step backward",
    body: "\u2325K steps focus the other way through the same stops (merge \u2192 comments \u2192 description).",
    chords: ["\u2325K"]
  },
  {
    id: "conv-adjacent",
    title: "3 \xB7 Adjacent PRs",
    body: "\u2325] opens the next PR, then \u2325[ comes back. Type them in that order so you return to demo PR #1.",
    chords: ["\u2325]", "\u2325["]
  }
];

// src/onboarding-core.ts
var ONBOARDING_ROOT_ID = "prp-onboarding";
var DEMO_PR = {
  owner: "enif-lee",
  repo: "pr-plus",
  number: 1,
  pathSuffix: "/enif-lee/pr-plus/pull/1",
  pullsUrl: "https://github.com/enif-lee/pr-plus/pulls",
  prUrl: "https://github.com/enif-lee/pr-plus/pull/1"
};
var ONBOARDING_STEPS = [
  { id: "pat", title: "PAT setup", index: 0 },
  { id: "opt", title: "Hold Option", index: 1 },
  { id: "openPr", title: "Open demo PR #1", index: 2 },
  { id: "convDemo", title: "Conversation shortcuts", index: 3 },
  { id: "diffToggle", title: "Open Diff", index: 4 },
  { id: "diffDemo", title: "Diff shortcuts", index: 5 },
  { id: "optShiftK", title: "Command palette", index: 6 },
  { id: "prefs", title: "Feature settings", index: 7 },
  { id: "done", title: "All set", index: 8 }
];
var PR_DEPENDENT_STEPS = [
  "openPr",
  "convDemo",
  "diffToggle",
  "diffDemo"
];
function shouldShowOnboarding(prefs, pathname) {
  if (prefs?.onboardingCompleted === true) return false;
  const path = String(pathname || "");
  if (!path.includes("/pulls")) return false;
  if (/\/pull\/\d+/.test(path)) return false;
  return true;
}
function clampOnboardingStep(step) {
  const max = ONBOARDING_STEPS.length - 1;
  const n = Number(step);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}
function stepIdAt(step) {
  return ONBOARDING_STEPS[clampOnboardingStep(step)]?.id || "pat";
}
function countPullListItems(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return 0;
  const links = doc.querySelectorAll(
    'a[href*="/pull/"], a[id^="issue_"], .js-issue-row, [data-hovercard-type="pull_request"]'
  );
  const rows = doc.querySelectorAll(
    '.js-issue-row, [data-testid="issue-row"], .Box-row'
  );
  if (rows.length > 0) return rows.length;
  return links.length;
}
function buildOnboardingHotkeySlots() {
  let s = "123456789";
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    if (ch !== "j" && ch !== "k") s += ch;
  }
  return s;
}
var ONBOARDING_HOTKEY_SLOTS = buildOnboardingHotkeySlots();
var ONBOARDING_TARGET_PR_CLASS = "prp-onboarding-target-pr";
var ONBOARDING_TARGET_PR_ATTR = "data-prp-onboarding-target";
function findDemoPrLink(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  const n = Number(DEMO_PR.number) || 1;
  const candidates = [
    ...doc.querySelectorAll('a[href*="/pull/"]')
  ];
  for (const a of candidates) {
    const href = String(a.getAttribute?.("href") || "");
    if (new RegExp(`/pull/${n}(?:$|[?#/])`).test(href) || href.endsWith(`/pull/${n}`)) {
      const text = (a.textContent || "").trim();
      if (text.length > 2 || !candidates.some((x) => x !== a)) return a;
    }
  }
  return candidates.find(
    (a) => new RegExp(`/pull/${n}(?:$|[?#/])`).test(
      String(a.getAttribute?.("href") || "")
    )
  ) || null;
}
function listPullRowsForHotkeys(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return [];
  const selectors = [
    ".js-navigation-container .js-issue-row",
    ".js-issue-row",
    '[data-testid="issue-row"]',
    ".Box-row.js-navigation-item"
  ];
  for (const sel of selectors) {
    const rows = [...doc.querySelectorAll(sel)];
    if (rows.length) return rows;
  }
  return [];
}
function resolveDemoPrHotkey(doc) {
  const link = findDemoPrLink(doc);
  if (!link) {
    return { link: null, row: null, slot: null, index: -1 };
  }
  const rows = listPullRowsForHotkeys(doc);
  let index = rows.findIndex((row2) => row2.contains(link));
  if (index < 0) {
    let el = link;
    while (el && el !== doc?.body) {
      index = rows.indexOf(el);
      if (index >= 0) break;
      el = el.parentElement;
    }
  }
  const row = index >= 0 ? rows[index] : link.closest(
    '.js-issue-row, [data-testid="issue-row"], .Box-row, li'
  ) || link;
  const slot = index >= 0 && index < ONBOARDING_HOTKEY_SLOTS.length ? ONBOARDING_HOTKEY_SLOTS[index] : null;
  return { link, row, slot, index };
}

// src/onboarding-ui.ts
function clearDemoPrHighlight(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return;
  try {
    doc.querySelectorAll(
      `.${ONBOARDING_TARGET_PR_CLASS}, [${ONBOARDING_TARGET_PR_ATTR}]`
    ).forEach((el) => {
      el.classList.remove(ONBOARDING_TARGET_PR_CLASS);
      try {
        el.removeAttribute(ONBOARDING_TARGET_PR_ATTR);
      } catch {
      }
    });
  } catch {
  }
}
function highlightDemoPr(doc) {
  clearDemoPrHighlight(doc);
  const info = resolveDemoPrHotkey(doc);
  if (!info.row) return info;
  try {
    info.row.classList.add(ONBOARDING_TARGET_PR_CLASS);
    info.row.setAttribute(ONBOARDING_TARGET_PR_ATTR, "1");
    if (typeof info.row.scrollIntoView === "function") {
      info.row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  } catch {
  }
  return info;
}
function clickDemoPr(doc) {
  const a = findDemoPrLink(doc);
  if (!a) return false;
  try {
    a.click();
    return true;
  } catch {
    return false;
  }
}
function isModalOpen(doc) {
  if (!doc) return false;
  return Boolean(
    doc.querySelector(
      ".prp-overlay, .prp-modal, #prp-modal-host .prp-modal, #prp-page-embed .prp-modal"
    )
  );
}
function isDiffLayout(doc) {
  if (!doc || typeof doc.querySelector !== "function") return false;
  return Boolean(doc.querySelector(".prp-modal--diff"));
}
function resolveOnboardingPlan(opts) {
  const hasPulls = Boolean(opts?.hasPulls);
  return ONBOARDING_STEPS.filter((s) => {
    if (!hasPulls && PR_DEPENDENT_STEPS.includes(s.id)) return false;
    return true;
  }).map((s) => s.id);
}
function matchesConversationDemoChord(opts, chord) {
  const c = String(chord || "").trim();
  if (!c) return false;
  if (matchesDiffDemoChord(opts, c)) return true;
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const mod = Boolean(opts.mod);
  if (!alt || shift || mod) return false;
  const code = String(opts.code || "");
  const key = String(opts.key || "");
  if (c === "\u2325]" || c === "\u2325\u3011") {
    return code === "BracketRight" || key === "]" || key === "}";
  }
  if (c === "\u2325[" || c === "\u2325\u3010") {
    return code === "BracketLeft" || key === "[" || key === "{";
  }
  return false;
}
function matchesConversationDemoStep(opts, step) {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  return chords.some((ch) => matchesConversationDemoChord(opts, ch));
}
function matchesConversationDemoChordAt(opts, step, chordIndex = 0) {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  const i = Math.max(0, Math.min(chords.length - 1, Math.floor(Number(chordIndex) || 0)));
  return matchesConversationDemoChord(opts, chords[i]);
}
function nextConversationDemoChordIndex(step, chordIndex = 0) {
  const chords = step?.chords || [];
  if (!chords.length) return "done";
  const i = Math.max(0, Math.floor(Number(chordIndex) || 0));
  if (i + 1 >= chords.length) return "done";
  return i + 1;
}
function readOpenModalPrNumber(doc) {
  if (!doc || typeof doc.querySelector !== "function") return null;
  const el = doc.querySelector(".prp-header__number");
  const text = String(el?.textContent || "").trim();
  const m = text.match(/#\s*(\d+)/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const labeled = doc.querySelector(
    '[aria-label*="Pull request #"], [aria-label*="pull request #"]'
  );
  const aria = String(labeled?.getAttribute?.("aria-label") || "");
  const m2 = aria.match(/#\s*(\d+)/);
  if (m2) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
function isDemoPrModalOpen(doc) {
  if (!isModalOpen(doc)) return false;
  const n = readOpenModalPrNumber(doc);
  if (n == null) return false;
  return n === Number(DEMO_PR.number);
}
function openDemoPrModal(opts = {}) {
  const open = typeof opts.openModal === "function" ? opts.openModal : typeof globalThis !== "undefined" && typeof globalThis.PRModalHost?.openModal === "function" ? (args) => globalThis.PRModalHost.openModal(args) : null;
  if (!open) return false;
  try {
    void open({
      owner: DEMO_PR.owner,
      repo: DEMO_PR.repo,
      number: DEMO_PR.number,
      page: opts.page || null
    });
    return true;
  } catch {
    return false;
  }
}
function ensureDemoPrForDiffStep(doc, opts = {}) {
  const page = isDiffLayout(doc) ? "diff" : "conversation";
  if (opts.force) {
    return openDemoPrModal({ openModal: opts.openModal, page });
  }
  if (!isModalOpen(doc)) {
    return openDemoPrModal({ openModal: opts.openModal, page });
  }
  const n = readOpenModalPrNumber(doc);
  if (n == null) return false;
  if (n === Number(DEMO_PR.number)) return false;
  return openDemoPrModal({ openModal: opts.openModal, page });
}
function createOnboardingTour(deps) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const getPrefs = deps.getPrefs;
  const setPrefs = deps.setPrefs;
  const isOnboardingDone = deps.isOnboardingDone;
  const markOnboardingDone = deps.markOnboardingDone;
  const getTokenStatus = deps.getTokenStatus;
  const setToken = deps.setToken;
  const getPathname = deps.getPathname || (() => String(win.location?.pathname || ""));
  let plan = resolveOnboardingPlan({ hasPulls: true });
  let planIndex = 0;
  let root = null;
  let disposed = false;
  let statusText = "";
  let statusError = false;
  let tokenConfigured = false;
  let tokenMask = "";
  let prefsDraft = null;
  let keyHandler = null;
  let pollTimer = null;
  let demoSubIndex = 0;
  let convSubIndex = 0;
  let convChordIndex = 0;
  let modalOpenOnOpenPrEnter = false;
  let diffOpenOnDiffToggleEnter = false;
  let userPressedOptPeriod = false;
  function resolveOpenModal() {
    if (typeof deps.openModal === "function") return deps.openModal;
    try {
      const host = typeof globalThis !== "undefined" ? globalThis.PRModalHost : null;
      if (host && typeof host.openModal === "function") {
        return (args) => host.openModal(args);
      }
    } catch {
    }
    return null;
  }
  function ensureDemoPrForCurrentDiffStep(force = false) {
    const opened = ensureDemoPrForDiffStep(doc, {
      openModal: resolveOpenModal(),
      force
    });
    if (opened) {
      setStatus(`Using demo PR #${DEMO_PR.number} for Diff tips\u2026`);
    }
    return opened;
  }
  function currentId() {
    return plan[planIndex] || "done";
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearDemoPrHighlight(doc);
    if (keyHandler) {
      win.removeEventListener("keydown", keyHandler, true);
      keyHandler = null;
    }
    if (pollTimer) {
      win.clearInterval(pollTimer);
      pollTimer = null;
    }
    try {
      root?.remove();
    } catch {
    }
    root = null;
  }
  async function markComplete() {
    let saved = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        if (typeof markOnboardingDone === "function") {
          saved = Boolean(await markOnboardingDone());
        } else {
          const next = await setPrefs({ onboardingCompleted: true });
          saved = Boolean(next?.onboardingCompleted);
        }
        if (saved) break;
        lastErr = new Error("onboarding write did not stick");
      } catch (err) {
        lastErr = err;
        await sleep(80 * (attempt + 1));
      }
    }
    try {
      doc.documentElement?.setAttribute(
        "data-prp-onboarding-done",
        saved ? "1" : "0"
      );
    } catch {
    }
    if (!saved) {
      setStatus(
        lastErr?.message || "Could not save setup progress \u2014 try again or Skip tour",
        true
      );
    }
    dispose();
  }
  async function refreshTokenStatus() {
    try {
      const st = await getTokenStatus();
      tokenConfigured = Boolean(st?.configured);
      tokenMask = String(st?.mask || "");
    } catch {
      tokenConfigured = false;
      tokenMask = "";
    }
  }
  async function ensurePrefsDraft() {
    if (prefsDraft) return prefsDraft;
    try {
      prefsDraft = { ...await getPrefs() };
    } catch {
      prefsDraft = {
        reverseComments: true,
        autoOpenEmbed: true,
        singleFileMode: false,
        treeView: true,
        onboardingCompleted: false
      };
    }
    return prefsDraft;
  }
  function setStatus(text, isError = false) {
    statusText = text || "";
    statusError = Boolean(isError);
    const el2 = root?.querySelector(".prp-onboarding__status");
    if (el2) {
      el2.textContent = statusText;
      el2.classList.toggle("prp-onboarding__status--err", statusError);
    }
  }
  function goToPlanIndex(next) {
    planIndex = Math.max(0, Math.min(plan.length - 1, next));
    statusText = "";
    demoSubIndex = 0;
    convSubIndex = 0;
    convChordIndex = 0;
    userPressedOptPeriod = false;
    const id = plan[planIndex];
    clearDemoPrHighlight(doc);
    if (id === "openPr") {
      modalOpenOnOpenPrEnter = isModalOpen(doc);
      if (!modalOpenOnOpenPrEnter) {
        highlightDemoPr(doc);
      }
    }
    if (id === "diffToggle") {
      ensureDemoPrForCurrentDiffStep(true);
      diffOpenOnDiffToggleEnter = isDiffLayout(doc);
    }
    if (id === "diffDemo") {
      demoSubIndex = 0;
      ensureDemoPrForCurrentDiffStep(true);
    }
    if (id === "convDemo") {
      convSubIndex = 0;
      convChordIndex = 0;
    }
    render();
  }
  function advance() {
    if (planIndex >= plan.length - 1) {
      void markComplete();
      return;
    }
    goToPlanIndex(planIndex + 1);
  }
  function goBack() {
    if (planIndex <= 0) return;
    goToPlanIndex(planIndex - 1);
  }
  function skipToSettings() {
    const prefsIdx = plan.indexOf("prefs");
    const id = currentId();
    if (prefsIdx >= 0 && planIndex < prefsIdx && id !== "prefs") {
      goToPlanIndex(prefsIdx);
      setStatus("Skipped ahead \u2014 review feature settings, then Done.");
      return;
    }
    void markComplete();
  }
  function el(tag, className = "", text = "") {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function kbdRow(parts) {
    const row = el("div", "prp-onboarding__kbd-row");
    for (const p of parts) {
      if (typeof p === "string") {
        row.appendChild(el("span", "prp-onboarding__kbd-sep", p));
      } else {
        const key = String(p.k || "");
        let kbdClass = "prp-onboarding__kbd";
        if (key === "\u21E7" || key === "Shift") {
          kbdClass += " prp-onboarding__kbd--shift";
        }
        const kbd = el("kbd", kbdClass, key);
        try {
          if (key === "\u21E7" || key === "Shift") {
            kbd.setAttribute("data-key", "shift");
          } else if (key === "\u2325" || key === "Alt") {
            kbd.setAttribute("data-key", "opt");
          } else if (key === "\u2318" || key === "Ctrl" || key === "\u2303") {
            kbd.setAttribute("data-key", "mod");
          }
        } catch {
        }
        row.appendChild(kbd);
      }
    }
    return row;
  }
  function kbdRowFromChords(chords, multiJoiner = "or") {
    return kbdRow(chordLabelsToKbdParts(chords, multiJoiner));
  }
  function renderBody(body) {
    body.innerHTML = "";
    const id = currentId();
    if (id === "pat") {
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          tokenConfigured ? "GitHub access is ready. Continue to learn the keyboard shortcuts \u2014 or paste a new token below to replace it." : "pr+ needs a GitHub personal access token to load your PRs. Paste a token for github.com, then continue."
        )
      );
      if (tokenConfigured && tokenMask) {
        const saved = el("p", "prp-onboarding__hint", `Saved: ${tokenMask}`);
        body.appendChild(saved);
      }
      const label = el("label", "prp-onboarding__label", "github.com PAT");
      label.setAttribute("for", "prp-onboarding-token");
      body.appendChild(label);
      const input = doc.createElement("input");
      input.id = "prp-onboarding-token";
      input.type = "password";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = "ghp_\u2026 / github_pat_\u2026";
      input.className = "prp-onboarding__input";
      body.appendChild(input);
      const link = el("a", "prp-onboarding__link", "Create a token");
      link.href = "https://github.com/settings/tokens";
      link.target = "_blank";
      link.rel = "noreferrer";
      body.appendChild(link);
      return;
    }
    if (id === "opt") {
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          "Most pr+ shortcuts start with Option (Mac) or Alt (Windows/Linux). Hold that key on the PR list to reveal number badges on each row."
        )
      );
      body.appendChild(kbdRow([{ k: "\u2325" }, "or", { k: "Alt" }]));
      body.appendChild(
        el(
          "p",
          "prp-onboarding__hint prp-onboarding__hint--pulse",
          "Hold Option / Alt once to continue\u2026"
        )
      );
      return;
    }
    if (id === "openPr") {
      const modalNow = isModalOpen(doc);
      const hot = resolveDemoPrHotkey(doc);
      const slot = hot.slot;
      if (!modalNow && hot.row && !hot.row.classList.contains(ONBOARDING_TARGET_PR_CLASS)) {
        highlightDemoPr(doc);
      }
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          modalNow ? `A PR shell is open. Prefer demo PR #${DEMO_PR.number} (20+ files, 5 review threads) for the next steps. Continue when ready.` : `Open demo PR #${DEMO_PR.number} from the list \u2014 it is highlighted with a blue border. Hold Option to see list badges, then press the shortcut for that row.`
        )
      );
      if (!modalNow) {
        if (slot) {
          body.appendChild(
            kbdRow([{ k: "\u2325" }, "+", { k: String(slot).toUpperCase() }])
          );
          body.appendChild(
            el(
              "p",
              "prp-onboarding__hint prp-onboarding__hint--pulse",
              `Hold Option (Alt), then press ${String(slot).toUpperCase()} \u2014 that opens the highlighted PR #${DEMO_PR.number}.`
            )
          );
          body.appendChild(
            el(
              "p",
              "prp-onboarding__hint",
              "You can also click the highlighted row. We will continue automatically when the PR shell opens."
            )
          );
        } else if (hot.link) {
          body.appendChild(
            el(
              "p",
              "prp-onboarding__hint prp-onboarding__hint--pulse",
              `Click the highlighted PR #${DEMO_PR.number} row on the list to open it\u2026`
            )
          );
        } else {
          body.appendChild(
            el(
              "p",
              "prp-onboarding__hint prp-onboarding__hint--pulse",
              `Find PR #${DEMO_PR.number} (${DEMO_PR.pathSuffix}) on this list and open it\u2026`
            )
          );
        }
      } else {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Press Continue when you are ready\u2026"
          )
        );
      }
      return;
    }
    if (id === "convDemo") {
      if (!isModalOpen(doc)) {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Open a PR shell first (demo PR #1), then practice Conversation shortcuts here."
          )
        );
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Stay on Conversation (not Diff) for these tips\u2026"
          )
        );
        return;
      }
      if (isDiffLayout(doc)) {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Switch to Conversation for these tips, then come back to Diff later."
          )
        );
        body.appendChild(kbdRow([{ k: "\u2325" }, "+", { k: "." }]));
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Press \u2325. to leave Diff, then practice \u2325J / \u2325K\u2026"
          )
        );
        return;
      }
      const tip = CONVERSATION_DEMO_STEPS[convSubIndex] || CONVERSATION_DEMO_STEPS[0];
      const total = CONVERSATION_DEMO_STEPS.length;
      body.appendChild(
        el(
          "p",
          "prp-onboarding__demo-progress",
          `Tip ${convSubIndex + 1} / ${total}`
        )
      );
      body.appendChild(el("p", "prp-onboarding__lead", tip.title));
      body.appendChild(el("p", "prp-onboarding__hint", tip.body));
      if (tip.chords.length) {
        const sequential = tip.chords.length > 1;
        body.appendChild(
          kbdRowFromChords(tip.chords, sequential ? "then" : "or")
        );
        if (sequential) {
          const nextChord = tip.chords[Math.max(0, Math.min(tip.chords.length - 1, convChordIndex))] || tip.chords[0];
          body.appendChild(
            el(
              "p",
              "prp-onboarding__hint",
              `Step ${convChordIndex + 1} / ${tip.chords.length}: press ${nextChord}`
            )
          );
        }
      }
      body.appendChild(
        el(
          "p",
          "prp-onboarding__hint prp-onboarding__hint--pulse",
          tip.chords.length > 1 ? "Press each shortcut in order (or Enter to skip this tip)\u2026" : tip.chords.length ? "Press the shortcut (or Enter to skip this tip)\u2026" : "Press Enter for the next tip\u2026"
        )
      );
      return;
    }
    if (id === "diffToggle") {
      const nowDiff = isDiffLayout(doc);
      const onDemo = isDemoPrModalOpen(doc);
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          nowDiff ? `You are on Diff for demo PR #${DEMO_PR.number}. Press \u2325. to switch to Conversation and back, or Continue to keep Diff open.` : onDemo ? `Demo PR #${DEMO_PR.number} is open. Switch to Diff to review code \u2014 Conversation is always one press away again.` : `Opening demo PR #${DEMO_PR.number} for Diff practice. Then press \u2325. to switch to Diff.`
        )
      );
      body.appendChild(kbdRow([{ k: "\u2325" }, "+", { k: "." }]));
      body.appendChild(
        el(
          "p",
          "prp-onboarding__hint prp-onboarding__hint--pulse",
          nowDiff ? "Press \u2325. (or Continue) to move on\u2026" : "Press \u2325. (Option + period) to open Diff\u2026"
        )
      );
      return;
    }
    if (id === "diffDemo") {
      if (!isDiffLayout(doc)) {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Open the Diff view first, then practice each shortcut yourself."
          )
        );
        body.appendChild(kbdRow([{ k: "\u2325" }, "+", { k: "." }]));
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Press \u2325. to open Diff, then continue\u2026"
          )
        );
        return;
      }
      const tip = DIFF_DEMO_STEPS[demoSubIndex] || DIFF_DEMO_STEPS[0];
      const total = DIFF_DEMO_STEPS.length;
      const progress = el(
        "p",
        "prp-onboarding__demo-progress",
        `Tip ${demoSubIndex + 1} / ${total}`
      );
      body.appendChild(progress);
      body.appendChild(el("p", "prp-onboarding__lead", tip.title));
      body.appendChild(el("p", "prp-onboarding__hint", tip.body));
      if (tip.chords.length) {
        body.appendChild(kbdRowFromChords(tip.chords, "or"));
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Press the shortcut on the Diff panel (or Enter to skip this tip)\u2026"
          )
        );
      } else {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            tip.id === "wrap-up" ? "Press Enter to continue the tour\u2026" : "Do this in Diff, then press Enter for the next tip\u2026"
          )
        );
      }
      return;
    }
    if (id === "optShiftK") {
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          "The command palette searches PRs, filters, and actions. It works on the pulls list and inside the review shell."
        )
      );
      body.appendChild(
        kbdRow([{ k: "\u2325" }, "+", { k: "\u21E7" }, "+", { k: "K" }])
      );
      body.appendChild(
        el(
          "p",
          "prp-onboarding__hint prp-onboarding__hint--pulse",
          "Press \u2325\u21E7K (Alt+Shift+K) once to continue\u2026"
        )
      );
      return;
    }
    if (id === "prefs") {
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          "Pick defaults for how pr+ loads and displays reviews. You can change these later from the extension popup."
        )
      );
      const flags = [
        {
          key: "treeView",
          title: "PR stack tree view",
          desc: "Indent stacked PRs on the /pulls list"
        },
        {
          key: "autoOpenEmbed",
          title: "Auto-open pr+ on PR pages",
          desc: "Open the pr+ shell when you land on a PR URL"
        },
        {
          key: "reverseComments",
          title: "Newest comments first",
          desc: "Composer \u2192 merge box \u2192 latest conversation"
        },
        {
          key: "singleFileMode",
          title: "Single-file Diff mode",
          desc: "Show only the active file in the Diff list"
        }
      ];
      const draft = prefsDraft || {};
      for (const f of flags) {
        const row = el("label", "prp-onboarding__pref");
        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.dataset.prefKey = f.key;
        const defOn = f.key !== "singleFileMode";
        cb.checked = typeof draft[f.key] === "boolean" ? Boolean(draft[f.key]) : defOn;
        cb.addEventListener("change", () => {
          if (!prefsDraft) prefsDraft = {};
          prefsDraft[f.key] = cb.checked;
        });
        const text = el("span", "prp-onboarding__pref-body");
        text.appendChild(el("span", "prp-onboarding__pref-title", f.title));
        text.appendChild(el("span", "prp-onboarding__pref-desc", f.desc));
        row.appendChild(cb);
        row.appendChild(text);
        body.appendChild(row);
      }
      return;
    }
    body.appendChild(
      el(
        "p",
        "prp-onboarding__lead",
        "You are set. Open PRs from the list, toggle Diff with \u2325., and open the palette with \u2325\u21E7K anytime."
      )
    );
    const tips = el("ul", "prp-onboarding__tips");
    for (const t of [
      "Hold \u2325 on the list \u2192 badges \xB7 \u2325N opens that PR row",
      "\u2325. toggles Diff \u2194 Conversation \xB7 Esc clears selection",
      "Re-run this tour from the extension popup \u2192 Start onboarding"
    ]) {
      tips.appendChild(el("li", "", t));
    }
    body.appendChild(tips);
  }
  function render() {
    if (!root || disposed) return;
    const id = currentId();
    const meta = ONBOARDING_STEPS.find((s) => s.id === id);
    const titleEl = root.querySelector(".prp-onboarding__title");
    const stepEl = root.querySelector(".prp-onboarding__step");
    const body = root.querySelector(".prp-onboarding__body");
    const primary = root.querySelector(
      ".prp-onboarding__btn--primary"
    );
    const back = root.querySelector(
      ".prp-onboarding__btn--back"
    );
    if (titleEl) titleEl.textContent = meta?.title || "pr+ setup";
    if (stepEl) stepEl.textContent = `${planIndex + 1} / ${plan.length}`;
    if (body) renderBody(body);
    if (back) {
      back.hidden = planIndex === 0;
    }
    if (primary) {
      if (id === "pat") {
        primary.textContent = tokenConfigured ? "Continue" : "Save & continue";
        primary.hidden = false;
      } else if (id === "prefs") {
        primary.textContent = "Save & continue";
        primary.hidden = false;
      } else if (id === "done") {
        primary.textContent = "Done";
        primary.hidden = false;
      } else if (id === "openPr" && isModalOpen(doc)) {
        primary.textContent = "Continue \xB7 \u23CE";
        primary.hidden = false;
      } else if (id === "openPr" && !isModalOpen(doc)) {
        primary.textContent = "Skip \xB7 \u23CE";
        primary.hidden = false;
      } else if (id === "diffToggle" && isDiffLayout(doc)) {
        primary.textContent = "Continue \xB7 \u23CE";
        primary.hidden = false;
      } else if (id === "convDemo") {
        if (convSubIndex >= CONVERSATION_DEMO_STEPS.length - 1) {
          primary.textContent = "Continue \xB7 \u23CE";
        } else {
          primary.textContent = "Next tip \xB7 \u23CE";
        }
        primary.hidden = false;
      } else if (id === "diffDemo") {
        if (!isDiffLayout(doc)) {
          primary.textContent = "Skip Diff tips \xB7 \u23CE";
        } else if (demoSubIndex >= DIFF_DEMO_STEPS.length - 1) {
          primary.textContent = "Continue \xB7 \u23CE";
        } else {
          primary.textContent = "Next tip \xB7 \u23CE";
        }
        primary.hidden = false;
      } else if (id === "opt" || id === "diffToggle" || id === "optShiftK") {
        primary.textContent = "Skip \xB7 \u23CE";
        primary.hidden = false;
      } else {
        primary.textContent = "Continue \xB7 \u23CE";
        primary.hidden = false;
      }
      if (primary && !primary.hidden && primary.textContent && !primary.textContent.includes("\u23CE") && (id === "pat" || id === "prefs" || id === "done" || id === "openPr")) {
        if (id === "pat") {
          primary.textContent = tokenConfigured ? "Continue \xB7 \u23CE" : "Save & continue \xB7 \u23CE";
        } else if (id === "prefs") {
          primary.textContent = "Save & continue \xB7 \u23CE";
        } else if (id === "done") {
          primary.textContent = "Done \xB7 \u23CE";
        } else if (id === "openPr" && isModalOpen(doc)) {
          primary.textContent = "Continue \xB7 \u23CE";
        } else if (id === "openPr" && !isModalOpen(doc)) {
          primary.textContent = "Skip \xB7 \u23CE";
        }
      }
    }
    setStatus(statusText, statusError);
  }
  async function goNextFromPrimary() {
    const id = currentId();
    setStatus("");
    if (id === "openPr" && !isModalOpen(doc)) {
      clearDemoPrHighlight(doc);
      advance();
      return;
    }
    if (id === "pat") {
      const input = root?.querySelector(
        "#prp-onboarding-token"
      );
      const value = String(input?.value || "").trim();
      if (value) {
        try {
          const res = await setToken(value);
          if (!res?.ok && res?.error) throw new Error(res.error);
          tokenConfigured = true;
          tokenMask = String(res?.mask || tokenMask);
          if (input) input.value = "";
        } catch (err) {
          setStatus(err?.message || "Could not save token", true);
          return;
        }
      } else if (!tokenConfigured) {
        setStatus("Paste a PAT, or open the extension popup later.", true);
        return;
      }
      advance();
      return;
    }
    if (id === "prefs") {
      try {
        await ensurePrefsDraft();
        const patch = {
          treeView: Boolean(prefsDraft.treeView !== false),
          autoOpenEmbed: Boolean(prefsDraft.autoOpenEmbed !== false),
          reverseComments: Boolean(prefsDraft.reverseComments !== false),
          singleFileMode: Boolean(prefsDraft.singleFileMode === true)
        };
        prefsDraft = await setPrefs(patch);
      } catch (err) {
        setStatus(err?.message || "Could not save options", true);
        return;
      }
      advance();
      return;
    }
    if (id === "done") {
      await markComplete();
      return;
    }
    if (id === "diffDemo") {
      advanceDiffTip();
      return;
    }
    if (id === "convDemo") {
      advanceConvTip();
      return;
    }
    advance();
  }
  function advanceDiffTip() {
    if (demoSubIndex < DIFF_DEMO_STEPS.length - 1) {
      demoSubIndex += 1;
      setStatus("");
      render();
      return;
    }
    advance();
  }
  function advanceConvTip() {
    convChordIndex = 0;
    if (convSubIndex < CONVERSATION_DEMO_STEPS.length - 1) {
      convSubIndex += 1;
      setStatus("");
      render();
      return;
    }
    advance();
  }
  function onKeyDown(e) {
    if (disposed || !root) return;
    const t = e.target;
    const inField = Boolean(
      t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    );
    const id = currentId();
    const mod = Boolean(e.metaKey || e.ctrlKey);
    const opts = {
      alt: e.altKey,
      shift: e.shiftKey,
      mod,
      key: e.key,
      code: e.code,
      type: "keydown"
    };
    if (!inField) {
      if (isOnboardingBackEvent(opts) && planIndex > 0) {
        e.preventDefault();
        goBack();
        return;
      }
      if (isOnboardingEnterEvent(opts)) {
        e.preventDefault();
        void goNextFromPrimary();
        return;
      }
      if (isOnboardingSkipTourEvent(opts)) {
        const tip = id === "diffDemo" && isDiffLayout(doc) ? DIFF_DEMO_STEPS[demoSubIndex] : null;
        if (tip && matchesDiffDemoStep(opts, tip)) {
          e.preventDefault();
          advanceDiffTip();
          return;
        }
        e.preventDefault();
        skipToSettings();
        return;
      }
    } else {
      if (isOnboardingSkipTourEvent(opts)) {
        e.preventDefault();
        skipToSettings();
        return;
      }
    }
    if (id === "opt" && isOptHoldEvent(opts) && e.altKey) {
      e.preventDefault();
      advance();
      return;
    }
    if (id === "openPr") {
      const slot = resolveDemoPrHotkey(doc).slot;
      if (slot && isOptHotkeySlotEvent(opts, slot)) {
        setStatus(
          `Opening PR #${DEMO_PR.number} with \u2325${String(slot).toUpperCase()}\u2026`
        );
        return;
      }
      if (isOptDigit1Event(opts)) {
        setStatus("Opening with list hotkey\u2026");
        return;
      }
    }
    if (id === "convDemo") {
      if (isDiffLayout(doc) && isOptPeriodEvent(opts)) {
        return;
      }
      const tip = CONVERSATION_DEMO_STEPS[convSubIndex];
      if (tip?.chords?.length) {
        if (matchesConversationDemoChordAt(opts, tip, convChordIndex)) {
          const next = nextConversationDemoChordIndex(tip, convChordIndex);
          if (next === "done") {
            convChordIndex = 0;
            advanceConvTip();
          } else {
            convChordIndex = next;
            const nextChord = tip.chords[next] || "";
            setStatus(
              tip.id === "conv-adjacent" ? `Good \u2014 now ${nextChord} to return to demo PR #${DEMO_PR.number}\u2026` : `Now press ${nextChord}\u2026`
            );
            render();
          }
          return;
        }
        if (matchesConversationDemoStep(opts, tip)) {
          const expected = tip.chords[convChordIndex] || tip.chords[0];
          setStatus(
            `Press ${expected} next (${tip.chords.join(" \u2192 ")})`
          );
          return;
        }
      }
    }
    if (id === "diffToggle" && isOptPeriodEvent(opts)) {
      userPressedOptPeriod = true;
      render();
      return;
    }
    if (id === "diffDemo" && isDiffLayout(doc)) {
      const tip = DIFF_DEMO_STEPS[demoSubIndex];
      if (tip && matchesDiffDemoStep(opts, tip)) {
        advanceDiffTip();
        return;
      }
    }
    if (id === "optShiftK" && isOptShiftKEvent(opts)) {
      advance();
    }
  }
  function tickPoll() {
    if (disposed) return;
    const id = currentId();
    if (id === "openPr") {
      if (!isModalOpen(doc)) {
        const row = doc.querySelector?.(`.${ONBOARDING_TARGET_PR_CLASS}`);
        if (!row) highlightDemoPr(doc);
      }
      if (isModalOpen(doc) && !modalOpenOnOpenPrEnter) {
        clearDemoPrHighlight(doc);
        advance();
      }
      return;
    }
    if (id === "diffToggle") {
      const openNum = readOpenModalPrNumber(doc);
      if (isModalOpen(doc) && openNum != null && openNum !== Number(DEMO_PR.number)) {
        ensureDemoPrForCurrentDiffStep(false);
      }
      render();
      if (userPressedOptPeriod && isDiffLayout(doc)) {
        if (openNum != null && openNum !== Number(DEMO_PR.number)) {
          ensureDemoPrForCurrentDiffStep(false);
          return;
        }
        advance();
      }
      return;
    }
    if (id === "convDemo" || id === "diffDemo") {
      render();
    }
  }
  function buildShell() {
    const rootEl = el("div", "prp-onboarding");
    rootEl.id = ONBOARDING_ROOT_ID;
    rootEl.setAttribute("role", "dialog");
    rootEl.setAttribute("aria-label", "pr+ setup");
    const card = el("div", "prp-onboarding__card");
    const header = el("header", "prp-onboarding__header");
    header.appendChild(el("div", "prp-onboarding__brand", "pr+"));
    const stepEl = el("div", "prp-onboarding__step");
    stepEl.setAttribute("aria-live", "polite");
    header.appendChild(stepEl);
    const closeBtn = el("button", "prp-onboarding__close", "\xD7");
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Skip to settings");
    closeBtn.setAttribute("title", "Skip to feature settings (Esc)");
    closeBtn.addEventListener("click", () => {
      skipToSettings();
    });
    header.appendChild(closeBtn);
    const title = el("h2", "prp-onboarding__title");
    const body = el("div", "prp-onboarding__body");
    const status = el("p", "prp-onboarding__status");
    status.setAttribute("aria-live", "polite");
    const footer = el("footer", "prp-onboarding__footer");
    const back = el(
      "button",
      "prp-onboarding__btn prp-onboarding__btn--back",
      "Back \xB7 \u232B"
    );
    back.setAttribute("type", "button");
    back.setAttribute("title", "Back (Backspace)");
    back.addEventListener("click", () => goBack());
    const skip = el(
      "button",
      "prp-onboarding__btn prp-onboarding__btn--ghost prp-onboarding__btn--skip",
      "Skip to settings \xB7 Esc"
    );
    skip.setAttribute("type", "button");
    skip.setAttribute("title", "Skip remaining tips and open feature settings (Esc)");
    skip.addEventListener("click", () => {
      skipToSettings();
    });
    const primary = el(
      "button",
      "prp-onboarding__btn prp-onboarding__btn--primary",
      "Continue \xB7 \u23CE"
    );
    primary.setAttribute("type", "button");
    primary.addEventListener("click", () => {
      void goNextFromPrimary();
    });
    footer.appendChild(back);
    footer.appendChild(skip);
    footer.appendChild(primary);
    card.appendChild(header);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(status);
    card.appendChild(footer);
    rootEl.appendChild(card);
    return rootEl;
  }
  async function start() {
    if (disposed) return { ok: false, reason: "disposed" };
    if (typeof isOnboardingDone === "function") {
      try {
        if (await isOnboardingDone()) {
          return { ok: false, reason: "already-completed" };
        }
      } catch {
        return { ok: false, reason: "status-unavailable" };
      }
    } else {
      try {
        const prefs = await getPrefs();
        if (!shouldShowOnboarding(prefs, getPathname())) {
          return { ok: false, reason: "not-eligible" };
        }
      } catch {
        return { ok: false, reason: "prefs-unavailable" };
      }
    }
    if (!shouldShowOnboarding({ onboardingCompleted: false }, getPathname())) {
      if (!doc.getElementById(ONBOARDING_ROOT_ID) && !isModalOpen(doc)) {
        return { ok: false, reason: "not-pulls-page" };
      }
    }
    const hasPulls = countPullListItems(doc) > 0;
    plan = resolveOnboardingPlan({ hasPulls });
    planIndex = 0;
    doc.getElementById(ONBOARDING_ROOT_ID)?.remove();
    await refreshTokenStatus();
    await ensurePrefsDraft();
    root = buildShell();
    (doc.body || doc.documentElement).appendChild(root);
    keyHandler = onKeyDown;
    win.addEventListener("keydown", keyHandler, true);
    pollTimer = win.setInterval(tickPoll, 400);
    render();
    return { ok: true, plan: plan.slice(), hasPulls };
  }
  return {
    start,
    dispose,
    getStep: () => planIndex,
    getStepId: () => currentId(),
    getPlan: () => plan.slice(),
    setStep: (n) => goToPlanIndex(n),
    getRoot: () => root,
    isActive: () => Boolean(root) && !disposed
  };
}
var onboardingApi = {
  ONBOARDING_ROOT_ID,
  ONBOARDING_STEPS,
  PR_DEPENDENT_STEPS,
  DIFF_DEMO_STEPS,
  CONVERSATION_DEMO_STEPS,
  DEMO_PR,
  shouldShowOnboarding,
  clampOnboardingStep,
  stepIdAt,
  countPullListItems,
  findDemoPrLink,
  clickDemoPr,
  listPullRowsForHotkeys,
  resolveDemoPrHotkey,
  highlightDemoPr,
  clearDemoPrHighlight,
  ONBOARDING_TARGET_PR_CLASS,
  ONBOARDING_HOTKEY_SLOTS,
  isModalOpen,
  isDiffLayout,
  isOptHoldEvent,
  isOptShiftKEvent,
  isOptPeriodEvent,
  isOptDigit1Event,
  isOptHotkeySlotEvent,
  isEscapeEvent,
  resolveOnboardingPlan,
  fireKey,
  matchesDiffDemoChord,
  matchesDiffDemoStep,
  matchesConversationDemoChord,
  matchesConversationDemoStep,
  matchesConversationDemoChordAt,
  nextConversationDemoChordIndex,
  readOpenModalPrNumber,
  isDemoPrModalOpen,
  openDemoPrModal,
  ensureDemoPrForDiffStep,
  isOnboardingEnterEvent,
  isOnboardingSkipTourEvent,
  isOnboardingBackEvent,
  splitChordKeys,
  chordLabelsToKbdParts,
  createOnboardingTour
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = onboardingApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PROnboarding = onboardingApi;
}
