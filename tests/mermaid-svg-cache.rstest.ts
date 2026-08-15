/**
 * Module LRU for Mermaid SVG — survives Conversation virtual-list remount.
 * Drives shipped helpers in mermaid-svg-cache.ts + wiring in MermaidBlock.
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearMermaidSvgCache,
  getMermaidSvgCache,
  hasMermaidSvgCache,
  MERMAID_SVG_CACHE_MAX,
  mermaidSvgCacheSize,
  setMermaidSvgCache,
} from '../src/modal/lib/mermaid-svg-cache.ts';
import {
  mermaidSourceKey,
  shouldRunMermaidHeavyWork,
} from '../src/modal/lib/scroll-idle-render.ts';

const root = resolve(__dirname, '..');

beforeEach(() => {
  clearMermaidSvgCache();
});

describe('mermaid-svg-cache (shipped pure LRU)', () => {
  test('set then get returns fitted + full SVG', () => {
    const key = mermaidSourceKey('graph TD; A-->B', 'neutral');
    setMermaidSvgCache(key, {
      svgFitted: '<svg data-fit="1"/>',
      svgFull: '<svg data-full="1"/>',
    });
    expect(hasMermaidSvgCache(key)).toBe(true);
    const hit = getMermaidSvgCache(key);
    expect(hit?.svgFitted).toBe('<svg data-fit="1"/>');
    expect(hit?.svgFull).toBe('<svg data-full="1"/>');
    expect(mermaidSvgCacheSize()).toBe(1);
  });

  test('miss / empty key returns null', () => {
    expect(getMermaidSvgCache('nope')).toBe(null);
    expect(getMermaidSvgCache('')).toBe(null);
    expect(getMermaidSvgCache(null)).toBe(null);
    setMermaidSvgCache('k', { svgFitted: '' });
    expect(getMermaidSvgCache('k')).toBe(null);
  });

  test('LRU evicts oldest past maxSize', () => {
    for (let i = 0; i < 5; i++) {
      setMermaidSvgCache(`k${i}`, { svgFitted: `<svg id="${i}"/>` }, { maxSize: 3 });
    }
    expect(mermaidSvgCacheSize()).toBe(3);
    expect(getMermaidSvgCache('k0')).toBe(null);
    expect(getMermaidSvgCache('k1')).toBe(null);
    expect(getMermaidSvgCache('k2')?.svgFitted).toBe('<svg id="2"/>');
    expect(getMermaidSvgCache('k4')?.svgFitted).toBe('<svg id="4"/>');
  });

  test('get promotes entry to most-recent (LRU touch)', () => {
    setMermaidSvgCache('a', { svgFitted: '<svg a/>' }, { maxSize: 2 });
    setMermaidSvgCache('b', { svgFitted: '<svg b/>' }, { maxSize: 2 });
    // Touch a so b is oldest
    expect(getMermaidSvgCache('a')?.svgFitted).toBe('<svg a/>');
    setMermaidSvgCache('c', { svgFitted: '<svg c/>' }, { maxSize: 2 });
    expect(getMermaidSvgCache('b')).toBe(null);
    expect(getMermaidSvgCache('a')?.svgFitted).toBe('<svg a/>');
    expect(getMermaidSvgCache('c')?.svgFitted).toBe('<svg c/>');
  });

  test('theme is part of key (light vs dark independent)', () => {
    const light = mermaidSourceKey('graph TD; A-->B', 'neutral');
    const dark = mermaidSourceKey('graph TD; A-->B', 'dark');
    setMermaidSvgCache(light, { svgFitted: '<svg light/>' });
    expect(getMermaidSvgCache(dark)).toBe(null);
    setMermaidSvgCache(dark, { svgFitted: '<svg dark/>' });
    expect(getMermaidSvgCache(light)?.svgFitted).toBe('<svg light/>');
    expect(getMermaidSvgCache(dark)?.svgFitted).toBe('<svg dark/>');
  });

  test('default max constant is positive', () => {
    expect(MERMAID_SVG_CACHE_MAX).toBeGreaterThanOrEqual(16);
  });

  test('clear empties store', () => {
    setMermaidSvgCache('x', { svgFitted: '<svg/>' });
    clearMermaidSvgCache();
    expect(mermaidSvgCacheSize()).toBe(0);
  });
});

describe('MermaidBlock wires module cache (structural)', () => {
  test('imports and writes module LRU on successful render', () => {
    const mmd = readFileSync(
      resolve(root, 'src/modal/components/common/MermaidBlock.tsx'),
      'utf8'
    );
    expect(mmd).toMatch(/getMermaidSvgCache/);
    expect(mmd).toMatch(/setMermaidSvgCache/);
    expect(mmd).toMatch(/mermaid-svg-cache/);
    // Remount path restores then returns without eng.render
    expect(mmd).toMatch(/moduleHit\?\.svgFitted/);
    expect(mmd).toMatch(/return undefined/);
  });
});

/**
 * Simulate remount decision pure path used by MermaidBlock:
 * after set, get on same key must skip heavy work.
 */
describe('remount skip contract (pure)', () => {
  test('after first paint cache, remount key hasCachedResult equivalent', () => {
    const key = mermaidSourceKey('sequenceDiagram\nA->>B: hi', 'neutral');
    // First paint stores
    setMermaidSvgCache(key, {
      svgFitted: '<svg width="10" height="10"/>',
      svgFull: '<svg width="100" height="100"/>',
    });
    // Remount: only module store (no component ref)
    const hit = getMermaidSvgCache(key);
    expect(hit).not.toBe(null);
    // Gate: with module hit, heavy work must not start (MermaidBlock early-returns)
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: false,
        hasCachedResult: Boolean(hit?.svgFitted),
        sourceKey: key,
        cachedSourceKey: key,
      })
    ).toBe(false);
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: true,
        hasCachedResult: Boolean(hit?.svgFitted),
        sourceKey: key,
        cachedSourceKey: key,
      })
    ).toBe(false);
  });
});
