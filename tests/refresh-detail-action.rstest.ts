/**
 * Refresh PR detail — palette + Opt peer (⌥⇧G).
 */
import { describe, expect, test } from '@rstest/core';
import {
  optShortcutForCommandId,
  resolvePrModalOptAction,
} from '../src/modal/lib/command-palette-opt';

describe('refreshDetail Opt peer', () => {
  test('⌥⇧G → refreshDetail', () => {
    const peer = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      key: 'g',
      code: 'KeyG',
    });
    expect(peer?.action).toBe('refreshDetail');
    expect(peer?.id).toBe('opt-refresh');
    expect(peer?.labelMac).toBe('⌥⇧G');
  });

  test('plain ⌥G is not refresh', () => {
    const peer = resolvePrModalOptAction({
      alt: true,
      shift: false,
      mod: false,
      code: 'KeyG',
    });
    expect(peer?.action === 'refreshDetail').toBe(false);
  });

  test('optShortcutForCommandId refresh-pr', () => {
    expect(optShortcutForCommandId('refresh-pr')).toBe('opt+shift+g');
  });
});

describe('refresh wiring (static shipped sources)', () => {
  test('palette + header + runner share refreshDetail', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const palette = fs.readFileSync(
      path.join(root, 'src/modal/lib/command-palette-build.ts'),
      'utf8'
    );
    const runner = fs.readFileSync(
      path.join(root, 'src/modal/app/pr-modal-run-palette.ts'),
      'utf8'
    );
    const header = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/Header.tsx'),
      'utf8'
    );
    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(palette).toMatch(/refresh-pr/);
    expect(palette).toMatch(/refreshDetail/);
    expect(palette).toMatch(/opt\+shift\+g/);
    expect(runner).toMatch(/case 'refreshDetail'/);
    expect(runner).toMatch(/onRefresh/);
    expect(header).toMatch(/⌥⇧G/);
    expect(header).toMatch(/data-prp-refresh/);
    expect(app).toMatch(/function refreshDetail/);
    expect(app).toMatch(/data-prp-refresh-seq/);
    expect(app).toMatch(/onRefresh: refreshDetail/);
  });
});
