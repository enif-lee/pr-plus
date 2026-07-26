'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const TestRenderer = require('react-test-renderer');

const polish = require('../src/modal/pure/ui-polish.js');

// Load StackStrip via tsx-free path: read source asserts + pure helpers.
// Component integration via react-test-renderer needs the built bundle globals —
// we unit-test pure hover machine + options + source contracts, then render a
// minimal stub that mirrors click/hover wiring using the pure reducers.

const SCRATCH =
  process.env.PRP_SCRATCH ||
  require('node:path').join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const log = [];
function ok(msg) {
  log.push(`ok - ${msg}`);
  console.log(`ok - ${msg}`);
}

const prs = [
  { number: 1, title: 'Root', headRef: 'a', baseRef: 'main', htmlUrl: '/1' },
  { number: 2, title: 'Left', headRef: 'b1', baseRef: 'a', htmlUrl: '/2' },
  { number: 3, title: 'Right', headRef: 'b2', baseRef: 'a', htmlUrl: '/3' },
  { number: 4, title: 'L2', headRef: 'c1', baseRef: 'b1', htmlUrl: '/4' },
  { number: 5, title: 'R2', headRef: 'c2', baseRef: 'b2', htmlUrl: '/5' },
];

// --- pure: branch options attach to LEVEL node (selected sibling), not parent ---
{
  const model = polish.buildStackPathModel(prs, 1, {});
  const fork = model.branches.find((b) => b.parentHeadRef === 'a');
  assert.ok(fork && fork.options.length >= 2);
  // Default first branch is highest number (#3 Right)
  assert.equal(fork.levelNumber, 3, 'picker attaches to selected level node #3');
  assert.equal(fork.selectedNumber, 3);
  // Level chip exists on strip
  assert.ok(model.items.some((i) => i.number === fork.levelNumber));
  // Parent root is NOT the levelNumber
  assert.notEqual(fork.levelNumber, 1);
  assert.equal(polish.stackBranchHasPathPicker(fork), true);
  const opts = polish.buildStackBranchSelectOptions(fork);
  assert.equal(opts.length, 2);
  assert.ok(opts.some((o) => Number(o.meta.number) === 2));
  assert.ok(opts.some((o) => Number(o.meta.number) === 3));
  ok('levelNumber anchors path picker to degree node');
}

// --- pure: hover state machine ---
{
  let s = { openKey: null, armedKey: null };
  let r = polish.reduceStackPathHover(s, { type: 'enter', key: 'a' });
  assert.equal(r.scheduleOpen, true);
  assert.equal(r.armedKey, 'a');
  s = { openKey: r.openKey, armedKey: r.armedKey };

  r = polish.reduceStackPathHover(s, { type: 'timer-fire', key: 'a' });
  assert.equal(r.openKey, 'a');
  s = { openKey: r.openKey, armedKey: r.armedKey };

  // leave cancels arm but keeps open
  r = polish.reduceStackPathHover(s, { type: 'leave', key: 'a' });
  assert.equal(r.openKey, 'a');
  assert.equal(r.armedKey, null);
  assert.equal(r.cancelTimer, true);

  r = polish.reduceStackPathHover(s, { type: 'close' });
  assert.equal(r.openKey, null);
  ok('reduceStackPathHover open on dwell / close');
}

// --- pure: click navigation independent of path selection ---
{
  const model = polish.buildStackPathModel(prs, 3, {});
  // From Right (#3), strip includes ancestors + self + descendants
  assert.ok(model.items.some((i) => i.number === 1));
  assert.ok(model.items.some((i) => i.number === 3 && i.current));
  // Every non-current item is a navigation target
  const navTargets = model.items.filter((i) => !i.current).map((i) => i.number);
  assert.ok(navTargets.includes(1));
  ok('stack items remain clickable navigation targets');
}

