/** @module modal/lib/markdown-composer */
/**
 * Pure markdown segment helpers + mention / slash / emoji composer affordances.
 *
 * Supported slash commands (bounded set):
 *   /approve /nit /blocking /question /suggestion /lgtm
 *
 * Mentions: filter collaborators by prefix after '@'.
 * Emoji: `:` typeahead → `:shortcode:` (see emoji-shortcodes).
 */

import {
  EMOJI_SHORTCODES,
  detectEmojiTrigger,
  filterEmojis,
  applyEmojiInsertion,
  emojiMenuLabel,
  expandEmojiShortcodes,
} from './emoji-shortcodes';

export {
  EMOJI_SHORTCODES,
  detectEmojiTrigger,
  filterEmojis,
  applyEmojiInsertion,
  emojiMenuLabel,
  expandEmojiShortcodes,
};

/** @type {Array<{ id: string, label: string, insert: string, description: string }>} */
export const SLASH_COMMANDS = [
  {
    id: 'approve',
    label: '/approve',
    insert: '**LGTM** — looks good to me.',
    description: 'Approve-style praise',
  },
  {
    id: 'lgtm',
    label: '/lgtm',
    insert: 'LGTM 👍',
    description: 'Short LGTM',
  },
  {
    id: 'nit',
    label: '/nit',
    insert: '**nit:** ',
    description: 'Non-blocking nitpick',
  },
  {
    id: 'blocking',
    label: '/blocking',
    insert: '**blocking:** ',
    description: 'Blocking concern',
  },
  {
    id: 'question',
    label: '/question',
    insert: '**question:** ',
    description: 'Clarifying question',
  },
  {
    id: 'suggestion',
    label: '/suggestion',
    insert: '```suggestion\n\n```',
    description: 'GitHub suggestion fence',
  },
];

/**
 * Split markdown into md / mermaid segments for rendering.
 * @param {string} source
 * @returns {Array<{ type: 'md'|'mermaid', content: string }>}
 */
