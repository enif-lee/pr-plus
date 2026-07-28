
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sot = path.join(root, 'src/background/sw-api.ts');
const out = path.join(root, 'src/background.ts');
if (!fs.existsSync(sot)) {
  console.error('Missing', sot);
  process.exit(1);
}
let src = fs.readFileSync(sot, 'utf8');
src = src.replace(/^\/\*\*[\s\S]*?Do not split into mid-function fragments\.\s*\*\/\s*/m, '');
src = src.replace(/^\s*\/\/ @ts-expect-error.*$/gm, '');
// Keep as TS for build-sw transform; strip nocheck always
const file = `/**
 * AUTO-GENERATED from src/background/sw-api.ts
 * SOURCE OF TRUTH: src/background/sw-api.ts — npm run build:background-src
 */
${src}
`;
fs.writeFileSync(out, file);
console.log('Built background.ts from sw-api.ts', file.split(/\n/).length, 'lines');
