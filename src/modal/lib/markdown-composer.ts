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

// applyEmojiInsertion re-exported from emoji-shortcodes above
