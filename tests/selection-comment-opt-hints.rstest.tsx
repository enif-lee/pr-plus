/**
 * Selection comment island (⌥C): OptBtnHints + composer surface parity with
 * thread reply / finish-review forms — input (⌥I), Comment (⌥C·⌘↵),
 * Start review / Add comment (⌥S or ⌥C), Cancel (Esc). Focus after open.
 */
import { describe, expect, test } from '@rstest/core';
import {
  COMPOSER_CONTEXT_SHORTCUT,
  resolveComposerContextShortcutAction,
} from '../src/modal/lib/shortcut-policy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('SelectionCommentBar comment-phase OptBtnHints wiring', () => {
  test('comment phase always mounts OptBtnHint leaves for input/CTAs/cancel', () => {
    const src = read('src/modal/views/diff/SelectionCommentBar.tsx');
    expect(src).toMatch(/data-prp-composer-kind="selection"/);
    expect(src).toMatch(/data-prp-composer-root="1"/);

    // Shortcut label SoT in comment phase
    expect(src).toMatch(/const kbdFocus = /);
    expect(src).toMatch(/const kbdSubmit = /);
    expect(src).toMatch(/const kbdStartPending = /);
    expect(src).toMatch(/const kbdCancel = ['"]Esc['"]/);

    // Always-mounted leaves (not focus-gated) so Opt-hold paints all controls
    expect(src).toMatch(/<OptBtnHint label=\{kbdFocus\}/);
    expect(src).toMatch(/<OptBtnHint label=\{kbdCancel\}/);
    expect(src).toMatch(/label=\{canImmediate \? kbdStartPending : kbdSubmit\}/);
    expect(src).toMatch(/label=\{kbdSubmit\}/);

    // DOM markers for composer-context chords + Esc layer
    expect(src).toMatch(/data-prp-composer-start-review/);
    expect(src).toMatch(/data-prp-composer-submit/);
    expect(src).toMatch(/data-prp-selection-cancel/);
    expect(src).toMatch(/data-prp-selection-back/);
  });

  test('PENDING gates single Comment; keeps Add comment + cancel + focus', () => {
    const src = read('src/modal/views/diff/SelectionCommentBar.tsx');
    expect(src).toMatch(/canPublishImmediateReviewComment/);
    expect(src).toMatch(/pendingAttachCtaLabel/);
    expect(src).toMatch(/hasViewerPendingReview/);
    expect(src).toMatch(/data-prp-pending-only/);
    // Immediate Comment only when canImmediate
    expect(src).toMatch(/\{canImmediate \? \(/);
  });

  test('actions phase keeps Comment chip OptBtnHint (⌥C)', () => {
    const src = read('src/modal/views/diff/SelectionCommentBar.tsx');
    expect(src).toMatch(/const kbdComment = /);
    // Actions Comment button opens comment phase
    expect(src).toMatch(/onClick=\{\(\) => setPhase\('comment'\)\}/);
    expect(src).toMatch(/label=\{kbdComment\}/);
  });
});

describe('openSelectionComment focus after ⌥C', () => {
  test('App openSelectionComment sets comment phase and focuses selection composer', () => {
    const src = read('src/modal/app/PrModalShell.tsx');
    expect(src).toMatch(/openSelectionComment:\s*\(\)\s*=>\s*\{/);
    expect(src).toMatch(/setSelectionIslandPhase\('comment'\)/);
    expect(src).toMatch(/selectionIslandPhaseRef\.current\s*=\s*'comment'/);
    expect(src).toMatch(/setShowSelectionComposer\(true\)/);
    // Focus path: query selection root → prp-composer-focus-input → textarea.focus
    expect(src).toContain('data-prp-composer-kind="selection"');
    expect(src).toContain('data-prp-composer-root="1"');
    expect(src).toContain('prp-composer-focus-input');
    expect(src).toContain('focusSelectionComposer');
    expect(src).toMatch(/ta\.focus/);
  });

  test('⌥C product chord dispatches openSelectionComment on Diff selection', () => {
    const src = read('src/modal/app/PrModalShell.tsx');
    expect(src).toMatch(/reportShortcutAction\('openSelectionComment'\)/);
    expect(src).toMatch(/act\.openSelectionComment\?\.\(\)/);
  });
});

describe('composer-context chords apply to focused selection form', () => {
  test('COMPOSER_CONTEXT_SHORTCUT SoT labels', () => {
    expect(COMPOSER_CONTEXT_SHORTCUT.focusInput.labelMac).toBe('⌥I');
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.chord).toBe('opt+c');
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.labelMac).toBe('⌥C');
    expect(COMPOSER_CONTEXT_SHORTCUT.startPending.labelMac).toBe('⌥S');
    expect(COMPOSER_CONTEXT_SHORTCUT.startPending.action).toBe(
      'composerStartPending'
    );
  });

  test('focused surface: ⌥C/I/S resolve to composer actions', () => {
    const base = {
      composerFocused: true,
      alt: true,
      mod: false,
      shift: false,
      canStartPending: true,
    };
    expect(resolveComposerContextShortcutAction({ ...base, key: 'c' })).toBe(
      'composerSubmit'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 'i' })).toBe(
      'composerFocusInput'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 's' })).toBe(
      'composerStartPending'
    );
  });
});
