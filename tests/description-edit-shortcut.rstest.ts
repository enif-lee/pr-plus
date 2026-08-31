/**
 * Description focus → ⌥W edit → ⌥C/⌘↵ save shortcut wiring.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTEXT_COMMENT_ACTION_SHORTCUT,
  COMPOSER_CONTEXT_SHORTCUT,
  resolveModalShortcutAction,
} from '../src/modal/lib/shortcut-policy';
import { formatMessage } from '../src/modal/lib/i18n';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('description edit shortcut policy', () => {
  test('⌥W on Conversation focus is comment/description edit', () => {
    expect(
      resolveModalShortcutAction({
        contextThreadActive: true,
        alt: true,
        key: 'w',
        code: 'KeyW',
        layoutMode: 'conversation',
      })
    ).toBe(CONTEXT_COMMENT_ACTION_SHORTCUT.edit.action);
  });

  test('⌥C / ⌘↵ submit while description composer is focused', () => {
    expect(
      resolveModalShortcutAction({
        composerFocused: true,
        alt: true,
        key: 'c',
        code: 'KeyC',
        layoutMode: 'conversation',
      })
    ).toBe(COMPOSER_CONTEXT_SHORTCUT.submit.action);
    expect(
      resolveModalShortcutAction({
        composerFocused: true,
        mod: true,
        key: 'Enter',
        code: 'Enter',
        layoutMode: 'conversation',
      })
    ).toBe(COMPOSER_CONTEXT_SHORTCUT.submitModEnter.action);
  });
});

describe('description edit chrome wiring', () => {
  test('DescriptionCard Opt-hold edit uses ⌥W + data-prp-edit-body', () => {
    const src = read('src/modal/views/conversation/DescriptionCard.tsx');
    expect(src).toMatch(/CommentActionIconBtn/);
    expect(src).toMatch(/data-prp-edit-body/);
    expect(src).toMatch(/CONTEXT_COMMENT_ACTION_SHORTCUT\.edit/);
    expect(src).toMatch(/cta_edit_description/);
    expect(src).toMatch(/showShortcutHint=\{focused\}/);
    expect(read('src/modal/views/conversation/ConversationView.tsx')).toMatch(
      /focused=\{focused\}/
    );
  });

  test('BodyEditor is a composer-root with submit chord + auto-focus', () => {
    const src = read('src/modal/views/composers/BodyEditor.tsx');
    expect(src).toMatch(/data-prp-composer-root/);
    expect(src).toMatch(/data-prp-composer-kind="body"/);
    expect(src).toMatch(/data-prp-composer-submit/);
    expect(src).toMatch(/onSubmitRequest=\{save\}/);
    expect(src).toMatch(/COMPOSER_CONTEXT_SHORTCUT/);
    expect(src).toMatch(/useLayoutEffect/);
    expect(src).toMatch(/cta_save/);
  });

  test('hotkeys prefer description edit marker before comment edit', () => {
    const src = read('src/modal/hooks/usePrModalHotkeys.ts');
    const start = src.indexOf('contextCommentEdit:');
    expect(start).toBeGreaterThan(0);
    const chunk = src.slice(start, start + 500);
    const body = chunk.indexOf('data-prp-edit-body');
    const comment = chunk.indexOf('data-prp-edit-comment');
    expect(body).toBeGreaterThan(-1);
    expect(comment).toBeGreaterThan(-1);
    expect(body).toBeLessThan(comment);
  });

  test('cta_save ships in en + ko', () => {
    expect(formatMessage('cta_save', 'en')).toBe('Save');
    expect(formatMessage('cta_save', 'ko')).toBeTruthy();
    expect(formatMessage('cta_save', 'ko')).not.toBe('Save');
  });
});
