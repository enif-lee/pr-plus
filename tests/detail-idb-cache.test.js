/**
 * IndexedDB-backed PR detail cache (uses pure content-script modules).
 */
const assert = require('node:assert/strict');
const {
  createDetailIdb,
  sanitizeDetailForCache,
} = require('../src/modal/pure/detail-idb-cache.js');
const {
  createPersistedDetailCache,
  createDetailCache,
} = require('../src/modal/pure/detail-cache.js');

async function main() {
  // --- sanitize ---
  {
    const raw = {
      number: 1,
      title: 't',
      _fetchTimings: { a: 1 },
      _metaSeq: 9,
    };
    const clean = sanitizeDetailForCache(raw);
    assert.equal(clean.title, 't');
    assert.equal(clean._fetchTimings, undefined);
    assert.equal(clean._metaSeq, undefined);
  }

  // --- fake IDB adapter ---
  function createMemoryIdb() {
    const rows = new Map();
    return {
      async get(key) {
        return rows.get(key) || null;
      },
      async set(key, value) {
        const t = Date.now();
        rows.set(key, {
          key,
          value: sanitizeDetailForCache(value),
          updatedAt: t,
          accessedAt: t,
        });
      },
      async delete(key) {
        rows.delete(key);
      },
      async clear() {
        rows.clear();
      },
    };
  }

  // --- persisted SWR ---
  {
    let clock = 1_000_000;
    const idb = createMemoryIdb();
    const cache = createPersistedDetailCache({
      ttlMs: 1_000,
      now: () => clock,
      idb,
    });

    const key = cache.cacheKey('Acme', 'app', 7);
    assert.equal(key, 'acme/app#7');

    const detail = {
      owner: 'Acme',
      repo: 'app',
      number: 7,
      title: 'First',
      files: [{ filename: 'a.js', patch: '@@ huge', additions: 1 }],
      reviewComments: [{ id: 1, body: 'hi' }],
      _fetchTimings: { x: 1 },
    };
    cache.set(key, detail);

    const mem = cache.peek(key);
    assert.equal(mem.fresh, true);
    assert.equal(mem.value.title, 'First');
    assert.equal(mem.value._fetchTimings, undefined, 'ephemeral stripped in memory');

    // IDB write is fire-and-forget (microtask)
    await new Promise((r) => setTimeout(r, 0));
    const row = await idb.get(key);
    assert.ok(row, 'IDB write-through');
    assert.equal(row.value.title, 'First');
    assert.equal(row.value.reviewComments.length, 1);
    // Incomplete (no commits) → slim; full snapshots tested in detail-cache-full.test.js
    assert.equal(row.value.files[0].patch, '', 'incomplete IDB drops patches');
    assert.equal(row.value.files[0]._patchOmitted, true);

    // Simulate page reload: empty memory, hydrate from IDB
    const cold = createPersistedDetailCache({
      ttlMs: 1_000,
      now: () => clock,
      idb,
    });
    assert.equal(cold.peek(key).value, null);

    const hydrated = await cold.peekAsync(key);
    assert.equal(hydrated.source, 'idb');
    assert.equal(hydrated.value.title, 'First');
    assert.equal(hydrated.stale, false);
    assert.equal(cold.peek(key).source, 'memory');
    assert.equal(cold.peek(key).value.title, 'First');

    clock += 5_000;
    const stale = cold.peek(key);
    assert.equal(stale.stale, true);
    assert.equal(stale.value.title, 'First');

    cold.invalidate(key);
    assert.equal(cold.peek(key).value, null);
    assert.equal(await idb.get(key), null);
  }

  // Memory-only when idb disabled
  {
    const cache = createPersistedDetailCache({ idb: null, ttlMs: 1000 });
    const key = cache.cacheKey('o', 'r', 1);
    cache.set(key, { number: 1 });
    const p = await cache.peekAsync(key);
    assert.equal(p.value.number, 1);
  }

  // Base memory cache
  {
    const m = createDetailCache({ ttlMs: 100 });
    m.set('k', { a: 1 });
    assert.deepEqual(m.get('k'), { a: 1 });
  }

  // createDetailIdb factory exists (no real IDB in node)
  {
    assert.equal(typeof createDetailIdb, 'function');
    const store = createDetailIdb({ indexedDB: null });
    assert.equal(await store.get('x'), null);
    await store.set('x', { n: 1 }); // no-op without factory
  }

  console.log('detail-idb-cache.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
