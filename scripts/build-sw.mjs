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

/**
 * Fail when SW concat would ship stale fetch/pure artifacts.
 * Pure IIFEs must be newer-or-equal to their lib SoT; fetch-pulls.js
 * must be newer-or-equal to every src/fetch/*.ts.
 */
export function assertSwInputsFresh(repoRoot = root) {
  const fetchJs = path.join(repoRoot, 'src/fetch-pulls.js');
  const fetchDir = path.join(repoRoot, 'src/fetch');
  if (!fs.existsSync(fetchJs)) {
    throw new Error('build:sw: missing src/fetch-pulls.js — run build:fetch first');
  }
  const fetchMtime = fs.statSync(fetchJs).mtimeMs;
  if (fs.existsSync(fetchDir)) {
    for (const name of fs.readdirSync(fetchDir)) {
      if (!name.endsWith('.ts')) continue;
      const p = path.join(fetchDir, name);
      if (fs.statSync(p).mtimeMs > fetchMtime + 1) {
        throw new Error(
          `build:sw: stale fetch-pulls.js (older than src/fetch/${name})`
        );
      }
    }
  }
  const libDir = path.join(repoRoot, 'src/modal/lib');
  const pureDir = path.join(repoRoot, 'src/modal/pure');
  const pureDeps = [
    ['collapse.js', 'collapse.ts'],
    ['comments-page.js', 'comments-page.ts'],
    ['review-threads.js', 'review-threads.ts'],
    ['pending-review.js', 'pending-review.ts'],
    ['pr-edit-api.js', 'pr-edit-api.ts'],
    ['checks.js', 'checks.ts'],
    ['rate-limit.js', 'rate-limit.ts'],
    ['graphql-cost-log.js', 'graphql-cost-log.ts'],
    ['conversation-timeline.js', 'conversation-timeline.ts'],
  ];
  for (const [pureName, libName] of pureDeps) {
    const purePath = path.join(pureDir, pureName);
    const libPath = path.join(libDir, libName);
    if (!fs.existsSync(purePath)) {
      throw new Error(`build:sw: missing src/modal/pure/${pureName} — run build:pure first`);
    }
    if (!fs.existsSync(libPath)) continue;
    if (fs.statSync(libPath).mtimeMs > fs.statSync(purePath).mtimeMs + 1) {
      throw new Error(
        `build:sw: stale src/modal/pure/${pureName} (older than src/modal/lib/${libName})`
      );
    }
  }
}

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
  // Before storage — prefs normalizeTimelineVisibility uses pure when present
  'modal/pure/conversation-timeline.js',
  'storage',
  'fetch-pulls.js',
];

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

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

if (!isMain) {
  // Imported by unit tests — skip concat side effects.
} else {
assertSwInputsFresh(root);
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
}
