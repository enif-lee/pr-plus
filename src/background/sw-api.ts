/**
 * SOURCE OF TRUTH — service worker API composition entry.
 */
/* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

// Pure helpers + fetch must load before handlers (classic SW importScripts).
// When esbuild bundles this entry, importScripts may be no-ops or kept as-is.
try {
  importScripts(
    'github-endpoints.js',
    'modal/pure/collapse.js',
    'modal/pure/comments-page.js',
    'modal/pure/review-threads.js',
    'modal/pure/pending-review.js',
    'modal/pure/pr-edit-api.js',
    'modal/pure/checks.js',
    'storage.js',
    'fetch-pulls.js'
  );
} catch {
  /* bundled classic may already include deps */
}

export * from './sw-enterprise';
export * from './sw-broadcast';
export * from './sw-rate-limit';
export * from './sw-handle-message';
