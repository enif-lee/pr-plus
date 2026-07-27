/**
 * Assemble src/fetch-pulls.js from src/fetch/parts/* 
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, 'src/fetch/parts');
const out = path.join(root, 'src/fetch-pulls.js');
const parts = fs.readdirSync(partsDir).filter((f) => f.endsWith('.js')).sort();
const body = parts.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').trimEnd()).join('\n\n');
fs.writeFileSync(
  out,
  `/**\n * AUTO-ASSEMBLED from src/fetch/parts/* — run: npm run build:fetch\n */\n${body}\n`
);
console.log('Built fetch-pulls.js', parts.length, 'parts', body.split(/\n/).length, 'lines');
for (const f of parts) {
  const n = fs.readFileSync(path.join(partsDir, f), 'utf8').split(/\n/).length;
  console.log(`  ${f}: ${n}`);
}
