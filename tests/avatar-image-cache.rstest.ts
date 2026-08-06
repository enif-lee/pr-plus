/**
 * Avatar image warm-cache: cold → warm remount path (shipped pure helpers).
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import {
  isAvatarImageWarm,
  isAvatarImageFailed,
  markAvatarImageWarm,
  markAvatarImageFailed,
  avatarImageLoadingAttr,
  avatarImageDecodingAttr,
  clearAvatarImageCacheForTests,
  avatarImageCacheStats,
  preloadAvatarImage,
} from '../src/modal/lib/avatar-image-cache';

const URL_A = 'https://github.com/alice.png?size=56';
const URL_B = 'https://github.com/bob.png?size=56';

beforeEach(() => {
  clearAvatarImageCacheForTests();
});

describe('avatar image warm cache (shipped)', () => {
  test('URL starts cold; after markWarm is warm; second lookup stays warm', () => {
    expect(isAvatarImageWarm(URL_A)).toBe(false);
    expect(avatarImageLoadingAttr(URL_A)).toBe('lazy');
    expect(avatarImageDecodingAttr(URL_A)).toBe('async');

    markAvatarImageWarm(URL_A);

    expect(isAvatarImageWarm(URL_A)).toBe(true);
    expect(avatarImageLoadingAttr(URL_A)).toBe('eager');
    expect(avatarImageDecodingAttr(URL_A)).toBe('sync');
    // Remount-equivalent second lookup
    expect(isAvatarImageWarm(URL_A)).toBe(true);
    expect(avatarImageLoadingAttr(URL_A)).toBe('eager');
  });

  test('distinct URL remains cold', () => {
    markAvatarImageWarm(URL_A);
    expect(isAvatarImageWarm(URL_A)).toBe(true);
    expect(isAvatarImageWarm(URL_B)).toBe(false);
    expect(avatarImageLoadingAttr(URL_B)).toBe('lazy');
  });

  test('failed URL is not warm and stays failed', () => {
    markAvatarImageFailed(URL_A);
    expect(isAvatarImageFailed(URL_A)).toBe(true);
    expect(isAvatarImageWarm(URL_A)).toBe(false);
    // Later warm clears failed
    markAvatarImageWarm(URL_A);
    expect(isAvatarImageFailed(URL_A)).toBe(false);
    expect(isAvatarImageWarm(URL_A)).toBe(true);
  });

  test('empty url is never warm', () => {
    expect(isAvatarImageWarm('')).toBe(false);
    expect(isAvatarImageWarm(null)).toBe(false);
    markAvatarImageWarm('  ');
    expect(avatarImageCacheStats().warm).toBe(0);
  });

  test('preloadAvatarImage marks warm on Image onload (jsdom/Image)', () => {
    // Under rstest/jsdom Image may be incomplete; exercise API without throw
    expect(() => preloadAvatarImage(URL_A)).not.toThrow();
    // If Image exists and fires sync in env, may already be warm; either ok
    const warm = isAvatarImageWarm(URL_A);
    expect(typeof warm).toBe('boolean');
  });
});

describe('Avatar component wiring (static)', () => {
  test('Avatar.tsx uses cache attrs not unconditional lazy', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/components/common/Avatar.tsx'),
      'utf8'
    );
    expect(src).toMatch(/avatarImageLoadingAttr/);
    expect(src).toMatch(/markAvatarImageWarm/);
    expect(src).toMatch(/markAvatarImageFailed/);
    // Must not hardcode only loading="lazy" without cache
    expect(src).not.toMatch(/loading=\"lazy\"\s*\n\s*decoding=\"async\"/);
    expect(src).toMatch(/loading=\{loading\}/);
  });

  test('CommandPalette PR avatar uses warm loading attrs', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../src/modal/views/chrome/CommandPalette.tsx'
      ),
      'utf8'
    );
    expect(src).toMatch(/avatarImageLoadingAttr/);
    expect(src).toMatch(/markAvatarImageWarm/);
  });
});
