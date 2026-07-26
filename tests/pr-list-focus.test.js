/**
 * PR list keyboard focus: Option+J/K step + Enter open policy.
 */
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  PR_LIST_FOCUS_CLASS,
  PR_LIST_STEP,
  normalizePrListKey,
  nextFocusIndex,
  resolvePrListShortcutAction,
  findFocusIndex,
  applyFocusToRows,
  isGithubCommandPaletteOpen,
  touchGithubCommandPaletteOpen,
  shouldIgnoreModalEscapeForGithubPalette,
  __resetGithubPaletteWatchForTests,
  GITHUB_PALETTE_ESCAPE_GRACE_MS,
  recoverGithubCommandPaletteTopLayer,
} = require('../src/pr-list-focus.js');

// --- labels / constants ---
assert.equal(PR_LIST_STEP.prev.action, 'focusPrev');
assert.equal(PR_LIST_STEP.next.action, 'focusNext');
assert.equal(PR_LIST_STEP.prev.key, 'k');
assert.equal(PR_LIST_STEP.next.key, 'j');

// --- Option glyph normalization ---
assert.equal(
  normalizePrListKey({ key: '∆', code: 'KeyJ', alt: true }),
  'j'
);
assert.equal(
  normalizePrListKey({ key: '˚', code: 'KeyK', alt: true }),
  'k'
);
assert.equal(normalizePrListKey({ key: 'j', alt: false }), 'j');

// --- index movement ---
assert.equal(nextFocusIndex(-1, 1, 5), 0, 'first next focuses head');
assert.equal(nextFocusIndex(-1, -1, 5), 4, 'first prev focuses tail');
assert.equal(nextFocusIndex(0, 1, 5), 1);
assert.equal(nextFocusIndex(4, 1, 5), 0, 'wrap next');
assert.equal(nextFocusIndex(0, -1, 5), 4, 'wrap prev');
assert.equal(nextFocusIndex(2, 1, 0), -1, 'empty list');
assert.equal(nextFocusIndex(2, 1, 1), 0, 'single item wraps to self');

// --- resolve: Option+J/K ---
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: '∆',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: true,
  }),
  'focusNext'
);
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'k',
    code: 'KeyK',
    isPullsList: true,
    hostEnabled: true,
  }),
  'focusPrev'
);

// plain j/k without Option → no action (does not steal typing / GH keys)
assert.equal(
  resolvePrListShortcutAction({
    alt: false,
    key: 'j',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: true,
  }),
  null
);

// --- resolve: Enter ---
assert.equal(
  resolvePrListShortcutAction({
    key: 'Enter',
    code: 'Enter',
    isPullsList: true,
    hostEnabled: true,
    hasFocusedRow: true,
  }),
  'openFocused'
);
assert.equal(
  resolvePrListShortcutAction({
    key: 'Enter',
    code: 'Enter',
    isPullsList: true,
    hostEnabled: true,
    hasFocusedRow: false,
  }),
  null,
  'Enter without focus is no-op'
);

// --- guards ---
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'j',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: true,
    githubPaletteOpen: true,
  }),
  null,
  'no steal while GitHub ⌘K palette is open'
);
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'j',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: true,
    editableTarget: true,
  }),
  null,
  'no steal while typing'
);
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'j',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: true,
    modalOpen: true,
  }),
  null,
  'modal owns keyboard'
);
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'j',
    code: 'KeyJ',
    isPullsList: false,
    hostEnabled: true,
  }),
  null
);
assert.equal(
  resolvePrListShortcutAction({
    alt: true,
    key: 'j',
    code: 'KeyJ',
    isPullsList: true,
    hostEnabled: false,
  }),
  null
);

// --- DOM apply / find ---
const dom = new JSDOM(`<!doctype html><body>
  <div id="issue_10" class="js-issue-row"><a href="/o/r/pull/10">A</a></div>
  <div id="issue_20" class="js-issue-row"><a href="/o/r/pull/20">B</a></div>
  <div id="issue_30" class="js-issue-row"><a href="/o/r/pull/30">C</a></div>
</body>`);
const rows = [...dom.window.document.querySelectorAll('.js-issue-row')];
assert.equal(findFocusIndex(rows), -1);
const focused = applyFocusToRows(rows, 1);
assert.ok(focused);
assert.ok(focused.classList.contains(PR_LIST_FOCUS_CLASS));
assert.equal(focused.getAttribute('data-prp-list-focus'), '1');
assert.equal(rows[0].classList.contains(PR_LIST_FOCUS_CLASS), false);
assert.equal(findFocusIndex(rows), 1);
assert.equal(
  findFocusIndex(rows, {
    focusNumber: 30,
    getNumber: (row) =>
      Number(String(row.id || '').replace(/\D/g, '')) || Number.NaN,
  }),
  2,
  'prefer PR number when set'
);
applyFocusToRows(rows, -1);
assert.equal(findFocusIndex(rows), -1);

