/**
 * Ensures MV3 service worker script evaluates without global const collisions
 * (Chrome error status 15 / registration failed).
 *
 * Prefers the single-file background.bundle.js produced by npm run build:sw.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const bundlePath = path.join(root, 'src', 'background.bundle.js');

// Ensure bundle exists and is not older than background.js / fetch-pulls sources
const bgPath = path.join(root, 'src', 'background.js');
const fetchPath = path.join(root, 'src', 'fetch-pulls.js');
const bundleStale =
  !fs.existsSync(bundlePath) ||
  (fs.existsSync(bgPath) &&
    fs.statSync(bundlePath).mtimeMs < fs.statSync(bgPath).mtimeMs) ||
  (fs.existsSync(fetchPath) &&
    fs.statSync(bundlePath).mtimeMs < fs.statSync(fetchPath).mtimeMs);
if (bundleStale) {
  const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-sw.mjs')], {
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    process.stderr.write(build.stdout + build.stderr);
    process.exit(build.status || 1);
  }
}

assert.ok(fs.existsSync(bundlePath), 'src/background.bundle.js missing — run npm run build:sw');
const code = fs.readFileSync(bundlePath, 'utf8');
assert.ok(code.length > 1000, 'SW bundle unexpectedly small');
assert.ok(!/\bimportScripts\s*\(/.test(code), 'bundled SW must not call importScripts');

const sandbox = {
  console,
  chrome: {
    storage: {
      local: { get() {}, set() {} },
      onChanged: { addListener() {} },
    },
    runtime: {
      onMessage: { addListener() {} },
      sendMessage() {
        return Promise.resolve();
      },
      lastError: null,
    },
    tabs: {
      query() {},
      sendMessage() {
        return Promise.resolve();
      },
    },
  },
  fetch: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({}),
  }),
  URLSearchParams,
  TextDecoder,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  setTimeout,
  clearTimeout,
  Promise,
  Map,
  Set,
  WeakMap,
  Array,
  Object,
  String,
  Number,
  Boolean,
  JSON,
  Error,
  TypeError,
  Math,
  Date,
  RegExp,
  encodeURIComponent,
  decodeURIComponent,
  Uint8Array,
};

sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

try {
  vm.runInContext(code, ctx, { filename: 'background.bundle.js' });
} catch (err) {
  console.error('SW bundle evaluation failed:', err);
  process.exit(1);
}

assert.equal(typeof sandbox.PRTreeFetch, 'object', 'PRTreeFetch global');
assert.equal(typeof sandbox.PRTreeStorage, 'object', 'PRTreeStorage global');
assert.equal(typeof sandbox.PRModalCollapse, 'object', 'PRModalCollapse global');
assert.equal(typeof sandbox.PRModalCommentsPage, 'object', 'PRModalCommentsPage global');
assert.equal(typeof sandbox.PRTreeFetch.fetchPrDetail, 'function');
assert.equal(typeof sandbox.PRTreeFetch.fetchPrCommentsPage, 'function');

console.log('service-worker-load.test.js: all assertions passed');
console.log(`bundleBytes=${code.length} importScripts=false`);
