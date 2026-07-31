/**
 * First-run onboarding tour (top-right card) after install → pulls.
 *
 * Flow:
 *  1. pat        — save github.com PAT
 *  2. opt        — hold Option / Alt
 *  3. openPr     — open demo PR #1 via ⌥N / click (skipped if list empty)
 *  4. convDemo   — Conversation tips: ⌥J/K (body→comments→merge), ⌥[ / ]
 *  5. diffToggle — ⌥. to open Diff (skipped if no PR)
 *  6. diffDemo   — guided Diff tips; user presses each shortcut (no auto-sim)
 *  7. optShiftK  — ⌥⇧K command palette
 *  8. prefs      — feature flags (incl. tree view)
 *  9. done       — finish
 *
 * Card chrome shortcuts (when focus is not in an input):
 *  Enter — primary (Continue / Save / Skip tip)
 *  Esc   — skip entire tour
 *  ⌫     — back
 */

export const ONBOARDING_ROOT_ID = 'prp-onboarding';

/** Canonical demo PR used by onboarding (multi-file + review threads). */
export const DEMO_PR = {
  owner: 'enif-lee',
  repo: 'pr-plus',
  number: 1,
  pathSuffix: '/enif-lee/pr-plus/pull/1',
  pullsUrl: 'https://github.com/enif-lee/pr-plus/pulls',
  prUrl: 'https://github.com/enif-lee/pr-plus/pull/1',
};

export const ONBOARDING_STEPS = [
  { id: 'pat', title: 'PAT setup', index: 0 },
  { id: 'opt', title: 'Hold Option', index: 1 },
  { id: 'openPr', title: 'Open demo PR #1', index: 2 },
  { id: 'convDemo', title: 'Conversation shortcuts', index: 3 },
  { id: 'diffToggle', title: 'Open Diff', index: 4 },
  { id: 'diffDemo', title: 'Diff shortcuts', index: 5 },
  { id: 'optShiftK', title: 'Command palette', index: 6 },
  { id: 'prefs', title: 'Feature settings', index: 7 },
  { id: 'done', title: 'All set', index: 8 },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

/** Steps that need an open PR modal; skipped when list is empty. */
export const PR_DEPENDENT_STEPS: OnboardingStepId[] = [
  'openPr',
  'convDemo',
  'diffToggle',
  'diffDemo',
];

/**
 * Start tour on pulls list when not completed.
 * Active tour may continue while modal is open (same document).
 */
export function shouldShowOnboarding(
  prefs: { onboardingCompleted?: boolean } | null | undefined,
  pathname: string
) {
  if (prefs?.onboardingCompleted === true) return false;
  const path = String(pathname || '');
  if (!path.includes('/pulls')) return false;
  if (/\/pull\/\d+/.test(path)) return false;
  return true;
}

export function clampOnboardingStep(step: number) {
  const max = ONBOARDING_STEPS.length - 1;
  const n = Number(step);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export function stepIdAt(step: number): OnboardingStepId {
  return ONBOARDING_STEPS[clampOnboardingStep(step)]?.id || 'pat';
}

/** Count PR links / rows on a pulls list document. */
export function countPullListItems(doc: Document | null | undefined) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  const links = doc.querySelectorAll(
    'a[href*="/pull/"], a[id^="issue_"], .js-issue-row, [data-hovercard-type="pull_request"]'
  );
  // Unique-ish: count rows preferred
  const rows = doc.querySelectorAll(
    '.js-issue-row, [data-testid="issue-row"], .Box-row'
  );
  if (rows.length > 0) return rows.length;
  return links.length;
}

/** List hotkey slots matching pr-list-focus (1–9 then a–z except j/k). */
export function buildOnboardingHotkeySlots() {
  let s = '123456789';
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    if (ch !== 'j' && ch !== 'k') s += ch;
  }
  return s;
}

export const ONBOARDING_HOTKEY_SLOTS = buildOnboardingHotkeySlots();

/** Class / attr applied to the list row for demo PR guidance. */
export const ONBOARDING_TARGET_PR_CLASS = 'prp-onboarding-target-pr';
export const ONBOARDING_TARGET_PR_ATTR = 'data-prp-onboarding-target';

/**
 * Find the list link for the demo PR (#1), if present on the page.
 */
export function findDemoPrLink(doc: Document | null | undefined): HTMLElement | null {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const n = Number(DEMO_PR.number) || 1;
  const candidates = [
    ...doc.querySelectorAll('a[href*="/pull/"]'),
  ] as HTMLElement[];
  for (const a of candidates) {
    const href = String(a.getAttribute?.('href') || '');
    // Match /pull/1 or /pull/1?… /pull/1#… — not /pull/10, /pull/12
    if (
      new RegExp(`/pull/${n}(?:$|[?#/])`).test(href) ||
      href.endsWith(`/pull/${n}`)
    ) {
      const text = (a.textContent || '').trim();
      // Prefer titled links over empty icon anchors
      if (text.length > 2 || !candidates.some((x) => x !== a)) return a;
    }
  }
  // Fallback: any matching href even if short text
  return (
    candidates.find((a) =>
      new RegExp(`/pull/${n}(?:$|[?#/])`).test(
        String(a.getAttribute?.('href') || '')
      )
    ) || null
  );
}

/**
 * List rows in the same order as ⌥1… hotkey slots (best-effort).
 */
export function listPullRowsForHotkeys(
  doc: Document | null | undefined
): HTMLElement[] {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const selectors = [
    '.js-navigation-container .js-issue-row',
    '.js-issue-row',
    '[data-testid="issue-row"]',
    '.Box-row.js-navigation-item',
  ];
  for (const sel of selectors) {
    const rows = [...doc.querySelectorAll(sel)] as HTMLElement[];
    if (rows.length) return rows;
  }
  return [];
}

/**
 * Resolve demo PR #1 list row + hotkey slot label (e.g. "1", "6", "a").
 * Guidance-only — does not open the PR.
 */
export function resolveDemoPrHotkey(doc: Document | null | undefined): {
  link: HTMLElement | null;
  row: HTMLElement | null;
  slot: string | null;
  index: number;
} {
  const link = findDemoPrLink(doc);
  if (!link) {
    return { link: null, row: null, slot: null, index: -1 };
  }
  const rows = listPullRowsForHotkeys(doc);
  let index = rows.findIndex((row) => row.contains(link));
  if (index < 0) {
    let el: HTMLElement | null = link;
    while (el && el !== doc?.body) {
      index = rows.indexOf(el);
      if (index >= 0) break;
      el = el.parentElement;
    }
  }
  const row =
    index >= 0
      ? rows[index]
      : (link.closest(
          '.js-issue-row, [data-testid="issue-row"], .Box-row, li'
        ) as HTMLElement | null) || link;
  const slot =
    index >= 0 && index < ONBOARDING_HOTKEY_SLOTS.length
      ? ONBOARDING_HOTKEY_SLOTS[index]
      : null;
  return { link, row, slot, index };
}

/** Remove target-PR highlight from the list. */
export function clearDemoPrHighlight(doc: Document | null | undefined) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  try {
    doc
      .querySelectorAll(
        `.${ONBOARDING_TARGET_PR_CLASS}, [${ONBOARDING_TARGET_PR_ATTR}]`
      )
      .forEach((el) => {
        el.classList.remove(ONBOARDING_TARGET_PR_CLASS);
        try {
          el.removeAttribute(ONBOARDING_TARGET_PR_ATTR);
        } catch {
          /* ignore */
        }
      });
  } catch {
    /* ignore */
  }
}

