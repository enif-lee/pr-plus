/**
 * Extension SW detail-cache RPC (not page-origin IDB).
 */
import { afterEach, describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { MSG } from '../src/sw-messages';
import {
  handleDetailCacheMessage,
  setExtensionDetailIdbForTests,
} from '../src/background/sw-detail-cache';

const root = path.join(__dirname, '..');

function memIdb() {
  const map = new Map<string, { key: string; value: unknown }>();
  return {
    get: async (key: string) => map.get(key) || null,
    set: async (key: string, value: unknown) => {
      map.set(key, { key, value, updatedAt: 1, accessedAt: 1 });
    },
    delete: async (key: string) => {
      map.delete(key);
    },
    clear: async () => {
      map.clear();
    },
    _map: map,
  };
}

describe('extension SW detail cache', () => {
  afterEach(() => {
    setExtensionDetailIdbForTests(null);
  });

  test('GET/SET/DELETE round-trip through handleDetailCacheMessage', async () => {
    const store = memIdb();
    setExtensionDetailIdbForTests(store as any);
    const key = 'rtzr/iac#1911';
    const value = { owner: 'rtzr', repo: 'iac', number: 1911, title: 'hook' };
    const set = await handleDetailCacheMessage({
      type: MSG.DETAIL_CACHE_SET,
      key,
      value,
    });
    expect(set).toEqual({ ok: true });
    const got = (await handleDetailCacheMessage({
      type: MSG.DETAIL_CACHE_GET,
      key,
    })) as any;
    expect(got.ok).toBe(true);
    expect(got.row?.value).toEqual(value);
    await handleDetailCacheMessage({ type: MSG.DETAIL_CACHE_DELETE, key });
    const miss = (await handleDetailCacheMessage({
      type: MSG.DETAIL_CACHE_GET,
      key,
    })) as any;
    expect(miss.row).toBe(null);
  });

  test('CLEAR wipes all rows', async () => {
    const store = memIdb();
    setExtensionDetailIdbForTests(store as any);
    await handleDetailCacheMessage({
      type: MSG.DETAIL_CACHE_SET,
      key: 'a/b#1',
      value: { number: 1 },
    });
    await handleDetailCacheMessage({ type: MSG.DETAIL_CACHE_CLEAR });
    expect(store._map.size).toBe(0);
  });

  test('host peeks extension SW IDB, not page origin, including partner', () => {
    const assets = fs.readFileSync(
      path.join(root, 'src/host/modules/side-fetch-cache-assets.ts'),
      'utf8'
    );
    expect(assets).not.toMatch(
      /isPartnerOrShellRuntime\(\)\) \{\s*return emptyPeek/
    );
    const progress = fs.readFileSync(
      path.join(root, 'src/host/modules/side-fetch-progress.ts'),
      'utf8'
    );
    expect(progress).toMatch(/PR_TREE_DETAIL_CACHE_GET/);
    expect(progress).toMatch(/createExtensionDetailIdb/);
    expect(progress).not.toMatch(/PRModalDetailIdb\?\.createDetailIdb/);
    expect(fs.readFileSync(path.join(root, 'src/sw-messages.ts'), 'utf8')).toMatch(
      /DETAIL_CACHE_GET/
    );
  });
});
