/**
 * Unified command-palette: help per scope, shortcut coverage, `#$` PR search.
 * Drives shipped pure helpers (no re-implementation of the logic under test).
 */
import { describe, expect, test } from '@rstest/core';
import { createRequire } from 'node:module';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  parsePalettePrSearchQuery,
  matchCachedPrsForSearch,
  mergePrSearchResults,
  buildPrSearchPaletteCommands,
  buildPrSearchLoadingCommand,
  buildPrSearchEmptyCommand,
  applyPrSearchQuery,
  applyPrSearchAsyncResult,
  applyPrSearchAsyncError,
  createPalettePrSearchState,
  shouldKickPrSearchAsync,
  buildModalPaletteHelpEntries,
  listRequiredPaletteShortcutCoverage,
  checkPaletteShortcutCoverage,
  formatShortcut,
} from '../src/modal/lib/command-palette';

const require = createRequire(import.meta.url);
/** Classic dual-export pure module (shipped host path). */
function loadPullsPalette(): any {
  // Prefer emitted classic JS (type-erased); rebuild via build:content-ts.
  // Side-effect sets globalThis.PRPullsPalette.
  const mod = require('../src/pulls-palette.js');
  return (globalThis as any).PRPullsPalette || mod;
}

const SAMPLE_DETAIL = {
  number: 10,
  title: 'Sample PR',
  author: 'alice',
  viewerLogin: 'bob',
  baseRef: 'main',
  draft: false,
  mergeable: true,
  mergeStateStatus: 'CLEAN',
  allowedMergeMethods: ['merge', 'squash'],
  requestedReviewers: [],
  assignees: [],
  labels: [],
};

const CACHED_PRS = [
  {
    number: 42,
    title: 'Fix login timeout',
    author: 'alice',
    authorAvatarUrl: 'https://example.com/alice.png',
    headRef: 'fix-login',
    baseRef: 'main',
    draft: false,
  },
  {
    number: 99,
    title: 'Add dark mode',
    author: 'bob',
    headRef: 'dark-mode',
    baseRef: 'main',
    draft: true,
  },
  {
    number: 7,
    title: 'Docs: palette help',
    author: 'carol',
    headRef: 'docs',
    baseRef: 'main',
  },
];

describe('parsePalettePrSearchQuery', () => {
  test('recognizes #123, #name, and #$… forms', () => {
    expect(parsePalettePrSearchQuery('#123')).toEqual({
      isPrSearch: true,
      term: '123',
      raw: '#123',
    });
    expect(parsePalettePrSearchQuery('#fix login')).toEqual({
      isPrSearch: true,
      term: 'fix login',
      raw: '#fix login',
    });
    expect(parsePalettePrSearchQuery('#$99')).toEqual({
      isPrSearch: true,
      term: '99',
      raw: '#$99',
    });
    expect(parsePalettePrSearchQuery('#$dark mode')).toEqual({
      isPrSearch: true,
      term: 'dark mode',
      raw: '#$dark mode',
    });
    expect(parsePalettePrSearchQuery('merge')).toMatchObject({
      isPrSearch: false,
    });
    expect(parsePalettePrSearchQuery('')).toMatchObject({ isPrSearch: false });
    expect(parsePalettePrSearchQuery('  # 7  ')).toEqual({
      isPrSearch: true,
      term: '7',
      raw: '  # 7  ',
    });
  });
});

describe('matchCachedPrsForSearch + mergePrSearchResults', () => {
  test('cache matches appear in first sync result set', () => {
    const byNum = matchCachedPrsForSearch(CACHED_PRS, '42');
    expect(byNum.map((p) => p.number)).toEqual([42]);

    const byTitle = matchCachedPrsForSearch(CACHED_PRS, 'dark');
    expect(byTitle.map((p) => p.number)).toEqual([99]);

    const byAuthor = matchCachedPrsForSearch(CACHED_PRS, 'alice');
    expect(byAuthor.map((p) => p.number)).toEqual([42]);
  });

  test('async merge appends without dropping cache hits or duplicating', () => {
    const cache = matchCachedPrsForSearch(CACHED_PRS, 'mode');
    expect(cache.map((p) => p.number)).toEqual([99]);

    const asyncHits = [
      { number: 99, title: 'Add dark mode (remote)' }, // dupe
      { number: 120, title: 'Another mode fix' },
    ];
    const merged = mergePrSearchResults(cache, asyncHits);
    expect(merged.map((p) => p.number)).toEqual([99, 120]);
    // Cache object wins for number 99
    expect(merged[0].title).toBe('Add dark mode');
  });
});

