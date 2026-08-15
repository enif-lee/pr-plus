/**
 * Emit src/background.ts from composed TypeScript SoT under src/background/.
 * Entry: src/background/sw-api.ts
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, 'src/background/sw-api.ts');
const out = path.join(root, 'src/background.ts');

if (!fs.existsSync(entry)) {
  console.error('Missing', entry);
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
});

let code = result.outputFiles[0].text;
// Keep as TS-free JS body that build-sw will re-process; strip export keywords
code = code
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
  .replace(/^export\s+(const|let|var)\s+/gm, '$1 ')
  .replace(/^export\s+class\s+/gm, 'class ')
  .replace(/^export\s+default\s+/gm, '');

const file = `/**
 * AUTO-GENERATED from src/background/* (entry: sw-api.ts)
 * SOURCE OF TRUTH: src/background/ — npm run build:background-src
 */
${code}
`;
fs.writeFileSync(out, file);
console.log('Built background.ts from src/background/*', file.split(/\n/).length, 'lines');
