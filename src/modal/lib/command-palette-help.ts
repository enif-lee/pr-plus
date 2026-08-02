/** @module modal/lib/command-palette */
/**
 * Linear-style command palette registry + filter for the PR modal.
 * Commands are pure data; runners are injected by the App.
 *
 * Keyboard: most product chords are opt/⌥; Find stays mod/⌘F.
 *   mod+.        → opt+.
 *   mod+f        → mod+f (Find)
 *   mod+shift+X  → opt+shift+X
 */
import { allowedMergeMethods, canUpdateBranch } from './merge-box-status';

import {
  buildPaletteCommands,
} from './command-palette-build';


/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   section?: string,
 *   keywords?: string[],
 *   shortcut?: string,
 *   action: string,
 *   payload?: object,
 * }} PaletteCommand
 */

/**
 * PR detail actions on Option chords (former mod/⌘ → opt/⌥).
 * `shift: true`  → ⌥⇧letter
 * `shift: false` → ⌥letter (or ⌥.)
 *
 * Reserved plain Opt: j/k step-nav, 1–9 stack, [ ] adjacent.
 */
export function buildModalPaletteHelpEntries(
  detail: any,
  opts: {
    layoutMode?: string;
    stackItems?: any[];
    openPulls?: any[];
    canSubmitReviewVerdict?: boolean;
  } = {}
): Array<{
  id: string;
  title: string;
  aliases: string[];
  primary: string;
  action: string;
  shortcut?: string | null;
  section?: string;
}> {
  const cmds = buildPaletteCommands(detail, opts);
  const out: Array<{
    id: string;
    title: string;
    aliases: string[];
    primary: string;
    action: string;
    shortcut?: string | null;
    section?: string;
  }> = [];
  const seen = new Set<string>();
  for (const c of cmds) {
    if (!c || !c.id) continue;
    // Help panel: prefer rows with a shortcut or typed aliases (actionable)
    const aliases = Array.isArray(c.aliases)
      ? c.aliases.map((a: any) => String(a).toLowerCase()).filter(Boolean)
      : [];
    const shortcut = c.shortcut ? String(c.shortcut) : '';
    if (!shortcut && aliases.length === 0) continue;
    // Skip dynamic people/label rows (too many)
    if (
      String(c.id).startsWith('rm-rev-') ||
      String(c.id).startsWith('rm-asg-') ||
      String(c.id).startsWith('label-') ||
      String(c.id).startsWith('stack-slot-')
    ) {
      continue;
    }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const displayAliases = [
      ...aliases,
      ...(shortcut ? [shortcut] : []),
    ];
    out.push({
      id: String(c.id),
      title: String(c.title || c.id),
      aliases: displayAliases,
      primary: aliases[0] || shortcut || '',
      action: String(c.action || ''),
      shortcut: shortcut || null,
      section: c.section ? String(c.section) : undefined,
    });
  }
  return out;
}

/**
 * Inventory of product chords that MUST appear as palette rows for a scope.
 * Used by unit tests to prevent shortcut ↔ palette drift.
 *
 * @param {'conversation'|'diff'} scope
 * @returns {Array<{ id: string, shortcut: string, action: string }>}
 */
