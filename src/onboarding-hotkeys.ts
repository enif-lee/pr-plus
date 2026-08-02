/** Split from onboarding.ts: onboarding-hotkeys */
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
export function sleep(ms: number) {
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
