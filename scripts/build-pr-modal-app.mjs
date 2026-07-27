/**
 * Assemble PrModalApp.tsx from src/modal/app/pr-modal/parts/*
 * Parts are the maintainable source of truth (each ≤ ~1500 lines).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, 'src/modal/app/pr-modal/parts');
const out = path.join(root, 'src/modal/app/PrModalApp.generated.tsx');

const parts = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .sort();

const body = parts
  .map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').trimEnd())
  .join('\n');

const banner = `// @ts-nocheck — assembled from parts
/**
 * Composition root for PR modal — AUTO-ASSEMBLED from pr-modal/parts/*.
 * Edit parts under src/modal/app/pr-modal/parts/, then: npm run build:app-parts
 */
`;

fs.writeFileSync(out, banner + body + '\n');
console.log(
  'Built PrModalApp.generated.tsx',
  parts.length,
  'parts',
  (banner + body).split(/\n/).length,
  'lines'
);
for (const f of parts) {
  const n = fs.readFileSync(path.join(partsDir, f), 'utf8').split(/\n/).length;
  const flag = n > 1500 ? ' OVER' : '';
  console.log(`  ${f}: ${n}${flag}`);
}
