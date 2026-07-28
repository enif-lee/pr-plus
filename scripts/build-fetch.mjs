/**
 * Emit src/fetch-pulls.js from complete TypeScript SoT: src/fetch/fetch-api.ts
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sot = path.join(root, 'src/fetch/fetch-api.ts');
const out = path.join(root, 'src/fetch-pulls.js');

if (!fs.existsSync(sot)) {
  console.error('Missing SoT', sot);
  process.exit(1);
}

let src = fs.readFileSync(sot, 'utf8');
src = src.replace(/^\/\*\*[\s\S]*?Do not split into mid-function fragments\.\s*\*\/\s*/m, '');
// Drop expect-error comments for emit cleanliness (optional)
src = src.replace(/^\s*\/\/ @ts-expect-error.*$/gm, '');

// Prevent esbuild cjs wrap from dual module.exports
const ME = '__PRP_ME__';
const MOD = '__PRP_MOD__';
let protectedSrc = src
  .replace(/\bmodule\.exports\b/g, ME)
  .replace(/\btypeof\s+module\b/g, `typeof ${MOD}`)
  .replace(/\bmodule\b/g, MOD)
  .replace(
    /\)\(\s*typeof\s+globalThis\s*!==\s*['"]undefined['"]\s*\?\s*globalThis\s*:\s*this\s*\)/g,
    ')(typeof globalThis !== "undefined" ? globalThis : globalThis)'
  );

const result = await esbuild.transform(protectedSrc, {
  loader: 'ts',
  format: 'esm',
  target: 'es2020',
  platform: 'neutral',
});

let code = result.code
  .replace(new RegExp(ME, 'g'), 'module.exports')
  .replace(new RegExp(MOD, 'g'), 'module')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function\s+/gm, 'function ')
  .replace(/^export\s+class\s+/gm, 'class ')
  .replace(/^export\s+(const|let|var)\s+/gm, '$1 ');

if (/__commonJS|require_stdin/.test(code) || /:\s*any\b/.test(code.slice(0, 5000))) {
  // Last resort: esbuild with pure type erase via esbuild + strip remaining annotations
  const r2 = await esbuild.transform(src.replace(/\bmodule\.exports\b/g, ME).replace(/\btypeof\s+module\b/g, `typeof ${MOD}`).replace(/\bmodule\b(?!\.)/g, MOD), {
    loader: 'ts',
    format: 'esm',
    target: 'es2020',
  });
  code = r2.code
    .replace(new RegExp(ME, 'g'), 'module.exports')
    .replace(new RegExp(MOD, 'g'), 'module');
}

// Never ship TS syntax
if (/:\s*any\b|: string\b|: number\b|: boolean\b/.test(code) && /function \w+\([^)]*:\s*/.test(code)) {
  console.error('FATAL: type annotations leaked into fetch-pulls.js');
  process.exit(1);
}

const file = `/**
 * AUTO-GENERATED from src/fetch/fetch-api.ts
 * SOURCE OF TRUTH: src/fetch/fetch-api.ts — npm run build:fetch
 */
${code}
`;
fs.writeFileSync(out, file);
console.log('Built fetch-pulls.js from fetch-api.ts', file.split(/\n/).length, 'lines');
