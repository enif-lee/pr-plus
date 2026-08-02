/** onboarding core constants/helpers */
import {
  CONVERSATION_DEMO_STEPS,
  DIFF_DEMO_STEPS,
  chordLabelsToKbdParts,
  matchesDiffDemoChord,
  matchesDiffDemoStep,
  splitChordKeys,
} from './onboarding-diff-demo';
import {
  fireKey,
  isEscapeEvent,
  isOnboardingBackEvent,
  isOnboardingEnterEvent,
  isOnboardingSkipTourEvent,
  isOptDigit1Event,
  isOptHoldEvent,
  isOptHotkeySlotEvent,
  isOptPeriodEvent,
  isOptShiftKEvent,
  sleep,
} from './onboarding-hotkeys';

/** Split from onboarding.ts: onboarding-steps */
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
