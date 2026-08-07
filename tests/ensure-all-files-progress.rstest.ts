/**
 * Diff ensureAllFiles reports header progress via detail-ui-store.
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDetailUiStore } from '../src/modal/store/detail-ui-store.ts';

const root = resolve(__dirname, '..');

beforeEach(() => {
  useDetailUiStore.getState().resetDetailUi();
});

describe('detail-ui-store load stage (shipped)', () => {
  test('setLoadStage + clearLoadStage round-trip', () => {
    const s = useDetailUiStore.getState();
    s.setLoadStage({
      busy: true,
      label: 'Loading files 0/12',
      percent: 18,
    });
    expect(useDetailUiStore.getState().loadBusy).toBe(true);
    expect(useDetailUiStore.getState().loadLabel).toMatch(/Loading files/);
    expect(useDetailUiStore.getState().loadPercent).toBe(18);
    s.clearLoadStage();
    expect(useDetailUiStore.getState().loadBusy).toBe(false);
    expect(useDetailUiStore.getState().loadLabel).toBe(null);
    expect(useDetailUiStore.getState().loadPercent).toBe(null);
  });
});

describe('ensureAllFiles progress wiring (structural)', () => {
  test('PrModalApp ensureAllFiles drives detail-ui-store load stage', () => {
    const src = readFileSync(
      resolve(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(src).toMatch(/useDetailUiStore/);
    expect(src).toMatch(/const ensureAllFiles = useCallback/);
    // Start / mid / settle labels (i18n keys; catalogs hold English copy)
    expect(src).toMatch(/progress_loading_files/);
    expect(src).toMatch(/progress_loading_all_files|progress_loading_files_n/);
    expect(src).toMatch(/setLoadStage\(\{\s*busy:\s*true/);
    expect(src).toMatch(/clearLoadStage/);
    // Still sets file tree busy flag
    expect(src).toMatch(/setFileListLoading\(true\)/);
  });

  test('HeaderStats prefers busy store stage when host bar idle', () => {
    const src = readFileSync(
      resolve(root, 'src/modal/views/chrome/HeaderStats.tsx'),
      'utf8'
    );
    expect(src).toMatch(/storeBusy && storeLabel && !hostBusy/);
    expect(src).toMatch(/useDetailUiStore/);
  });

  test('host loadStageLabel knows files-all', () => {
    const src = readFileSync(
      resolve(root, 'src/host/modules/side-fetch-progress.ts'),
      'utf8'
    );
    // Inline map uses if (k === 'files-all' …) + i18n keys
    expect(src).toMatch(/files-all/);
    expect(src).toMatch(/load_stage_files_all|Loading all files/);
  });
});
