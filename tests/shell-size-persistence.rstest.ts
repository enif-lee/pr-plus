import { describe, expect, test } from '@rstest/core';
import {
  loadModalSize, saveModalSize, loadSheetWidth, saveSheetWidth,
  loadShellFullscreen, saveShellFullscreen,
} from '../src/modal/lib/shell-size';

function storageFixture() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

describe('shell size persistence across reopen', () => {
  test('restores fullscreen and preserves the windowed sizes for exiting fullscreen', () => {
    const storage = storageFixture();
    saveModalSize(storage, { width: 900, height: 600 });
    saveSheetWidth(storage, 760);
    saveShellFullscreen(storage, true);

    expect(loadShellFullscreen(storage)).toBe(true);
    expect(loadModalSize(storage)).toEqual({ width: 900, height: 600 });
    expect(loadSheetWidth(storage)).toBe(760);

    saveShellFullscreen(storage, false);
    expect(loadShellFullscreen(storage)).toBe(false);
    expect(loadModalSize(storage)).toEqual({ width: 900, height: 600 });
    expect(loadSheetWidth(storage)).toBe(760);
  });

  test('viewport-limited restore does not overwrite the last adjusted size', () => {
    const storage = storageFixture();
    saveModalSize(storage, { width: 1400, height: 900 });
    saveSheetWidth(storage, 1400);
    expect(loadModalSize(storage, { viewportWidth: 920, viewportHeight: 700 }))
      .toEqual({ width: 920, height: 700 });
    expect(loadSheetWidth(storage, { viewportWidth: 920 })).toBe(920);
    expect(loadModalSize(storage)).toEqual({ width: 1400, height: 900 });
    expect(loadSheetWidth(storage)).toBe(1400);
    expect(loadShellFullscreen(storage)).toBe(false);
  });
});
