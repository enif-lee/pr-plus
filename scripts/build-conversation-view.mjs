/**
 * ConversationView is a complete TypeScript module.
 * No mid-IIFE part assembly. Validates SoT presence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sot = path.join(root, 'src/modal/views/conversation/ConversationView.tsx');
if (!fs.existsSync(sot)) {
  console.error('Missing SoT', sot);
  process.exit(1);
}
const text = fs.readFileSync(sot, 'utf8');
if (/@ts-nocheck/.test(text.slice(0, 200))) {
  console.error('ConversationView must not use @ts-nocheck');
  process.exit(1);
}
if (/AUTO-ASSEMBLED from conversation\/parts/.test(text.slice(0, 300))) {
  console.error('ConversationView must not be mid-IIFE assembled');
  process.exit(1);
}
const n = text.split(/\n/).length;
console.log('ConversationView SoT OK:', n, 'lines (complete module, no part assemble)');
if (n > 1500) console.warn('WARN: ConversationView exceeds 1500 lines — further extraction recommended');