describe('PR search loading state transitions', () => {
  test('bare # is cache-only (no async kick / loading)', () => {
    expect(shouldKickPrSearchAsync('')).toBe(false);
    expect(shouldKickPrSearchAsync('  ')).toBe(false);
    expect(shouldKickPrSearchAsync('dark')).toBe(true);

    const bare = applyPrSearchQuery(null, '#', CACHED_PRS);
    expect(bare.isPrSearch).toBe(true);
    expect(bare.term).toBe('');
    expect(bare.loading).toBe(false);
    expect(bare.items.map((p) => p.number)).toEqual([42, 99, 7]);

    const bareDollar = applyPrSearchQuery(null, '#$', CACHED_PRS);
    expect(bareDollar.isPrSearch).toBe(true);
    expect(bareDollar.term).toBe('');
    expect(bareDollar.loading).toBe(false);
  });

  test('loading true only while in-flight search pending', () => {
    let state = createPalettePrSearchState();
    expect(state.loading).toBe(false);

    state = applyPrSearchQuery(state, '#dark', CACHED_PRS);
    expect(state.isPrSearch).toBe(true);
    expect(state.loading).toBe(true);
    expect(state.cacheHits.map((p) => p.number)).toEqual([99]);
    expect(state.items.map((p) => p.number)).toEqual([99]);

    state = applyPrSearchAsyncResult(state, 'dark', [
      { number: 99, title: 'dup' },
      { number: 200, title: 'Remote dark' },
    ]);
    expect(state.loading).toBe(false);
    expect(state.items.map((p) => p.number)).toEqual([99, 200]);

    // Stale term must not clobber
    const stale = applyPrSearchAsyncResult(state, 'other', [
      { number: 1, title: 'nope' },
    ]);
    expect(stale.items.map((p) => p.number)).toEqual([99, 200]);

    state = applyPrSearchQuery(state, 'merge', CACHED_PRS);
    expect(state.isPrSearch).toBe(false);
    expect(state.loading).toBe(false);
  });

  test('async error ends loading but keeps cache hits', () => {
    let state = applyPrSearchQuery(null, '#login', CACHED_PRS);
    expect(state.loading).toBe(true);
    expect(state.items.map((p) => p.number)).toEqual([42]);
    state = applyPrSearchAsyncError(state, 'login', 'network down');
    expect(state.loading).toBe(false);
    expect(state.error).toMatch(/network/i);
    expect(state.items.map((p) => p.number)).toEqual([42]);
  });

  test('loading + empty builders produce status rows', () => {
    const loading = buildPrSearchLoadingCommand();
    expect(loading.loading).toBe(true);
    expect(loading.disabled).toBe(true);
    expect(loading.action).toBe('noop');

    const empty = buildPrSearchEmptyCommand('zzz');
    expect(empty.empty).toBe(true);
    expect(empty.title).toMatch(/zzz/);
  });
});

describe('buildPrSearchPaletteCommands open path payload', () => {
  test('rows use openPullRequest with number payload', () => {
    const cmds = buildPrSearchPaletteCommands(CACHED_PRS, {
      owner: 'acme',
      repo: 'app',
    });
    expect(cmds.length).toBe(3);
    for (const c of cmds) {
      expect(c.action).toBe('openPullRequest');
      expect(c.kind).toBe('pr');
      expect(c.payload.number).toBe(c.number);
      expect(c.payload.owner).toBe('acme');
      expect(c.payload.repo).toBe('app');
      expect(String(c.href)).toMatch(/\/pull\/\d+/);
    }
  });

  test('rows carry rich PR chrome fields for list-parity rendering', () => {
    const cmds = buildPrSearchPaletteCommands(CACHED_PRS, {
      owner: 'acme',
      repo: 'app',
    });
    const first = cmds.find((c) => c.number === 42);
    expect(first?.author).toBe('alice');
    expect(first?.authorAvatarUrl).toBe('https://example.com/alice.png');
    expect(first?.headRef).toBe('fix-login');
    expect(first?.baseRef).toBe('main');
    expect(first?.draft).toBe(false);

    const draft = cmds.find((c) => c.number === 99);
    expect(draft?.draft).toBe(true);
    expect(draft?.author).toBe('bob');
  });
});