// --- GitHub command palette detection + stuck top-layer recovery ---
{
  const ghDom = new JSDOM(
    `<!doctype html><body>
      <main><a href="/o/r/pull/1">PR</a></main>
      <dialog-helper>
        <dialog id="command-palette-pjax-container" class="js-command-palette-dialog Overlay">
          <input aria-label="Command palette input" />
        </dialog>
      </dialog-helper>
    </body>`,
    { url: 'https://github.com/o/r/pulls', pretendToBeVisual: true }
  );
  const gdoc = ghDom.window.document;
  const dlg = gdoc.getElementById('command-palette-pjax-container');

  __resetGithubPaletteWatchForTests();
  assert.equal(isGithubCommandPaletteOpen(gdoc), false);

  // Simulate open palette
  dlg.open = true;
  Object.defineProperty(dlg, 'getBoundingClientRect', {
    value: () => ({ width: 720, height: 400, top: 100, left: 100, right: 820, bottom: 500 }),
  });
  // getComputedStyle may not know open dialogs in jsdom — open flag is enough
  assert.equal(isGithubCommandPaletteOpen(gdoc), true);
  assert.equal(touchGithubCommandPaletteOpen(gdoc, 5000), true);

  dlg.open = false;
  assert.equal(isGithubCommandPaletteOpen(gdoc), false);
  // Race: GH closed on Escape before our listener — grace still owns Escape
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(gdoc, {
      now: 5100,
      graceMs: GITHUB_PALETTE_ESCAPE_GRACE_MS,
    }),
    true
  );

  // Stuck :modal with open=false — matches() reports :modal until re-parented
  let modalStuck = true;
  dlg.matches = (sel) => (sel === ':modal' ? modalStuck : false);
  dlg.close = () => {
    dlg.open = false;
    /* intentionally leave :modal stuck (mirrors GH bug) */
  };
  const recovered = recoverGithubCommandPaletteTopLayer(gdoc);
  assert.equal(recovered, true, 'recovery should run for stuck :modal');
  // After remove+reinsert, our mock still returns true unless we clear — emulate clear
  modalStuck = false;
  assert.equal(
    recoverGithubCommandPaletteTopLayer(gdoc),
    false,
    'no recovery when not :modal'
  );
}

console.log('pr-list-focus.test.js: ok');

// --- Option hotkey slots 1-9 + a-z (skip j/k); ⌥⇧N new PR; filter bar ⌥⇧ ---
{
  const {
    PR_LIST_HOTKEY_SLOTS,
    PR_LIST_HOTKEY_RESERVED,
    PR_LIST_FILTER_BAR,
    prListHotkeyLabel,
    resolvePrListHotkeyIndex,
    resolveFilterBarShortcut,
    matchFilterBarLabel,
    resolvePrListShortcutAction,
    unwrapPrListAction,
  } = require('../src/pr-list-focus.js');
  assert.equal(PR_LIST_HOTKEY_SLOTS, '123456789abcdefghilmnopqrstuvwxyz');
  // n is free for list slots (new PR is ⌥⇧N)
  assert.ok(PR_LIST_HOTKEY_SLOTS.includes('n'));
  assert.equal(PR_LIST_HOTKEY_SLOTS.length, 33);
  assert.ok(!PR_LIST_HOTKEY_SLOTS.includes('j'));
  assert.ok(!PR_LIST_HOTKEY_SLOTS.includes('k'));
  assert.equal(prListHotkeyLabel(0), '1');
  assert.equal(prListHotkeyLabel(9), 'a');
  assert.equal(prListHotkeyLabel(32), 'z');
  assert.equal(resolvePrListHotkeyIndex({ alt: true, code: 'Digit1' }), 0);
  assert.equal(resolvePrListHotkeyIndex({ alt: true, code: 'KeyZ' }), 32);
  assert.equal(resolvePrListHotkeyIndex({ alt: true, code: 'KeyJ' }), -1);
  assert.equal(resolvePrListHotkeyIndex({ alt: true, code: 'KeyK' }), -1);
  // New PR requires Option+Shift+N
  assert.equal(
    resolvePrListShortcutAction({
      alt: true,
      shift: true,
      code: 'KeyN',
      isPullsList: true,
      hostEnabled: true,
    }),
    'newPullRequest'
  );
  assert.notEqual(
    resolvePrListShortcutAction({
      alt: true,
      shift: false,
      code: 'KeyN',
      isPullsList: true,
      hostEnabled: true,
    }),
    'newPullRequest'
  );
  assert.equal(
    resolvePrListShortcutAction({
      alt: true,
      code: 'KeyJ',
      isPullsList: true,
      hostEnabled: true,
    }),
    'focusNext'
  );
  // Filter bar
  assert.equal(PR_LIST_FILTER_BAR.length, 8); // + Filters menu
  assert.equal(
    resolveFilterBarShortcut({ alt: true, shift: true, code: 'KeyF' })?.id,
    'filters-menu'
  );
  assert.equal(
    resolveFilterBarShortcut({ alt: true, shift: true, code: 'KeyA' })?.id,
    'author'
  );
  assert.equal(
    resolveFilterBarShortcut({ alt: true, shift: true, code: 'KeyL' })?.id,
    'label'
  );
  assert.equal(
    resolveFilterBarShortcut({ alt: true, shift: true, code: 'KeyK' }),
    null,
    '⌥⇧K reserved for palette'
  );
  assert.equal(matchFilterBarLabel('Author')?.id, 'author');
  assert.equal(matchFilterBarLabel('Milestones')?.id, 'milestones');
  assert.deepEqual(
    unwrapPrListAction(
      resolvePrListShortcutAction({
        alt: true,
        shift: true,
        code: 'KeyR',
        isPullsList: true,
        hostEnabled: true,
      })
    ),
    { action: 'openFilterBar', index: -1, filterId: 'reviews' }
  );
}
