/** Extension-origin PR detail IndexedDB (service worker). */

import { createDetailIdb, type DetailIdb } from '../modal/lib/detail-idb';
import { MSG } from '../sw-messages';
import type { SwMessage } from '../sw-messages';

const DB_NAME = 'pr-plus-detail-cache';

let idb: DetailIdb | null = null;

export function getExtensionDetailIdb(): DetailIdb {
  if (!idb) {
    idb = createDetailIdb({
      dbName: DB_NAME,
      maxEntries: 24,
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });
  }
  return idb;
}

/** Tests only. */
export function setExtensionDetailIdbForTests(next: DetailIdb | null) {
  idb = next;
}

export async function handleDetailCacheMessage(
  message: SwMessage
): Promise<unknown> {
  switch (message.type) {
    case MSG.DETAIL_CACHE_GET: {
      const key = String(message.key || '');
      const row = key ? await getExtensionDetailIdb().get(key) : null;
      return { ok: true, row };
    }
    case MSG.DETAIL_CACHE_SET: {
      const key = String(message.key || '');
      if (!key) return { ok: false, error: 'key required' };
      await getExtensionDetailIdb().set(key, message.value);
      return { ok: true };
    }
    case MSG.DETAIL_CACHE_DELETE: {
      const key = String(message.key || '');
      if (key) await getExtensionDetailIdb().delete(key);
      return { ok: true };
    }
    case MSG.DETAIL_CACHE_CLEAR: {
      await getExtensionDetailIdb().clear();
      return { ok: true };
    }
    default:
      return undefined;
  }
}
