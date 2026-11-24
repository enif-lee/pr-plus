import { describe, expect, test } from '@rstest/core';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as pageEmbed from '../src/modal/lib/page-embed';
import * as listFocus from '../src/pr-list-focus';
import { pullsPaletteApi } from '../src/pulls-palette-actions';

function loadHost(context: vm.Context, ...modules: string[]) {
  for (const name of modules) {
    const source = readFileSync(path.join(__dirname, `../src/host/modules/${name}.ts`), 'utf8');
    vm.runInContext(transformSync(source, { loader: 'ts' }).code, context, { filename: `${name}.ts` });
  }
}

function fixture(pathname: string) {
  const { window } = new JSDOM('<input id="search">', { url: `https://github.com${pathname}` });
  const context = vm.createContext({ window, document: window.document, location: window.location });
  const input = window.document.querySelector('input')!;
  const press = (options: KeyboardEventInit, target: EventTarget = window.document.body) =>
    !target.dispatchEvent(new window.KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true }));
  return { context, input, press };
}

describe('native PR entry shortcut', () => {
  function nativeHost(pathname = '/o/r/pull/19/files') {
    const h = fixture(pathname);
    const opened: any[] = [];
    const current = { open: false, presentation: 'embed' };
    Object.assign(h.context, {
      hostEnabled: true,
      current,
      githubPaletteOpenNow: () => Boolean(h.context.githubPaletteOpen),
      pageEmbedApi: () => pageEmbed,
      parsePrPagePath: pageEmbed.parsePrPagePath,
      isEmbedPresentation: pageEmbed.isEmbedPresentation,
      isPartnerOrShellRuntime: () => false,
      HOST_RUNTIME: 'github',
      GH_PR_TOGGLE_ID: 'prp-toggle',
      openModal: (options: any) => opened.push(options),
    });
    loadHost(h.context, 'host-core-timeline-b');
    vm.runInContext('ensureNativePrOpenShortcut()', h.context);
    return { ...h, opened, current };
  }

  // Option can change the text key on macOS; the physical E still owns the chord.
  const chord = { key: 'Dead', code: 'KeyE', altKey: true, shiftKey: true };

  test('opens on the same physical chord that restores an embed', () => {
    const h = nativeHost();
    expect(pageEmbed.resolveEmbedShortcutAction({
      key: chord.key, code: chord.code, alt: true, shift: true, presentation: 'embed',
    })).toBe('restoreNativeView');
    expect(h.press(chord)).toBe(true);
    expect(h.opened).toEqual([expect.objectContaining({ number: 19, page: 'diff', presentation: 'embed' })]);
  });

  test('leaves the old chord, editing, active shells, and held-key repeats alone', () => {
    const h = nativeHost();
    expect(h.press({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(h.press({ ...chord, ctrlKey: true })).toBe(false);
    h.input.focus();
    expect(h.press(chord, h.input)).toBe(false);
    h.input.blur();
    expect(h.press({ ...chord, repeat: true })).toBe(false);
    h.context.githubPaletteOpen = true;
    expect(h.press(chord)).toBe(false);
    h.context.githubPaletteOpen = false;
    h.current.open = true;
    expect(h.press(chord)).toBe(false);
    h.current.presentation = 'modal';
    expect(h.press(chord)).toBe(false);
    expect(h.opened).toEqual([]);
    expect(nativeHost('/o/r/pulls').press(chord)).toBe(false);
  });
});

describe('/pulls shortcut routing', () => {
  function pullsHost(pathname = '/o/r/pulls') {
    const h = fixture(pathname);
    const executed: any[] = [];
    const steps: number[] = [];
    Object.assign(h.context, {
      hostEnabled: true,
      current: { open: false },
      PRListFocus: listFocus,
      pullsPaletteApi: () => pullsPaletteApi,
      isPullsPaletteOpen: () => Boolean(h.context.pullsPaletteOpen),
      githubPaletteOpenNow: () => false,
      recoverGithubPaletteIfStuck: () => {},
      showPullsListHotkeyHints: () => {},
      stepPullsListFocus: (delta: number) => steps.push(delta),
      recordCommand: (item: any) => executed.push(item),
    });
    loadHost(h.context, 'host-core-timeline-b', 'restore-embed-list-focus', 'pulls-palette-render', 'pulls-palette-keys');
    // Capture the selected command instead of navigating or opening a real PR.
    vm.runInContext('executePullsPaletteCommand = recordCommand; ensurePullsListKeyboard()', h.context);
    const openPalette = (query: string, prSearchLoading = false) => {
      h.input.focus();
      Object.assign(h.context, {
        pullsPaletteOpen: true,
        pullsPaletteQuery: query,
        pullsPaletteFocusIndex: 0,
        pullsPaletteItems: pullsPaletteApi.buildPullsPaletteItems([
          { number: 19, title: 'Dark mode' },
          { number: 13, title: 'Dark theme' },
          { number: 1, title: 'Cleanup', assignees: ['me'] },
        ], { query, prSearchLoading, viewerLogin: 'me' }),
      });
    };
    return { ...h, executed, steps, openPalette };
  }

  const next = { key: '∆', code: 'KeyJ', altKey: true };
  const digit = { key: '¡', code: 'Digit1', altKey: true };

  test('list keys stay on the repository /pulls route', () => {
    const list = pullsHost('/o/r/pulls?state=open');
    expect(list.press(next)).toBe(true);
    expect(list.steps).toEqual([1]);
    expect(pullsHost('/o/r/pullstuff').press(next)).toBe(false);
    expect(pullsHost('/o/r/tree/main/pulls-guide').press(next)).toBe(false);
  });

  test('peer filters do not take over a focused native search input', () => {
    const h = pullsHost();
    const assigned = { key: '˝', code: 'KeyG', altKey: true, shiftKey: true };
    h.input.focus();
    expect(h.press(assigned, h.input)).toBe(false);
    expect(h.executed).toEqual([]);
    h.input.blur();
    expect(h.press(assigned)).toBe(true);
    expect(h.executed).toEqual([expect.objectContaining({ action: 'applyFilter', filterId: 'am' })]);
  });

  test('the first palette open reads the repository cache without an active PR', () => {
    const h = pullsHost();
    Object.assign(h.context, {
      PRPullsPalette: pullsPaletteApi,
      __PR_TREE_APP__: {
        getCachedRepoKey: () => 'o/r',
        getCachedPrs: () => [{ number: 19, title: 'Dark mode' }],
      },
    });
    loadHost(h.context, 'side-fetch-cache-assets', 'pulls-palette-state');
    expect(vm.runInContext('rebuildPullsPaletteItems().map(item => item.number)', h.context)).toEqual([19]);
  });

  test('palette digits open the labeled PRs while search is loading', () => {
    const h = pullsHost();
    h.openPalette('#dark', true);
    expect(h.press(digit, h.input)).toBe(true);
    expect(h.press({ ...digit, key: '™', code: 'Digit2' }, h.input)).toBe(true);
    expect(h.executed.map((item) => item.number)).toEqual([19, 13]);
  });

  test('palette digits select their row; only Enter prefers an exact alias', () => {
    const h = pullsHost();
    h.openPalette('am');
    const item = h.context.pullsPaletteItems.find((entry: any) => entry.number === 1);
    expect(item?.digit).toBeGreaterThan(0);
    expect(h.press({ ...digit, code: `Digit${item.digit}` }, h.input)).toBe(true);
    expect(h.press({ key: 'Enter', code: 'Enter' }, h.input)).toBe(true);
    expect(h.executed).toEqual([
      expect.objectContaining({ action: 'openPullRequest', number: 1 }),
      expect.objectContaining({ action: 'applyFilter', filterId: 'am' }),
    ]);
  });
});
