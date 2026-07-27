/**
 * Assemble ConversationView.tsx from conversation/parts/*
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, 'src/modal/views/conversation/parts');
const out = path.join(root, 'src/modal/views/conversation/ConversationView.tsx');

const parts = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .sort();

const body = parts
  .map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').trimEnd())
  .join('\n');

const banner = `/**
 * Conversation surface — AUTO-ASSEMBLED from conversation/parts/*.
 * Edit parts, then: npm run build:app-parts
 */
`;

fs.writeFileSync(out, banner + body + '\n');
console.log(
  'Built ConversationView.tsx',
  parts.length,
  'parts',
  (banner + body).split(/\n/).length,
  'lines'
);
for (const f of parts) {
  const n = fs.readFileSync(path.join(partsDir, f), 'utf8').split(/\n/).length;
  console.log(`  ${f}: ${n}${n > 1500 ? ' OVER' : ''}`);
}
