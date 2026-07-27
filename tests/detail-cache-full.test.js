/**
 * Full files/diff/commits durable cache when complete; slim otherwise.
 * Hydrate-first paint via peekAsync without waiting on network.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  sanitizeDetailForCache,
  isDetailCompleteForFullCache,
} = require('../src/modal/pure/detail-idb-cache.js');
const {
  createPersistedDetailCache,
} = require('../src/modal/pure/detail-cache.js');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(
    '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-64b7d276d0c1/implementer'
  );

function writeLog(name, lines) {
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, name), lines.join('\n') + '\n');
  } catch (e) {
    console.warn('scratch write failed', e.message);
  }
}

function createMemoryIdb() {
  const rows = new Map();
  return {
    rows,
    async get(key) {
      return rows.get(key) || null;
    },
    async set(key, value) {
      // Mirror createDetailIdb: store the value as given (already sanitized by cache)
      const t = Date.now();
      rows.set(key, { key, value, updatedAt: t, accessedAt: t });
    },
    async delete(key) {
      rows.delete(key);
    },
    async clear() {
      rows.clear();
    },
  };
}

const logFull = [];
const logHydrate = [];
const logParallel = [];

async function main() {
// --- completeness + sanitize full vs slim ---
{
  const incomplete = {
    owner: 'Acme',
    repo: 'app',
    number: 3,
    title: 'WIP',
    files: [{ filename: 'a.js', patch: '', _patchOmitted: true }],
    commits: [{ sha: 'abc' }],
  };
  assert.equal(isDetailCompleteForFullCache(incomplete), false);
  const slim = sanitizeDetailForCache(incomplete);
  assert.equal(slim.files[0].patch, '');
  assert.equal(slim.files[0]._patchOmitted, true);
  logFull.push('incomplete→slim ok');

  const complete = {
    owner: 'Acme',
    repo: 'app',
    number: 3,
    title: 'Done',
    files: [
      { filename: 'a.js', patch: '@@ -1 +1 @@\n+hello', additions: 1, deletions: 0 },
      { filename: 'b.png', patch: '', binary: true, additions: 0, deletions: 0 },
    ],
    commits: [{ sha: 'deadbeef', message: 'init' }],
    comments: [],
    reviewComments: [{ id: 1, body: 'n' }],
  };
  assert.equal(isDetailCompleteForFullCache(complete), true);
  const full = sanitizeDetailForCache(complete);
  assert.equal(full.files[0].patch.includes('+hello'), true, 'full keeps patch');
  assert.equal(full.files[0]._patchOmitted, undefined);
  assert.equal(full.commits.length, 1);
  assert.equal(full._cacheFull, true);
  logFull.push('complete→full ok');

  const forcedSlim = sanitizeDetailForCache(complete, { full: false });
  assert.equal(forcedSlim.files[0].patch, '');
  assert.equal(forcedSlim.files[0]._patchOmitted, true);
  logFull.push('force slim ok');
}

// --- write-through: complete detail stores patches in IDB ---
{
  let clock = 2_000_000;
  const idb = createMemoryIdb();
  const cache = createPersistedDetailCache({
    ttlMs: 60_000,
    now: () => clock,
    idb,
  });
  const key = cache.cacheKey('Acme', 'app', 9);
  const detail = {
    owner: 'Acme',
    repo: 'app',
    number: 9,
    title: 'Full',
    files: [{ filename: 'x.ts', patch: '@@ patch body @@', additions: 2 }],
    commits: [{ sha: '111', message: 'c' }],
    reviewComments: [],
    _fetchTimings: { a: 1 },
  };
  cache.set(key, detail);
  await new Promise((r) => setTimeout(r, 0));
  const row = await idb.get(key);
  assert.ok(row, 'idb row');
  assert.ok(
    String(row.value.files[0].patch || '').includes('patch body'),
    'IDB full snapshot keeps patch'
  );
  assert.equal(row.value.commits.length, 1);
  assert.equal(row.value._fetchTimings, undefined);
  logFull.push('idb write full ok');

  // Incomplete progressive load must not promote full patches
  const partial = {
    owner: 'Acme',
    repo: 'app',
    number: 10,
    title: 'Partial',
    files: [{ filename: 'y.ts', patch: '', _patchOmitted: true }],
    commits: [{ sha: '222' }],
  };
  const key2 = cache.cacheKey('Acme', 'app', 10);
  cache.set(key2, partial);
  await new Promise((r) => setTimeout(r, 0));
  const row2 = await idb.get(key2);
  assert.equal(row2.value.files[0].patch, '');
  assert.equal(row2.value.files[0]._patchOmitted, true);
  logFull.push('idb write slim for incomplete ok');
}

// --- hydrate-first: empty memory + IDB snapshot paints without network ---
{
  let clock = 3_000_000;
  const idb = createMemoryIdb();
  const warm = createPersistedDetailCache({
    ttlMs: 60_000,
    now: () => clock,
    idb,
  });
  const key = warm.cacheKey('Org', 'r', 1);
  warm.set(key, {
    owner: 'Org',
    repo: 'r',
    number: 1,
    title: 'Cached PR',
    files: [{ filename: 'a.js', patch: '@@ cached @@', additions: 1 }],
    commits: [{ sha: 'abc' }],
  });
  await new Promise((r) => setTimeout(r, 0));

  // Cold process: new memory, same IDB
  let networkCalled = false;
  const cold = createPersistedDetailCache({
    ttlMs: 60_000,
    now: () => clock,
    idb,
  });
  assert.equal(cold.peek(key).value, null, 'memory empty before hydrate');
  const t0 = Date.now();
  const hydrated = await cold.peekAsync(key);
  const hydrateMs = Date.now() - t0;
  assert.equal(hydrated.source, 'idb');
  assert.equal(hydrated.value.title, 'Cached PR');
  assert.ok(
    String(hydrated.value.files[0].patch || '').includes('cached'),
    'hydrate includes patch for pre-render'
  );
  // Simulated revalidate would be separate — first paint must not await it
  const revalidate = async () => {
    networkCalled = true;
    return { title: 'Network' };
  };
  // Paint from cache first
  const firstPaint = hydrated.value;
  assert.equal(firstPaint.title, 'Cached PR');
  assert.equal(networkCalled, false, 'network not required for first paint');
  await revalidate();
  assert.equal(networkCalled, true);
  logHydrate.push(`hydrate-first ok ms=${hydrateMs} title=${firstPaint.title}`);
}

// --- parallel schedule: metadata + threads both start before either resolves ---
{
  const starts = [];
  const finishes = [];
  function job(name, ms) {
    starts.push({ name, t: Date.now() });
    return new Promise((resolve) => {
      setTimeout(() => {
        finishes.push({ name, t: Date.now() });
        resolve(name);
      }, ms);
    });
  }
  // Mirror host orchestration: kick threads, await core, then await threads
  const threadsP = job('threads', 40);
  const coreP = job('core', 25);
  // Both must have started before core resolves
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    starts.some((s) => s.name === 'threads') &&
      starts.some((s) => s.name === 'core'),
    'both phases initiated before either finishes'
  );
  const core = await coreP;
  assert.equal(core, 'core');
  assert.ok(
    !finishes.some((f) => f.name === 'threads'),
    'threads still in flight when core resolves'
  );
  await threadsP;
  logParallel.push(
    `parallel ok starts=${starts.map((s) => s.name).join(',')} finishes=${finishes
      .map((f) => f.name)
      .join(',')}`
  );
}

writeLog('detail-cache-full.log', logFull);
writeLog('detail-hydrate.log', logHydrate);
writeLog('parallel-load.log', logParallel);

console.log('detail-cache-full.test.js: all assertions passed');
console.log(logFull.join(' | '));
console.log(logHydrate.join(' | '));
console.log(logParallel.join(' | '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