// --- source contracts: StackStrip uses hover + SearchableSelect, click navigates ---
{
  const src = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/chrome/StackStrip.tsx'),
    'utf8'
  );
  assert.match(src, /SearchableSelect/);
  assert.match(src, /reduceStackPathHover|STACK_PATH_HOVER_MS/);
  assert.match(src, /onMouseEnter/);
  assert.match(src, /navigateTo|onOpenPr/);
  assert.ok(!src.includes('<select'), 'native select removed');
  assert.match(src, /preventDefault/);
  // Anchored to the hovered stack level chip (not centered modal)
  assert.match(src, /anchorKey/);
  assert.match(src, /bindOpenAnchor|openAnchorRef/);
  assert.match(src, /data-stack-level|data-pr-number/);
  assert.match(src, /branchByLevel|levelNumber/);
  // Click always navigates (not only opens picker)
  assert.match(src, /onClick[\s\S]*navigateTo|navigateTo\(levelNum/);
  ok('StackStrip source: hover floating select + click navigate');
}

// Stack hop preserves current Diff/Conversation view (host + App contract)
{
  const app = fs.readFileSync(
    path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  const host = fs.readFileSync(
    path.join(__dirname, '../src/pr-modal-host.js'),
    'utf8'
  );
  assert.ok(
    app.includes("onOpenStackPr(n, { page })") ||
      app.includes('onOpenStackPr(n, { page:') ||
      app.includes('onOpenStackPr(num, { page })') ||
      /onOpenStackPr\(\s*(n|num)\s*,\s*\{\s*page/.test(app),
    'App passes current layout page when opening stack PR'
  );
  assert.ok(
    app.includes('routePage') &&
      (app.includes('routePage wins') ||
        app.includes('Host/stack nav page wins') ||
        /if\s*\(\s*routePage\s*\)/.test(app)),
    'App prefers route page over target session layoutMode'
  );
  assert.ok(
    host.includes('onOpenStackPr') && host.includes('page'),
    'host openModal receives page for stack navigation'
  );
  assert.ok(
    host.includes('resolvedPage') ||
      host.includes('current.routePage'),
    'host preserves routePage when stack-opening without explicit page'
  );
  ok('stack hop preserves current view state');
}

// SearchableSelect measures from anchorKey / anchorRef
{
  const ss = fs.readFileSync(
    path.join(__dirname, '../src/modal/components/common/SearchableSelect.tsx'),
    'utf8'
  );
  assert.match(ss, /anchorKey/);
  assert.match(ss, /getBoundingClientRect/);
  // Prefer open below; flip above only when bottom side cannot fit
  assert.match(ss, /preferBottom|placement !== 'top'|placement === 'bottom'/);
  assert.match(ss, /fitsBelow|fitsAbove/);
  ok('SearchableSelect remeasures on anchorKey');
}

// --- lightweight React harness: click fires onOpenPr, hover open after reduce ---
{
  function MiniStack({ items, branches, onOpenPr, onPathChange }) {
    const [hover, setHover] = React.useState({ openKey: null, armedKey: null });
    const branchByLevel = new Map(
      (branches || []).map((b) => [Number(b.levelNumber ?? b.selectedNumber), b])
    );
    return React.createElement(
      'div',
      null,
      items.map((it) => {
        const branch = branchByLevel.get(Number(it.number));
        const hasPicker = polish.stackBranchHasPathPicker(branch);
        const chipKey = `level-${it.number}`;
        return React.createElement(
          'button',
          {
            key: it.number,
            type: 'button',
            'data-pr': it.number,
            'data-fork': hasPicker ? '1' : '0',
            onClick: () => onOpenPr(it.number),
            onMouseEnter: () => {
              if (!hasPicker) return;
              const r = polish.reduceStackPathHover(hover, {
                type: 'enter',
                key: chipKey,
              });
              const fired = polish.reduceStackPathHover(
                { openKey: r.openKey, armedKey: r.armedKey },
                { type: 'timer-fire', key: chipKey }
              );
              setHover({ openKey: fired.openKey, armedKey: fired.armedKey });
            },
          },
          `#${it.number}`
        );
      }),
      hover.openKey
        ? React.createElement(
            'div',
            { 'data-picker': hover.openKey },
            polish
              .buildStackBranchSelectOptions(
                branchByLevel.get(Number(String(hover.openKey).replace(/^level-/, '')))
              )
              .map((o) =>
                React.createElement(
                  'button',
                  {
                    key: o.id,
                    type: 'button',
                    'data-pick': o.meta.number,
                    onClick: () => {
                      const b = branchByLevel.get(
                        Number(String(hover.openKey).replace(/^level-/, ''))
                      );
                      onPathChange?.(b.parentHeadRef, o.meta.number);
                      onOpenPr(o.meta.number);
                      setHover({ openKey: null, armedKey: null });
                    },
                  },
                  o.label
                )
              )
          )
        : null
    );
  }

  const model = polish.buildStackPathModel(prs, 1, {});
  const opened = [];
  const paths = [];
  let root;
  TestRenderer.act(() => {
    root = TestRenderer.create(
      React.createElement(MiniStack, {
        items: model.items,
        branches: model.branches,
        onOpenPr: (n) => opened.push(n),
        onPathChange: (h, n) => paths.push([h, n]),
      })
    );
  });

  // Click non-current item
  const btn2 = root.root.findAll(
    (n) => n.props && n.props['data-pr'] === 3
  )[0];
  // default path may be 1→3→5 so 3 might be on path
  const clickable = root.root.findAll(
    (n) => n.type === 'button' && n.props['data-pr'] && n.props['data-pr'] !== 1
  );
  assert.ok(clickable.length >= 1);
  TestRenderer.act(() => {
    clickable[0].props.onClick();
  });
  assert.equal(opened.length, 1);
  assert.equal(opened[0], clickable[0].props['data-pr']);
  ok('click navigates to PR number');

  // Hover fork root
  const forkBtn = root.root.findAll(
    (n) => n.props && n.props['data-fork'] === '1'
  )[0];
  assert.ok(forkBtn, 'fork chip present');
  TestRenderer.act(() => {
    forkBtn.props.onMouseEnter();
  });
  const picker = root.root.findAll(
    (n) => n.props && n.props['data-picker']
  )[0];
  assert.ok(picker, 'floating picker opens after hover dwell');
  const pickLeft = picker.findAll(
    (n) => n.props && n.props['data-pick'] === 2
  )[0];
  assert.ok(pickLeft);
  TestRenderer.act(() => {
    pickLeft.props.onClick();
  });
  assert.ok(paths.some((p) => p[0] === 'a' && p[1] === 2));
  assert.ok(opened.includes(2));
  ok('hover picker pick changes path and navigates');

  // Click every strip node navigates (including level-with-fork)
  const allBtns = root.root.findAll(
    (n) => n.type === 'button' && n.props['data-pr'] != null
  );
  const before = opened.length;
  TestRenderer.act(() => {
    for (const b of allBtns) b.props.onClick();
  });
  assert.equal(opened.length, before + allBtns.length);
  ok('every level chip click navigates');
}

// Opt-hold must not grow stack bar height (badge absolute; host keeps overflow clip)
{
  const css = fs.readFileSync(
    path.join(__dirname, '../src/modal/styles.css'),
    'utf8'
  );
  assert.ok(
    /\.prp-stack-strip__item \.prp-modal-hotkey\s*\{[^}]*position:\s*absolute/s.test(
      css
    ),
    'stack opt digit is absolute (no bar height jump)'
  );
  assert.ok(
    !/\.prp-overlay\.prp-opt-hints-on[^{]*\.prp-stack-strip-host/.test(css) ||
      !/prp-opt-hints-on[\s\S]{0,400}prp-stack-strip-host[\s\S]{0,80}overflow:\s*visible/.test(
        css
      ),
    'opt-hints-on does not force stack host overflow:visible'
  );
  assert.ok(
    /\.prp-stack-strip__item\s*\{[^}]*height:\s*22px/s.test(css),
    'stack chip has fixed height'
  );
  ok('opt-hold stack bar height contract');
}

const out = log.join('\n') + '\n';
fs.writeFileSync(path.join(SCRATCH, 'stack-strip-path.log'), out);
console.log('stack-strip-path.test.js: all assertions passed');
