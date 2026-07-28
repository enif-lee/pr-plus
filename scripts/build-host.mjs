/**
 * Assemble pr-modal-host.js from TypeScript host modules (SoT).
 * Modules cut only at top-level function boundaries.
 * Edit src/host/modules/*.ts — then: npm run build:host
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleTsParts } from './assemble-ts-parts.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modulesDir = path.join(root, 'src/host/modules');
const out = path.join(root, 'src/pr-modal-host.js');

// Validate starts (TS preferred)
const files = fs
  .readdirSync(modulesDir)
  .filter((f) => /^\d+.*\.(ts|js)$/.test(f))
  .sort();
const byBase = new Map();
for (const f of files) {
  const base = f.replace(/\.(ts|js)$/, '');
  if (!byBase.has(base) || f.endsWith('.ts')) byBase.set(base, f);
}
for (const f of [...byBase.values()].sort()) {
  const body = fs.readFileSync(path.join(modulesDir, f), 'utf8');
  const first = body
    .split(/\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !l.startsWith('//') &&
        !l.startsWith('/*') &&
        !l.startsWith('*')
    );
  if (
    first &&
    (/^[.)\]},]/.test(first) ||
      first.startsWith('.catch') ||
      first.startsWith('.then') ||
      first.startsWith('catch') ||
      first.startsWith('then('))
  ) {
    console.error('Invalid module start in', f, ':', first.slice(0, 60));
    process.exit(1);
  }
  const n = body.split(/\n/).length;
  if (n > 1500) console.warn('WARN', f, 'has', n, 'lines (>1500)');
}

const result = await assembleTsParts({
  partsDir: modulesDir,
  outFile: out,
  banner: `/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * AUTO-GENERATED from src/host/modules/*.ts (function-boundary modules).
 * SOURCE OF TRUTH: TypeScript modules — npm run build:host
 */`,
  wrap: (body) => `(function initPrModalHost() {\n${body}\n})();`,
});

console.log(
  'Built',
  path.relative(root, out),
  `(${result.parts.length} modules, ${result.lines} lines)`
);
for (const f of result.parts) console.log(`  ${f}`);