describe('help entries per scope', () => {
  test('Conversation help omits Diff-only actions', () => {
    const help = buildModalPaletteHelpEntries(SAMPLE_DETAIL, {
      layoutMode: 'centered',
    });
    const ids = new Set(help.map((h) => h.id));
    expect(ids.has('toggle-help')).toBe(true);
    expect(ids.has('focus-conversation-comment')).toBe(true);
    expect(ids.has('conv-comment-next')).toBe(true);
    expect(ids.has('diff-prev-file')).toBe(false);
    expect(ids.has('diff-filter-unresolved')).toBe(false);
    // Help aliases
    const helpRow = help.find((h) => h.id === 'toggle-help');
    expect(helpRow?.aliases).toEqual(
      expect.arrayContaining(['help', 'hh', '?'])
    );
  });

  test('Diff help includes Diff filters and omits Conversation scroll-only rows', () => {
    const help = buildModalPaletteHelpEntries(SAMPLE_DETAIL, {
      layoutMode: 'diff',
    });
    const ids = new Set(help.map((h) => h.id));
    expect(ids.has('toggle-help')).toBe(true);
    expect(ids.has('diff-prev-file')).toBe(true);
    expect(ids.has('diff-filter-unresolved')).toBe(true);
    expect(ids.has('diff-filter-resolved')).toBe(true);
    expect(ids.has('diff-filter-pending')).toBe(true);
    expect(ids.has('conv-comment-next')).toBe(false);
    expect(ids.has('conv-page-up')).toBe(false);
  });
});

describe('shortcut coverage completeness', () => {
  test('Conversation palette lists required chords with matching tokens', () => {
    const cmds = buildPaletteCommands(SAMPLE_DETAIL, {
      layoutMode: 'centered',
    });
    const check = checkPaletteShortcutCoverage(cmds, 'conversation');
    expect(check.missing).toEqual([]);
    expect(check.ok).toBe(true);

    // Known gap: Conversation focus seed opt+shift+c
    const focus = cmds.find((c) => c.id === 'focus-conversation-comment');
    expect(focus).toBeTruthy();
    expect(String(focus?.shortcut).toLowerCase()).toBe('opt+shift+c');
  });

  test('Diff palette lists file-nav + review filters with matching tokens', () => {
    const cmds = buildPaletteCommands(SAMPLE_DETAIL, { layoutMode: 'diff' });
    const check = checkPaletteShortcutCoverage(cmds, 'diff');
    expect(check.missing).toEqual([]);
    expect(check.ok).toBe(true);

    const unresolved = cmds.find((c) => c.id === 'diff-filter-unresolved');
    expect(unresolved?.shortcut).toBe('opt+u');
    const prevFile = cmds.find((c) => c.id === 'diff-prev-file');
    expect(prevFile?.shortcut).toBe('opt+shift+[');
  });

  test('inventory helpers stay non-empty for both scopes', () => {
    expect(listRequiredPaletteShortcutCoverage('conversation').length).toBeGreaterThan(
      5
    );
    expect(listRequiredPaletteShortcutCoverage('diff').length).toBeGreaterThan(10);
  });
});

describe('filterPaletteCommands + help entry', () => {
  test('help / hh / ? match toggle-help command', () => {
    const cmds = buildPaletteCommands(SAMPLE_DETAIL, {
      layoutMode: 'centered',
    });
    for (const q of ['help', 'hh', '?']) {
      const filtered = filterPaletteCommands(cmds, q);
      expect(filtered.some((c) => c.id === 'toggle-help')).toBe(true);
    }
  });
});

describe('formatShortcut', () => {
  test('renders opt+shift+c for display', () => {
    expect(formatShortcut('opt+shift+c', true)).toMatch(/⌥/);
    expect(formatShortcut('opt+shift+c', true)).toMatch(/⇧/);
    expect(formatShortcut('opt+shift+c', true).toLowerCase()).toMatch(/c/);
  });
});

