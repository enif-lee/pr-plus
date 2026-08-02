/**
 * Emit src/content-bridge.js from composed TypeScript SoT under src/content-bridge/.
 * Entry: src/content-bridge/bridge-api.ts
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
const entry = path.join(root, 'src/content-bridge/bridge-api.ts');
const out = path.join(root, 'src/content-bridge.js');
const pointer = path.join(root, 'src/content-bridge.ts');

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
  ...esbuildReleaseExtras(),
});

let code = result.outputFiles[0].text;
code = code
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
  .replace(/^export\s+class\s+/gm, 'class ')
  .replace(/^export\s+(const|let|var)\s+/gm, '$1 ')
  .replace(/^export\s+default\s+/gm, '');

code = await maybeStripDebugLogs(code, { loader: 'js' });

const file = `/**
 * AUTO-GENERATED from src/content-bridge/* (entry: bridge-api.ts)
 * SOURCE OF TRUTH: src/content-bridge/ — npm run build:content-bridge
${isReleaseBuild() ? ' * RELEASE: debug console.log/info stripped (PRP_RELEASE=1)\n' : ''} */
${code}
`;
fs.writeFileSync(out, file);
// Keep thin pointer for tools that look at content-bridge.ts
fs.writeFileSync(
  pointer,
  `/** Pointer — SoT is src/content-bridge/*.ts (entry bridge-api.ts). Built to content-bridge.js */\n`
);
console.log(
  'Built content-bridge.js from src/content-bridge/*',
  file.split(/\n/).length,
  'lines',
  isReleaseBuild() ? '(release)' : ''
);
