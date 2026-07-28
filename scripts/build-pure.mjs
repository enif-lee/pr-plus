/**
 * Emit content-script pure IIFE modules from TypeScript lib SoT.
 *
 * Mapping: src/modal/lib/<name>.ts → src/modal/pure/<name>.js
 * Pure files are GENERATED — edit lib/*.ts only (except pure-only / re-export stubs).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const libDir = path.join(root, 'src/modal/lib');
const pureDir = path.join(root, 'src/modal/pure');

/** pure basename → { libFile, globalName } */
const MAP = {
  'aside-lists': { lib: 'aside-lists.ts', global: 'PRModalAsideLists' },
  'auto-refresh': { lib: 'auto-refresh.ts', global: 'PRModalAutoRefresh' },
  collapse: { lib: 'collapse.ts', global: 'PRModalCollapse' },
  'command-palette': { lib: 'command-palette.ts', global: 'PRModalCommandPalette' },
  'comment-nav': { lib: 'comment-nav.ts', global: 'PRModalCommentNav' },
  'comments-page': { lib: 'comments-page.ts', global: 'PRModalCommentsPage' },
  'confirm-gate': { lib: 'confirm-gate.ts', global: 'PRModalConfirmGate' },
  'conversation-timeline': {
    lib: 'conversation-timeline.ts',
    global: 'PRModalConversationTimeline',
  },
  'conversation-virtual': {
    lib: 'conversation-virtual.ts',
    global: 'PRModalConversationVirtual',
  },
  'detail-cache': { lib: 'detail-cache.ts', global: 'PRModalDetailCache' },
  'detail-idb-cache': { lib: 'detail-idb.ts', global: 'PRModalDetailIdb' },
  'detail-store': { lib: 'detail-store.ts', global: 'PRModalDetailStore' },
  'diff-commit-filter': {
    lib: 'diff-commit-filter.ts',
    global: 'PRModalDiffCommitFilter',
  },
  'diff-rows': { lib: 'diff-rows.ts', global: 'PRModalDiffRows' },
  'diff-snippet': { lib: 'diff-snippet.ts', global: 'PRModalDiffSnippet' },
  'file-tree': { lib: 'file-tree.ts', global: 'PRModalFileTree' },
  'floating-scrollbar': {
    lib: 'floating-scrollbar.ts',
    global: 'PRModalFloatingScrollbar',
  },
  'layout-mode': { lib: 'layout-mode.ts', global: 'PRModalLayoutMode' },
  'line-selection': { lib: 'line-selection.ts', global: 'PRModalLineSelection' },
  'load-progress': { lib: 'load-progress.ts', global: 'PRModalLoadProgress' },
  'markdown-composer': {
    lib: 'markdown-composer.ts',
    global: 'PRModalMarkdownComposer',
  },
  'modal-state': { lib: 'modal-state.ts', global: 'PRModalModalState' },
  'page-embed': { lib: 'page-embed.ts', global: 'PRModalPageEmbed' },
  'pending-review': { lib: 'pending-review.ts', global: 'PRModalPendingReview' },
  'pr-edit-api': { lib: 'pr-edit-api.ts', global: 'PRModalPrEditApi' },
  'review-threads': { lib: 'review-threads.ts', global: 'PRModalReviewThreads' },
  'search-index': { lib: 'search-index.ts', global: 'PRModalSearchIndex' },
  'searchable-select': {
    lib: 'searchable-select.ts',
    global: 'PRModalSearchableSelect',
  },
  'session-view': { lib: 'session-view.ts', global: 'PRModalSessionView' },
  'shortcut-policy': {
    lib: 'shortcut-policy.ts',
    global: 'PRModalShortcutPolicy',
  },
  theme: { lib: 'theme.ts', global: 'PRModalTheme' },
  'ui-polish': { lib: 'ui-polish.ts', global: 'PRModalUiPolish' },
  'virtual-range': { lib: 'virtual-range.ts', global: 'PRModalVirtualRange' },
};

/**
 * Pure remains SoT (lib only re-exports pure, or pure has no lib twin).
 * Do not overwrite these from a thin re-export lib file.
 */
