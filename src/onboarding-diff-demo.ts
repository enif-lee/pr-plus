/** Split from onboarding.ts: onboarding-diff-demo */
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