export function splitMarkdownSegments(source: any) {
  const text = source == null ? '' : String(source);
  if (!text) return [{ type: 'md', content: '' }];
  const segments = [];
  const re = /```(?:mermaid|MERMAID)[ \t]*\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'md', content: text.slice(last, m.index) });
    }
    segments.push({ type: 'mermaid', content: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'md', content: text.slice(last) });
  }
  if (segments.length === 0) segments.push({ type: 'md', content: text });
  return segments;
}

export function hasMermaidFence(source: any) {
  return splitMarkdownSegments(source).some((s) => s.type === 'mermaid');
}

/**
 * Detect @mention token at cursor.
 * @returns {{ query: string, start: number, end: number }|null}
 */
export function detectMentionTrigger(text: any, cursor: any) {
  const s = String(text || '');
  const c = Math.max(0, Math.min(cursor == null ? s.length : cursor, s.length));
  const before = s.slice(0, c);
  const m = before.match(/(^|[\s([{])@([a-zA-Z0-9-]{0,39})$/);
  if (!m) return null;
  const query = m[2] || '';
  const start = c - query.length - 1;
  return { query, start, end: c };
}

/**
 * Detect /slash token at start of line or after whitespace.
 */
export function detectSlashTrigger(text: any, cursor: any) {
  const s = String(text || '');
  const c = Math.max(0, Math.min(cursor == null ? s.length : cursor, s.length));
  const before = s.slice(0, c);
  const m = before.match(/(^|[\n\r])(\/)([a-zA-Z0-9_-]{0,32})$/);
  if (!m) return null;
  const query = (m[3] || '').toLowerCase();
  const start = c - query.length - 1;
  return { query, start, end: c };
}

/**
 * @param {string} query without @
 * @param {Array<string|{login:string}>} candidates
 */
export function filterMentions(query: any, candidates: any) {
  const q = String(query || '').toLowerCase();
  const list = (Array.isArray(candidates) ? candidates : [])
    .map((c) => (typeof c === 'string' ? c : c?.login || c?.name || ''))
    .filter(Boolean);
  if (!q) return list.slice(0, 8);
  return list.filter((name) => name.toLowerCase().startsWith(q)).slice(0, 8);
}

/**
 * @param {string} query without leading /
 */
export function filterSlashCommands(query: any) {
  const q = String(query || '')
    .toLowerCase()
    .replace(/^\//, '');
  if (!q) return SLASH_COMMANDS.slice();
  return SLASH_COMMANDS.filter(
    (cmd) => cmd.id.startsWith(q) || cmd.label.slice(1).startsWith(q)
  );
}

export function applyInsertion(text: any, start: any, end: any, insertion: any, cursorBias = 0) {
  const s = String(text || '');
  const a = Math.max(0, start);
  const b = Math.max(a, end);
  const next = s.slice(0, a) + insertion + s.slice(b);
  const cursor = a + insertion.length + cursorBias;
  return { text: next, cursor };
}

export function applyMentionInsertion(text: any, trigger: any, username: any) {
  if (!trigger) return { text: String(text || ''), cursor: String(text || '').length };
  const insert = `@${username} `;
  return applyInsertion(text, trigger.start, trigger.end, insert);
}

export function applySlashInsertion(text: any, trigger: any, command: any) {
  if (!trigger || !command) return { text: String(text || ''), cursor: String(text || '').length };
  return applyInsertion(text, trigger.start, trigger.end, command.insert);
}

/** Viewport box used to park the portaled @ / / / : suggest menu. */
export type ComposerSuggestAnchor = {
  top: number;
  left: number;
  bottom: number;
  width: number;
  height?: number;
};

export type ComposerSuggestMenuPos = {
  top: number;
  left: number;
  width: number;
  placement: 'above' | 'below';
};

/**
 * Place the composer suggest menu next to the textarea (viewport coords).
 * Prefers above so Diff/Conversation action rows stay visible; flips below
 * when the preferred side cannot fit.
 */
export function placeComposerSuggestMenu(
  anchor: ComposerSuggestAnchor,
  opts: {
    menuHeight?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    gap?: number;
    edge?: number;
    minWidth?: number;
    maxWidth?: number;
    prefer?: 'above' | 'below';
  } = {}
): ComposerSuggestMenuPos {
  const gap = Number.isFinite(opts.gap as number) ? Number(opts.gap) : 4;
  const edge = Number.isFinite(opts.edge as number) ? Number(opts.edge) : 8;
  const vw = Number.isFinite(opts.viewportWidth as number)
    ? Number(opts.viewportWidth)
    : 1024;
  const vh = Number.isFinite(opts.viewportHeight as number)
    ? Number(opts.viewportHeight)
    : 768;
  const minW = Number.isFinite(opts.minWidth as number)
    ? Math.max(160, Number(opts.minWidth))
    : 220;
  const maxW = Number.isFinite(opts.maxWidth as number)
    ? Math.max(minW, Number(opts.maxWidth))
    : 360;
  const width = Math.max(minW, Math.min(maxW, Math.max(Number(anchor?.width) || 0, minW)));
  const left = Math.min(
    Math.max(edge, Number(anchor?.left) || 0),
    Math.max(edge, vw - width - edge)
  );
  const h = Math.max(0, Number(opts.menuHeight) || 0);
  const prefer = opts.prefer === 'below' ? 'below' : 'above';
  const aTop = Number(anchor?.top) || 0;
  const aBottom = Number(anchor?.bottom) || aTop;
  const belowTop = aBottom + gap;
  const aboveTop = aTop - (h || 0) - gap;

  if (h <= 0) {
    const top = prefer === 'above' ? Math.max(edge, aboveTop) : belowTop;
    return { top: Math.max(edge, top), left, width, placement: prefer };
  }

  const fitsBelow = belowTop + h <= vh - edge;
  const fitsAbove = aboveTop >= edge;
  let placement: 'above' | 'below' = prefer;
  let top: number;
  if (prefer === 'above') {
    if (fitsAbove) {
      top = aboveTop;
      placement = 'above';
    } else if (fitsBelow) {
      top = belowTop;
      placement = 'below';
    } else {
      const spaceAbove = aTop - edge;
      const spaceBelow = vh - aBottom - edge;
      if (spaceAbove > spaceBelow) {
        top = Math.max(edge, aboveTop);
        placement = 'above';
      } else {
        top = belowTop;
        placement = 'below';
      }
    }
  } else if (fitsBelow) {
    top = belowTop;
    placement = 'below';
  } else if (fitsAbove) {
    top = aboveTop;
    placement = 'above';
  } else {
    const spaceAbove = aTop - edge;
    const spaceBelow = vh - aBottom - edge;
    if (spaceBelow > spaceAbove) {
      top = belowTop;
      placement = 'below';
    } else {
      top = Math.max(edge, aboveTop);
      placement = 'above';
    }
  }
  return { top: Math.max(edge, top), left, width, placement };
}

// applyEmojiInsertion re-exported from emoji-shortcodes above
