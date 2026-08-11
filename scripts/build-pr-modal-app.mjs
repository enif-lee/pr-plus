/**
 * PrModalApp is a complete TypeScript module (PrModalShell.tsx).
 * No mid-IIFE part assembly. This script only validates SoT presence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const impl = path.join(root, 'src/modal/app/PrModalShell.tsx');
const entry = path.join(root, 'src/modal/app/PrModalApp.tsx');
if (!fs.existsSync(impl)) {
  console.error('Missing SoT', impl);
  process.exit(1);
}
if (!fs.existsSync(entry)) {
  console.error('Missing entry', entry);
  process.exit(1);
}
const n = fs.readFileSync(impl, 'utf8').split(/\n/).length;
console.log('PrModalApp SoT OK:', path.relative(root, impl), n, 'lines (complete module, no part assemble)');
if (n > 1500) {
  console.warn('WARN: PrModalShell.tsx exceeds 1500 lines — further hook extraction recommended');
}
