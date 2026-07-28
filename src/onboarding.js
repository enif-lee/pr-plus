/**
 * AUTO-GENERATED from src/onboarding.ts
 * SOURCE OF TRUTH: src/onboarding.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
const ONBOARDING_ROOT_ID = "prp-onboarding";
const DEMO_PR = {
  owner: "enif-lee",
  repo: "pr-plus",
  number: 1,
  pathSuffix: "/enif-lee/pr-plus/pull/1",
  pullsUrl: "https://github.com/enif-lee/pr-plus/pulls",
  prUrl: "https://github.com/enif-lee/pr-plus/pull/1"
};
const ONBOARDING_STEPS = [
  { id: "pat", title: "PAT setup", index: 0 },
  { id: "opt", title: "Hold Option", index: 1 },
  { id: "openPr", title: "Open demo PR #1", index: 2 },
  { id: "diffToggle", title: "Open Diff", index: 3 },
  { id: "diffDemo", title: "Diff demo", index: 4 },
  { id: "optShiftK", title: "Command palette", index: 5 },
  { id: "prefs", title: "Feature settings", index: 6 },
  { id: "done", title: "All set", index: 7 }
];
const PR_DEPENDENT_STEPS = [
  "openPr",
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
const ONBOARDING_HOTKEY_SLOTS = buildOnboardingHotkeySlots();
const ONBOARDING_TARGET_PR_CLASS = "prp-onboarding-target-pr";
const ONBOARDING_TARGET_PR_ATTR = "data-prp-onboarding-target";
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
function resolveOnboardingPlan(opts) {
  const hasPulls = Boolean(opts?.hasPulls);
  return ONBOARDING_STEPS.filter((s) => {
    if (!hasPulls && PR_DEPENDENT_STEPS.includes(s.id)) return false;
    return true;
  }).map((s) => s.id);
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
const DIFF_DEMO_STEPS = [
  {
    id: "select-line",
    title: "1 \xB7 Select a line",
    body: "On PR #1 we click a code line first. That starts a selection \u2014 the foundation for new comments.",
    chords: []
  },
  {
    id: "file-next",
    title: "2 \xB7 Next file",
    body: "Jump to the next changed file in this PR (20+ demo files). No mouse needed.",
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
    body: "Page the hunk list by roughly one screen \u2014 faster than the trackpad on long files.",
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
    body: "Arrow keys move the selected line one step at a time.",
    chords: ["\u2193"]
  },
  {
    id: "jump-selection",
    title: "7 \xB7 Jump selection",
    body: "Option + arrow hops several lines \u2014 useful when scanning a large hunk.",
    chords: ["\u2325\u2193"]
  },
  {
    id: "multi-select",
    title: "8 \xB7 Multi-line range",
    body: "Shift + arrow grows the selection into a block you can comment on together.",
    chords: ["\u21E7\u2193"]
  },
  {
    id: "comment-island",
    title: "9 \xB7 New comment bar",
    body: "With a range selected, a bar appears \u2014 that is how you start a *new* review comment.",
    chords: []
  },
  {
    id: "clear-selection",
    title: "10 \xB7 Clear selection",
    body: "Esc dismisses the selection bar so we can navigate existing review threads.",
    chords: ["Esc"]
  },
  {
    id: "thread-next",
    title: "11 \xB7 Next review thread",
    body: "PR #1 has 5 demo thread groups. \u2325J steps to the next review comment/thread on Diff.",
    chords: ["\u2325J", "\u2325J"]
  },
  {
    id: "thread-prev",
    title: "12 \xB7 Previous review thread",
    body: "\u2325K steps backward through the same comment list \u2014 great for triage.",
    chords: ["\u2325K", "\u2325K"]
  },
  {
    id: "wrap-up",
    title: "13 \xB7 Done with the demo",
    body: "You saw files, scrolling, selection, new comments, and thread nav on PR #1. Press Esc if anything is still focused, then continue.",
    chords: ["Esc"]
  }
];
async function runDiffDemo(doc, win, onNarrate) {
  const target = doc;
  const narrate = async (index) => {
    const step = DIFF_DEMO_STEPS[index];
    if (!step) return;
    const payload = {
      index,
      total: DIFF_DEMO_STEPS.length,
      id: step.id,
      title: step.title,
      body: step.body,
      chords: [...step.chords]
    };
    try {
      await onNarrate?.(payload);
    } catch {
    }
    await sleep(index === 0 ? 900 : 1100);
  };
  const click = (sel) => {
    const el = doc.querySelector(sel);
    if (!el) return false;
    try {
      el.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 8, clientY: 8 })
      );
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 8, clientY: 8 })
      );
      el.click();
      return true;
    } catch {
      return false;
    }
  };
  const pickLine = () => click(".prp-vline--selectable") || click(".prp-vline--context") || click(".prp-vline--add") || click(".prp-vline--del") || click(".prp-vline");
  await narrate(0);
  pickLine();
  await sleep(350);
  await narrate(1);
  fireKey(target, { key: "]", code: "BracketRight", alt: true, shift: true });
  await sleep(450);
  pickLine();
  await sleep(200);
  await narrate(2);
  fireKey(target, { key: "[", code: "BracketLeft", alt: true, shift: true });
  await sleep(450);
  pickLine();
  await sleep(200);
  await narrate(3);
  fireKey(target, { key: "ArrowDown", code: "ArrowDown", alt: true, shift: true });
  await sleep(400);
  await narrate(4);
  fireKey(target, { key: "ArrowUp", code: "ArrowUp", alt: true, shift: true });
  await sleep(400);
  await narrate(5);
  pickLine();
  await sleep(200);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: "ArrowDown", code: "ArrowDown" });
    await sleep(160);
  }
  await narrate(6);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: "ArrowDown", code: "ArrowDown", alt: true });
    await sleep(220);
  }
  await narrate(7);
  for (let i = 0; i < 3; i++) {
    fireKey(target, { key: "ArrowDown", code: "ArrowDown", shift: true });
    await sleep(180);
  }
  await sleep(280);
  await narrate(8);
  const commented = click(".prp-selection-island button") || click(".prp-selection-dock button") || click('[data-action="comment"]') || click(".prp-sel-actions button") || click(".prp-selection-island .prp-btn--primary") || click(".prp-selection-dock .prp-btn");
  void commented;
  await sleep(700);
  await narrate(9);
  fireKey(target, { key: "Escape", code: "Escape" });
  await sleep(350);
  fireKey(target, { key: "Escape", code: "Escape" });
  await sleep(300);
  click(".prp-vline--comment") || click(".prp-inline-thread") || click("[data-thread-focus-anchor]") || click(".prp-inline-comment");
  await sleep(400);
  await narrate(10);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: "j", code: "KeyJ", alt: true });
    await sleep(450);
  }
  await narrate(11);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: "k", code: "KeyK", alt: true });
    await sleep(450);
  }
  await narrate(12);
  await sleep(400);
  return { ok: true, steps: DIFF_DEMO_STEPS.length };
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
  let demoRunning = false;
  let demoDone = false;
  let demoWaitingEsc = false;
  let demoNarration = null;
  let modalOpenOnOpenPrEnter = false;
  let diffOpenOnDiffToggleEnter = false;
  let userPressedOptPeriod = false;
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
        fastReview: true,
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
    demoRunning = false;
    demoDone = false;
    demoWaitingEsc = false;
    demoNarration = null;
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
      diffOpenOnDiffToggleEnter = isDiffLayout(doc);
    }
    render();
    if (id === "diffDemo") {
      maybeStartDemo();
    }
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
        row.appendChild(el("span", "", p));
      } else {
        row.appendChild(el("kbd", "prp-onboarding__kbd", p.k));
      }
    }
    return row;
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
    if (id === "diffToggle") {
      const nowDiff = isDiffLayout(doc);
      body.appendChild(
        el(
          "p",
          "prp-onboarding__lead",
          nowDiff ? "You are on the Diff view. Press \u2325. to switch to Conversation and back, or Continue to keep Diff open." : "Switch to Diff to review code. Press the shortcut once \u2014 Conversation is always one press away again."
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
      if (demoWaitingEsc) {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Diff demo finished \u2014 file nav, paging, selection jumps, multi-line ranges, and the comment bar."
          )
        );
        body.appendChild(kbdRow([{ k: "Esc" }]));
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Press Esc to clear selection UI and continue\u2026"
          )
        );
      } else if (demoRunning && demoNarration) {
        const n = demoNarration;
        const progress = el(
          "p",
          "prp-onboarding__demo-progress",
          `Demo ${n.index + 1} / ${n.total}`
        );
        body.appendChild(progress);
        body.appendChild(el("p", "prp-onboarding__lead", n.title));
        body.appendChild(el("p", "prp-onboarding__hint", n.body));
        if (n.chords.length) {
          const parts = [];
          n.chords.forEach((c, i) => {
            if (i > 0) parts.push("then");
            parts.push({ k: c });
          });
          body.appendChild(kbdRow(parts));
        }
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint prp-onboarding__hint--pulse",
            "Watch the Diff panel\u2026"
          )
        );
      } else if (demoRunning) {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Starting Diff demo\u2026"
          )
        );
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint",
            "We will walk through file navigation, scrolling, selection, and comments."
          )
        );
      } else {
        body.appendChild(
          el(
            "p",
            "prp-onboarding__lead",
            "Ready for a guided Diff walkthrough. Stay on the Diff view."
          )
        );
        body.appendChild(
          el(
            "p",
            "prp-onboarding__hint",
            "Each step will explain a shortcut, then play it for you."
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
          key: "fastReview",
          title: "Fast progressive load",
          desc: "Show core data first; load threads on demand"
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
        primary.textContent = "Continue";
        primary.hidden = false;
      } else if (id === "openPr" && !isModalOpen(doc)) {
        primary.textContent = "Skip this step";
        primary.hidden = false;
      } else if (id === "diffToggle" && isDiffLayout(doc)) {
        primary.textContent = "Continue";
        primary.hidden = false;
      } else if (id === "opt" || id === "diffToggle" || id === "optShiftK" || id === "diffDemo" && demoWaitingEsc) {
        primary.textContent = "Skip this step";
        primary.hidden = false;
      } else if (id === "diffDemo" && demoRunning) {
        primary.textContent = "Skip demo";
        primary.hidden = false;
      } else if (id === "diffDemo" && !isDiffLayout(doc) && !demoRunning) {
        primary.textContent = "Skip demo";
        primary.hidden = false;
      } else {
        primary.textContent = "Continue";
        primary.hidden = false;
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
          fastReview: Boolean(prefsDraft.fastReview !== false),
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
    advance();
  }
  async function maybeStartDemo() {
    if (disposed || currentId() !== "diffDemo") return;
    if (demoRunning || demoDone || demoWaitingEsc) return;
    if (!isDiffLayout(doc)) {
      return;
    }
    demoRunning = true;
    demoNarration = null;
    render();
    try {
      await runDiffDemo(doc, win, async (n) => {
        if (disposed || currentId() !== "diffDemo") return;
        demoNarration = n;
        render();
      });
    } catch (err) {
      console.warn("[pr+] onboarding demo", err);
    }
    demoRunning = false;
    demoDone = true;
    demoWaitingEsc = true;
    demoNarration = null;
    render();
  }
  function onKeyDown(e) {
    if (disposed || !root) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      if (!(currentId() === "diffDemo" && isEscapeEvent(e))) return;
    }
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
    if (id === "opt" && isOptHoldEvent(opts) && e.altKey) {
      e.preventDefault();
      advance();
      return;
    }
    if (id === "openPr") {
      const slot = resolveDemoPrHotkey(doc).slot;
      if (slot && isOptHotkeySlotEvent(opts, slot)) {
        setStatus(`Opening PR #${DEMO_PR.number} with \u2325${String(slot).toUpperCase()}\u2026`);
        return;
      }
      if (isOptDigit1Event(opts)) {
        setStatus("Opening with list hotkey\u2026");
        return;
      }
    }
    if (id === "diffToggle" && isOptPeriodEvent(opts)) {
      userPressedOptPeriod = true;
      render();
      return;
    }
    if (id === "diffDemo" && demoWaitingEsc && isEscapeEvent(opts)) {
      advance();
      return;
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
      render();
      if (userPressedOptPeriod && isDiffLayout(doc)) {
        advance();
      }
      return;
    }
    if (id === "diffDemo") {
      if (!demoRunning && !demoDone && !demoWaitingEsc) {
        if (isDiffLayout(doc)) void maybeStartDemo();
      }
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
    closeBtn.setAttribute("aria-label", "Skip tour");
    closeBtn.addEventListener("click", () => {
      void markComplete();
    });
    header.appendChild(closeBtn);
    const title = el("h2", "prp-onboarding__title");
    const body = el("div", "prp-onboarding__body");
    const status = el("p", "prp-onboarding__status");
    status.setAttribute("aria-live", "polite");
    const footer = el("footer", "prp-onboarding__footer");
    const back = el("button", "prp-onboarding__btn prp-onboarding__btn--back", "Back");
    back.setAttribute("type", "button");
    back.addEventListener("click", () => goBack());
    const skip = el(
      "button",
      "prp-onboarding__btn prp-onboarding__btn--ghost prp-onboarding__btn--skip",
      "Skip tour"
    );
    skip.setAttribute("type", "button");
    skip.addEventListener("click", () => {
      void markComplete();
    });
    const primary = el(
      "button",
      "prp-onboarding__btn prp-onboarding__btn--primary",
      "Continue"
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
const onboardingApi = {
  ONBOARDING_ROOT_ID,
  ONBOARDING_STEPS,
  PR_DEPENDENT_STEPS,
  DIFF_DEMO_STEPS,
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
  runDiffDemo,
  createOnboardingTour
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = onboardingApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PROnboarding = onboardingApi;
}
