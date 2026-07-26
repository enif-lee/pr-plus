/**
 * Pulls-page command palette — pure helpers + policy + structural wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const pp = require('../src/pulls-palette.js');
const listFocus = require('../src/pr-list-focus.js');
const {
  resolveModalShortcutAction,
} = require('../src/modal/lib/shortcut-policy.ts');

const prs = [
  {
    number: 10,
    title: 'Fix auth flow',
    author: 'alice',
    assignees: ['bob'],
    requestedReviewers: ['carol'],
    headRef: 'fix-auth',
    baseRef: 'main',
  },
  {
    number: 20,
    title: 'Add metrics dashboard',
    author: 'bob',
    assignees: ['alice'],
    requestedReviewers: ['bob'],
    headRef: 'metrics',
    baseRef: 'main',
  },
  {
    number: 30,
    title: 'Docs: API reference',
    author: 'carol',
    assignees: [],
    requestedReviewers: ['alice'],
    headRef: 'docs',
    baseRef: 'main',
  },
  {
    number: 40,
    title: 'Unrelated chore',
    author: 'dave',
    assignees: ['erin'],
    requestedReviewers: ['frank'],
    headRef: 'chore',
    baseRef: 'main',
  },
];

const logs = [];

// --- (a) build items: actions hidden by default; only PRs ---
{
  const items = pp.buildPullsPaletteItems(prs, {
    query: '',
    viewerLogin: 'alice',
    owner: 'acme',
    repo: 'app',
    webOrigin: 'https://github.com',
  });
  assert.equal(
    items.filter((i) => i.kind === 'action').length,
    0,
    'actions hidden when query empty'
  );
  const prItems = items.filter((i) => i.kind === 'pr');
  assert.equal(prItems.length, 4);
  assert.equal(prItems[0].number, 10);
  assert.equal(items[0].digit, 1);
  // Rich meta fields for palette UI (avatar / branches / #num)
  assert.equal(prItems[0].author, 'alice');
  assert.equal(prItems[0].headRef, 'fix-auth');
  assert.equal(prItems[0].baseRef, 'main');
  logs.push(`build items: ${prItems.length} prs, actions hidden`);
}

// --- new PR (np) + filters as peer rows when query matches ---
{
  const createItems = pp.buildPullsPaletteItems(prs, {
    query: 'np',
    owner: 'acme',
    repo: 'app',
    webOrigin: 'https://github.com',
  });
  const create = createItems.find((i) => i.id === pp.CREATE_PR_ACTION_ID);
  assert.ok(create, 'np reveals new pull request action');
  assert.equal(create.action, 'createPullRequest');
  assert.equal(create.title, 'New pull request');
  assert.ok(create.href.includes('/acme/app/compare'));
  assert.ok((create.aliases || []).includes('np'));
  // Peer shape: same fields as PR rows (no special section)
  assert.equal(create.section, null);
  assert.equal(create.kind, 'action');

  const amItems = pp.buildPullsPaletteItems(prs, {
    query: 'am',
    viewerLogin: 'alice',
    owner: 'acme',
    repo: 'app',
  });
  const amAction = amItems.find((i) => i.action === 'applyFilter' && i.filterId === 'am');
  assert.ok(amAction, 'am reveals filter action as peer row');
  assert.equal(amAction.kind, 'action');
  // PR filter still applies for token
  assert.deepEqual(
    amItems.filter((i) => i.kind === 'pr').map((i) => i.number),
    [20]
  );
  logs.push('np/am peer actions ok');
}

// --- (b) filters am / cm / hr / my ---
{
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: 'am', viewerLogin: 'alice' }).map(
      (p) => p.number
    ),
    [20]
  );
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: 'cm', viewerLogin: 'alice' }).map(
      (p) => p.number
    ),
    [10]
  );
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: 'hr', viewerLogin: 'alice' }).map(
      (p) => p.number
    ),
    [30]
  );
  assert.deepEqual(
    pp
      .filterPullsForPalette(prs, { query: 'my', viewerLogin: 'alice' })
      .map((p) => p.number)
      .sort((a, b) => a - b),
    [10, 20, 30]
  );
  // No viewer → me-filters match nothing
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: 'am', viewerLogin: '' }).map(
      (p) => p.number
    ),
    []
  );
  logs.push('filters am/cm/hr/my ok');
}

// --- (c) text query ---
{
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: 'metrics' }).map((p) => p.number),
    [20]
  );
  assert.deepEqual(
    pp.filterPullsForPalette(prs, { query: '#30' }).map((p) => p.number),
    [30]
  );
  assert.deepEqual(
    pp
      .filterPullsForPalette(prs, { query: 'am metrics', viewerLogin: 'alice' })
      .map((p) => p.number),
    [20]
  );
  logs.push('text query ok');
}

// --- (d) focus step + opt digit ---
{
  assert.equal(pp.nextPaletteFocusIndex(-1, 1, 5), 0);
  assert.equal(pp.nextPaletteFocusIndex(-1, -1, 5), 4);
  assert.equal(pp.nextPaletteFocusIndex(0, 1, 5), 1);
  assert.equal(pp.nextPaletteFocusIndex(4, 1, 5), 0);
  assert.equal(pp.nextPaletteFocusIndex(0, -1, 5), 4);

  assert.equal(
    pp.resolveOptDigitIndex({ alt: true, code: 'Digit3', key: '3' }),
    2
  );
  assert.equal(
    pp.resolveOptDigitIndex({ alt: false, code: 'Digit3', key: '3' }),
    -1
  );

  const sel = pp.unwrapPullsPaletteAction(
    pp.resolvePullsPaletteShortcutAction({
      alt: true,
      code: 'Digit2',
      key: '2',
      paletteOpen: true,
      isPullsList: true,
      hostEnabled: true,
    })
  );
  assert.equal(sel.action, 'selectDigit');
  assert.equal(sel.digitIndex, 1);

  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      alt: true,
      code: 'KeyJ',
      key: '∆',
      paletteOpen: true,
      isPullsList: true,
    }),
    'focusNext'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      alt: true,
      code: 'KeyK',
      key: 'k',
      paletteOpen: true,
      isPullsList: true,
    }),
    'focusPrev'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      code: 'ArrowDown',
      key: 'ArrowDown',
      paletteOpen: true,
      isPullsList: true,
    }),
    'focusNext'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      code: 'ArrowUp',
      key: 'ArrowUp',
      paletteOpen: true,
      isPullsList: true,
    }),
    'focusPrev'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      code: 'Enter',
      key: 'Enter',
      paletteOpen: true,
      isPullsList: true,
    }),
    'activate'
  );
  logs.push('focus + digit ok');
}

// --- (e) Esc close ---
{
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      key: 'Escape',
      code: 'Escape',
      paletteOpen: true,
      isPullsList: true,
    }),
    'closePalette'
  );
  logs.push('esc close ok');
}

// --- open shortcut: ⌥⇧K (not ⌘K / ⌘⇧K) ---
{
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      mod: false,
      shift: true,
      alt: true,
      key: '˚', // macOS Option+K glyph; code wins
      code: 'KeyK',
      paletteOpen: false,
      isPullsList: true,
      hostEnabled: true,
    }),
    'openPalette'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      mod: true,
      shift: true,
      key: 'k',
      code: 'KeyK',
      paletteOpen: false,
      isPullsList: true,
      hostEnabled: true,
    }),
    null,
    '⌘⇧K is not pulls palette'
  );
  assert.equal(
    pp.resolvePullsPaletteShortcutAction({
      mod: true,
      shift: false,
      key: 'k',
      paletteOpen: false,
      isPullsList: true,
      hostEnabled: true,
    }),
    null,
    'plain ⌘K reserved for GitHub'
  );
  // Modal policy uses the same ⌥⇧K chord for in-modal palette
  assert.equal(
    resolveModalShortcutAction({
      mod: false,
      shift: true,
      alt: true,
      key: 'k',
      code: 'KeyK',
    }),
    'openPalette'
  );
  logs.push('open shortcut opt+shift+k ok');
}

// --- Enter on am/my prefers filter action index ---
{
  const items = pp.buildPullsPaletteItems(
    [
      {
        number: 1,
        title: 'x',
        author: 'bob',
        assignees: ['alice'],
        requestedReviewers: [],
      },
    ],
    { query: 'am', viewerLogin: 'alice', owner: 'o', repo: 'r' }
  );
  assert.equal(items[0].action, 'applyFilter');
  assert.equal(pp.resolveActivateIndex(items, 1, 'am'), 0, 'am → filter row');
  const myItems = pp.buildPullsPaletteItems(
    [
      {
        number: 2,
        title: 'y',
        author: 'alice',
        assignees: [],
        requestedReviewers: [],
      },
    ],
    { query: 'my', viewerLogin: 'alice', owner: 'o', repo: 'r' }
  );
  assert.equal(
    pp.resolveActivateIndex(myItems, 5, 'my'),
    myItems.findIndex((i) => i.filterId === 'my')
  );
  logs.push('activate index am/my ok');
}

// --- list row shortcuts yield while pulls palette open ---
{
  assert.equal(
    listFocus.resolvePrListShortcutAction({
      alt: true,
      key: 'j',
      code: 'KeyJ',
      isPullsList: true,
      hostEnabled: true,
      pullsPaletteOpen: true,
    }),
    null
  );
  logs.push('list focus yields to pulls palette');
}

// --- create URL ---
{
  assert.equal(
    pp.buildCreatePullRequestUrl('acme', 'app', 'https://github.com'),
    'https://github.com/acme/app/compare'
  );
}

// --- filter Enter navigates real GH pulls list (q=) ---
{
  assert.equal(
    pp.githubQueryForFilter('am'),
    'is:pr is:open assignee:@me'
  );
  assert.equal(
    pp.githubQueryForFilter('cm'),
    'is:pr is:open author:@me'
  );
  assert.equal(
    pp.githubQueryForFilter('hr'),
    'is:pr is:open user-review-requested:@me'
  );
  assert.equal(
    pp.githubQueryForFilter('my'),
    'is:pr is:open involves:@me'
  );
  assert.equal(
    pp.githubQueryForFilter('df'),
    'is:pr is:open draft:true'
  );
  assert.equal(
    pp.githubQueryForFilter('rd'),
    'is:pr is:open draft:false'
  );
  assert.equal(
    pp.buildPullsListFilterUrl('acme', 'app', 'rs', 'https://github.com'),
    'https://github.com/acme/app/pulls',
    'reset clears to plain pulls list'
  );
  assert.ok(
    pp
      .buildPullsListFilterUrl('acme', 'app', 'df', 'https://github.com')
      .includes('draft%3Atrue') ||
      pp
        .buildPullsListFilterUrl('acme', 'app', 'df', 'https://github.com')
        .includes('draft:true')
  );
  // In-palette draft filter uses pr.draft
  assert.deepEqual(
    pp
      .filterPullsForPalette(
        [
          { number: 1, title: 'a', author: 'x', draft: true, assignees: [] },
          { number: 2, title: 'b', author: 'x', draft: false, assignees: [] },
        ],
        { query: 'df' }
      )
      .map((p) => p.number),
    [1]
  );
  assert.deepEqual(
    pp
      .filterPullsForPalette(
        [
          { number: 1, title: 'a', author: 'x', draft: true, assignees: [] },
          { number: 2, title: 'b', author: 'x', draft: false, assignees: [] },
        ],
        { query: 'rd' }
      )
      .map((p) => p.number),
    [2]
  );
  const dfItems = pp.buildPullsPaletteItems([], {
    query: 'df',
    owner: 'o',
    repo: 'r',
  });
  assert.ok(dfItems.some((i) => i.filterId === 'df'));
  const rsItems = pp.buildPullsPaletteItems([], {
    query: 'rs',
    owner: 'o',
    repo: 'r',
  });
  assert.ok(rsItems.some((i) => i.filterId === 'rs'));
  assert.equal(
    pp.buildPullsListFilterUrl('acme', 'app', 'am', 'https://github.com'),
    'https://github.com/acme/app/pulls/assigned/@me'
  );
  assert.equal(
    pp.buildPullsListFilterUrl('acme', 'app', 'cm', 'https://github.com'),
    'https://github.com/acme/app/pulls/created_by/@me'
  );
  assert.equal(
    pp.buildPullsListFilterUrl('acme', 'app', 'hr', 'https://github.com'),
    'https://github.com/acme/app/pulls/review-requested/@me'
  );
  const myUrl = pp.buildPullsListFilterUrl(
    'acme',
    'app',
    'my',
    'https://github.com'
  );
  assert.ok(myUrl.includes('/pulls?'));
  assert.equal(
    new URL(myUrl).searchParams.get('q'),
    'is:pr is:open involves:@me'
  );
  assert.ok(
    fs
      .readFileSync(path.join(__dirname, '../src/pr-modal-host.js'), 'utf8')
      .includes('buildPullsListFilterUrl'),
    'host activates filters via real list URL'
  );
  logs.push('filter list navigation urls ok');
}

// --- footer help entries from configured actions ---
{
  const help = pp.buildPullsPaletteHelpEntries();
  assert.ok(help.length >= 8);
  const np = help.find((h) => h.primary === 'np');
  assert.ok(np);
  assert.equal(np.title, 'New pull request');
  assert.ok(np.aliases.includes('np'));
  const am = help.find((h) => h.primary === 'am');
  assert.ok(am);
  assert.ok(help.some((h) => h.primary === 'df'));
  assert.ok(help.some((h) => h.primary === 'rs'));
  const helpAct = help.find((h) => h.action === 'toggleHelp' || h.primary === 'help');
  assert.ok(helpAct, 'help toggle is a palette action');
  assert.ok((helpAct.aliases || []).includes('help'));
  const helpItems = pp.buildPullsPaletteItems([], {
    query: 'help',
    owner: 'o',
    repo: 'r',
  });
  assert.ok(
    helpItems.some((i) => i.action === 'toggleHelp'),
    'searching help reveals toggleHelp action'
  );
  logs.push('help entries ok');
}

// --- structural wiring ---
{
  const root = path.join(__dirname, '..');
  const host = fs.readFileSync(path.join(root, 'src/pr-modal-host.js'), 'utf8');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const bg = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  assert.ok(manifest.content_scripts[0].js.includes('src/pulls-palette.js'));
  assert.ok(bg.includes('src/pulls-palette.js'));
  assert.ok(host.includes('openPullsPalette'));
  assert.ok(host.includes('closePullsPalette'));
  assert.ok(host.includes('activatePullsPaletteItem'));
  assert.ok(host.includes("page: 'conversation'"));
  assert.ok(host.includes('createPullRequest') || host.includes('compare'));
  assert.ok(host.includes('prp-pulls-palette') || host.includes('PULLS_PALETTE'));
  assert.ok(fs.existsSync(path.join(root, 'src/pulls-palette.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/styles.css')));
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  assert.ok(css.includes('.prp-pp-layer'));
  logs.push('structural wiring ok');
}

const unitLog = ['pulls-palette.test.js', ...logs, 'PASS'].join('\n') + '\n';
fs.writeFileSync(path.join(SCRATCH, 'pulls-palette-unit.log'), unitLog);
fs.writeFileSync(
  path.join(SCRATCH, 'pulls-palette-policy.log'),
  [
    'pulls-palette policy',
    'open=alt+shift+k',
    'plain-mod+k=null',
    'list-focus-yields-when-palette-open',
    'PASS',
  ].join('\n') + '\n'
);
fs.writeFileSync(
  path.join(SCRATCH, 'pulls-palette-wire.log'),
  [
    'pulls-palette wire',
    'module=src/pulls-palette.js',
    'manifest=content_scripts',
    'host=openPullsPalette/closePullsPalette/activate',
    'PASS',
  ].join('\n') + '\n'
);

console.log('pulls-palette.test.js: ok');
console.log(logs.join('\n'));
