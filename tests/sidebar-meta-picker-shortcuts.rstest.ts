/**
 * Conversation sidebar meta pickers: single-select people, ⌥1–3, milestone
 * open path, label/milestone confirm chords, z-index above Opt hints, emoji
 * dismiss wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  filterSelectOptions,
  pickFilteredOptionByIndex,
  resolveOptDigitPickIndex,
} from '../src/modal/lib/searchable-select';
import { resolvePrModalOptAction } from '../src/modal/lib/command-palette-opt';
import { runPaletteCommand } from '../src/modal/app/pr-modal-run-palette';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('⌥1–3 filtered pick (shipped pure helpers)', () => {
  test('resolveOptDigitPickIndex maps Digit1–3 only with alt', () => {
    expect(
      resolveOptDigitPickIndex({
        altKey: true,
        code: 'Digit1',
        key: '1',
      })
    ).toBe(0);
    expect(
      resolveOptDigitPickIndex({
        altKey: true,
        code: 'Digit2',
        key: '2',
      })
    ).toBe(1);
    expect(
      resolveOptDigitPickIndex({
        altKey: true,
        code: 'Digit3',
        key: '3',
      })
    ).toBe(2);
    expect(
      resolveOptDigitPickIndex({
        altKey: false,
        code: 'Digit1',
        key: '1',
      })
    ).toBeNull();
    expect(
      resolveOptDigitPickIndex({
        altKey: true,
        metaKey: true,
        code: 'Digit1',
        key: '1',
      })
    ).toBeNull();
    expect(
      resolveOptDigitPickIndex({
        altKey: true,
        code: 'Digit4',
        key: '4',
      })
    ).toBeNull();
  });

  test('pickFilteredOptionByIndex only allows first three hits', () => {
    const opts = [
      { id: 'a', label: 'alice' },
      { id: 'b', label: 'bob' },
      { id: 'c', label: 'carol' },
      { id: 'd', label: 'dave' },
    ];
    const filtered = filterSelectOptions(opts, '');
    expect(pickFilteredOptionByIndex(filtered, 0)?.id).toBe('a');
    expect(pickFilteredOptionByIndex(filtered, 2)?.id).toBe('c');
    expect(pickFilteredOptionByIndex(filtered, 3)).toBeNull();
    expect(pickFilteredOptionByIndex(filtered, -1)).toBeNull();
  });

  test('filter + digit index is stable for typed query', () => {
    const opts = [
      { id: 'z', label: 'zeta' },
      { id: 'a1', label: 'alice' },
      { id: 'a2', label: 'albert' },
      { id: 'a3', label: 'al' },
    ];
    const filtered = filterSelectOptions(opts, 'al');
    expect(filtered.map((o) => o.id)).toEqual(['a1', 'a2', 'a3']);
    const idx = resolveOptDigitPickIndex({
      altKey: true,
      code: 'Digit2',
      key: '2',
    });
    expect(pickFilteredOptionByIndex(filtered, idx!)?.id).toBe('a2');
  });
});

describe('reviewer/assignee single-select shared pattern (source)', () => {
  test('openAssigneePicker and openReviewerPicker are multi:false', () => {
    const mut = read('src/modal/commands/domain-mutations.ts');
    // Assignee block no longer sets multi: true
    const assigneeBlock = mut.slice(
      mut.indexOf('function openAssigneePicker'),
      mut.indexOf('function openAssigneePicker') + 1200
    );
    expect(assigneeBlock).toMatch(/multi:\s*false/);
    expect(assigneeBlock).not.toMatch(/multi:\s*true/);
    expect(assigneeBlock).toMatch(/title:\s*['"]Add assignee['"]/);
    const revBlock = mut.slice(
      mut.indexOf('function openReviewerPicker'),
      mut.indexOf('function openReviewerPicker') + 900
    );
    expect(revBlock).toMatch(/multi:\s*false/);
    expect(revBlock).toMatch(/title:\s*['"]Add reviewer['"]/);
  });

  test('SearchableSelect wires Opt digit pick; multi footer only', () => {
    const ui = read('src/modal/components/common/SearchableSelect.tsx');
    expect(ui).toMatch(/resolveOptDigitPickIndex/);
    expect(ui).toMatch(/pickFilteredOptionByIndex/);
    expect(ui).toMatch(/OptBtnHint/);
    expect(ui).toMatch(/createPortal/);
    // Prefer .prp-overlay for theme tokens; body only as fallback shell
    expect(ui).toMatch(/\.prp-overlay/);
    expect(ui).toMatch(/document\.body/);
    expect(ui).toMatch(/prp-sselect-portal/);
    expect(ui).toMatch(/data-prp-sselect-open/);
    expect(ui).toMatch(/footerVisible/);
    expect(ui).toMatch(/showFooter/);
    // Multi still has Cancel/Apply chords
    expect(ui).toMatch(/data-prp-sselect-confirm/);
    expect(ui).toMatch(/data-prp-sselect-cancel/);
    expect(ui).toMatch(/label=\{`⌥\$\{rowIndex \+ 1\}`\}/);
    expect(ui).toMatch(/label=["']Esc["']/);
    expect(ui).toMatch(/label=["']⌘↵["']/);
    expect(ui).toMatch(/metaKey/);
    expect(ui).toMatch(/data-prp-sselect=["']1["']/);
    // Default footer only when multi (assignee/reviewer single = no Cancel/Apply)
    expect(ui).toMatch(
      /showFooter\s*==\s*null\s*\?\s*Boolean\(multi\)\s*:\s*Boolean\(showFooter\)/
    );
  });
});

describe('set milestone shortcut path', () => {
  test('⌥⇧P resolves to promptMilestone', () => {
    const peer = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      key: 'p',
      code: 'KeyP',
    });
    expect(peer?.action).toBe('promptMilestone');
    expect(peer?.id).toBe('opt-milestone');
  });

  test('runPaletteCommand promptMilestone calls openMilestonePicker', () => {
    let opened = 0;
    runPaletteCommand(
      {
        setPaletteOpen: () => {},
        setPaletteQuery: () => {},
        setPaletteHelpOpen: () => {},
        openMilestonePicker: () => {
          opened += 1;
        },
        onSetMilestone: () => {
          throw new Error('should prefer openMilestonePicker');
        },
      },
      { action: 'promptMilestone' }
    );
    expect(opened).toBe(1);
  });

  test('shell bag passes onSetMilestone + openMilestonePicker', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toMatch(/openMilestonePicker:\s*\(\)\s*=>\s*openMilestonePicker/);
    expect(shell).toMatch(/onSetMilestone,/);
  });
});

describe('z-index: picker above OptBtnHint', () => {
  test('portal token exceeds tip/dialog used by opt hints', () => {
    const tokens = read('src/modal/styles/tokens.css');
    const tip = tokens.match(/--prp-z-tip:\s*(\d+)/);
    const dialog = tokens.match(/--prp-z-dialog:\s*(\d+)/);
    const portal = tokens.match(/--prp-z-portal:\s*(\d+)/);
    expect(tip).toBeTruthy();
    expect(dialog).toBeTruthy();
    expect(portal).toBeTruthy();
    expect(Number(portal![1])).toBeGreaterThan(Number(dialog![1]));
    expect(Number(portal![1])).toBeGreaterThan(Number(tip![1]));
  });

  test('SearchableSelect CSS forces portal z-index; hides outer opt hints', () => {
    const css = read('src/modal/components/common/SearchableSelect.css');
    expect(css).toMatch(/--prp-z-portal/);
    expect(css).toMatch(/120000/);
    expect(css).toMatch(/data-prp-sselect-open/);
    expect(css).toMatch(/body:has\(\[data-prp-sselect=['"]1['"]\]\)/);
    expect(css).toMatch(/display:\s*none\s*!important/);
    // Opaque panel — must not bleed aside through transparent --prp-bg
    expect(css).toMatch(
      /\.prp-sselect-panel(?:--popover)?[\s\S]*?background(?:-color)?:\s*#ffffff\s*!important/
    );
    expect(css).toMatch(/\.prp-sselect-portal\s*\{/);
    const afford = read('src/modal/views/diff/LineCommentAffordance.css');
    // Must not pin popover to toast/island band (loses to body Opt tips)
    expect(afford).not.toMatch(
      /\.prp-sselect-panel--popover\s*\{[\s\S]*?--prp-z-toast/
    );
    const hint = read('src/modal/views/diff/DiffSearchMarks.css');
    // Conversation opt hints use tip layer (below portal pickers)
    expect(hint).toMatch(
      /\.prp-opt-btn-hint--fixed\s*\{[\s\S]*?--prp-z-tip/
    );
  });
});

describe('emoji reaction dismiss on Esc / competing shortcuts', () => {
  test('hotkeys dismiss reaction picker on peer + product actions', () => {
    const hk = read('src/modal/hooks/usePrModalHotkeys.ts');
    expect(hk).toMatch(/dismissCommentReactionPicker/);
    expect(hk).toMatch(/isCommentReactionPickerOpen/);
    // Peer opt path dismisses before openPalette / pickers
    expect(hk).toMatch(/Competing product chord owns the surface/);
    expect(hk).toMatch(
      /Competing product chord[\s\S]{0,400}dismissCommentReactionPicker\(document\)/
    );
    // Modal shortcut path dismisses except contextCommentReact
    expect(hk).toMatch(/contextCommentReact/);
    expect(hk).toMatch(
      /product shortcut that takes ownership dismisses emoji/
    );
  });

  test('escape owner treats reactionPickerOpen as dismiss-nested', () => {
    const esc = read('src/modal/lib/escape-layer.ts');
    expect(esc).toMatch(/reactionPickerOpen/);
    expect(esc).toMatch(/data-prp-reaction-picker/);
  });
});
