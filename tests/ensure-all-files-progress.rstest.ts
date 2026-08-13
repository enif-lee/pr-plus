/**
 * Diff ensureAllFiles reports header loading via detail-ui-store (busy mode).
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDetailUiStore } from '../src/modal/store/detail-ui-store.ts';

const root = resolve(__dirname, '..');

beforeEach(() => {
  useDetailUiStore.getState().resetDetailUi();
});

describe('detail-ui-store diff loading mode (shipped)', () => {
  test('setDiffLoading + clearLoadStage round-trip', () => {
    const s = useDetailUiStore.getState();
    s.setDiffLoading(true);
    expect(useDetailUiStore.getState().loadBusy).toBe(true);
    s.setLoadStage({ busy: false });
    expect(useDetailUiStore.getState().loadBusy).toBe(false);
    s.setLoadStage({ busy: true });
    expect(useDetailUiStore.getState().loadBusy).toBe(true);
    s.clearLoadStage();
    expect(useDetailUiStore.getState().loadBusy).toBe(false);
  });
});

describe('ensureAllFiles progress wiring (structural)', () => {
  test('PrModalApp ensureAllFiles drives detail-ui-store loading mode', () => {
    const src = [
      'src/modal/app/PrModalShell.tsx',
      'src/modal/hooks/useEnsureDiffLoads.ts',
    ]
      .map((rel) => readFileSync(resolve(root, rel), 'utf8'))
      .join('\n');
    expect(src).toMatch(/useDetailUiStore/);
    expect(src).toMatch(/const ensureAllFiles = useCallback/);
    expect(src).toMatch(/setDiffLoading\(true\)/);
    expect(src).toMatch(/setDiffLoading\(false\)/);
    expect(src).toMatch(/setFileListLoading\(true\)/);
  });

  test('HeaderStats uses loading mode on the diff-stat pill (no stage bar)', () => {
    const src = readFileSync(
      resolve(root, 'src/modal/views/chrome/HeaderStats.tsx'),
      'utf8'
    );
    expect(src).toMatch(/useDetailUiStore/);
    expect(src).toMatch(/hostLoading \|\| storeBusy/);
    expect(src).toMatch(/data-stats-mode=\{loading \? 'metrics-loading' : 'metrics'\}/);
    expect(src).not.toMatch(/prp-header__stats--busy/);
    expect(src).not.toMatch(/prp-header__stats-pct/);
    expect(src).not.toMatch(/data-load-percent/);
    expect(src).not.toMatch(/showStage/);
  });
});
