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
import {
  esbuildReleaseExtras,
  isReleaseBuild,
  maybeStripDebugLogs,
  stripDebugMarkersRegexOnly,
} from './release-build-options.mjs';

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
  'modal/pure/rate-limit.js',
  'modal/pure/graphql-cost-log.js',
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
      ...esbuildReleaseExtras(),
    });
    body = result.code.trim();
  }
  // Per-part strip (pure .js deps included) — avoids re-parsing full SW with GraphQL `$ids`
  if (isReleaseBuild()) {
    try {
      body = (await maybeStripDebugLogs(body, { loader: 'js' })).trim();
    } catch {
      body = stripDebugMarkersRegexOnly(body).trim();
    }
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
      ...esbuildReleaseExtras(),
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
const outSw = path.join(src, 'background.sw.js');
let body = parts.join('\n');
// Light final regex pass only (parts already stripped); no full esbuild re-parse
if (isReleaseBuild()) {
  body = stripDebugMarkersRegexOnly(body);
}
fs.writeFileSync(out, body);
// Distinct SW path so unpacked Chrome reloads pick up handler changes (MV3 cache).
fs.writeFileSync(outSw, body);
const size = fs.statSync(out).size;
console.log(
  'Built',
  path.relative(root, out),
  `+ ${path.relative(root, outSw)}`,
  `(${size} bytes) from TS/JS mix`,
  isReleaseBuild() ? '[release logs stripped]' : ''
);
