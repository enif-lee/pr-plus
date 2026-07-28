/**
 * Bundle the MV3 service worker into a single classic script.
 *
 * Prefers TypeScript sources (background.ts + deps) via esbuild; falls back
 * to compiled JS when a twin has not been migrated yet.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

const deps = [
  'github-endpoints',
  'modal/pure/collapse.js',
  'modal/pure/comments-page.js',
  'modal/pure/review-threads.js',
  'modal/pure/pending-review.js',
  'modal/pure/pr-edit-api.js',
  'modal/pure/checks.js',
  'storage',
  'fetch-pulls.js',
];

function resolveSource(rel) {
  // rel may be 'storage' or 'foo.js'
  const base = rel.replace(/\.js$/, '');
  const candidates = [
    path.join(src, `${base}.ts`),
    path.join(src, `${base}.js`),
    path.join(src, rel),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`SW dep missing: ${rel}`);
}

const parts = [];
parts.push(`/**
 * AUTO-GENERATED — do not edit. Run: npm run build:sw
 * Single-file MV3 service worker (deps + background handler).
 * TypeScript sources are transformed with esbuild before concat.
 */
/* eslint-disable */
`);

for (const rel of deps) {
  const file = resolveSource(rel);
  const label = path.relative(src, file);
  let body = fs.readFileSync(file, 'utf8').trim();
  if (file.endsWith('.ts')) {
    const result = await esbuild.transform(body, {
      loader: 'ts',
      target: 'es2020',
      format: 'cjs',
      legalComments: 'none',
    });
    body = result.code.trim();
  }
  parts.push(`\n/* ---- ${label} ---- */\n`);
  const needsWrap =
    !/^\s*\/\*[\s\S]*?\*\/\s*\(function\s*\(/.test(body) &&
    !/^\s*\(function\s*\(/.test(body) &&
    !body.includes('(function ()') &&
    !body.includes('(function(');
  if (
    needsWrap &&
    (label === 'storage.js' ||
      label === 'storage.ts' ||
      label.endsWith('fetch-pulls.js') ||
      label === 'storage')
  ) {
    parts.push(`;(function(){\n${body}\n})();\n`);
  } else {
    parts.push(body.endsWith(';') ? body + '\n' : body + ';\n');
  }
}

const bgFile = resolveSource('background');
let bg = fs.readFileSync(bgFile, 'utf8');
if (bgFile.endsWith('.ts')) {
  bg = (
    await esbuild.transform(bg, {
      loader: 'ts',
      target: 'es2020',
      format: 'cjs',
      legalComments: 'none',
    })
  ).code;
}
// Drop importScripts block — deps are inlined above
bg = bg.replace(
  /\/\* global importScripts[\s\S]*?importScripts\(\s*[\s\S]*?\);\s*/m,
  '/* deps inlined by scripts/build-sw.mjs */\n'
);
bg = bg.replace(
  /importScripts\(\s*[\s\S]*?\);\s*/m,
  '/* deps inlined by scripts/build-sw.mjs */\n'
);
bg = bg.replace(
  /\/\* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse \*\//,
  '/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRModalCommentsPage, PRModalReviewThreads, PRModalPendingReview, PRModalPrEditApi */'
);

parts.push(`\n/* ---- ${path.relative(src, bgFile)} ---- */\n`);
parts.push(bg);

const out = path.join(src, 'background.bundle.js');
fs.writeFileSync(out, parts.join('\n'));
const size = fs.statSync(out).size;
console.log('Built', path.relative(root, out), `(${size} bytes) from TS/JS mix`);
