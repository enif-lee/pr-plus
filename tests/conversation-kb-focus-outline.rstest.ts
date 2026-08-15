/**
 * Conversation thread outline + kb-focus contracts (shipped SoT):
 *
 * Spec: In Conversation, the **thread unit outline is ALWAYS drawn**
 * (independent of whether an inner comment has unit-focus). Kb-focus only
 * elevates the same full unit to accent.
 *
 * - Nested review-group path rows: full <li> (header + body when open)
 * - Standalone review threads: .prp-conversation-inline-thread border always
 * - Minimized/off-topic: ring matches 6px banner radius
 * - No dual ring on nested inner cards
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('conversation thread outline (always-on + kb-focus)', () => {
  test('nested path-row owns thread unit; inner skips dual ring', () => {
    const view = read('src/modal/views/conversation/ConversationView.tsx');
    expect(view).toMatch(/ConversationKbFocusHost/);
    expect(view).toMatch(/as=["']li["']/);
    expect(view).toMatch(/focusClassName=["']prp-review-group__row--kb-focus["']/);
    expect(view).toMatch(/data-prp-thread-unit=["']path-row["']/);
    expect(view).toMatch(/skipKbFocus:\s*true/);
    expect(view).toMatch(
      /if\s*\(\s*opts\.skipKbFocus\s*\)\s*\{[\s\S]*?renderThreadShell\(threadBaseClass,\s*false\)/
    );
  });

  test('open nested rows always paint full-unit outline via ::after', () => {
    const group = read('src/modal/views/diff/MultiFileReviewGroup.css');
    // Always-on for open path rows (header + body)
    expect(group).toMatch(
      /\.prp-review-group__list\s+\.prp-review-group__row--open::after/
    );
    expect(group).toMatch(/inset:\s*0/);
    expect(group).toMatch(/position:\s*relative/);
  });

  test('kb-focus elevates same full-unit ::after; no host outline double', () => {
    const css = read('src/modal/views/diff/DiffSearchMarks.css');
    expect(css).toMatch(
      /\.prp-review-group__list\s+\.prp-review-group__row--kb-focus::after/
    );
    // Dual-ring suppress on nested cards
    expect(css).toMatch(
      /\.prp-review-group__row--kb-focus\s+\.prp-conversation-inline-thread/
    );
    expect(css).toMatch(/outline:\s*none\s*!important/);
  });

  test('standalone conversation thread border is always-on (10px radius)', () => {
    const thread = read(
      'src/modal/views/conversation/ConversationThread.css'
    );
    expect(thread).toMatch(
      /\.prp-conversation-inline-thread\s*\{[\s\S]*?border:\s*1px solid/
    );
    expect(thread).toMatch(
      /\.prp-conversation-inline-thread\s*\{[\s\S]*?border-radius:\s*10px/
    );
    // Nested under group: row owns outline
    expect(thread).toMatch(
      /\.prp-review-group__thread\s+\.prp-conversation-inline-thread\s*\{[\s\S]*?border:\s*0/
    );
  });

  test('minimized/off-topic kb-focus rings 6px banner, not square host', () => {
    const css = read('src/modal/views/diff/DiffSearchMarks.css');
    const thread = read(
      'src/modal/views/conversation/ConversationThread.css'
    );
    expect(thread).toMatch(
      /\.prp-comment-minimized\s*\{[\s\S]*?border-radius:\s*6px/
    );
    expect(css).toMatch(
      /\.prp-comment-minimized-card\.prp-card--kb-focus\s*>\s*\.prp-comment-minimized/
    );
    expect(css).toMatch(
      /\.prp-comment-minimized-card\.prp-card--kb-focus\s*>\s*\.prp-comment-minimized[\s\S]*?border-radius:\s*6px/
    );
  });

  test('card / merge / composer geometry still match painted boxes', () => {
    const css = read('src/modal/views/diff/DiffSearchMarks.css');
    const cardCss = read('src/modal/views/conversation/AsideRail.css');
    expect(cardCss).toMatch(/\.prp-card\s*\{[\s\S]*?border-radius:\s*10px/);
    expect(css).toMatch(
      /\.prp-card\.prp-card--kb-focus\s*\{[\s\S]*?border-radius:\s*10px/
    );
    expect(css).toMatch(
      /\.prp-merge-box-focus-host\.prp-card--kb-focus\s*>\s*\.prp-merge-box/
    );
    expect(css).toMatch(
      /\.prp-composer-focus-host\.prp-card--kb-focus\s*>\s*\.prp-card/
    );
  });
});
