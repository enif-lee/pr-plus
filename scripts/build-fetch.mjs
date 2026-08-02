/**
 * Emit src/fetch-pulls.js from composed TypeScript SoT under src/fetch/.
 * Entry: src/fetch/fetch-api.ts (re-exports feature units + attaches PRTreeFetch).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esbuildReleaseExtras,
  isReleaseBuild,
  maybeStripDebugLogs,
} from './release-build-options.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, 'src/fetch/fetch-api.ts');
const out = path.join(root, 'src/fetch-pulls.js');

if (!fs.existsSync(entry)) {
  console.error('Missing SoT entry', entry);
  process.exit(1);
}

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  logLevel: 'warning',
  // Keep classic module.exports / globalThis attach from entry
  banner: {},
  ...esbuildReleaseExtras(),
});

let code = result.outputFiles[0].text;

// Drop ESM export statements — SW loads as classic script via importScripts
code = code
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
  .replace(/^export\s+class\s+/gm, 'class ')
  .replace(/^export\s+(const|let|var)\s+/gm, '$1 ')
  .replace(/^export\s+default\s+/gm, '');

// esbuild may wrap; ensure we don't ship TS
if (/:\s*any\b/.test(code.slice(0, 3000)) && /function \w+\([^)]*:\s*/.test(code)) {
  console.error('FATAL: type annotations leaked into fetch-pulls.js');
  process.exit(1);
}

code = await maybeStripDebugLogs(code, { loader: 'js' });

const file = `/**
 * AUTO-GENERATED from src/fetch/* (entry: fetch-api.ts)
 * SOURCE OF TRUTH: src/fetch/ — npm run build:fetch
${isReleaseBuild() ? ' * RELEASE: debug console.log/info stripped (PRP_RELEASE=1)\n' : ''} */
${code}
`;
fs.writeFileSync(out, file);
console.log(
  'Built fetch-pulls.js from src/fetch/*',
  file.split(/\n/).length,
  'lines',
  isReleaseBuild() ? '(release, logs stripped)' : ''
);
