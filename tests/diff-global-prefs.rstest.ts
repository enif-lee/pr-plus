/**
 * Global Diff prefs (hide whitespace + hide outdated + word highlight/strike).
 */
import { describe, expect, test } from '@rstest/core';
import {
  type DiffGlobalPrefs,
  DEFAULT_DIFF_GLOBAL_PREFS,
  DIFF_GLOBAL_PREFS_KEY,
  loadDiffGlobalPrefs,
  normalizeDiffGlobalPrefs,
  parseDiffGlobalPrefs,
  resolveDiffGlobalPrefsStorage,
  saveDiffGlobalPrefs,
  serializeDiffGlobalPrefs,
} from '../src/modal/lib/diff-global-prefs.ts';

/** In-memory Storage fake for injected load/save. */
function makeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
    get raw() {
      return map;
    },
  };
}

describe('normalizeDiffGlobalPrefs / parse', () => {
  test('defaults for null/garbage', () => {
    expect(normalizeDiffGlobalPrefs(null)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(normalizeDiffGlobalPrefs(undefined)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(normalizeDiffGlobalPrefs('nope')).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(normalizeDiffGlobalPrefs(42)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(parseDiffGlobalPrefs('')).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(parseDiffGlobalPrefs('{not json')).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(parseDiffGlobalPrefs(null)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
  });

  test('booleans from object', () => {
    expect(
      normalizeDiffGlobalPrefs({ hideWhitespace: true, hideOutdated: false })
    ).toEqual({
      diffMode: 'unified',
      hideWhitespace: true,
      hideOutdated: false,
      wordHighlight: true,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(
      normalizeDiffGlobalPrefs({ hideWhitespace: 1, hideOutdated: 'yes' })
    ).toEqual({
      diffMode: 'unified',
      hideWhitespace: true,
      hideOutdated: true,
      wordHighlight: true,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(
      normalizeDiffGlobalPrefs({
        diffMode: 'unified',
        hideWhitespace: false,
        hideOutdated: false,
        wordHighlight: false,
        wordStrike: false,
        dimUnfocusedFiles: false,
      })
    ).toEqual({
      diffMode: 'unified',
      hideWhitespace: false,
      hideOutdated: false,
      wordHighlight: false,
      wordStrike: false,
      dimUnfocusedFiles: false,
    });
  });

  test('missing wordHighlight / wordStrike / dimUnfocusedFiles default on (legacy storage)', () => {
    expect(normalizeDiffGlobalPrefs({ hideWhitespace: true }).wordHighlight).toBe(
      true
    );
    expect(normalizeDiffGlobalPrefs({ hideWhitespace: true }).wordStrike).toBe(
      true
    );
    expect(
      normalizeDiffGlobalPrefs({ hideWhitespace: true }).dimUnfocusedFiles
    ).toBe(true);
  });
});

test('diff mode defaults for legacy / invalid values and preserves split', () => {
  expect(parseDiffGlobalPrefs('{"hideWhitespace":true}').diffMode).toBe('unified');
  expect(normalizeDiffGlobalPrefs({ diffMode: 'invalid' }).diffMode).toBe('unified');
  expect(normalizeDiffGlobalPrefs({ diffMode: 'split' }).diffMode).toBe('split');
});

describe('loadDiffGlobalPrefs / saveDiffGlobalPrefs round-trip', () => {
  test('missing storage → defaults, no throw', () => {
    expect(loadDiffGlobalPrefs(null)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(loadDiffGlobalPrefs(undefined)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(loadDiffGlobalPrefs({} as any)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    expect(saveDiffGlobalPrefs(null, { hideWhitespace: true })).toBe(false);
  });

  test('corrupt stored value falls back without throw', () => {
    const s = makeStorage({ [DIFF_GLOBAL_PREFS_KEY]: '%%%corrupt' });
    expect(loadDiffGlobalPrefs(s)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
    const s2 = makeStorage({ [DIFF_GLOBAL_PREFS_KEY]: '{"hideWhitespace":' });
    expect(loadDiffGlobalPrefs(s2)).toEqual(DEFAULT_DIFF_GLOBAL_PREFS);
  });

  test('write both true/false combos and read back', () => {
    const cases: Array<DiffGlobalPrefs> = [
      {
        diffMode: 'unified',
        hideWhitespace: false,
        hideOutdated: false,
        wordHighlight: true,
        wordStrike: true,
        dimUnfocusedFiles: true,
      },
      {
        diffMode: 'split',
        hideWhitespace: true,
        hideOutdated: false,
        wordHighlight: false,
        wordStrike: true,
        dimUnfocusedFiles: false,
      },
      {
        diffMode: 'unified',
        hideWhitespace: false,
        hideOutdated: true,
        wordHighlight: true,
        wordStrike: false,
        dimUnfocusedFiles: true,
      },
      {
        diffMode: 'unified',
        hideWhitespace: true,
        hideOutdated: true,
        wordHighlight: false,
        wordStrike: false,
        dimUnfocusedFiles: false,
      },
    ];
    for (const c of cases) {
      const s = makeStorage();
      expect(saveDiffGlobalPrefs(s, c)).toBe(true);
      expect(loadDiffGlobalPrefs(s)).toEqual(c);
      // raw key written as JSON
      const raw = s.getItem(DIFF_GLOBAL_PREFS_KEY);
      expect(raw).toBe(serializeDiffGlobalPrefs(c));
      expect(parseDiffGlobalPrefs(raw)).toEqual(c);
    }
  });

  test('partial save merges with previous', () => {
    const s = makeStorage();
    expect(saveDiffGlobalPrefs(s, { hideWhitespace: true })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: true,
      hideOutdated: false,
      wordHighlight: true,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(saveDiffGlobalPrefs(s, { hideOutdated: true })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: true,
      hideOutdated: true,
      wordHighlight: true,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(saveDiffGlobalPrefs(s, { hideWhitespace: false })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: false,
      hideOutdated: true,
      wordHighlight: true,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(saveDiffGlobalPrefs(s, { wordHighlight: false })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: false,
      hideOutdated: true,
      wordHighlight: false,
      wordStrike: true,
      dimUnfocusedFiles: true,
    });
    expect(saveDiffGlobalPrefs(s, { wordStrike: false })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: false,
      hideOutdated: true,
      wordHighlight: false,
      wordStrike: false,
      dimUnfocusedFiles: true,
    });
    expect(saveDiffGlobalPrefs(s, { dimUnfocusedFiles: false })).toBe(true);
    expect(loadDiffGlobalPrefs(s)).toEqual({
      diffMode: 'unified',
      hideWhitespace: false,
      hideOutdated: true,
      wordHighlight: false,
      wordStrike: false,
      dimUnfocusedFiles: false,
    });
  });

  test('resolveDiffGlobalPrefsStorage prefers localStorage', () => {
    const local = makeStorage();
    const session = makeStorage();
    const resolved = resolveDiffGlobalPrefsStorage({
      localStorage: local as any,
      sessionStorage: session as any,
    });
    expect(resolved).toBe(local as any);
    expect(
      resolveDiffGlobalPrefsStorage({
        sessionStorage: session as any,
      })
    ).toBe(session as any);
    expect(resolveDiffGlobalPrefsStorage(null)).toBe(null);
  });
});

test('real store setter saves display mode for other PRs and future mounts', () => {
  const { useModalStore } = require('../src/modal/store/modal-store') as typeof import('../src/modal/store/modal-store');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousMode = useModalStore.getState().diffMode;
  const storage = makeStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  try {
    saveDiffGlobalPrefs(storage, { hideWhitespace: true, wordHighlight: false });
    useModalStore.getState().setDiffMode('split');
    useModalStore.getState().resetForClose();
    expect(useModalStore.getState().diffMode).toBe('split');
    expect(loadDiffGlobalPrefs(storage)).toMatchObject({ diffMode: 'split', hideWhitespace: true, wordHighlight: false });
    useModalStore.getState().setDiffMode('unified');
    expect(loadDiffGlobalPrefs(storage).diffMode).toBe('unified');
  } finally {
    useModalStore.getState().setDiffMode(previousMode);
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else delete (globalThis as any).window;
  }
});