export function listRequiredPaletteShortcutCoverage(
  scope: 'conversation' | 'diff' | string
): Array<{ id: string; shortcut: string; action: string }> {
  const s = String(scope || '').toLowerCase();
  const common: Array<{ id: string; shortcut: string; action: string }> = [
    { id: 'toggle-diff', shortcut: 'opt+.', action: 'toggleDiff' },
    { id: 'toggle-side-panel', shortcut: 'opt+b', action: 'toggleSidePanel' },
    { id: 'find-in-pr', shortcut: 'mod+f', action: 'openSearch' },
    {
      id: 'toggle-fullscreen',
      shortcut: 'opt+shift+f',
      action: 'toggleFullscreen',
    },
    {
      id: 'focus-conversation-comment',
      shortcut: 'opt+shift+c',
      action: 'focusConversationComment',
    },
    {
      id: 'nav-adjacent-prev',
      shortcut: 'opt+[',
      action: 'navAdjacentPrev',
    },
    {
      id: 'nav-adjacent-next',
      shortcut: 'opt+]',
      action: 'navAdjacentNext',
    },
    {
      id: 'context-thread-fold',
      shortcut: 'opt+f',
      action: 'contextThreadFold',
    },
    {
      id: 'context-thread-diff',
      shortcut: 'opt+d',
      action: 'contextThreadGotoDiff',
    },
    {
      id: 'context-thread-comment',
      shortcut: 'opt+c',
      action: 'contextThreadComment',
    },
    {
      id: 'context-thread-resolve',
      shortcut: 'opt+ctrl+r',
      action: 'contextThreadResolve',
    },
  ];
  if (s === 'diff') {
    return [
      ...common,
      {
        id: 'diff-prev-file',
        shortcut: 'opt+shift+[',
        action: 'navFilePrev',
      },
      {
        id: 'diff-next-file',
        shortcut: 'opt+shift+]',
        action: 'navFileNext',
      },
      {
        id: 'diff-page-up',
        shortcut: 'opt+shift+arrowup',
        action: 'scrollDiffPagePrev',
      },
      {
        id: 'diff-page-down',
        shortcut: 'opt+shift+arrowdown',
        action: 'scrollDiffPageNext',
      },
      {
        id: 'diff-opt-arrow-up',
        shortcut: 'opt+arrowup',
        action: 'optArrowScrollSelectPrev',
      },
      {
        id: 'diff-opt-arrow-down',
        shortcut: 'opt+arrowdown',
        action: 'optArrowScrollSelectNext',
      },
      {
        id: 'diff-toggle-viewed',
        shortcut: 'opt+shift+r',
        action: 'toggleViewedActiveFile',
      },
      {
        id: 'diff-fold-file',
        shortcut: 'opt+f',
        action: 'toggleActiveFileCollapse',
      },
      {
        id: 'diff-step-prev',
        shortcut: 'opt+k',
        action: 'stepNavPrev',
      },
      {
        id: 'diff-step-next',
        shortcut: 'opt+j',
        action: 'stepNavNext',
      },
      {
        id: 'diff-filter-unresolved',
        shortcut: 'opt+u',
        action: 'toggleReviewFilterUnresolved',
      },
      {
        id: 'diff-filter-resolved',
        shortcut: 'opt+r',
        action: 'toggleReviewFilterResolved',
      },
      {
        id: 'diff-filter-pending',
        shortcut: 'opt+p',
        action: 'toggleReviewFilterPending',
      },
      { id: 'diff-sel-up', shortcut: 'arrowup', action: 'moveSelectionUp' },
      {
        id: 'diff-sel-down',
        shortcut: 'arrowdown',
        action: 'moveSelectionDown',
      },
      {
        id: 'diff-sel-extend-up',
        shortcut: 'shift+arrowup',
        action: 'extendSelectionUp',
      },
      {
        id: 'diff-sel-extend-down',
        shortcut: 'shift+arrowdown',
        action: 'extendSelectionDown',
      },
      {
        id: 'diff-sel-comment',
        shortcut: 'opt+c',
        action: 'openSelectionComment',
      },
      {
        id: 'diff-sel-copy-code',
        shortcut: 'mod+c',
        action: 'copySelectionCode',
      },
      {
        id: 'diff-sel-copy-url',
        shortcut: 'mod+opt+c',
        action: 'copySelectionUrl',
      },
    ];
  }
  // Conversation (centered)
  return [
    ...common,
    {
      id: 'conv-comment-prev',
      shortcut: 'opt+k',
      action: 'stepNavPrev',
    },
    {
      id: 'conv-comment-next',
      shortcut: 'opt+j',
      action: 'stepNavNext',
    },
    {
      id: 'conv-scroll-up',
      shortcut: 'opt+arrowup',
      action: 'scrollConversationOptPrev',
    },
    {
      id: 'conv-scroll-down',
      shortcut: 'opt+arrowdown',
      action: 'scrollConversationOptNext',
    },
    {
      id: 'conv-page-up',
      shortcut: 'opt+shift+arrowup',
      action: 'scrollConversationPagePrev',
    },
    {
      id: 'conv-page-down',
      shortcut: 'opt+shift+arrowdown',
      action: 'scrollConversationPageNext',
    },
  ];
}

/**
 * Assert every required chord for a scope is present on the built command list
 * with a matching non-empty shortcut token.
 *
 * @returns {{ ok: boolean, missing: Array<{ id: string, shortcut: string }> }}
 */
export function checkPaletteShortcutCoverage(
  commands: unknown,
  scope: 'conversation' | 'diff' | string
): { ok: boolean; missing: Array<{ id: string; shortcut: string }> } {
  const list = Array.isArray(commands) ? commands : [];
  const byId = new Map(
    list.map((c: any) => [String(c?.id || ''), c]).filter(([id]) => id)
  );
  const required = listRequiredPaletteShortcutCoverage(scope);
  const missing: Array<{ id: string; shortcut: string }> = [];
  for (const req of required) {
    const cmd = byId.get(req.id);
    const sc = cmd?.shortcut != null ? String(cmd.shortcut).toLowerCase() : '';
    const want = String(req.shortcut).toLowerCase();
    if (!cmd || !sc || sc !== want) {
      missing.push({ id: req.id, shortcut: req.shortcut });
    }
  }
  return { ok: missing.length === 0, missing };
}
