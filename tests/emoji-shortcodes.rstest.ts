/**
 * `:` emoji typeahead pure helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  detectEmojiTrigger,
  filterEmojis,
  applyEmojiInsertion,
  emojiMenuLabel,
  expandEmojiShortcodes,
  EMOJI_SHORTCODES,
} from '../src/modal/lib/emoji-shortcodes';
import {
  detectEmojiTrigger as fromComposer,
  filterEmojis as filterFromComposer,
} from '../src/modal/lib/markdown-composer';

describe('detectEmojiTrigger', () => {
  test('opens on bare : after start / whitespace', () => {
    expect(detectEmojiTrigger(':', 1)).toEqual({
      query: '',
      start: 0,
      end: 1,
    });
    expect(detectEmojiTrigger('hi :smi', 7)).toEqual({
      query: 'smi',
      start: 3,
      end: 7,
    });
  });

  test('does not open mid-word or after digits (time-ish)', () => {
    expect(detectEmojiTrigger('http://x', 7)).toBeNull();
    expect(detectEmojiTrigger('12:30', 3)).toBeNull();
    expect(detectEmojiTrigger('foo:bar', 4)).toBeNull();
  });

  test('allows after open brackets', () => {
    expect(detectEmojiTrigger('(:rocket', 8)?.query).toBe('rocket');
  });
});

describe('filterEmojis', () => {
  test('empty query returns popular set', () => {
    const items = filterEmojis('', 8);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items.some((e) => e.name === '+1' || e.name === 'smile')).toBe(
      true
    );
  });

  test('prefix and alias search', () => {
    const rocket = filterEmojis('rock');
    expect(rocket.some((e) => e.name === 'rocket')).toBe(true);
    const thumb = filterEmojis('thumbsup');
    expect(thumb.some((e) => e.name === '+1' || e.name === 'thumbsup')).toBe(
      true
    );
  });

  test('catalog is non-empty', () => {
    expect(EMOJI_SHORTCODES.length).toBeGreaterThan(100);
  });
});

describe('applyEmojiInsertion', () => {
  test('replaces :query with :name: and trailing space', () => {
    const text = 'Nice :smi';
    const trig = detectEmojiTrigger(text, text.length);
    const next = applyEmojiInsertion(text, trig, {
      name: 'smile',
      emoji: '😄',
    });
    expect(next.text).toBe('Nice :smile: ');
    expect(next.cursor).toBe(next.text.length);
  });

  test('emojiMenuLabel wraps colons', () => {
    expect(emojiMenuLabel({ name: 'tada', emoji: '🎉' })).toBe(':tada:');
  });

  test('expandEmojiShortcodes renders unicode for preview', () => {
    expect(expandEmojiShortcodes('ship it :rocket: now')).toContain('🚀');
    expect(expandEmojiShortcodes(':unknown_xyz:')).toBe(':unknown_xyz:');
    expect(expandEmojiShortcodes(':+1:')).toContain('👍');
  });
});

describe('markdown-composer re-exports', () => {
  test('detect/filter available from composer barrel', () => {
    expect(typeof fromComposer).toBe('function');
    expect(typeof filterFromComposer).toBe('function');
    expect(fromComposer(':fire', 5)?.query).toBe('fire');
  });
});
