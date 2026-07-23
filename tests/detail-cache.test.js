const assert = require('node:assert/strict');
const { createDetailCache } = require('../src/modal/lib/detail-cache.ts');

let clock = 1_000_000;
const cache = createDetailCache({
  ttlMs: 1_000,
  now: () => clock,
});

const key = cache.cacheKey('Owner', 'Repo', 42);
assert.equal(key, 'owner/repo#42');

assert.equal(cache.get(key), null);
assert.equal(cache.peek(key).value, null);
assert.equal(cache.peek(key).fresh, false);
assert.equal(cache.peek(key).stale, false);

const detail = { number: 42, title: 'cached' };
cache.set(key, detail);
assert.deepEqual(cache.get(key), detail);
assert.equal(cache.peek(key).fresh, true);
assert.equal(cache.peek(key).stale, false);
assert.equal(cache.size(), 1);

// Still fresh inside TTL
clock += 500;
assert.deepEqual(cache.get(key), detail);

// Expire → get returns null, peek returns stale value for SWR
clock += 600;
assert.equal(cache.get(key), null);
const stalePeek = cache.peek(key);
assert.equal(stalePeek.fresh, false);
assert.equal(stalePeek.stale, true);
assert.deepEqual(stalePeek.value, detail);

// Re-set after stale
cache.set(key, { number: 42, title: 'fresh' });
assert.equal(cache.get(key).title, 'fresh');

cache.invalidate(key);
assert.equal(cache.get(key), null);

cache.set(key, detail);
cache.clear();
assert.equal(cache.size(), 0);

console.log('detail-cache.test.js: all assertions passed');
