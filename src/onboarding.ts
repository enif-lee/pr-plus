/**
 * First-run onboarding tour (top-right card) after install → pulls.
 *
 * Flow:
 *  1. pat        — save github.com PAT
 *  2. opt        — hold Option / Alt
 *  3. openPr     — click a PR or ⌥1 (skipped if list empty)
 *  4. diffToggle — ⌥. to open Diff (skipped if no PR)
 *  5. diffDemo   — auto demo (file / selection / multi / comment), then Esc
 *  6. optShiftK  — ⌥⇧K command palette
 *  7. prefs      — feature flags (incl. tree view)
 *  8. done       — finish
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
  { id: 'diffToggle', title: 'Open Diff', index: 3 },
  { id: 'diffDemo', title: 'Diff demo', index: 4 },
  { id: 'optShiftK', title: 'Command palette', index: 5 },
  { id: 'prefs', title: 'Feature settings', index: 6 },
  { id: 'done', title: 'All set', index: 7 },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

/** Steps that need an open PR modal; skipped when list is empty. */
export const PR_DEPENDENT_STEPS: OnboardingStepId[] = [
  'openPr',
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
 * Ordered Diff demo beats — each has a short explanation + optional chords.
 * Used by runDiffDemo for narration between actions.
 */
export const DIFF_DEMO_STEPS = [
  {
    id: 'select-line',
    title: '1 · Select a line',
    body: 'On PR #1 we click a code line first. That starts a selection — the foundation for new comments.',
    chords: [] as string[],
  },
  {
    id: 'file-next',
    title: '2 · Next file',
    body: 'Jump to the next changed file in this PR (20+ demo files). No mouse needed.',
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
    body: 'Page the hunk list by roughly one screen — faster than the trackpad on long files.',
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
    body: 'Arrow keys move the selected line one step at a time.',
    chords: ['↓'],
  },
  {
    id: 'jump-selection',
    title: '7 · Jump selection',
    body: 'Option + arrow hops several lines — useful when scanning a large hunk.',
    chords: ['⌥↓'],
  },
  {
    id: 'multi-select',
    title: '8 · Multi-line range',
    body: 'Shift + arrow grows the selection into a block you can comment on together.',
    chords: ['⇧↓'],
  },
  {
    id: 'comment-island',
    title: '9 · New comment bar',
    body: 'With a range selected, a bar appears — that is how you start a *new* review comment.',
    chords: [] as string[],
  },
  {
    id: 'clear-selection',
    title: '10 · Clear selection',
    body: 'Esc dismisses the selection bar so we can navigate existing review threads.',
    chords: ['Esc'],
  },
  {
    id: 'thread-next',
    title: '11 · Next review thread',
    body: 'PR #1 has 5 demo thread groups. ⌥J steps to the next review comment/thread on Diff.',
    chords: ['⌥J', '⌥J'],
  },
  {
    id: 'thread-prev',
    title: '12 · Previous review thread',
    body: '⌥K steps backward through the same comment list — great for triage.',
    chords: ['⌥K', '⌥K'],
  },
  {
    id: 'wrap-up',
    title: '13 · Done with the demo',
    body: 'You saw files, scrolling, selection, new comments, and thread nav on PR #1. Press Esc if anything is still focused, then continue.',
    chords: ['Esc'],
  },
] as const;

export type DiffDemoStepId = (typeof DIFF_DEMO_STEPS)[number]['id'];

export type DiffDemoNarration = {
  index: number;
  total: number;
  id: string;
  title: string;
  body: string;
  chords: string[];
};

/**
 * Scripted Diff demo with narrated beats between shortcuts.
 * @param onNarrate called before each beat (update onboarding card UI)
 */
export async function runDiffDemo(
  doc: Document,
  win: Window,
  onNarrate?: (n: DiffDemoNarration) => void | Promise<void>
) {
  const target = doc;
  const narrate = async (index: number) => {
    const step = DIFF_DEMO_STEPS[index];
    if (!step) return;
    const payload: DiffDemoNarration = {
      index,
      total: DIFF_DEMO_STEPS.length,
      id: step.id,
      title: step.title,
      body: step.body,
      chords: [...step.chords],
    };
    try {
      await onNarrate?.(payload);
    } catch {
      /* ignore UI errors */
    }
    // Pause so the user can read the card
    await sleep(index === 0 ? 900 : 1100);
  };

  const click = (sel: string) => {
    const el = doc.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    try {
      el.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 8, clientY: 8 })
      );
      el.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 8, clientY: 8 })
      );
      el.click();
      return true;
    } catch {
      return false;
    }
  };

  const pickLine = () =>
    click('.prp-vline--selectable') ||
    click('.prp-vline--context') ||
    click('.prp-vline--add') ||
    click('.prp-vline--del') ||
    click('.prp-vline');

  // 0 — select line
  await narrate(0);
  pickLine();
  await sleep(350);

  // 1 — next file ⌥⇧]
  await narrate(1);
  fireKey(target, { key: ']', code: 'BracketRight', alt: true, shift: true });
  await sleep(450);
  pickLine();
  await sleep(200);

  // 2 — prev file ⌥⇧[
  await narrate(2);
  fireKey(target, { key: '[', code: 'BracketLeft', alt: true, shift: true });
  await sleep(450);
  pickLine();
  await sleep(200);

  // 3 — page down ⌥⇧↓
  await narrate(3);
  fireKey(target, { key: 'ArrowDown', code: 'ArrowDown', alt: true, shift: true });
  await sleep(400);

  // 4 — page up ⌥⇧↑
  await narrate(4);
  fireKey(target, { key: 'ArrowUp', code: 'ArrowUp', alt: true, shift: true });
  await sleep(400);

  // 5 — move selection ↓
  await narrate(5);
  pickLine();
  await sleep(200);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: 'ArrowDown', code: 'ArrowDown' });
    await sleep(160);
  }

  // 6 — jump selection ⌥↓
  await narrate(6);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: 'ArrowDown', code: 'ArrowDown', alt: true });
    await sleep(220);
  }

  // 7 — multi-line ⇧↓
  await narrate(7);
  for (let i = 0; i < 3; i++) {
    fireKey(target, { key: 'ArrowDown', code: 'ArrowDown', shift: true });
    await sleep(180);
  }
  await sleep(280);

  // 8 — new comment island
  await narrate(8);
  const commented =
    click('.prp-selection-island button') ||
    click('.prp-selection-dock button') ||
    click('[data-action="comment"]') ||
    click('.prp-sel-actions button') ||
    click('.prp-selection-island .prp-btn--primary') ||
    click('.prp-selection-dock .prp-btn');
  void commented;
  await sleep(700);

  // 9 — clear selection with Esc
  await narrate(9);
  fireKey(target, { key: 'Escape', code: 'Escape' });
  await sleep(350);
  fireKey(target, { key: 'Escape', code: 'Escape' });
  await sleep(300);

  // Focus an existing review thread if present (PR #1 demo threads)
  click('.prp-vline--comment') ||
    click('.prp-inline-thread') ||
    click('[data-thread-focus-anchor]') ||
    click('.prp-inline-comment');
  await sleep(400);

  // 10 — next review thread ⌥J (step nav on Diff)
  await narrate(10);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: 'j', code: 'KeyJ', alt: true });
    await sleep(450);
  }

  // 11 — previous review thread ⌥K
  await narrate(11);
  for (let i = 0; i < 2; i++) {
    fireKey(target, { key: 'k', code: 'KeyK', alt: true });
    await sleep(450);
  }

  // 12 — wrap-up
  await narrate(12);
  await sleep(400);

  return { ok: true, steps: DIFF_DEMO_STEPS.length };
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
  let demoRunning = false;
  let demoDone = false;
  let demoWaitingEsc = false;
  /** Live narration while Diff demo runs */
  let demoNarration: DiffDemoNarration | null = null;
  /** When entering openPr, was modal already open? (session restore) */
  let modalOpenOnOpenPrEnter = false;
  /** When entering diffToggle, was Diff already open? (session restore) */
  let diffOpenOnDiffToggleEnter = false;
  /** User pressed ⌥. while on diffToggle (required signal to leave the step). */
  let userPressedOptPeriod = false;

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
    demoRunning = false;
    demoDone = false;
    demoWaitingEsc = false;
    demoNarration = null;
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
      // Session may already be on Diff — still teach ⌥. unless user Continues
      diffOpenOnDiffToggleEnter = isDiffLayout(doc);
    }
    render();
    // Only start demo after we are on the demo step *and* Diff is active
    if (id === 'diffDemo') {
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
        row.appendChild(el('span', '', p));
      } else {
        row.appendChild(el('kbd', 'prp-onboarding__kbd', p.k));
      }
    }
    return row;
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

    if (id === 'diffToggle') {
      const nowDiff = isDiffLayout(doc);
      body.appendChild(
        el(
          'p',
          'prp-onboarding__lead',
          nowDiff
            ? 'You are on the Diff view. Press ⌥. to switch to Conversation and back, or Continue to keep Diff open.'
            : 'Switch to Diff to review code. Press the shortcut once — Conversation is always one press away again.'
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
      if (demoWaitingEsc) {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Diff demo finished — file nav, paging, selection jumps, multi-line ranges, and the comment bar.'
          )
        );
        body.appendChild(kbdRow([{ k: 'Esc' }]));
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Press Esc to clear selection UI and continue…'
          )
        );
      } else if (demoRunning && demoNarration) {
        const n = demoNarration;
        const progress = el(
          'p',
          'prp-onboarding__demo-progress',
          `Demo ${n.index + 1} / ${n.total}`
        );
        body.appendChild(progress);
        body.appendChild(el('p', 'prp-onboarding__lead', n.title));
        body.appendChild(el('p', 'prp-onboarding__hint', n.body));
        if (n.chords.length) {
          const parts: Array<string | { k: string }> = [];
          n.chords.forEach((c, i) => {
            if (i > 0) parts.push('then');
            // Expand multi-key labels like ⌥⇧] into separate kbd chips when possible
            parts.push({ k: c });
          });
          body.appendChild(kbdRow(parts));
        }
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint prp-onboarding__hint--pulse',
            'Watch the Diff panel…'
          )
        );
      } else if (demoRunning) {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Starting Diff demo…'
          )
        );
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint',
            'We will walk through file navigation, scrolling, selection, and comments.'
          )
        );
      } else {
        body.appendChild(
          el(
            'p',
            'prp-onboarding__lead',
            'Ready for a guided Diff walkthrough. Stay on the Diff view.'
          )
        );
        body.appendChild(
          el(
            'p',
            'prp-onboarding__hint',
            'Each step will explain a shortcut, then play it for you.'
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
        primary.textContent = 'Continue';
        primary.hidden = false;
      } else if (id === 'openPr' && !isModalOpen(doc)) {
        // Guidance only — do not auto-open; user presses ⌥N or clicks the row
        primary.textContent = 'Skip this step';
        primary.hidden = false;
      } else if (id === 'diffToggle' && isDiffLayout(doc)) {
        // Live Diff open → allow Continue without requiring a toggle
        primary.textContent = 'Continue';
        primary.hidden = false;
      } else if (
        id === 'opt' ||
        id === 'diffToggle' ||
        id === 'optShiftK' ||
        (id === 'diffDemo' && demoWaitingEsc)
      ) {
        primary.textContent = 'Skip this step';
        primary.hidden = false;
      } else if (id === 'diffDemo' && demoRunning) {
        primary.textContent = 'Skip demo';
        primary.hidden = false;
      } else if (id === 'diffDemo' && !isDiffLayout(doc) && !demoRunning) {
        // Demo step but not on Diff yet — help user get there
        primary.textContent = 'Skip demo';
        primary.hidden = false;
      } else {
        primary.textContent = 'Continue';
        primary.hidden = false;
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

    // Skip interactive steps
    advance();
  }

  async function maybeStartDemo() {
    if (disposed || currentId() !== 'diffDemo') return;
    if (demoRunning || demoDone || demoWaitingEsc) return;
    // Never start the demo from Conversation — only real Diff layout
    if (!isDiffLayout(doc)) {
      return;
    }
    demoRunning = true;
    demoNarration = null;
    render();
    try {
      await runDiffDemo(doc, win, async (n) => {
        if (disposed || currentId() !== 'diffDemo') return;
        demoNarration = n;
        render();
      });
    } catch (err) {
      console.warn('[pr+] onboarding demo', err);
    }
    demoRunning = false;
    demoDone = true;
    demoWaitingEsc = true;
    demoNarration = null;
    render();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disposed || !root) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        (t as any).isContentEditable)
    ) {
      // Allow Esc even from inputs during demo wait
      if (!(currentId() === 'diffDemo' && isEscapeEvent(e))) return;
    }

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

    if (id === 'opt' && isOptHoldEvent(opts) && e.altKey) {
      e.preventDefault();
      advance();
      return;
    }
    if (id === 'openPr') {
      // Let host open the PR via the guided hotkey; poll advances when modal appears
      const slot = resolveDemoPrHotkey(doc).slot;
      if (slot && isOptHotkeySlotEvent(opts, slot)) {
        setStatus(`Opening PR #${DEMO_PR.number} with ⌥${String(slot).toUpperCase()}…`);
        return;
      }
      // Also accept ⌥1 as common first-slot attempt (re-render keeps guide accurate)
      if (isOptDigit1Event(opts)) {
        setStatus('Opening with list hotkey…');
        return;
      }
    }
    if (id === 'diffToggle' && isOptPeriodEvent(opts)) {
      // Host toggles Diff; advance only after Diff is actually active (poll)
      userPressedOptPeriod = true;
      // Re-render so copy tracks Conversation ↔ Diff immediately
      render();
      return;
    }
    if (id === 'diffDemo' && demoWaitingEsc && isEscapeEvent(opts)) {
      advance();
      return;
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
      // Keep card copy in sync with live layout
      render();
      // Advance when user pressed ⌥. and Diff shell is active.
      // (If Diff was already open, primary "Continue" advances — no auto-skip.)
      if (userPressedOptPeriod && isDiffLayout(doc)) {
        advance();
      }
      return;
    }
    if (id === 'diffDemo') {
      if (!demoRunning && !demoDone && !demoWaitingEsc) {
        // Strict: Diff layout only — never conversation modal
        if (isDiffLayout(doc)) void maybeStartDemo();
      }
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
    closeBtn.setAttribute('aria-label', 'Skip tour');
    closeBtn.addEventListener('click', () => {
      void markComplete();
    });
    header.appendChild(closeBtn);

    const title = el('h2', 'prp-onboarding__title');
    const body = el('div', 'prp-onboarding__body');
    const status = el('p', 'prp-onboarding__status');
    status.setAttribute('aria-live', 'polite');

    const footer = el('footer', 'prp-onboarding__footer');
    const back = el('button', 'prp-onboarding__btn prp-onboarding__btn--back', 'Back');
    back.setAttribute('type', 'button');
    back.addEventListener('click', () => goBack());
    const skip = el(
      'button',
      'prp-onboarding__btn prp-onboarding__btn--ghost prp-onboarding__btn--skip',
      'Skip tour'
    );
    skip.setAttribute('type', 'button');
    skip.addEventListener('click', () => {
      void markComplete();
    });
    const primary = el(
      'button',
      'prp-onboarding__btn prp-onboarding__btn--primary',
      'Continue'
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
  createOnboardingTour,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = onboardingApi;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).PROnboarding = onboardingApi;
}
