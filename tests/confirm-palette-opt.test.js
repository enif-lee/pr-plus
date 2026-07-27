/**
 * Confirm gate, palette focus step, peer opt actions, stack current after nav.
 * Drives shipped modules only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildMergeConfirmRequest,
  confirmGateProceed,
} = require('../src/modal/lib/confirm-gate.ts');

const {
  resolveAdjacentPrNumber,
  buildPaletteCommands,
  resolvePrModalOptAction,
  buildPrModalOptHoldSlots,
  PR_MODAL_OPT_ACTIONS,
  optShortcutForCommandId,
} = require('../src/modal/lib/command-palette.ts');

const {
  buildModalOptHoldSlots,
  resolveModalShortcutAction,
} = require('../src/modal/lib/shortcut-policy.ts');

const {
  buildStackPathModel,
} = require('../src/modal/lib/ui-polish.ts');

const {
  resolvePullsPeerOptAction,
  buildPullsPeerOptHoldSlots,
  PULLS_PEER_OPT_ACTIONS,
  nextPaletteFocusIndex,
} = require('../src/pulls-palette.js');

// stepPaletteFocusIndex from CommandPalette (React) — reimplement via shared pure nextPaletteFocusIndex
function stepPaletteFocusIndex(current, delta, count) {
  return nextPaletteFocusIndex(current, delta, count);
}

function main() {
  // --- confirm gate ---
  {
    const req = buildMergeConfirmRequest('squash', 42);
    assert.match(req.title, /squash/i);
    assert.match(req.message, /#42/);
    assert.equal(req.tone, 'danger');
    assert.equal(confirmGateProceed(true), true);
    assert.equal(confirmGateProceed(false), false);
    assert.equal(confirmGateProceed(undefined), false);
  }

  // --- Opt hold slots: no [ ] badges ---
  {
    const slots = buildModalOptHoldSlots({
      stackItems: [{ number: 1 }, { number: 2 }],
      isMac: true,
      layoutMode: 'diff',
    });
    assert.ok(!slots.some((s) => s.target === 'adjacent-prev'));
    assert.ok(!slots.some((s) => s.target === 'adjacent-next'));
    assert.ok(slots.some((s) => s.id === 'stack-digit-1'));
    // keys still resolve
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
  }

  // --- palette focus step (no rebuild) ---
  {
    assert.equal(stepPaletteFocusIndex(0, 1, 5), 1);
    assert.equal(stepPaletteFocusIndex(4, 1, 5), 0);
    assert.equal(stepPaletteFocusIndex(0, -1, 5), 4);
    assert.equal(stepPaletteFocusIndex(-1, 1, 3), 0);
  }

  // --- pulls peer opt ---
  {
    assert.ok(PULLS_PEER_OPT_ACTIONS.length >= 5);
    const am = resolvePullsPeerOptAction({
      alt: true,
      shift: true,
      mod: false,
      code: 'KeyG',
      key: '©',
    });
    assert.equal(am.filterId, 'am');
    assert.equal(am.action, 'applyFilter');
    const none = resolvePullsPeerOptAction({
      alt: true,
      shift: false,
      code: 'KeyG',
    });
    assert.equal(none, null);
    const dock = buildPullsPeerOptHoldSlots({ isMac: true });
    assert.ok(dock.some((s) => s.filterId === 'cm' && /⌥⇧C/.test(s.label)));
    assert.ok(!dock.some((s) => s.label && s.label.includes('[')));
  }

  // --- stack current after adjacent nav ---
  {
    const prs = [
      { number: 10, title: 'base', headRef: 'b', baseRef: 'main' },
      { number: 11, title: 'mid', headRef: 'm', baseRef: 'b' },
      { number: 12, title: 'top', headRef: 't', baseRef: 'm' },
    ];
    const stack = buildStackPathModel(prs, 11, {}).items;
    const nextNum = resolveAdjacentPrNumber({
      direction: 'next',
      currentNumber: 11,
      stackItems: stack,
      openPulls: prs,
    });
    assert.equal(nextNum, 12);
    const after = buildStackPathModel(prs, nextNum, {}).items;
    const current = after.find((it) => it.current);
    assert.equal(Number(current?.number), 12);
    assert.ok(after.every((it) => !it.current || Number(it.number) === 12));
  }

  // --- palette has stack nav ---
  {
    const cmds = buildPaletteCommands(
      { number: 11 },
      {
        stackItems: [
          { number: 10 },
          { number: 11, current: true },
          { number: 12 },
        ],
        openPulls: [],
      }
    );
    assert.ok(cmds.some((c) => c.action === 'navAdjacentNext'));
    assert.ok(cmds.some((c) => c.id === 'stack-slot-2'));
  }

  // --- PR detail Option+Shift command map ---
  {
    assert.ok(PR_MODAL_OPT_ACTIONS.length >= 15);
    const merge = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      code: 'KeyM',
    });
    assert.equal(merge.action, 'mergePr');
    assert.equal(merge.payload.method, 'merge');
    assert.equal(
      resolvePrModalOptAction({ alt: true, shift: false, code: 'KeyM' }),
      null
    );
    // Opt+Shift alone (no letter) must not fire merge/squash
    assert.equal(
      resolvePrModalOptAction({
        alt: true,
        shift: true,
        mod: false,
        key: 'Shift',
        code: 'ShiftLeft',
      }),
      null,
      'Shift alone must not map to s/squash'
    );
    assert.equal(
      resolvePrModalOptAction({
        alt: true,
        shift: true,
        mod: false,
        key: 'Alt',
        code: 'AltLeft',
      }),
      null,
      'Alt alone must not map to a/assignee'
    );
    const dock = buildPrModalOptHoldSlots({ isMac: true });
    assert.ok(dock.some((s) => s.action === 'toggleDiff' && s.label === '⌥.'));
    assert.ok(
      dock.some((s) => s.action === 'toggleFullscreen' && s.label === '⌥⇧F')
    );
    assert.equal(optShortcutForCommandId('merge-pr'), 'opt+shift+m');
    assert.equal(optShortcutForCommandId('toggle-diff'), 'opt+.');
    assert.equal(optShortcutForCommandId('toggle-fullscreen'), 'opt+shift+f');
    assert.equal(optShortcutForCommandId('set-milestone'), 'opt+shift+p');
    assert.equal(optShortcutForCommandId('add-reviewer'), 'opt+shift+r');
    assert.equal(optShortcutForCommandId('set-assignee'), 'opt+shift+a');
    assert.equal(optShortcutForCommandId('set-labels'), 'opt+shift+l');
    assert.equal(optShortcutForCommandId('convert-draft'), 'opt+shift+d');
    assert.equal(optShortcutForCommandId('ready-review'), 'opt+shift+d');
    const milestone = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      code: 'KeyP',
    });
    assert.equal(milestone?.action, 'promptMilestone');
    const reviewer = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      code: 'KeyR',
    });
    assert.equal(reviewer?.action, 'promptAddReviewer');
    const draftStage = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      code: 'KeyD',
    });
    assert.equal(draftStage?.action, 'toggleDraftStage');
    assert.equal(draftStage?.labelMac || '⌥⇧D', '⌥⇧D');
    const cmds = buildPaletteCommands({ number: 1 }, {});
    const convertDraft = cmds.find((c) => c.id === 'convert-draft');
    assert.ok(convertDraft?.shortcut?.includes('opt+shift+d'));
    const mergeCmd = cmds.find((c) => c.id === 'merge-pr');
    assert.equal(mergeCmd.shortcut, 'opt+shift+m');
    const editBody = cmds.find((c) => c.id === 'edit-body');
    assert.equal(editBody.shortcut, 'opt+e');
    // mod chords no longer open product actions
    const sp = require('../src/modal/lib/shortcut-policy.ts');
    assert.equal(
      sp.resolveModalShortcutAction({
        mod: true,
        shift: true,
        alt: false,
        key: 'f',
      }),
      null
    );
    assert.equal(
      sp.resolveModalShortcutAction({
        mod: false,
        shift: true,
        alt: true,
        key: 'f',
        code: 'KeyF',
      }),
      'toggleFullscreen'
    );
  }

  // --- static: no window.confirm in modal app source ---
  {
    const app = fs.readFileSync(
      path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
      'utf8'
    );
    assert.ok(!/\bwindow\.confirm\s*\(/.test(app), 'no window.confirm in PrModalApp');
    assert.ok(app.includes('ConfirmDialog'));
    assert.ok(app.includes('requestConfirm'));
    assert.ok(app.includes('buildMergeConfirmRequest'));
    assert.ok(app.includes('currentNumber={detail'));

    const cmd = fs.readFileSync(
      path.join(__dirname, '../src/modal/views/chrome/CommandPalette.tsx'),
      'utf8'
    );
    assert.ok(cmd.includes('stepPaletteFocusIndex'));
    assert.ok(cmd.includes('applyFocusDom'));
    assert.ok(cmd.includes('KeyJ') || cmd.includes('opt'));

    const host = fs.readFileSync(
      path.join(__dirname, '../src/pr-modal-host.js'),
      'utf8'
    );
    assert.ok(!host.includes('paintPullsPeerOptDock'));
    assert.ok(!host.includes('prp-peer-opt-dock'));
    assert.ok(host.includes('resolvePullsPeerOptAction'));

    assert.ok(!app.includes('prp-modal-opt-rail'));
    assert.ok(!app.includes('prp-modal-opt-dock'));
    assert.ok(
      app.includes('setOptHintsActive') || app.includes('optHintsActive'),
      'App drives opt hints via store (not showOptHints prop tree)'
    );

    const header = fs.readFileSync(
      path.join(__dirname, '../src/modal/views/chrome/Header.tsx'),
      'utf8'
    );
    assert.ok(header.includes('OptBtnHint'));
    assert.ok(header.includes('prp-opt-hint-host'));

    const hint = fs.readFileSync(
      path.join(__dirname, '../src/modal/components/common/OptBtnHint.tsx'),
      'utf8'
    );
    assert.ok(hint.includes('createPortal'), 'OptBtnHint portals to avoid overflow clip');
    assert.ok(hint.includes('getBoundingClientRect'));
    assert.ok(hint.includes('prp-opt-btn-hint--fixed'));
    assert.ok(
      hint.includes('resolveTipPlacement') && hint.includes('clampTipCoords'),
      'OptBtnHint reuses TipPopover flip + clamp'
    );

    const confirmUi = fs.readFileSync(
      path.join(__dirname, '../src/modal/components/common/ConfirmDialog.tsx'),
      'utf8'
    );
    assert.ok(confirmUi.includes('createPortal'), 'ConfirmDialog portals to body');
    assert.ok(
      confirmUi.includes('stopImmediatePropagation'),
      'Confirm Escape must not close PR modal'
    );
    assert.ok(confirmUi.includes("data-prp-confirm"), 'confirm marker for layer CSS');
    assert.ok(
      !/data-color-mode=\{mode\}/.test(confirmUi) &&
        confirmUi.includes('data-prp-color-mode'),
      'confirm must not use GH data-color-mode (solid canvas bg)'
    );
    const modalCss = fs.readFileSync(
      path.join(__dirname, '../src/modal/styles.css'),
      'utf8'
    );
    assert.ok(
      /prp-confirm-layer[\s\S]{0,800}z-index:\s*100100/.test(modalCss),
      'confirm layer above opt-hint (100090)'
    );
    assert.ok(
      modalCss.includes('.prp-confirm-actions .prp-btn--primary'),
      'confirm buttons carry explicit token styles outside overlay'
    );
    assert.ok(
      modalCss.includes("data-prp-confirm") ||
        modalCss.includes("[data-prp-confirm='1']") ||
        modalCss.includes('[data-prp-confirm="1"]'),
      'CSS hides tips under confirm'
    );

    const meta = fs.readFileSync(
      path.join(__dirname, '../src/modal/views/conversation/MetaList.tsx'),
      'utf8'
    );
    assert.ok(meta.includes('OptBtnHint'), 'MetaList shows opt hints on Add…');
    assert.ok(meta.includes('addShortcut'));

    const conv = fs.readFileSync(
      path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
      'utf8'
    );
    assert.ok(conv.includes('addShortcut="⌥⇧R"'), 'reviewer opt hint');
    assert.ok(conv.includes('addShortcut="⌥⇧A"'), 'assignee opt hint');
    assert.ok(conv.includes('label="⌥⇧L"'), 'label opt hint');
    assert.ok(conv.includes('label="⌥⇧P"'), 'milestone opt hint');
    assert.ok(conv.includes('label="⌥⇧D"'), 'draft stage opt hint');
    assert.ok(conv.includes('Convert to draft'), 'convert to draft button');

    // Opt badges leaf-subscribe; inactive panels gated inside OptBtnHint
    assert.ok(
      app.includes('setOptHintsActive') || app.includes('optHintsActive'),
      'opt hints store-driven (layout gating in OptBtnHint hostIsLive)'
    );
    assert.ok(
      hint.includes('prp-body-panel--active') || hint.includes('hostIsLive'),
      'OptBtnHint skips inactive body panels'
    );

    const pureCmd = fs.readFileSync(
      path.join(__dirname, '../src/modal/pure/command-palette.js'),
      'utf8'
    );
    assert.ok(pureCmd.includes("id: 'opt-milestone'"), 'pure has opt-milestone chord');
    assert.ok(
      pureCmd.includes("'set-milestone': 'opt+shift+p'"),
      'pure maps set-milestone shortcut'
    );
    assert.ok(pureCmd.includes("id: 'opt-draft-stage'"), 'pure has opt-draft-stage chord');
    assert.ok(
      pureCmd.includes("'convert-draft': 'opt+shift+d'"),
      'pure maps convert-draft shortcut'
    );

    const appSrc = fs.readFileSync(
      path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
      'utf8'
    );
    assert.ok(
      appSrc.includes("case 'toggleDraftStage'"),
      'App handles toggleDraftStage from ⌥⇧D'
    );
  }

  console.log('confirm-palette-opt.test.js: all assertions passed');
}

main();
