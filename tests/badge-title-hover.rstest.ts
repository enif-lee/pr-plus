/**
 * Truncated title chips must put the full string on the hover target.
 * Drives Badge source contract + conversation title param wiring.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('title chip hover full text (shipped)', () => {
  test('Badge applies title to root and .prp-badge__text (pointer target)', () => {
    const badge = read('src/modal/components/common/Badge.tsx');
    // Explicit tip variable used on both nodes
    expect(badge).toMatch(/const tip\s*=/);
    expect(badge).toMatch(/title=\{tip\}/);
    // text span also receives title so ellipsis hover works
    expect(badge).toMatch(
      /prp-badge__text[\s\S]*?title=\{tip\}/
    );
  });

  test('Conversation title params pass full string as Badge title + data attr', () => {
    const view = read('src/modal/views/conversation/ConversationView.tsx');
    expect(view).toMatch(/case 'title'/);
    expect(view).toMatch(/const fullTitle = String\(p\.text/);
    expect(view).toMatch(/title=\{fullTitle\}/);
    expect(view).toMatch(/data-prp-full-title=\{fullTitle\}/);
    expect(view).toMatch(/prp-timeline-event__param--title/);
  });
});
