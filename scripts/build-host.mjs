/**
 * Assemble pr-modal-host.js from src/host/parts/* (architecture split).
 * Runtime remains one IIFE so closures over `current` / reactRoot stay shared.
 * Edit parts under src/host/parts/, then: npm run build:host
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, 'src/host/parts');
const out = path.join(root, 'src/pr-modal-host.js');

if (!fs.existsSync(partsDir)) {
  console.error('Missing src/host/parts — abort');
  process.exit(1);
}

const parts = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith('.js'))
  .sort();

const body = parts
  .map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').trimEnd())
  .join('\n\n');

const file = `/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * AUTO-ASSEMBLED from src/host/parts/* — edit parts, run: npm run build:host
 * Bundle + CSS are extension-local (no remote code).
 */
(function initPrModalHost() {
${body}
})();
`;

fs.writeFileSync(out, file);
console.log(
  'Built',
  path.relative(root, out),
  `(${parts.length} parts, ${file.split(/\n/).length} lines)`
);
for (const f of parts) {
  const n = fs.readFileSync(path.join(partsDir, f), 'utf8').split(/\n/).length;
  console.log(`  ${f}: ${n} lines`);
}
