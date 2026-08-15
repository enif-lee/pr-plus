/**
 * List-leave / reopen first paint: keep warm cache; use sketch/IDB title
 * when memory is empty. Drives shipped detail-idb helpers (host open path).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  shouldKeepCachedDetailOverListSketch,
  chooseOpenFirstPaintDetail,
} from '../src/modal/lib/detail-idb.ts';

const root = resolve(__dirname, '..');

function snapshot(over: Record<string, unknown> = {}) {
  return {
    owner: 'enif-lee',
    repo: 'mornica',
    number: 1,
    title: 'Warm cached title',
    body: 'Cached body markdown',
    milestone: { number: 2, title: 'Board A' },
    ...over,
  };
}

function listSketch(over: Record<string, unknown> = {}) {
  return {
    owner: 'enif-lee',
    repo: 'mornica',
    number: 1,
    title: 'List row title',
    body: '',
    _sketch: true,
    _source: 'list',
    milestone: { number: 3, title: 'List milestone' },
    ...over,
  };
}

describe('shouldKeepCachedDetailOverListSketch (shipped)', () => {
  test('keeps richer title+body when list sketch title/milestone differ', () => {
    const cached = snapshot();
    const sketch = listSketch({
      title: 'Different list title',
      milestone: { number: 9, title: 'Other' },
    });
    expect(shouldKeepCachedDetailOverListSketch(cached, sketch)).toBe(true);
    const picked = chooseOpenFirstPaintDetail({
      memory: cached,
      listSketch: sketch,
    });
    expect(picked.keepCache).toBe(true);
    expect(picked.source).toBe('memory');
    expect(picked.detail).toBe(cached);
    expect(String(picked.detail.title)).toBe(cached.title);
    expect(String(picked.detail.body)).toBe(cached.body);
  });

  test('does not keep an empty memory snapshot', () => {
    expect(shouldKeepCachedDetailOverListSketch(null, listSketch())).toBe(
      false
    );
    expect(shouldKeepCachedDetailOverListSketch({}, listSketch())).toBe(false);
  });
});

describe('chooseOpenFirstPaintDetail (shipped)', () => {
  test('empty memory + list sketch with title → first-paint sketch title', () => {
    const sketch = listSketch({ title: 'From pulls list' });
    const picked = chooseOpenFirstPaintDetail({
      memory: null,
      listSketch: sketch,
    });
    expect(picked.source).toBe('list-sketch');
    expect(picked.keepCache).toBe(false);
    expect(picked.detail).toBe(sketch);
    expect(String(picked.detail.title)).toBe('From pulls list');
  });

  test('empty memory + IDB snapshot with title/body, no list row → IDB fields', () => {
    const idb = snapshot({
      title: 'IDB title',
      body: 'IDB body',
    });
    const picked = chooseOpenFirstPaintDetail({
      memory: null,
      listSketch: null,
      idb,
    });
    expect(picked.source).toBe('idb');
    expect(String(picked.detail.title)).toBe(idb.title);
    expect(String(picked.detail.body)).toBe(idb.body);
  });
});

describe('open-modal-run wiring', () => {
  test('host first-paint uses chooseOpenFirstPaintDetail; no title-mismatch invalidate', () => {
    const src = readFileSync(
      resolve(root, 'src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    expect(src).toMatch(/chooseOpenFirstPaintDetail/);
    expect(src).not.toMatch(/lTitle !== cTitle/);
    expect(src).not.toMatch(/lTitle && cTitle && lTitle !== cTitle/);
  });
});