/**
 * Highlight demo PR row with a colored border and scroll it into view.
 * Returns hotkey info for the step guide (does not open the PR).
 */
export function highlightDemoPr(doc: Document | null | undefined) {
  clearDemoPrHighlight(doc);
  const info = resolveDemoPrHotkey(doc);
  if (!info.row) return info;
  try {
    info.row.classList.add(ONBOARDING_TARGET_PR_CLASS);
    info.row.setAttribute(ONBOARDING_TARGET_PR_ATTR, '1');
    if (typeof info.row.scrollIntoView === 'function') {
      info.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  } catch {
    /* ignore */
  }
  return info;
}

/** Click the demo PR #1 row/link when available (manual fallback only). */
export function clickDemoPr(doc: Document | null | undefined): boolean {
  const a = findDemoPrLink(doc);
  if (!a) return false;
  try {
    a.click();
    return true;
  } catch {
    return false;
  }
}

export function isModalOpen(doc: Document | null | undefined) {
  if (!doc) return false;
  return Boolean(
    doc.querySelector(
      '.prp-overlay, .prp-modal, #prp-modal-host .prp-modal, #prp-page-embed .prp-modal'
    )
  );
}

/**
 * True only when the Diff shell is the active layout.
 * Use modal root class only — keep-alive may leave .prp-diff-layout in the DOM
 * under Conversation with non-zero size, which falsely triggered the Diff demo.
 */
export function isDiffLayout(doc: Document | null | undefined) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  return Boolean(doc.querySelector('.prp-modal--diff'));
}

export function isOptHoldEvent(opts: {
  alt?: boolean;
  type?: string;
  key?: string;
  code?: string;
}) {
  if (!opts?.alt) return false;
  const type = String(opts.type || 'keydown');
  return type === 'keydown' || type === 'keyup';
}

/** ⌥⇧K / Alt+Shift+K */
export function isOptShiftKEvent(opts: {
  alt?: boolean;
  shift?: boolean;
  mod?: boolean;
  key?: string;
  code?: string;
}) {
  if (!opts?.alt || !opts?.shift || opts?.mod) return false;
  const code = String(opts.code || '');
  if (code === 'KeyK' || code === 'keyk') return true;
  return String(opts.key || '').toLowerCase() === 'k';
}

/** ⌥. / Alt+. — toggle Diff */
export function isOptPeriodEvent(opts: {
  alt?: boolean;
  shift?: boolean;
  mod?: boolean;
  key?: string;
  code?: string;
}) {
  if (!opts?.alt || opts?.shift || opts?.mod) return false;
  const code = String(opts.code || '');
  if (code === 'Period' || code === 'period') return true;
  const key = String(opts.key || '');
  return key === '.' || key === 'Period' || key === '＞' || key === '…';
}

/** ⌥1 / Alt+1 — open first list hotkey slot */
export function isOptDigit1Event(opts: {
  alt?: boolean;
  shift?: boolean;
  mod?: boolean;
  key?: string;
  code?: string;
}) {
  return isOptHotkeySlotEvent(opts, '1');
}

/**
 * ⌥ + list hotkey slot (digit 1–9 or letter a–z except j/k).
 * Used to detect the guided open for the highlighted demo PR.
 */
export function isOptHotkeySlotEvent(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  slot: string | null | undefined
) {
  if (!opts?.alt || opts?.shift || opts?.mod) return false;
  const want = String(slot || '').toLowerCase();
  if (!want) return false;
  const code = String(opts.code || '');
  if (/^[1-9]$/.test(want)) {
    if (code === `Digit${want}` || code === `Numpad${want}`) return true;
    return String(opts.key || '') === want;
  }
  // letter slot
  if (code === `Key${want.toUpperCase()}` || code === `key${want}`) return true;
  const key = String(opts.key || '').toLowerCase();
  return key === want;
}

export function isEscapeEvent(opts: { key?: string; code?: string }) {
  const key = String(opts.key || '');
  const code = String(opts.code || '');
  return key === 'Escape' || code === 'Escape';
}

/**
 * Build the ordered step list for this session (skip PR-dependent when empty).
 */