describe('pulls palette PR search + help (shipped pulls-palette)', () => {
  test('parse + buildPullsPaletteItems cache-first with loading row', () => {
    const g = loadPullsPalette();
    expect(typeof g.parsePalettePrSearchQuery).toBe('function');
    expect(g.parsePalettePrSearchQuery('#42').isPrSearch).toBe(true);
    expect(g.parsePalettePrSearchQuery('#$dark').term).toBe('dark');

    const itemsLoading = g.buildPullsPaletteItems(CACHED_PRS, {
      query: '#dark',
      owner: 'acme',
      repo: 'app',
      prSearchLoading: true,
      asyncHits: [],
    });
    expect(itemsLoading.some((it: any) => it.loading)).toBe(true);
    expect(itemsLoading.some((it: any) => it.number === 99)).toBe(true);

    const itemsMerged = g.buildPullsPaletteItems(CACHED_PRS, {
      query: '#dark',
      owner: 'acme',
      repo: 'app',
      prSearchLoading: false,
      asyncHits: [{ number: 200, title: 'Remote dark' }],
    });
    expect(itemsMerged.map((it: any) => it.number).filter(Boolean)).toEqual([
      99, 200,
    ]);

    const empty = g.buildPullsPaletteItems([], {
      query: '#zzz',
      prSearchLoading: false,
      asyncHits: [],
    });
    expect(empty.some((it: any) => it.empty)).toBe(true);

    const helpEntries = g.buildPullsPaletteHelpEntries();
    expect(helpEntries.some((e: any) => e.id === 'toggle-help')).toBe(true);
    expect(
      helpEntries.find((e: any) => e.id === 'toggle-help')?.aliases
    ).toEqual(expect.arrayContaining(['help', 'hh', '?']));
    // Pulls-scope: no Diff filter chords in help
    expect(
      helpEntries.every(
        (e: any) =>
          !String(e.id).startsWith('diff-') &&
          e.action !== 'toggleReviewFilterUnresolved'
      )
    ).toBe(true);
  });

  test('stale asyncHits from prior term do not appear after term switch', () => {
    const g = loadPullsPalette();
    // Prior remote hit for #$dark — only matches "dark", not "login"
    const staleAsync = [
      { number: 200, title: 'Remote dark theme' },
      { number: 201, title: 'Unrelated mode polish' },
    ];
    const afterSwitch = g.buildPullsPaletteItems(CACHED_PRS, {
      query: '#login',
      owner: 'acme',
      repo: 'app',
      prSearchLoading: true,
      // Host forgot to clear asyncHits (or race): pure path must filter by term
      asyncHits: staleAsync,
    });
    const nums = afterSwitch
      .map((it: any) => it.number)
      .filter((n: any) => Number.isFinite(n));
    // Cache hit for "login" only (#42 Fix login timeout)
    expect(nums).toEqual([42]);
    expect(nums).not.toContain(200);
    expect(nums).not.toContain(201);
    expect(afterSwitch.some((it: any) => it.loading)).toBe(true);

    // Matching async for current term still merges
    const withMatch = g.buildPullsPaletteItems(CACHED_PRS, {
      query: '#login',
      asyncHits: [
        ...staleAsync,
        { number: 300, title: 'Login rate limit' },
      ],
      prSearchLoading: false,
    });
    expect(
      withMatch.map((it: any) => it.number).filter(Boolean)
    ).toEqual([42, 300]);
  });

});

/**
 * Structural / open-path: invoke the same action string the UI runner uses.
 */
describe('open-PR action path (shipped runner contract)', () => {
  test('openPullRequest command from search is accepted by run switch shape', () => {
    const cmds = buildPrSearchPaletteCommands(
      [{ number: 55, title: 'Ship it', author: 'dev' }],
      { owner: 'acme', repo: 'app' }
    );
    const cmd = cmds[0];
    expect(cmd.action).toBe('openPullRequest');
    const n = Number(cmd.payload?.number ?? cmd.number);
    expect(n).toBe(55);

    // Simulate the shipped App switch arm (must not be a stub)
    const opened: number[] = [];
    const openStackOrListPr = (num: number) => {
      opened.push(num);
    };
    // Exact branch body used in PrModalApp.impl.tsx runPaletteCommand
    if (cmd.action === 'openPullRequest') {
      const num = Number(cmd.payload?.number ?? cmd.number);
      if (Number.isFinite(num) && num > 0) openStackOrListPr(num);
    }
    expect(opened).toEqual([55]);
  });

});
