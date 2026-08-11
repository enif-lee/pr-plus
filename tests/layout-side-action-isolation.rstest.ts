/**
 * Diff ↔ Conversation side-action isolation (shipped pure gate + wiring).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  CONVERSATION_SIDE_META_ACTIONS,
  DIFF_SIDE_ACTIONS,
  isConversationSideMetaAction,
  isDiffSideAction,
  isSideActionAllowedOnLayout,
  normalizeLayoutSurface,
} from '../src/modal/lib/layout-side-actions';
import { runPaletteCommand } from '../src/modal/app/pr-modal-run-palette';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('layout-side-actions pure gate', () => {
  test('normalizeLayoutSurface maps centered/empty → conversation', () => {
    expect(normalizeLayoutSurface('diff')).toBe('diff');
    expect(normalizeLayoutSurface('DIFF')).toBe('diff');
    expect(normalizeLayoutSurface('centered')).toBe('conversation');
    expect(normalizeLayoutSurface('conversation')).toBe('conversation');
    expect(normalizeLayoutSurface(null)).toBe('conversation');
  });

  test('Conversation meta blocked on Diff; allowed on Conversation', () => {
    for (const a of CONVERSATION_SIDE_META_ACTIONS) {
      expect(isConversationSideMetaAction(a)).toBe(true);
      expect(isSideActionAllowedOnLayout(a, 'diff')).toBe(false);
      expect(isSideActionAllowedOnLayout(a, 'centered')).toBe(true);
      expect(isSideActionAllowedOnLayout(a, 'conversation')).toBe(true);
    }
  });

  test('Diff side actions blocked on Conversation; allowed on Diff', () => {
    for (const a of DIFF_SIDE_ACTIONS) {
      expect(isDiffSideAction(a)).toBe(true);
      expect(isSideActionAllowedOnLayout(a, 'diff')).toBe(true);
      expect(isSideActionAllowedOnLayout(a, 'centered')).toBe(false);
    }
  });

  test('shared actions remain allowed on both layouts', () => {
    for (const a of [
      'toggleDiff',
      'openPalette',
      'refreshDetail',
      'mergePr',
      'leaveReview',
      'toggleFullscreen',
      'toggleSidePanel',
    ]) {
      expect(isSideActionAllowedOnLayout(a, 'diff')).toBe(true);
      expect(isSideActionAllowedOnLayout(a, 'centered')).toBe(true);
    }
  });
});

describe('runPaletteCommand respects layout gate', () => {
  test('promptLabels no-ops on Diff layout', () => {
    let opened = 0;
    runPaletteCommand(
      {
        setPaletteOpen: () => {},
        setPaletteQuery: () => {},
        setPaletteHelpOpen: () => {},
        layoutMode: 'diff',
        openLabelPicker: () => {
          opened += 1;
        },
      },
      { action: 'promptLabels' }
    );
    expect(opened).toBe(0);
  });

  test('promptLabels runs on Conversation layout', () => {
    let opened = 0;
    runPaletteCommand(
      {
        setPaletteOpen: () => {},
        setPaletteQuery: () => {},
        setPaletteHelpOpen: () => {},
        layoutMode: 'centered',
        openLabelPicker: () => {
          opened += 1;
        },
      },
      { action: 'promptLabels' }
    );
    expect(opened).toBe(1);
  });

  test('promptMilestone / promptAddReviewer blocked on Diff', () => {
    let n = 0;
    const bag = {
      setPaletteOpen: () => {},
      setPaletteQuery: () => {},
      setPaletteHelpOpen: () => {},
      layoutMode: 'diff',
      openMilestonePicker: () => {
        n += 1;
      },
      openReviewerPicker: () => {
        n += 1;
      },
      openAssigneePicker: () => {
        n += 1;
      },
    };
    runPaletteCommand(bag, { action: 'promptMilestone' });
    runPaletteCommand(bag, { action: 'promptAddReviewer' });
    runPaletteCommand(bag, { action: 'promptAddAssignee' });
    expect(n).toBe(0);
  });
});

describe('hotkeys + shell visibility contracts', () => {
  test('usePrModalHotkeys imports and applies isSideActionAllowedOnLayout', () => {
    const hk = read('src/modal/hooks/usePrModalHotkeys.ts');
    expect(hk).toMatch(/isSideActionAllowedOnLayout/);
    expect(hk).toMatch(/layout-side-actions/);
    expect(hk).toMatch(/peerBlockedByLayout/);
  });

  test('inactive body panels are inert + not active', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toMatch(/prp-body-panel--conversation/);
    expect(shell).toMatch(/prp-body-panel--diff/);
    expect(shell).toMatch(/inert:\s*true/);
    expect(shell).toMatch(/aria-hidden=\{layoutMode !== LAYOUT_CENTERED\}/);
    expect(shell).toMatch(/aria-hidden=\{layoutMode !== LAYOUT_DIFF\}/);
    const css = read('src/modal/views/chrome/ShellLayout.css');
    expect(css).toMatch(
      /\.prp-body-panel\s*\{[\s\S]*?visibility:\s*hidden[\s\S]*?pointer-events:\s*none/
    );
    expect(css).toMatch(
      /\.prp-body-panel--active\s*\{[\s\S]*?visibility:\s*visible[\s\S]*?pointer-events:\s*auto/
    );
  });
});
