/**
 * Emit classic content-script / popup JS from TypeScript SoT.
 * Manifest still loads *.js; edit the matching *.ts then run this.
 *
 * Uses esbuild type-erase. Files that dual-export via `module.exports` are
 * rewritten temporarily so esbuild does not wrap them in __commonJS (which
 * would hide top-level functions from other content scripts).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  protectCjsDualExport,
  protectCjsDualExportPlugin,
  restoreCjsDualExport,
} from './cjs-dual-export.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

/** basenames under src/ that MV3 loads as classic scripts */
const ENTRIES = [
  'tree',
  'dom',
  'pr-list-focus',
  'pulls-palette',
  'github-endpoints',
  // content-bridge is assembled from src/content-bridge/parts (build-content-bridge.mjs)
  'content-bootstrap',
  'onboarding',
  'content',
  'popup',
  'storage',
];

function stripModuleSyntax(code) {
  return code
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
    .replace(/^export\s+class\s+/gm, 'class ')
    .replace(/^export\s+(const|let|var)\s+/gm, '$1 ')
    .replace(/^export\s+type\s+.+$/gm, '')
    .replace(/^import\s+type\s+.+$/gm, '')
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+.+from\s+['"][^'"]+['"];?\s*$/gm, '');
}

let n = 0;
const failures = [];

for (const name of ENTRIES) {
  const tsPath = path.join(src, `${name}.ts`);
  const jsPath = path.join(src, `${name}.js`);
  if (!fs.existsSync(tsPath)) {
    console.log('skip (no ts):', name);
    continue;
  }

  let stripped;
  try {
    // Multi-file entries (onboarding/* barrel) need bundle; others type-erase only.
    // popup bundles pure i18n catalogs for settings-page localization.
    const needsBundle =
      name === 'onboarding' ||
      name === 'popup' ||
      fs.existsSync(path.join(src, `${name}-steps.ts`)) ||
      /export \* from '\.\//.test(fs.readFileSync(tsPath, 'utf8').slice(0, 500));
    if (needsBundle) {
      // Protect dual-export *before* parse (plugin); post-bundle protect was too late
      // and left esbuild commonjs-variable-in-esm warnings on barrel entries.
      const result = await esbuild.build({
        entryPoints: [tsPath],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'neutral',
        target: 'es2020',
        logLevel: 'warning',
        plugins: [protectCjsDualExportPlugin(src)],
      });
      stripped = restoreCjsDualExport(stripModuleSyntax(result.outputFiles[0].text));
    } else {
      let code = fs.readFileSync(tsPath, 'utf8');
      code = code.replace(/^\/\/ @ts-nocheck.*$/m, '');
      const protectedCode = protectCjsDualExport(code);
      const result = await esbuild.transform(protectedCode, {
        loader: 'ts',
        format: 'esm',
        target: 'es2020',
        platform: 'neutral',
      });
      stripped = restoreCjsDualExport(stripModuleSyntax(result.code));
    }
  } catch (err) {
    failures.push(`${name}: ${err.message?.slice(0, 160)}`);
    console.error('transform failed', name, err.message?.slice(0, 160));
    continue;
  }

  if (/__commonJS|require_stdin/.test(stripped)) {
    failures.push(`${name}: unexpected commonjs wrapper`);
    console.error('refusing to write cjs-wrapped', name);
    continue;
  }

  const header = `/**
 * AUTO-GENERATED from src/${name}.ts
 * SOURCE OF TRUTH: src/${name}.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
`;
  fs.writeFileSync(jsPath, header + stripped);
  n++;
  console.log('content-ts→js', name, `(${stripped.split(/\n/).length} lines)`);
}

if (failures.length) {
  console.error('build-content-ts failures:\n', failures.join('\n'));
  process.exit(1);
}
console.log('build-content-ts done', n);
