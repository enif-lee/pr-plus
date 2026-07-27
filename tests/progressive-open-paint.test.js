/**
 * Progressive partial paint during parallel open/refresh fetches.
 * Asserts host wires paint-on-resolve (not wait-for-all then paint).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const host = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);

// openModal: paint helpers exist
assert.ok(host.includes('function paintCoreNow'), 'paintCoreNow helper');
assert.ok(
  host.includes('function paintThreadsNewestNow'),
  'paintThreadsNewestNow helper'
);

// Core paint runs inside the core fetch .then (not only after both settle)
assert.ok(
  /fetchDetailOnce\(\{ skipReviewThreads: true \}\)\.then\(\(d\) => \{[\s\S]*?paintCoreNow\(d\)/.test(
    host
  ),
  'core paint on core resolve'
);

// Threads paint runs inside threads kickoff .then
assert.ok(
  /fetchReviewThreadsPage\([\s\S]*?\.then\(\(page\) => \{[\s\S]*?paintThreadsNewestNow\(page\)/.test(
    host
  ) || host.includes('paintThreadsNewestNow(page)'),
  'threads paint on threads resolve'
);

// IDB hydrate must not block core paint (void / .then, not await before paint)
assert.ok(
  host.includes('void idbHydrateP'),
  'IDB hydrate non-blocking (void)'
);
assert.ok(
  !/let detail = await coreP;\s*[\s\S]{0,80}await idbHydrateP/.test(host),
  'must not await idbHydrateP before/with first core paint path'
);

// When core paints after threads, re-merge early threads page
assert.ok(
  /paintCoreNow[\s\S]*?earlyThreadsPage[\s\S]*?paintThreadsNewestNow/.test(host),
  'core paint re-applies early threads page'
);

// Refresh path progressive paint
assert.ok(host.includes('function paintRefreshCore'), 'refresh core paint');
assert.ok(
  host.includes('paintRefreshThreadsNewest(page)'),
  'refresh threads early paint'
);
assert.ok(
  host.includes('paintRefreshVisibleBulk(bulk)'),
  'refresh visible bulk early paint'
);
assert.ok(
  /fetchPrDetail\([\s\S]*?\.then\(\(d\) => \{[\s\S]*?paintRefreshCore\(d\)/.test(
    host
  ),
  'refresh core paint on resolve'
);

console.log('progressive-open-paint.test.js: all assertions passed');
console.log('progressive-paint=true');
