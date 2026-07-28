/**
 * Emit src/content-bridge.js from complete TypeScript SoT:
 * src/content-bridge/bridge-api.ts
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sot = path.join(root, 'src/content-bridge/bridge-api.ts');
const out = path.join(root, 'src/content-bridge.js');
const pointer = path.join(root, 'src/content-bridge.ts');

if (!fs.existsSync(sot)) {
  console.error('Missing SoT', sot);
  process.exit(1);
}

let src = fs.readFileSync(sot, 'utf8');
src = src.replace(/^\/\*\*[\s\S]*?Do not split into mid-function fragments\.\s*\*\/\s*/m, '');
src = src.replace(/^\s*\/\/ @ts-expect-error.*$/gm, '');

const result = await esbuild.transform(src, {
  loader: 'ts',
  format: 'esm',
  target: 'es2020',
  platform: 'neutral',
});

let code = result.code
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
  .replace(/^export\s+class\s+/gm, 'class ')
  .replace(/^export\s+(const|let|var)\s+/gm, '$1 ');

if (/__commonJS|require_stdin/.test(code)) {
  console.error('FATAL: unexpected cjs wrap in content-bridge emit');
  process.exit(1);
}
if (/function \w+\([^)]*:\s*/.test(code)) {
  console.error('FATAL: type annotations leaked into content-bridge.js');
  process.exit(1);
}

const file = `/**
 * AUTO-GENERATED from src/content-bridge/bridge-api.ts
 * SOURCE OF TRUTH: src/content-bridge/bridge-api.ts — npm run build:content-bridge
 */
(function initPrTreeContentBridge() {
${code}
})();
`;
fs.writeFileSync(out, file);

fs.writeFileSync(
  pointer,
  `/**
 * Content-script bridge entry pointer.
 * SOURCE OF TRUTH: src/content-bridge/bridge-api.ts
 * Runtime: src/content-bridge.js — npm run build:content-bridge
 */
export const CONTENT_BRIDGE_SOT = 'src/content-bridge/bridge-api.ts' as const;
`
);

console.log('Built content-bridge.js from bridge-api.ts', file.split(/\n/).length, 'lines');
