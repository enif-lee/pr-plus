/**
 * Bundle the MV3 service worker into a single classic script.
 *
 * Chrome SW registration (status 15) is fragile with multi-file importScripts
 * (global const collisions, partial failures). One IIFE-safe concat file avoids that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

const deps = [
  'github-endpoints.js',
  'modal/pure/collapse.js',
  'modal/pure/comments-page.js',
  'modal/pure/review-threads.js',
  'modal/pure/pending-review.js',
  'modal/pure/pr-edit-api.js',
  'modal/pure/checks.js',
  'storage.js',
  'fetch-pulls.js',
];

function read(rel) {
  return fs.readFileSync(path.join(src, rel), 'utf8');
}

const parts = [];
parts.push(`/**
 * AUTO-GENERATED — do not edit. Run: npm run build:sw
 * Single-file MV3 service worker (deps + background handler).
 */
/* eslint-disable */
`);

for (const rel of deps) {
  const body = read(rel).trim();
  // Already-IIFE pure modules: load as-is. Wrap bare scripts just in case.
  const needsWrap = !/^\s*\/\*[\s\S]*?\*\/\s*\(function\s*\(\)/.test(body) &&
    !/^\s*\(function\s*\(\)/.test(body) &&
    !body.includes('(function ()');
  parts.push(`\n/* ---- ${rel} ---- */\n`);
  if (needsWrap && (rel === 'storage.js' || rel === 'fetch-pulls.js')) {
    // storage/fetch-pulls export via globalThis; wrap to avoid future collisions
    parts.push(`;(function(){\n${body}\n})();\n`);
  } else {
    parts.push(body.endsWith(';') ? body + '\n' : body + ';\n');
  }
}

let bg = read('background.js');
// Drop importScripts block — deps are inlined above
bg = bg.replace(
  /\/\* global importScripts[\s\S]*?importScripts\(\s*[\s\S]*?\);\s*/m,
  '/* deps inlined by scripts/build-sw.mjs */\n'
);
// Soften globals comment
bg = bg.replace(
  /\/\* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse \*\//,
  '/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRModalCommentsPage, PRModalReviewThreads, PRModalPendingReview, PRModalPrEditApi */'
);

parts.push(`\n/* ---- background.js ---- */\n`);
parts.push(bg);

const out = path.join(src, 'background.bundle.js');
fs.writeFileSync(out, parts.join('\n'));
const size = fs.statSync(out).size;
console.log('Built', path.relative(root, out), `(${size} bytes)`);