export function resolveOnboardingPlan(opts: { hasPulls: boolean }) {
  const hasPulls = Boolean(opts?.hasPulls);
  return ONBOARDING_STEPS.filter((s) => {
    if (!hasPulls && PR_DEPENDENT_STEPS.includes(s.id)) return false;
    return true;
  }).map((s) => s.id);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Dispatch a real-ish KeyboardEvent (bubbles, cancelable) on target.
 */
export function fireKey(
  target: EventTarget | null | undefined,
  init: {
    key: string;
    code?: string;
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    ctrl?: boolean;
    type?: 'keydown' | 'keyup';
  }
) {
  if (!target || typeof (target as any).dispatchEvent !== 'function') return false;
  const type = init.type || 'keydown';
  const mod = Boolean(init.mod);
  const evt = new KeyboardEvent(type, {
    key: init.key,
    code: init.code || '',
    altKey: Boolean(init.alt),
    shiftKey: Boolean(init.shift),
    metaKey: mod,
    ctrlKey: Boolean(init.ctrl) || (mod && false),
    bubbles: true,
    cancelable: true,
  });
  return (target as any).dispatchEvent(evt);
}

/**
 * Guided Diff tips — user presses each shortcut (no auto-simulation).
 * Primary chord is first entry; Enter skips the tip without practicing.
 */
export const DIFF_DEMO_STEPS = [
  {
    id: 'select-line',
    title: '1 · Select a line',
    body: 'Click any code line in the Diff. That starts a selection — the base for new comments.',
    chords: [] as string[],
  },
  {
    id: 'file-next',
    title: '2 · Next file',
    body: 'Jump to the next changed file. Press the shortcut once on the Diff panel.',
    chords: ['⌥⇧]'],
  },
  {
    id: 'file-prev',
    title: '3 · Previous file',
    body: 'Go back one file in the same list order.',
    chords: ['⌥⇧['],
  },
  {
    id: 'page-down',
    title: '4 · Scroll Diff down',
    body: 'Page the hunk list by roughly one screen.',
    chords: ['⌥⇧↓'],
  },
  {
    id: 'page-up',
    title: '5 · Scroll Diff up',
    body: 'Page back up the same amount.',
    chords: ['⌥⇧↑'],
  },
  {
    id: 'move-selection',
    title: '6 · Move selection',
    body: 'With a line selected, use Arrow Down to move one line at a time.',
    chords: ['↓'],
  },
  {
    id: 'jump-selection',
    title: '7 · Jump selection',
    body: 'Option + Arrow Down hops several lines — useful on long hunks.',
    chords: ['⌥↓'],
  },
  {
    id: 'multi-select',
    title: '8 · Multi-line range',
    body: 'Shift + Arrow Down grows the selection into a block for one comment.',
    chords: ['⇧↓'],
  },
  {
    id: 'comment-island',
    title: '9 · New comment',
    body: 'With a range selected, press ⌥C to open the new-comment composer. You do not need to post — practice the shortcut, then continue.',
    chords: ['⌥C'],
  },
  {
    id: 'clear-selection',
    title: '10 · Clear selection',
    body: 'Press Esc on the Diff to dismiss the selection bar (Enter skips this tip).',
    chords: ['Esc'],
  },
  {
    id: 'thread-next',
    title: '11 · Next review thread',
    body: 'PR #1 has demo thread groups. Press ⌥J to step to the next review thread on Diff.',
    chords: ['⌥J'],
  },
  {
    id: 'thread-prev',
    title: '12 · Previous review thread',
    body: 'Press ⌥K to step backward through review threads.',
    chords: ['⌥K'],
  },
  {
    id: 'wrap-up',
    title: '13 · Done',
    body: 'You practiced Diff nav and thread jumping. Press Enter to continue the tour.',
    chords: [] as string[],
  },
] as const;

export type DiffDemoStepId = (typeof DIFF_DEMO_STEPS)[number]['id'];

/**
 * Split a compact chord label into individual keys for separate keycaps.
 * Examples: `⌥⇧]` → ['⌥','⇧',']'] · `⌥C` → ['⌥','C'] · `Alt+Shift+K` → ['Alt','Shift','K']
 */
export function splitChordKeys(chord: unknown): string[] {
  let s = String(chord ?? '').trim();
  if (!s) return [];
  // Explicit Win/Linux style (already separated)
  if (s.includes('+')) {
    return s
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  // Named single keys
  if (/^(Esc|Enter|Tab|Space|Spacebar|Return)$/i.test(s)) {
    return [s.length <= 3 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase()];
  }
  const keys: string[] = [];
  const MODS = ['⌥', '⇧', '⌘', '⌃', '⎇'];
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
  // Arrow as remaining first char
  if (['↑', '↓', '←', '→'].includes(s[0])) {
    keys.push(s[0]);
    s = s.slice(1);
  }
  if (s) {
    // Single letter → uppercase for display parity with docs
    if (/^[a-z]$/.test(s)) keys.push(s.toUpperCase());
    else keys.push(s);
  }
  return keys;
}

/**
 * Build kbd-row parts: each chord becomes separate keycaps joined by `+`,
 * and multiple chords join with `or` / `then`.
 */
export function chordLabelsToKbdParts(
  chords: unknown,
  multiJoiner: 'or' | 'then' = 'or'
): Array<string | { k: string }> {
  const list = (Array.isArray(chords) ? chords : [chords])
    .map((c) => String(c || '').trim())
    .filter(Boolean);
  const parts: Array<string | { k: string }> = [];
  list.forEach((chord, i) => {
    if (i > 0) parts.push(multiJoiner);
    const keys = splitChordKeys(chord);
    keys.forEach((k, j) => {
      if (j > 0) parts.push('+');
      parts.push({ k });
    });
  });
  return parts;
}

/**
 * Whether a keydown matches a Diff tip chord label (e.g. "⌥⇧]", "↓", "Esc").
 */
export function matchesDiffDemoChord(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  chord: string | null | undefined
): boolean {
  const c = String(chord || '').trim();
  if (!c) return false;
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const mod = Boolean(opts.mod);
  if (mod) return false;
  const code = String(opts.code || '');
  const key = String(opts.key || '');

  if (c === 'Esc' || c === 'Escape') {
    return key === 'Escape' || code === 'Escape';
  }
  if (c === '↓' || c === 'ArrowDown') {
    return !alt && !shift && (key === 'ArrowDown' || code === 'ArrowDown');
  }
  if (c === '↑' || c === 'ArrowUp') {
    return !alt && !shift && (key === 'ArrowUp' || code === 'ArrowUp');
  }
  if (c === '⌥↓') {
    return alt && !shift && (key === 'ArrowDown' || code === 'ArrowDown');
  }
  if (c === '⌥↑') {
    return alt && !shift && (key === 'ArrowUp' || code === 'ArrowUp');
  }
  if (c === '⇧↓') {
    return !alt && shift && (key === 'ArrowDown' || code === 'ArrowDown');
  }
  if (c === '⇧↑') {
    return !alt && shift && (key === 'ArrowUp' || code === 'ArrowUp');
  }
  if (c === '⌥⇧↓') {
    return alt && shift && (key === 'ArrowDown' || code === 'ArrowDown');
  }
  if (c === '⌥⇧↑') {
    return alt && shift && (key === 'ArrowUp' || code === 'ArrowUp');
  }
  if (c === '⌥⇧]' || c === '⌥⇧】') {
    return (
      alt &&
      shift &&
      (code === 'BracketRight' || key === ']' || key === '}')
    );
  }
  if (c === '⌥⇧[' || c === '⌥⇧【') {
    return (
      alt &&
      shift &&
      (code === 'BracketLeft' || key === '[' || key === '{')
    );
  }
  if (c === '⌥J' || c === '⌥j') {
    return alt && !shift && (code === 'KeyJ' || key.toLowerCase() === 'j');
  }
  if (c === '⌥K' || c === '⌥k') {
    return alt && !shift && (code === 'KeyK' || key.toLowerCase() === 'k');
  }
  // Diff selection: open new-comment composer (same as product ⌥C)
  if (c === '⌥C' || c === '⌥c') {
    return alt && !shift && (code === 'KeyC' || key.toLowerCase() === 'c');
  }
  return false;
}

/** True if any chord on the tip matches this key event. */
export function matchesDiffDemoStep(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  step: { chords?: readonly string[] } | null | undefined
): boolean {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  return chords.some((ch) => matchesDiffDemoChord(opts, ch));
}

/** Card chrome: Enter → primary / Continue */
export function isOnboardingEnterEvent(opts: {
  key?: string;
  code?: string;
  alt?: boolean;
  mod?: boolean;
}) {
  if (opts?.alt || opts?.mod) return false;
  return opts?.key === 'Enter' || opts?.code === 'Enter';
}

/** Card chrome: Esc → skip entire tour */
export function isOnboardingSkipTourEvent(opts: {
  key?: string;
  code?: string;
}) {
  return opts?.key === 'Escape' || opts?.code === 'Escape';
}

/** Card chrome: Backspace → previous step */
export function isOnboardingBackEvent(opts: {
  key?: string;
  code?: string;
  alt?: boolean;
  mod?: boolean;
}) {
  if (opts?.mod) return false;
  return opts?.key === 'Backspace' || opts?.code === 'Backspace';
}

/**
 * Guided Conversation tips — user presses each shortcut (no auto-sim).
 * ⌥J/K order: 1) PR body · 2) comments/threads · 3) merge box.
 */
export const CONVERSATION_DEMO_STEPS = [
  {
    id: 'conv-jk',
    title: '1 · Step Conversation',
    body: 'On Conversation, ⌥J / ⌥K moves focus in this order: 1) PR description, 2) comments & review threads, 3) merge box. Press ⌥J a few times.',
    chords: ['⌥J'],
  },
  {
    id: 'conv-jk-back',
    title: '2 · Step backward',
    body: '⌥K steps focus the other way through the same stops (merge → comments → description).',
    chords: ['⌥K'],
  },
  {
    id: 'conv-adjacent',
    title: '3 · Adjacent PRs',
    body: '⌥] opens the next PR, then ⌥[ comes back. Type them in that order so you return to demo PR #1.',
    chords: ['⌥]', '⌥['],
  },
] as const;

export type ConversationDemoStepId =
  (typeof CONVERSATION_DEMO_STEPS)[number]['id'];

/** Match ⌥[ / ⌥] for adjacent PR nav tips. */
export function matchesConversationDemoChord(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  chord: string | null | undefined
): boolean {
  const c = String(chord || '').trim();
  if (!c) return false;
  // Reuse Diff chord matcher for J/K / Esc / arrows
  if (matchesDiffDemoChord(opts, c)) return true;
  const alt = Boolean(opts.alt);
  const shift = Boolean(opts.shift);
  const mod = Boolean(opts.mod);
  if (!alt || shift || mod) return false;
  const code = String(opts.code || '');
  const key = String(opts.key || '');
  if (c === '⌥]' || c === '⌥】') {
    return code === 'BracketRight' || key === ']' || key === '}';
  }
  if (c === '⌥[' || c === '⌥【') {
    return code === 'BracketLeft' || key === '[' || key === '{';
  }
  return false;
}

export function matchesConversationDemoStep(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  step: { chords?: readonly string[] } | null | undefined
): boolean {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  return chords.some((ch) => matchesConversationDemoChord(opts, ch));
}

/**
 * Multi-chord tips require chords in order. Only the chord at `chordIndex` counts.
 */
export function matchesConversationDemoChordAt(
  opts: {
    alt?: boolean;
    shift?: boolean;
    mod?: boolean;
    key?: string;
    code?: string;
  },
  step: { chords?: readonly string[] } | null | undefined,
  chordIndex = 0
): boolean {
  const chords = step?.chords || [];
  if (!chords.length) return false;
  const i = Math.max(0, Math.min(chords.length - 1, Math.floor(Number(chordIndex) || 0)));
  return matchesConversationDemoChord(opts, chords[i]);
}

/**
 * After matching chord at `chordIndex`, return the next index or `'done'`.
 */
export function nextConversationDemoChordIndex(
  step: { chords?: readonly string[] } | null | undefined,
  chordIndex = 0
): number | 'done' {
  const chords = step?.chords || [];
  if (!chords.length) return 'done';
  const i = Math.max(0, Math.floor(Number(chordIndex) || 0));
  if (i + 1 >= chords.length) return 'done';
  return i + 1;
}

/** Read open modal PR number from header chip (`#12`), if present. */
export function readOpenModalPrNumber(
  doc: Document | null | undefined
): number | null {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const el = doc.querySelector('.prp-header__number');
  const text = String(el?.textContent || '').trim();
  const m = text.match(/#\s*(\d+)/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const labeled = doc.querySelector(
    '[aria-label*="Pull request #"], [aria-label*="pull request #"]'
  );
  const aria = String(labeled?.getAttribute?.('aria-label') || '');
  const m2 = aria.match(/#\s*(\d+)/);
  if (m2) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function isDemoPrModalOpen(doc: Document | null | undefined): boolean {
  if (!isModalOpen(doc)) return false;
  const n = readOpenModalPrNumber(doc);
  if (n == null) return false;
  return n === Number(DEMO_PR.number);
}

/**
 * Open demo PR #1 via host `openModal` (or injected `openModal` dep).
 * @returns true when a call was dispatched
 */
export function openDemoPrModal(opts: {
  openModal?: ((args: any) => unknown) | null;
  page?: 'conversation' | 'diff' | null;
} = {}): boolean {
  const open =
    typeof opts.openModal === 'function'
      ? opts.openModal
      : typeof globalThis !== 'undefined' &&
          typeof (globalThis as any).PRModalHost?.openModal === 'function'
        ? (args: any) => (globalThis as any).PRModalHost.openModal(args)
        : null;
  if (!open) return false;
  try {
    void open({
      owner: DEMO_PR.owner,
      repo: DEMO_PR.repo,
      number: DEMO_PR.number,
      page: opts.page || null,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Diff onboarding steps require demo PR #1.
 * - `force: true` always re-opens #1 (step enter).
 * - otherwise only re-homes when the open modal is known to be another PR.
 * @returns true when openModal was invoked
 */
export function ensureDemoPrForDiffStep(
  doc: Document | null | undefined,
  opts: {
    openModal?: ((args: any) => unknown) | null;
    force?: boolean;
  } = {}
): boolean {
  const page = isDiffLayout(doc) ? 'diff' : 'conversation';
  if (opts.force) {
    return openDemoPrModal({ openModal: opts.openModal, page });
  }
  if (!isModalOpen(doc)) {
    return openDemoPrModal({ openModal: opts.openModal, page });
  }
  const n = readOpenModalPrNumber(doc);
  // Unknown (header not painted yet) — do not thrash openModal
  if (n == null) return false;
  if (n === Number(DEMO_PR.number)) return false;
  return openDemoPrModal({ openModal: opts.openModal, page });
}


/**
 * Mount the top-right onboarding card.
 */
export function createOnboardingTour(deps: any) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const getPrefs = deps.getPrefs;
  const setPrefs = deps.setPrefs;
  const isOnboardingDone = deps.isOnboardingDone;
  const markOnboardingDone = deps.markOnboardingDone;
  const getTokenStatus = deps.getTokenStatus;
  const setToken = deps.setToken;
  const getPathname =
    deps.getPathname || (() => String(win.location?.pathname || ''));

  /** Ordered step ids for this run (may skip PR steps). */
  let plan: OnboardingStepId[] = resolveOnboardingPlan({ hasPulls: true });
  let planIndex = 0;
  let root: HTMLElement | null = null;
  let disposed = false;
  let statusText = '';
  let statusError = false;
  let tokenConfigured = false;
  let tokenMask = '';
  let prefsDraft: any = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  let pollTimer: any = null;
  /** Index into DIFF_DEMO_STEPS while on diffDemo (user-driven tips). */
  let demoSubIndex = 0;
  /** Index into CONVERSATION_DEMO_STEPS while on convDemo. */
  let convSubIndex = 0;
  /** Progress within a multi-chord Conversation tip (e.g. ⌥] then ⌥[). */
  let convChordIndex = 0;
  /** When entering openPr, was modal already open? (session restore) */
  let modalOpenOnOpenPrEnter = false;
  /** When entering diffToggle, was Diff already open? (session restore) */
  let diffOpenOnDiffToggleEnter = false;
  /** User pressed ⌥. while on diffToggle (required signal to leave the step). */
  let userPressedOptPeriod = false;

  function resolveOpenModal() {
    if (typeof deps.openModal === 'function') return deps.openModal;
    try {
      const host =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalHost
          : null;
      if (host && typeof host.openModal === 'function') {
        return (args: any) => host.openModal(args);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Force modal onto demo PR #1 before Diff teaching steps. */
  function ensureDemoPrForCurrentDiffStep(force = false) {
    const opened = ensureDemoPrForDiffStep(doc, {
      openModal: resolveOpenModal(),
      force,
    });
    if (opened) {
      setStatus(`Using demo PR #${DEMO_PR.number} for Diff tips…`);
    }
    return opened;
  }

  function currentId(): OnboardingStepId {
    return plan[planIndex] || 'done';
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearDemoPrHighlight(doc);
    if (keyHandler) {
      win.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (pollTimer) {
      win.clearInterval(pollTimer);
      pollTimer = null;
    }
    try {
      root?.remove();
    } catch {
      /* ignore */
    }
    root = null;
  }

  async function markComplete() {
    let saved = false;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        if (typeof markOnboardingDone === 'function') {
          saved = Boolean(await markOnboardingDone());
        } else {
          const next = await setPrefs({ onboardingCompleted: true });
          saved = Boolean(next?.onboardingCompleted);
        }
        if (saved) break;
        lastErr = new Error('onboarding write did not stick');
      } catch (err) {
        lastErr = err;
        await sleep(80 * (attempt + 1));
      }
    }
    try {
      doc.documentElement?.setAttribute(
        'data-prp-onboarding-done',
        saved ? '1' : '0'
      );
    } catch {
      /* ignore */
    }
    if (!saved) {
      setStatus(
        lastErr?.message ||
          'Could not save setup progress — try again or Skip tour',
        true
      );
    }
    dispose();
  }

  async function refreshTokenStatus() {
    try {
      const st = await getTokenStatus();
      tokenConfigured = Boolean(st?.configured);
      tokenMask = String(st?.mask || '');
    } catch {
      tokenConfigured = false;
      tokenMask = '';
    }
  }

  async function ensurePrefsDraft() {
    if (prefsDraft) return prefsDraft;
    try {
      prefsDraft = { ...(await getPrefs()) };
    } catch {
      prefsDraft = {
        fastReview: true,
        reverseComments: true,
        autoOpenEmbed: true,
        singleFileMode: false,
        treeView: true,
        onboardingCompleted: false,
      };
    }
    return prefsDraft;
  }

  function setStatus(text: string, isError = false) {
    statusText = text || '';
    statusError = Boolean(isError);
    const el = root?.querySelector('.prp-onboarding__status');
    if (el) {
      el.textContent = statusText;
      el.classList.toggle('prp-onboarding__status--err', statusError);
    }
  }

  function goToPlanIndex(next: number) {
    planIndex = Math.max(0, Math.min(plan.length - 1, next));
    statusText = '';
    demoSubIndex = 0;
    convSubIndex = 0;
    convChordIndex = 0;
    userPressedOptPeriod = false;
    const id = plan[planIndex];
    // Highlight only while teaching openPr (guidance — never auto-open)
    clearDemoPrHighlight(doc);
    if (id === 'openPr') {
      modalOpenOnOpenPrEnter = isModalOpen(doc);
      if (!modalOpenOnOpenPrEnter) {
        highlightDemoPr(doc);
      }
    }
    if (id === 'diffToggle') {
      // Always land on demo PR #1 before teaching ⌥. (adjacent tips may leave #2+)
      ensureDemoPrForCurrentDiffStep(true);
      // Session may already be on Diff — still teach ⌥. unless user Continues
      diffOpenOnDiffToggleEnter = isDiffLayout(doc);
    }
    if (id === 'diffDemo') {
      demoSubIndex = 0;
      ensureDemoPrForCurrentDiffStep(true);
    }
    if (id === 'convDemo') {
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

  /**
   * Skip tour → jump to feature settings (prefs), not immediate close.
   * If already on prefs or past it, finish the tour.
   */
  function skipToSettings() {
    const prefsIdx = plan.indexOf('prefs');
    const id = currentId();
    if (prefsIdx >= 0 && planIndex < prefsIdx && id !== 'prefs') {
      goToPlanIndex(prefsIdx);
      setStatus('Skipped ahead — review feature settings, then Done.');
      return;
    }
    void markComplete();
  }

  function el(tag: string, className = '', text = ''): HTMLElement {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function kbdRow(parts: Array<string | { k: string }>) {
    const row = el('div', 'prp-onboarding__kbd-row');
    for (const p of parts) {
      if (typeof p === 'string') {
        row.appendChild(el('span', 'prp-onboarding__kbd-sep', p));
      } else {
        const key = String(p.k || '');
        let kbdClass = 'prp-onboarding__kbd';
        // Shift glyph paints shorter than ⌥/⌘ in most fonts — optical scale
        if (key === '⇧' || key === 'Shift') {
          kbdClass += ' prp-onboarding__kbd--shift';
        }
        const kbd = el('kbd', kbdClass, key);
        try {
          if (key === '⇧' || key === 'Shift') {
            kbd.setAttribute('data-key', 'shift');
          } else if (key === '⌥' || key === 'Alt') {
            kbd.setAttribute('data-key', 'opt');
          } else if (key === '⌘' || key === 'Ctrl' || key === '⌃') {
            kbd.setAttribute('data-key', 'mod');
          }
        } catch {
          /* mock DOM */
        }
        row.appendChild(kbd);
      }
    }
    return row;
  }

  /** Combo chords → separate keycaps (⌥ + ⇧ + ]). */
  function kbdRowFromChords(
    chords: string[] | readonly string[],
    multiJoiner: 'or' | 'then' = 'or'
  ) {
    return kbdRow(chordLabelsToKbdParts(chords, multiJoiner));
  }

  function renderBody(body: HTMLElement) {
    body.innerHTML = '';
    const id = currentId();

    if (id === 'pat') {
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          tokenConfigured
            ? 'GitHub access is ready. Continue to learn the keyboard shortcuts — or paste a new token below to replace it.'
            : 'pr+ needs a GitHub personal access token to load your PRs. Paste a token for github.com, then continue.'
        )
      );
      if (tokenConfigured && tokenMask) {
        const saved = el('p', 'prp-onboarding__hint', `Saved: ${tokenMask}`);
        body.appendChild(saved);
      }
      const label = el('label', 'prp-onboarding__label', 'github.com PAT');
      label.setAttribute('for', 'prp-onboarding-token');
      body.appendChild(label);
      const input = doc.createElement('input');
      input.id = 'prp-onboarding-token';
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = 'ghp_… / github_pat_…';
      input.className = 'prp-onboarding__input';
      body.appendChild(input);
      const link = el('a', 'prp-onboarding__link', 'Create a token') as HTMLAnchorElement;
      link.href = 'https://github.com/settings/tokens';
      link.target = '_blank';
      link.rel = 'noreferrer';
      body.appendChild(link);
      return;
    }

    if (id === 'opt') {
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          'Most pr+ shortcuts start with Option (Mac) or Alt (Windows/Linux). Hold that key on the PR list to reveal number badges on each row.'
        )
      );
      body.appendChild(kbdRow([{ k: '⌥' }, 'or', { k: 'Alt' }]));
      body.appendChild(
        el(
          'p',
          'prp-onboarding__hint prp-onboarding__hint--pulse',
          'Hold Option / Alt once to continue…'
        )
      );
      return;
    }

    if (id === 'openPr') {
      const modalNow = isModalOpen(doc);
      const hot = resolveDemoPrHotkey(doc);
      const slot = hot.slot;
      // Keep highlight fresh while on this step
      if (!modalNow && hot.row && !hot.row.classList.contains(ONBOARDING_TARGET_PR_CLASS)) {
        highlightDemoPr(doc);
      }
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          modalNow
            ? `A PR shell is open. Prefer demo PR #${DEMO_PR.number} (20+ files, 5 review threads) for the next steps. Continue when ready.`
            : `Open demo PR #${DEMO_PR.number} from the list — it is highlighted with a blue border. Hold Option to see list badges, then press the shortcut for that row.`
        )
      );
      if (!modalNow) {
        if (slot) {
          body.appendChild(
            kbdRow([{ k: '⌥' }, '+', { k: String(slot).toUpperCase() }])
          );
          body.appendChild(
            el(
              'p',
              'prp-onboarding__hint prp-onboarding__hint--pulse',
              `Hold Option (Alt), then press ${String(slot).toUpperCase()} — that opens the highlighted PR #${DEMO_PR.number}.`
            )
          );
          body.appendChild(
            el(
              'p',
              'prp-onboarding__hint',
              'You can also click the highlighted row. We will continue automatically when the PR shell opens.'
            )
          );
        } else if (hot.link) {
          body.appendChild(
            el(
              'p',
              'prp-onboarding__hint prp-onboarding__hint--pulse',
              `Click the highlighted PR #${DEMO_PR.number} row on the list to open it…`
            )
          );
        } else {
          body.appendChild(
            el(
              'p',
              'prp-onboarding__hint prp-onboarding__hint--pulse',
              `Find PR #${DEMO_PR.number} (${DEMO_PR.pathSuffix}) on this list and open it…`
            )
          );
        }
      } else {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Press Continue when you are ready…'
          )
        );
      }
      return;
    }

    if (id === 'convDemo') {
      if (!isModalOpen(doc)) {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Open a PR shell first (demo PR #1), then practice Conversation shortcuts here.'
          )
        );
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Stay on Conversation (not Diff) for these tips…'
          )
        );
        return;
      }
      if (isDiffLayout(doc)) {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Switch to Conversation for these tips, then come back to Diff later.'
          )
        );
        body.appendChild(kbdRow([{ k: '⌥' }, '+', { k: '.' }]));
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Press ⌥. to leave Diff, then practice ⌥J / ⌥K…'
          )
        );
        return;
      }
      const tip = CONVERSATION_DEMO_STEPS[convSubIndex] || CONVERSATION_DEMO_STEPS[0];
      const total = CONVERSATION_DEMO_STEPS.length;
      body.appendChild(
        el(
          'p',
          'prp-onboarding__demo-progress',
          `Tip ${convSubIndex + 1} / ${total}`
        )
      );
      body.appendChild(el('p', 'prp-onboarding__lead', tip.title));
      body.appendChild(el('p', 'prp-onboarding__hint', tip.body));
      if (tip.chords.length) {
        const sequential = tip.chords.length > 1;
        body.appendChild(
          kbdRowFromChords(tip.chords, sequential ? 'then' : 'or')
        );
        if (sequential) {
          const nextChord =
            tip.chords[
              Math.max(0, Math.min(tip.chords.length - 1, convChordIndex))
            ] || tip.chords[0];
          body.appendChild(
            el(
              'p',
              'prp-onboarding__hint',
              `Step ${convChordIndex + 1} / ${tip.chords.length}: press ${nextChord}`
            )
          );
        }
      }
      body.appendChild(
        el(
          'p',
          'prp-onboarding__hint prp-onboarding__hint--pulse',
          tip.chords.length > 1
            ? 'Press each shortcut in order (or Enter to skip this tip)…'
            : tip.chords.length
              ? 'Press the shortcut (or Enter to skip this tip)…'
              : 'Press Enter for the next tip…'
        )
      );
      return;
    }

    if (id === 'diffToggle') {
      const nowDiff = isDiffLayout(doc);
      const onDemo = isDemoPrModalOpen(doc);
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          nowDiff
            ? `You are on Diff for demo PR #${DEMO_PR.number}. Press ⌥. to switch to Conversation and back, or Continue to keep Diff open.`
            : onDemo
              ? `Demo PR #${DEMO_PR.number} is open. Switch to Diff to review code — Conversation is always one press away again.`
              : `Opening demo PR #${DEMO_PR.number} for Diff practice. Then press ⌥. to switch to Diff.`
        )
      );
      body.appendChild(kbdRow([{ k: '⌥' }, '+', { k: '.' }]));
      body.appendChild(
        el(
          'p',
          'prp-onboarding__hint prp-onboarding__hint--pulse',
          nowDiff
            ? 'Press ⌥. (or Continue) to move on…'
            : 'Press ⌥. (Option + period) to open Diff…'
        )
      );
      return;
    }

    if (id === 'diffDemo') {
      if (!isDiffLayout(doc)) {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Open the Diff view first, then practice each shortcut yourself.'
          )
        );
        body.appendChild(kbdRow([{ k: '⌥' }, '+', { k: '.' }]));
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Press ⌥. to open Diff, then continue…'
          )
        );
        return;
      }
      const tip = DIFF_DEMO_STEPS[demoSubIndex] || DIFF_DEMO_STEPS[0];
      const total = DIFF_DEMO_STEPS.length;
      const progress = el(
        'p',
        'prp-onboarding__demo-progress',
        `Tip ${demoSubIndex + 1} / ${total}`
      );
      body.appendChild(progress);
      body.appendChild(el('p', 'prp-onboarding__lead', tip.title));
      body.appendChild(el('p', 'prp-onboarding__hint', tip.body));
      if (tip.chords.length) {
        body.appendChild(kbdRowFromChords(tip.chords, 'or'));
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Press the shortcut on the Diff panel (or Enter to skip this tip)…'
          )
        );
      } else {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            tip.id === 'wrap-up'
              ? 'Press Enter to continue the tour…'
              : 'Do this in Diff, then press Enter for the next tip…'
          )
        );
      }
      return;
    }

    if (id === 'optShiftK') {
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          'The command palette searches PRs, filters, and actions. It works on the pulls list and inside the review shell.'
        )
      );
      body.appendChild(
        kbdRow([{ k: '⌥' }, '+', { k: '⇧' }, '+', { k: 'K' }])
      );
      body.appendChild(
        el(
          'p',
          'prp-onboarding__hint prp-onboarding__hint--pulse',
          'Press ⌥⇧K (Alt+Shift+K) once to continue…'
        )
      );
      return;
    }

    if (id === 'prefs') {
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          'Pick defaults for how pr+ loads and displays reviews. You can change these later from the extension popup.'
        )
      );
      const flags: Array<{ key: string; title: string; desc: string }> = [
        {
          key: 'treeView',
          title: 'PR stack tree view',
          desc: 'Indent stacked PRs on the /pulls list',
        },
        {
          key: 'autoOpenEmbed',
          title: 'Auto-open pr+ on PR pages',
          desc: 'Open the pr+ shell when you land on a PR URL',
        },
        {
          key: 'fastReview',
          title: 'Fast progressive load',
          desc: 'Show core data first; load threads on demand',
        },
        {
          key: 'reverseComments',
          title: 'Newest comments first',
          desc: 'Composer → merge box → latest conversation',
        },
        {
          key: 'singleFileMode',
          title: 'Single-file Diff mode',
          desc: 'Show only the active file in the Diff list',
        },
      ];
      const draft = prefsDraft || {};
      for (const f of flags) {
        const row = el('label', 'prp-onboarding__pref');
        const cb = doc.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.prefKey = f.key;
        const defOn = f.key !== 'singleFileMode';
        cb.checked =
          typeof draft[f.key] === 'boolean' ? Boolean(draft[f.key]) : defOn;
        cb.addEventListener('change', () => {
          if (!prefsDraft) prefsDraft = {};
          prefsDraft[f.key] = cb.checked;
        });
        const text = el('span', 'prp-onboarding__pref-body');
        text.appendChild(el('span', 'prp-onboarding__pref-title', f.title));
        text.appendChild(el('span', 'prp-onboarding__pref-desc', f.desc));
        row.appendChild(cb);
        row.appendChild(text);
        body.appendChild(row);
      }
      return;
    }

    // done
    body.appendChild(
      el(
        'p',
        'prp-onboarding__lead',
        'You are set. Open PRs from the list, toggle Diff with ⌥., and open the palette with ⌥⇧K anytime.'
      )
    );
    const tips = el('ul', 'prp-onboarding__tips');
    for (const t of [
      'Hold ⌥ on the list → badges · ⌥N opens that PR row',
      '⌥. toggles Diff ↔ Conversation · Esc clears selection',
      'Re-run this tour from the extension popup → Start onboarding',
    ]) {
      tips.appendChild(el('li', '', t));
    }
    body.appendChild(tips);
  }

  function render() {
    if (!root || disposed) return;
    const id = currentId();
    const meta = ONBOARDING_STEPS.find((s) => s.id === id);
    const titleEl = root.querySelector('.prp-onboarding__title');
    const stepEl = root.querySelector('.prp-onboarding__step');
    const body = root.querySelector('.prp-onboarding__body') as HTMLElement | null;
    const primary = root.querySelector(
      '.prp-onboarding__btn--primary'
    ) as HTMLButtonElement | null;
    const back = root.querySelector(
      '.prp-onboarding__btn--back'
    ) as HTMLButtonElement | null;

    if (titleEl) titleEl.textContent = meta?.title || 'pr+ setup';
    if (stepEl) stepEl.textContent = `${planIndex + 1} / ${plan.length}`;
    if (body) renderBody(body);

    if (back) {
      back.hidden = planIndex === 0;
    }
    if (primary) {
      if (id === 'pat') {
        primary.textContent = tokenConfigured ? 'Continue' : 'Save & continue';
        primary.hidden = false;
      } else if (id === 'prefs') {
        primary.textContent = 'Save & continue';
        primary.hidden = false;
      } else if (id === 'done') {
        primary.textContent = 'Done';
        primary.hidden = false;
      } else if (id === 'openPr' && isModalOpen(doc)) {
        primary.textContent = 'Continue · ⏎';
        primary.hidden = false;
      } else if (id === 'openPr' && !isModalOpen(doc)) {
        // Guidance only — do not auto-open; user presses ⌥N or clicks the row
        primary.textContent = 'Skip · ⏎';
        primary.hidden = false;
      } else if (id === 'diffToggle' && isDiffLayout(doc)) {
        // Live Diff open → allow Continue without requiring a toggle
        primary.textContent = 'Continue · ⏎';
        primary.hidden = false;
      } else if (id === 'convDemo') {
        if (convSubIndex >= CONVERSATION_DEMO_STEPS.length - 1) {
          primary.textContent = 'Continue · ⏎';
        } else {
          primary.textContent = 'Next tip · ⏎';
        }
        primary.hidden = false;
      } else if (id === 'diffDemo') {
        if (!isDiffLayout(doc)) {
          primary.textContent = 'Skip Diff tips · ⏎';
        } else if (demoSubIndex >= DIFF_DEMO_STEPS.length - 1) {
          primary.textContent = 'Continue · ⏎';
        } else {
          primary.textContent = 'Next tip · ⏎';
        }
        primary.hidden = false;
      } else if (id === 'opt' || id === 'diffToggle' || id === 'optShiftK') {
        primary.textContent = 'Skip · ⏎';
        primary.hidden = false;
      } else {
        primary.textContent = 'Continue · ⏎';
        primary.hidden = false;
      }
      // Annotate other primaries with Enter where not already
      if (
        primary &&
        !primary.hidden &&
        primary.textContent &&
        !primary.textContent.includes('⏎') &&
        (id === 'pat' || id === 'prefs' || id === 'done' || id === 'openPr')
      ) {
        if (id === 'pat') {
          primary.textContent = tokenConfigured
            ? 'Continue · ⏎'
            : 'Save & continue · ⏎';
        } else if (id === 'prefs') {
          primary.textContent = 'Save & continue · ⏎';
        } else if (id === 'done') {
          primary.textContent = 'Done · ⏎';
        } else if (id === 'openPr' && isModalOpen(doc)) {
          primary.textContent = 'Continue · ⏎';
        } else if (id === 'openPr' && !isModalOpen(doc)) {
          primary.textContent = 'Skip · ⏎';
        }
      }
    }
    setStatus(statusText, statusError);
  }

  async function goNextFromPrimary() {
    const id = currentId();
    setStatus('');

    // openPr without modal: Skip only (user opens via ⌥N / click — no simulation)
    if (id === 'openPr' && !isModalOpen(doc)) {
      clearDemoPrHighlight(doc);
      advance();
      return;
    }

    if (id === 'pat') {
      const input = root?.querySelector(
        '#prp-onboarding-token'
      ) as HTMLInputElement | null;
      const value = String(input?.value || '').trim();
      if (value) {
        try {
          const res = await setToken(value);
          if (!res?.ok && res?.error) throw new Error(res.error);
          tokenConfigured = true;
          tokenMask = String(res?.mask || tokenMask);
          if (input) input.value = '';
        } catch (err: any) {
          setStatus(err?.message || 'Could not save token', true);
          return;
        }
      } else if (!tokenConfigured) {
        setStatus('Paste a PAT, or open the extension popup later.', true);
        return;
      }
      advance();
      return;
    }

    if (id === 'prefs') {
      try {
        await ensurePrefsDraft();
        const patch = {
          treeView: Boolean(prefsDraft.treeView !== false),
          autoOpenEmbed: Boolean(prefsDraft.autoOpenEmbed !== false),
          fastReview: Boolean(prefsDraft.fastReview !== false),
          reverseComments: Boolean(prefsDraft.reverseComments !== false),
          singleFileMode: Boolean(prefsDraft.singleFileMode === true),
        };
        prefsDraft = await setPrefs(patch);
      } catch (err: any) {
        setStatus(err?.message || 'Could not save options', true);
        return;
      }
      advance();
      return;
    }

    if (id === 'done') {
      await markComplete();
      return;
    }

    // Skip interactive steps / advance guided tips
    if (id === 'diffDemo') {
      advanceDiffTip();
      return;
    }
    if (id === 'convDemo') {
      advanceConvTip();
      return;
    }
    advance();
  }

  /** Move to next Diff tip, or leave the Diff tips step when finished. */
  function advanceDiffTip() {
    if (demoSubIndex < DIFF_DEMO_STEPS.length - 1) {
      demoSubIndex += 1;
      setStatus('');
      render();
      return;
    }
    advance();
  }

  /** Move to next Conversation tip, or leave when finished. */
  function advanceConvTip() {
    convChordIndex = 0;
    if (convSubIndex < CONVERSATION_DEMO_STEPS.length - 1) {
      convSubIndex += 1;
      setStatus('');
      render();
      return;
    }
    advance();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disposed || !root) return;
    const t = e.target as HTMLElement | null;
    const inField = Boolean(
      t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as any).isContentEditable)
    );

    const id = currentId();
    const mod = Boolean(e.metaKey || e.ctrlKey);
    const opts = {
      alt: e.altKey,
      shift: e.shiftKey,
      mod,
      key: e.key,
      code: e.code,
      type: 'keydown' as const,
    };

    // Card chrome shortcuts (not inside form fields)
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
      // Esc skips the whole tour — except when a Diff tip is teaching Esc
      if (isOnboardingSkipTourEvent(opts)) {
        const tip =
          id === 'diffDemo' && isDiffLayout(doc)
            ? DIFF_DEMO_STEPS[demoSubIndex]
            : null;
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
      // Esc in inputs still jumps to settings (or completes if already there)
      if (isOnboardingSkipTourEvent(opts)) {
        e.preventDefault();
        skipToSettings();
        return;
      }
    }

    if (id === 'opt' && isOptHoldEvent(opts) && e.altKey) {
      e.preventDefault();
      advance();
      return;
    }
    if (id === 'openPr') {
      // Let host open the PR via the guided hotkey; poll advances when modal appears
      const slot = resolveDemoPrHotkey(doc).slot;
      if (slot && isOptHotkeySlotEvent(opts, slot)) {
        setStatus(
          `Opening PR #${DEMO_PR.number} with ⌥${String(slot).toUpperCase()}…`
        );
        return;
      }
      if (isOptDigit1Event(opts)) {
        setStatus('Opening with list hotkey…');
        return;
      }
    }
    if (id === 'convDemo') {
      // Stay on Conversation for JK tips; allow ⌥. to leave Diff if needed
      if (isDiffLayout(doc) && isOptPeriodEvent(opts)) {
        return; // host toggles to Conversation
      }
      const tip = CONVERSATION_DEMO_STEPS[convSubIndex];
      if (tip?.chords?.length) {
        // Multi-chord tips (⌥] then ⌥[) must be pressed in order so we land
        // back on the demo PR before Diff steps.
        if (matchesConversationDemoChordAt(opts, tip, convChordIndex)) {
          const next = nextConversationDemoChordIndex(tip, convChordIndex);
          if (next === 'done') {
            convChordIndex = 0;
            advanceConvTip();
          } else {
            convChordIndex = next;
            const nextChord = tip.chords[next] || '';
            setStatus(
              tip.id === 'conv-adjacent'
                ? `Good — now ${nextChord} to return to demo PR #${DEMO_PR.number}…`
                : `Now press ${nextChord}…`
            );
            render();
          }
          return;
        }
        if (matchesConversationDemoStep(opts, tip)) {
          const expected = tip.chords[convChordIndex] || tip.chords[0];
          setStatus(
            `Press ${expected} next (${tip.chords.join(' → ')})`
          );
          return;
        }
      }
    }
    if (id === 'diffToggle' && isOptPeriodEvent(opts)) {
      userPressedOptPeriod = true;
      render();
      return;
    }
    if (id === 'diffDemo' && isDiffLayout(doc)) {
      const tip = DIFF_DEMO_STEPS[demoSubIndex];
      if (tip && matchesDiffDemoStep(opts, tip)) {
        // Let host handle the shortcut; advance the tip guide
        advanceDiffTip();
        return;
      }
    }
    if (id === 'optShiftK' && isOptShiftKEvent(opts)) {
      advance();
    }
  }

  function tickPoll() {
    if (disposed) return;
    const id = currentId();
    if (id === 'openPr') {
      // Keep target PR highlighted while waiting
      if (!isModalOpen(doc)) {
        const row = doc.querySelector?.(`.${ONBOARDING_TARGET_PR_CLASS}`);
        if (!row) highlightDemoPr(doc);
      }
      // Advance only when a modal opens *after* this step started
      // (session-restored modal at enter should not skip the teaching step)
      if (isModalOpen(doc) && !modalOpenOnOpenPrEnter) {
        clearDemoPrHighlight(doc);
        advance();
      }
      return;
    }
    if (id === 'diffToggle') {
      // Stay on demo PR #1 while teaching Diff toggle (only when known wrong)
      const openNum = readOpenModalPrNumber(doc);
      if (
        isModalOpen(doc) &&
        openNum != null &&
        openNum !== Number(DEMO_PR.number)
      ) {
        ensureDemoPrForCurrentDiffStep(false);
      }
      // Keep card copy in sync with live layout
      render();
      // Advance when user pressed ⌥. and Diff shell is active.
      // (If Diff was already open, primary "Continue" advances — no auto-skip.)
      if (userPressedOptPeriod && isDiffLayout(doc)) {
        if (
          openNum != null &&
          openNum !== Number(DEMO_PR.number)
        ) {
          // Diff on wrong PR — re-home, do not leave the step yet
          ensureDemoPrForCurrentDiffStep(false);
          return;
        }
        advance();
      }
      return;
    }
    if (id === 'convDemo' || id === 'diffDemo') {
      // Keep tip card in sync when user toggles Conversation ↔ Diff
      render();
    }
  }

  function buildShell() {
    const rootEl = el('div', 'prp-onboarding');
    rootEl.id = ONBOARDING_ROOT_ID;
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-label', 'pr+ setup');

    const card = el('div', 'prp-onboarding__card');
    const header = el('header', 'prp-onboarding__header');
    header.appendChild(el('div', 'prp-onboarding__brand', 'pr+'));
    const stepEl = el('div', 'prp-onboarding__step');
    stepEl.setAttribute('aria-live', 'polite');
    header.appendChild(stepEl);
    const closeBtn = el('button', 'prp-onboarding__close', '×');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Skip to settings');
    closeBtn.setAttribute('title', 'Skip to feature settings (Esc)');
    closeBtn.addEventListener('click', () => {
      skipToSettings();
    });
    header.appendChild(closeBtn);

    const title = el('h2', 'prp-onboarding__title');
    const body = el('div', 'prp-onboarding__body');
    const status = el('p', 'prp-onboarding__status');
    status.setAttribute('aria-live', 'polite');

    const footer = el('footer', 'prp-onboarding__footer');
    const back = el(
      'button',
      'prp-onboarding__btn prp-onboarding__btn--back',
      'Back · ⌫'
    );
    back.setAttribute('type', 'button');
    back.setAttribute('title', 'Back (Backspace)');
    back.addEventListener('click', () => goBack());
    const skip = el(
      'button',
      'prp-onboarding__btn prp-onboarding__btn--ghost prp-onboarding__btn--skip',
      'Skip to settings · Esc'
    );
    skip.setAttribute('type', 'button');
    skip.setAttribute('title', 'Skip remaining tips and open feature settings (Esc)');
    skip.addEventListener('click', () => {
      skipToSettings();
    });
    const primary = el(
      'button',
      'prp-onboarding__btn prp-onboarding__btn--primary',
      'Continue · ⏎'
    );
    primary.setAttribute('type', 'button');
    primary.addEventListener('click', () => {
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
    if (disposed) return { ok: false, reason: 'disposed' };

    if (typeof isOnboardingDone === 'function') {
      try {
        if (await isOnboardingDone()) {
          return { ok: false, reason: 'already-completed' };
        }
      } catch {
        return { ok: false, reason: 'status-unavailable' };
      }
    } else {
      try {
        const prefs = await getPrefs();
        if (!shouldShowOnboarding(prefs, getPathname())) {
          return { ok: false, reason: 'not-eligible' };
        }
      } catch {
        return { ok: false, reason: 'prefs-unavailable' };
      }
    }

    if (!shouldShowOnboarding({ onboardingCompleted: false }, getPathname())) {
      // Allow resume if card already exists mid-tour after soft nav
      if (!doc.getElementById(ONBOARDING_ROOT_ID) && !isModalOpen(doc)) {
        return { ok: false, reason: 'not-pulls-page' };
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
    win.addEventListener('keydown', keyHandler, true);
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
    setStep: (n: number) => goToPlanIndex(n),
    getRoot: () => root,
    isActive: () => Boolean(root) && !disposed,
  };
}

const onboardingApi = {
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
  CONVERSATION_DEMO_STEPS,
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
  createOnboardingTour,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = onboardingApi;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).PROnboarding = onboardingApi;
}
