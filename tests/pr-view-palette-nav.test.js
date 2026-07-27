/**
 * PR-view command palette + stack/list nav + Development open mode.
 * Drives shipped pure modules (not re-implemented stubs).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  buildPaletteCommands,
  filterPaletteCommands,
  formatShortcut,
  resolveDevelopmentMainOpen,
  stackDigitSlotNumber,
  resolveAdjacentPrNumber,
} = require('../src/modal/lib/command-palette.ts');

const {
  resolveModalShortcutAction,
  normalizeShortcutKey,
  buildModalOptHoldSlots,
} = require('../src/modal/lib/shortcut-policy.ts');

function main() {
  // --- Development open mode ---
  {
    const pull = resolveDevelopmentMainOpen(
      {
        number: 12,
        kind: 'pull',
        title: 'Stack base',
        url: 'https://github.com/o/r/pull/12',
      },
      { owner: 'o', repo: 'r' }
    );
    assert.equal(pull.mode, 'inModal');
    assert.equal(pull.number, 12);

    const issue = resolveDevelopmentMainOpen(
      {
        number: 99,
        kind: 'issue',
        url: 'https://github.com/o/r/issues/99',
      },
      { owner: 'o', repo: 'r' }
    );
    assert.equal(issue.mode, 'navigate');
    assert.match(issue.href, /\/issues\/99/);

    const urlPull = resolveDevelopmentMainOpen(
      { number: 7, url: 'https://github.com/o/r/pull/7' },
      { owner: 'o', repo: 'r' }
    );
    assert.equal(urlPull.mode, 'inModal');

    const known = resolveDevelopmentMainOpen(
      { number: 42, title: 'from list' },
      { owner: 'o', repo: 'r', knownPullNumbers: [40, 42, 44] }
    );
    assert.equal(known.mode, 'inModal');
    assert.equal(known.number, 42);
  }

  // --- Stack digit + adjacent ---
  {
    const stack = [
      { number: 10, title: 'base' },
      { number: 11, title: 'mid', current: true },
      { number: 12, title: 'top' },
    ];
    assert.equal(stackDigitSlotNumber(1, stack), 10);
    assert.equal(stackDigitSlotNumber(2, stack), 11);
    assert.equal(stackDigitSlotNumber(3, stack), 12);
    assert.equal(stackDigitSlotNumber(9, stack), null);

    assert.equal(
      resolveAdjacentPrNumber({
        direction: 'next',
        currentNumber: 11,
        stackItems: stack,
        openPulls: [{ number: 1 }, { number: 2 }],
      }),
      12
    );
    assert.equal(
      resolveAdjacentPrNumber({
        direction: 'prev',
        currentNumber: 11,
        stackItems: stack,
      }),
      10
    );

    // Non-stack: use open pulls list
    assert.equal(
      resolveAdjacentPrNumber({
        direction: 'next',
        currentNumber: 5,
        stackItems: [{ number: 5 }],
        openPulls: [{ number: 3 }, { number: 5 }, { number: 8 }],
      }),
      8
    );
    assert.equal(
      resolveAdjacentPrNumber({
        direction: 'prev',
        currentNumber: 5,
        stackItems: [],
        openPulls: [{ number: 3 }, { number: 5 }, { number: 8 }],
      }),
      3
    );
  }

  // --- Keyboard policy ---
  {
    assert.equal(
      normalizeShortcutKey({ key: '“', code: 'BracketLeft', alt: true }),
      '['
    );
    assert.equal(
      normalizeShortcutKey({ key: '‘', code: 'BracketRight', alt: true }),
      ']'
    );
    assert.equal(
      normalizeShortcutKey({ key: '¡', code: 'Digit1', alt: true }),
      '1'
    );

    assert.equal(
      resolveModalShortcutAction({
        mod: false,
        shift: false,
        alt: true,
        key: '[',
        code: 'BracketLeft',
      }),
      'navAdjacentPrev'
    );
    assert.equal(
      resolveModalShortcutAction({
        mod: false,
        shift: false,
        alt: true,
        key: ']',
        code: 'BracketRight',
      }),
      'navAdjacentNext'
    );
    assert.equal(
      resolveModalShortcutAction({
        mod: false,
        shift: false,
        alt: true,
        key: '¡',
        code: 'Digit2',
      }),
      'navStackDigit2'
    );
    // Blocked while typing
    assert.equal(
      resolveModalShortcutAction({
        mod: false,
        shift: false,
        alt: true,
        key: ']',
        code: 'BracketRight',
        editableTarget: true,
      }),
      null
    );
  }

  // --- Palette commands include stack/list nav ---
  {
    const stack = [
      { number: 10, title: 'base' },
      { number: 11, title: 'mid', current: true },
    ];
    const cmds = buildPaletteCommands(
      { number: 11, title: 'mid', baseRef: 'main' },
      { stackItems: stack, openPulls: [{ number: 10 }, { number: 11 }, { number: 20 }] }
    );
    const ids = cmds.map((c) => c.id);
    assert.ok(ids.includes('stack-slot-1'));
    assert.ok(ids.includes('stack-slot-2'));
    assert.ok(ids.includes('nav-adjacent-prev'));
    assert.ok(ids.includes('nav-adjacent-next'));
    const prev = cmds.find((c) => c.id === 'nav-adjacent-prev');
    assert.equal(prev.shortcut, 'opt+[');
    assert.match(String(prev.title), /stack/i);
    const slot = cmds.find((c) => c.id === 'stack-slot-1');
    assert.equal(slot.action, 'openStackPr');
    assert.equal(slot.payload.number, 10);
    assert.equal(formatShortcut('opt+1', true), '⌥1');

    const filtered = filterPaletteCommands(cmds, 'stack');
    assert.ok(filtered.some((c) => c.id.startsWith('stack-slot')));
  }

  // Solo PR → list wording for adjacent
  {
    const cmds = buildPaletteCommands(
      { number: 5 },
      { stackItems: [{ number: 5 }], openPulls: [{ number: 4 }, { number: 5 }] }
    );
    const prev = cmds.find((c) => c.id === 'nav-adjacent-prev');
    assert.match(String(prev.title), /pull request/i);
  }

  // Opt-hold slots (digits + step-nav; not [ ] badges)
  {
    const slots = buildModalOptHoldSlots({
      stackItems: [{ number: 1 }, { number: 2 }],
      isMac: true,
      layoutMode: 'diff',
    });
    assert.ok(slots.some((s) => s.id === 'stack-digit-1' && s.label === '⌥1'));
    assert.ok(!slots.some((s) => s.target === 'adjacent-prev'));
    assert.ok(slots.some((s) => s.target === 'step-next'));
  }

  // --- Static wiring ---
  {
    const root = path.join(__dirname, '..');
    const cmdPal = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/CommandPalette.tsx'),
      'utf8'
    );
    assert.ok(cmdPal.includes('prp-pp-layer'), 'CommandPalette uses prp-pp shell');
    assert.ok(cmdPal.includes('prp-pp-panel'));
    assert.ok(!cmdPal.includes('prp-cmd-panel') || cmdPal.includes('prp-pp-panel'));

    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalApp.tsx'),
      'utf8'
    );
    assert.ok(app.includes('navAdjacentPrev'));
    assert.ok(app.includes('navStackDigit'));
    assert.ok(
      app.includes('setOptHintsActive') || app.includes('optHintsActive'),
      'stack opt hotkeys driven by store (StackStrip leaf-subscribes)'
    );
    assert.ok(app.includes('onOpenLinkedPr'));
    assert.ok(app.includes('openStackOrListPr'));

    const conv = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/ConversationView.tsx'),
      'utf8'
    );
    assert.ok(conv.includes('resolveDevelopmentMainOpen'));
    assert.ok(conv.includes('onOpenLinkedPr'));
    assert.ok(conv.includes('prp-aside-dev__badge-main'));

    const strip = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/StackStrip.tsx'),
      'utf8'
    );
    assert.ok(strip.includes('showOptHotkeys'));
    assert.ok(strip.includes('prp-modal-hotkey'));
  }

  console.log('pr-view-palette-nav.test.js: all assertions passed');
}

main();