const PURE_SOT = new Set(['checks', 'detail-merge']);

function isReexportOnly(src) {
  const body = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim();
  // Mostly export ... from '../pure/...'
  const lines = body.split(/\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  const reexport = lines.filter((l) =>
    /export\s+\{[\s\S]*\}\s+from\s+['"]\.\.\/pure\//.test(l) ||
    /export\s+\*\s+from\s+['"]\.\.\/pure\//.test(l) ||
    /from\s+['"]\.\.\/pure\//.test(l)
  );
  return reexport.length >= Math.max(1, lines.length - 3);
}

function flattenApiAssign(gname) {
  return `
  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.${gname} = api;
`;
}

let built = 0;
let skipped = 0;
const failures = [];

for (const [pureName, { lib, global: gname }] of Object.entries(MAP)) {
  const libPath = path.join(libDir, lib);
  const purePath = path.join(pureDir, `${pureName}.js`);

  if (PURE_SOT.has(pureName)) {
    console.log('keep pure-SoT', pureName);
    skipped++;
    continue;
  }
  if (!fs.existsSync(libPath)) {
    console.warn('skip (no lib):', pureName);
    skipped++;
    continue;
  }

  let src = fs.readFileSync(libPath, 'utf8');
  if (isReexportOnly(src)) {
    console.log('keep pure (lib re-exports pure):', pureName);
    skipped++;
    continue;
  }

  src = src.replace(/^\/\/ @ts-nocheck.*$/m, '');
  // Drop trailing export { a, b } re-export lists that duplicate named exports
  src = src.replace(/\nexport\s*\{[\s\S]*?\};\s*$/m, '\n');

  const hasRelativeImports =
    /from\s+['"]\.\.\/pure\//.test(src) ||
    /from\s+['"]\.\/[^'"]+['"]/.test(src);
  const nonTypeImportLines = (src.match(/^import\s+.+$/gm) || []).filter(
    (l) => !/\bimport\s+type\b/.test(l)
  );
  const needsBundle = hasRelativeImports && nonTypeImportLines.length > 0;

  let transformedCode;
  try {
    if (needsBundle) {
      // Bundle relative lib imports into one content-script IIFE global
      // (e.g. detail-cache.ts → detail-idb.ts). Do not leave require().
      const result = await esbuild.build({
        entryPoints: [libPath],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'neutral',
        target: 'es2020',
        logLevel: 'silent',
      });
      transformedCode = result.outputFiles[0]?.text || '';
      if (!transformedCode) {
        throw new Error('empty bundle output');
      }
      // Strip esbuild's cjs wrapper noise if it introduced __require — reject
      if (
        /require\s*\(\s*['"][^./]/.test(transformedCode) ||
        /__require/.test(transformedCode)
      ) {
        throw new Error('bundle still has external require');
      }
      console.log('pure←ts(bundle)', pureName);
    } else {
      const transformed = await esbuild.transform(src, {
        loader: 'ts',
        format: 'cjs',
        target: 'es2020',
        platform: 'neutral',
      });
      transformedCode = transformed.code;
      if (/require\s*\(/.test(transformedCode)) {
        console.warn('skip (emits require):', pureName);
        skipped++;
        continue;
      }
      console.log('pure←ts', pureName);
    }
  } catch (err) {
    failures.push(`${pureName}: ${err.message?.slice(0, 160)}`);
    console.error('transform failed', pureName, err.message?.slice(0, 160));
    skipped++;
    continue;
  }

  const file = `/**
 * AUTO-GENERATED from src/modal/lib/${lib}
 * SOURCE OF TRUTH: src/modal/lib/${lib}
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
${transformedCode}
${flattenApiAssign(gname)}
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;

  fs.writeFileSync(purePath, file);
  built++;
}

// always keep pure-only
for (const name of PURE_SOT) {
  if (fs.existsSync(path.join(pureDir, `${name}.js`))) {
    console.log('keep pure-only', name);
  }
}

console.log(`build-pure: built=${built} skipped=${skipped}`);
if (failures.length) {
  console.error('failures:', failures.join('; '));
  process.exit(1);
}
